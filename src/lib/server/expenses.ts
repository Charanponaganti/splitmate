import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db";
import {
  activityLog,
  attachments,
  expenseParticipants,
  expensePayers,
  expenses,
  users,
} from "@/lib/db/schema";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { computeSplit, validatePayers, type SplitMethod } from "@/lib/money/split";
import { expenseSchema, expenseUpdateSchema } from "@/lib/validation";
import { assertActiveMembers, getActiveMemberIds, lockGroup, requireMember } from "./access";
import { recordActivity, type NotificationTarget } from "./activity";
import { parseInput } from "./parse";

interface SplitInputs {
  amountMinor: number;
  splitMethod: SplitMethod;
  payers: { userId: string; amountMinor: number }[];
  participants: { userId: string; value?: number | null }[];
}

/** Recomputes shares on the server; client-side previews are never trusted. */
function resolveSplit(input: SplitInputs) {
  const payerCheck = validatePayers(input.amountMinor, input.payers);
  if (!payerCheck.ok) throw invalid(payerCheck.error, { payers: payerCheck.error });
  const split = computeSplit(input.amountMinor, input.splitMethod, input.participants);
  if (!split.ok) throw invalid(split.error, { participants: split.error });
  const inputById = new Map(input.participants.map((p) => [p.userId, p.value ?? null]));
  return split.shares.map((s) => ({
    userId: s.userId,
    shareMinor: s.shareMinor,
    inputValue: input.splitMethod === "equal" ? null : inputById.get(s.userId) ?? null,
  }));
}

async function assertReceipt(tx: DbOrTx, attachmentId: string | null | undefined, groupId: string, userId: string, current?: string | null) {
  if (!attachmentId || attachmentId === current) return;
  const [attachment] = await tx
    .select({ groupId: attachments.groupId, uploadedBy: attachments.uploadedBy })
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!attachment || attachment.groupId !== groupId || attachment.uploadedBy !== userId) {
    throw forbidden("That receipt can't be attached to this expense.");
  }
}

async function loadSplitRows(tx: DbOrTx, expenseId: string) {
  const [payers, participants] = await Promise.all([
    tx
      .select({ userId: expensePayers.userId, amountMinor: expensePayers.amountMinor })
      .from(expensePayers)
      .where(eq(expensePayers.expenseId, expenseId)),
    tx
      .select({
        userId: expenseParticipants.userId,
        shareMinor: expenseParticipants.shareMinor,
        inputValue: expenseParticipants.inputValue,
      })
      .from(expenseParticipants)
      .where(eq(expenseParticipants.expenseId, expenseId)),
  ]);
  return { payers, participants };
}

function involvementNotifications(
  members: string[],
  involved: Set<string>,
  groupId: string,
  expenseId: string,
): NotificationTarget[] {
  return members.map((userId) => ({
    userId,
    type: involved.has(userId) ? "expense_involved" : "expense_added",
    href: `/groups/${groupId}/expenses/${expenseId}`,
  }));
}

export async function createExpense(userId: string, rawInput: unknown) {
  const input = parseInput(expenseSchema, rawInput);
  const db = await getDb();
  return db.transaction(async (tx) => {
    await requireMember(tx, input.groupId, userId);
    const group = await lockGroup(tx, input.groupId);

    // Idempotency: a retried submission returns the original expense instead of creating a duplicate.
    const [existing] = await tx
      .select({ id: expenses.id, groupId: expenses.groupId })
      .from(expenses)
      .where(and(eq(expenses.createdBy, userId), eq(expenses.clientRequestId, input.clientRequestId)))
      .limit(1);
    if (existing) {
      if (existing.groupId !== input.groupId) throw conflict("Duplicate request.");
      return { id: existing.id, duplicate: true };
    }

    await assertActiveMembers(tx, input.groupId, [
      ...input.payers.map((p) => p.userId),
      ...input.participants.map((p) => p.userId),
    ]);
    const shares = resolveSplit(input);
    await assertReceipt(tx, input.receiptAttachmentId, input.groupId, userId);

    const [expense] = await tx
      .insert(expenses)
      .values({
        groupId: input.groupId,
        title: input.title,
        amountMinor: input.amountMinor,
        currency: group.currency,
        category: input.category,
        expenseDate: input.expenseDate,
        notes: input.notes,
        tags: input.tags,
        splitMethod: input.splitMethod,
        receiptAttachmentId: input.receiptAttachmentId ?? null,
        createdBy: userId,
        clientRequestId: input.clientRequestId,
      })
      .returning({ id: expenses.id });

    await tx.insert(expensePayers).values(input.payers.map((p) => ({ expenseId: expense.id, ...p })));
    await tx.insert(expenseParticipants).values(shares.map((s) => ({ expenseId: expense.id, ...s })));

    const members = await getActiveMemberIds(tx, input.groupId);
    const involved = new Set([...input.payers.map((p) => p.userId), ...shares.map((s) => s.userId)]);
    await recordActivity(tx, {
      groupId: input.groupId,
      actorId: userId,
      type: "expense.created",
      expenseId: expense.id,
      data: { title: input.title, amountMinor: input.amountMinor, currency: group.currency },
      notify: involvementNotifications(members, involved, input.groupId, expense.id),
      liveKind: "expense",
      liveRecipients: members,
    });
    return { id: expense.id, duplicate: false };
  });
}

export async function updateExpense(userId: string, expenseId: string, rawInput: unknown) {
  const input = parseInput(expenseUpdateSchema, rawInput);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    if (!current || current.deletedAt) throw notFound("Expense");
    await requireMember(tx, current.groupId, userId);
    await lockGroup(tx, current.groupId);

    // Re-read under the group lock to get the authoritative version.
    const [locked] = await tx.select().from(expenses).where(eq(expenses.id, expenseId)).for("update").limit(1);
    if (!locked || locked.deletedAt) throw notFound("Expense");
    if (locked.version !== input.expectedVersion) {
      throw conflict("Someone else changed this expense while you were editing. Reload to see the latest version.");
    }

    const before = await loadSplitRows(tx, expenseId);
    const previousIds = [...before.payers.map((p) => p.userId), ...before.participants.map((p) => p.userId)];
    await assertActiveMembers(
      tx,
      locked.groupId,
      [...input.payers.map((p) => p.userId), ...input.participants.map((p) => p.userId)],
      previousIds,
    );
    const shares = resolveSplit(input);
    await assertReceipt(tx, input.receiptAttachmentId, locked.groupId, userId, locked.receiptAttachmentId);

    await tx
      .update(expenses)
      .set({
        title: input.title,
        amountMinor: input.amountMinor,
        category: input.category,
        expenseDate: input.expenseDate,
        notes: input.notes,
        tags: input.tags,
        splitMethod: input.splitMethod,
        receiptAttachmentId: input.receiptAttachmentId ?? null,
        updatedBy: userId,
        version: locked.version + 1,
      })
      .where(eq(expenses.id, expenseId));
    await tx.delete(expensePayers).where(eq(expensePayers.expenseId, expenseId));
    await tx.delete(expenseParticipants).where(eq(expenseParticipants.expenseId, expenseId));
    await tx.insert(expensePayers).values(input.payers.map((p) => ({ expenseId, ...p })));
    await tx.insert(expenseParticipants).values(shares.map((s) => ({ expenseId, ...s })));

    const members = await getActiveMemberIds(tx, locked.groupId);
    const involved = new Set([...previousIds, ...input.payers.map((p) => p.userId), ...shares.map((s) => s.userId)]);
    await recordActivity(tx, {
      groupId: locked.groupId,
      actorId: userId,
      type: "expense.updated",
      expenseId,
      data: {
        title: input.title,
        currency: locked.currency,
        before: {
          title: locked.title,
          amountMinor: locked.amountMinor,
          splitMethod: locked.splitMethod,
          payers: before.payers,
          participants: before.participants.map(({ userId: id, shareMinor }) => ({ userId: id, shareMinor })),
        },
        after: {
          title: input.title,
          amountMinor: input.amountMinor,
          splitMethod: input.splitMethod,
          payers: input.payers,
          participants: shares.map(({ userId: id, shareMinor }) => ({ userId: id, shareMinor })),
        },
      },
      notify: [...involved]
        .filter((id) => members.includes(id))
        .map((id) => ({ userId: id, type: "expense_updated" as const, href: `/groups/${locked.groupId}/expenses/${expenseId}` })),
      liveKind: "expense",
      liveRecipients: members,
    });
    return { id: expenseId, version: locked.version + 1 };
  });
}

/** Soft-deletes an expense so the audit trail is preserved; balances exclude it immediately. */
export async function deleteExpense(userId: string, expenseId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    if (!current || current.deletedAt) throw notFound("Expense");
    await requireMember(tx, current.groupId, userId);
    await lockGroup(tx, current.groupId);
    const [locked] = await tx.select().from(expenses).where(eq(expenses.id, expenseId)).for("update").limit(1);
    if (!locked || locked.deletedAt) throw notFound("Expense");

    await tx.update(expenses).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(expenses.id, expenseId));

    const split = await loadSplitRows(tx, expenseId);
    const members = await getActiveMemberIds(tx, locked.groupId);
    const involved = new Set([...split.payers.map((p) => p.userId), ...split.participants.map((p) => p.userId)]);
    await recordActivity(tx, {
      groupId: locked.groupId,
      actorId: userId,
      type: "expense.deleted",
      expenseId,
      data: { title: locked.title, amountMinor: locked.amountMinor, currency: locked.currency },
      notify: [...involved]
        .filter((id) => members.includes(id))
        .map((id) => ({ userId: id, type: "expense_deleted" as const, href: `/groups/${locked.groupId}` })),
      liveKind: "expense",
      liveRecipients: members,
    });
    return { groupId: locked.groupId };
  });
}

/**
 * Toggles the shared "done" tick on an expense. This is a checklist mark for
 * the trip room — it does not change balances (use settle-up for that).
 */
export async function setExpenseDone(userId: string, expenseId: string, done: boolean) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    if (!current || current.deletedAt) throw notFound("Expense");
    await requireMember(tx, current.groupId, userId);
    await lockGroup(tx, current.groupId);
    const [locked] = await tx.select().from(expenses).where(eq(expenses.id, expenseId)).for("update").limit(1);
    if (!locked || locked.deletedAt) throw notFound("Expense");

    const alreadyDone = locked.doneAt !== null;
    if (alreadyDone === done) return { id: expenseId, done, groupId: locked.groupId };

    await tx
      .update(expenses)
      .set({
        doneAt: done ? new Date() : null,
        doneBy: done ? userId : null,
        updatedBy: userId,
      })
      .where(eq(expenses.id, expenseId));

    const members = await getActiveMemberIds(tx, locked.groupId);
    await recordActivity(tx, {
      groupId: locked.groupId,
      actorId: userId,
      type: "expense.updated",
      expenseId,
      data: { title: locked.title, done },
      liveKind: "expense",
      liveRecipients: members,
    });
    return { id: expenseId, done, groupId: locked.groupId };
  });
}

export async function getExpenseDetail(userId: string, expenseId: string) {
  const db = await getDb();
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!expense) throw notFound("Expense");
  await requireMember(db, expense.groupId, userId);

  const split = await loadSplitRows(db, expenseId);
  const ids = [...new Set([...split.payers.map((p) => p.userId), ...split.participants.map((p) => p.userId), expense.createdBy])];
  const people = await db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(inArray(users.id, ids));

  const [receipt] = expense.receiptAttachmentId
    ? await db
        .select({ id: attachments.id, fileName: attachments.fileName, contentType: attachments.contentType, sizeBytes: attachments.sizeBytes })
        .from(attachments)
        .where(eq(attachments.id, expense.receiptAttachmentId))
        .limit(1)
    : [];

  const history = await db
    .select({ id: activityLog.id, type: activityLog.type, createdAt: activityLog.createdAt, actorName: users.name, data: activityLog.data })
    .from(activityLog)
    .innerJoin(users, eq(users.id, activityLog.actorId))
    .where(eq(activityLog.expenseId, expenseId))
    .orderBy(desc(activityLog.createdAt))
    .limit(50);

  return {
    expense,
    payers: split.payers.sort((a, b) => b.amountMinor - a.amountMinor),
    participants: split.participants.sort((a, b) => b.shareMinor - a.shareMinor),
    people: new Map(people.map((p) => [p.id, p])),
    receipt: receipt ?? null,
    history,
  };
}

export async function getExpenseForEdit(userId: string, expenseId: string) {
  const db = await getDb();
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!expense || expense.deletedAt) throw notFound("Expense");
  await requireMember(db, expense.groupId, userId);
  const split = await loadSplitRows(db, expenseId);
  return {
    expense,
    payers: split.payers,
    participants: split.participants.sort((a, b) => (a.userId < b.userId ? -1 : 1)),
  };
}
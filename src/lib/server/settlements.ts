import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { settlements, users } from "@/lib/db/schema";
import { conflict, forbidden, notFound } from "@/lib/errors";
import { maxSettlementAmount } from "@/lib/money/balances";
import { formatMoney } from "@/lib/money/currency";
import { settlementSchema } from "@/lib/validation";
import { assertActiveMembers, getActiveMemberIds, hasRole, lockGroup, requireMember } from "./access";
import { recordActivity } from "./activity";
import { getGroupBalances } from "./balances";
import { parseInput } from "./parse";

/**
 * Records a repayment between two members. This is a ledger entry confirmed
 * by a user; it does not move real money and is labelled as such in the UI.
 */
export async function recordSettlement(userId: string, rawInput: unknown) {
  const input = parseInput(settlementSchema, rawInput);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const actor = await requireMember(tx, input.groupId, userId);
    const group = await lockGroup(tx, input.groupId);

    const [existing] = await tx
      .select({ id: settlements.id, groupId: settlements.groupId })
      .from(settlements)
      .where(and(eq(settlements.createdBy, userId), eq(settlements.clientRequestId, input.clientRequestId)))
      .limit(1);
    if (existing) {
      if (existing.groupId !== input.groupId) throw conflict("Duplicate request.");
      return { id: existing.id, duplicate: true };
    }

    if (userId !== input.fromUserId && userId !== input.toUserId && !hasRole(actor.role, "admin")) {
      throw forbidden("Only the people involved or a group admin can record this repayment.");
    }
    await assertActiveMembers(tx, input.groupId, [input.fromUserId, input.toUserId]);

    const people = await tx
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, [input.fromUserId, input.toUserId]));
    const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Someone";

    // Balances are read under the group lock, so two concurrent repayments
    // cannot both pass this check and clear the same debt twice.
    const balances = await getGroupBalances(tx, input.groupId);
    const outstanding = maxSettlementAmount(balances, input.fromUserId, input.toUserId);
    const isOverpayment = input.amountMinor > outstanding;
    if (isOverpayment && !input.allowOverpayment) {
      throw conflict(
        outstanding === 0
          ? `${nameOf(input.fromUserId)} doesn't currently owe ${nameOf(input.toUserId)} anything. ` +
              "Turn on “Record as overpayment” if this is intentional."
          : `That's more than the outstanding ${formatMoney(outstanding, group.currency)}. ` +
              "Lower the amount or turn on “Record as overpayment”.",
      );
    }

    const [settlement] = await tx
      .insert(settlements)
      .values({
        groupId: input.groupId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountMinor: input.amountMinor,
        currency: group.currency,
        settledOn: input.settledOn,
        note: input.note,
        isOverpayment,
        createdBy: userId,
        clientRequestId: input.clientRequestId,
      })
      .returning({ id: settlements.id });

    const members = await getActiveMemberIds(tx, input.groupId);
    await recordActivity(tx, {
      groupId: input.groupId,
      actorId: userId,
      type: "settlement.created",
      settlementId: settlement.id,
      data: {
        fromName: nameOf(input.fromUserId),
        toName: nameOf(input.toUserId),
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amountMinor: input.amountMinor,
        currency: group.currency,
        isOverpayment,
      },
      notify: [input.fromUserId, input.toUserId].map((id) => ({
        userId: id,
        type: "settlement_recorded" as const,
        href: `/groups/${input.groupId}/settle`,
      })),
      liveKind: "settlement",
      liveRecipients: members,
    });
    return { id: settlement.id, duplicate: false };
  });
}

export async function deleteSettlement(userId: string, settlementId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(settlements).where(eq(settlements.id, settlementId)).limit(1);
    if (!current || current.deletedAt) throw notFound("Repayment");
    const actor = await requireMember(tx, current.groupId, userId);
    await lockGroup(tx, current.groupId);
    const [locked] = await tx.select().from(settlements).where(eq(settlements.id, settlementId)).for("update").limit(1);
    if (!locked || locked.deletedAt) throw notFound("Repayment");

    const involved = [locked.createdBy, locked.fromUserId, locked.toUserId];
    if (!involved.includes(userId) && !hasRole(actor.role, "admin")) {
      throw forbidden("Only the people involved or a group admin can undo this repayment.");
    }
    await tx.update(settlements).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(settlements.id, settlementId));

    const members = await getActiveMemberIds(tx, locked.groupId);
    await recordActivity(tx, {
      groupId: locked.groupId,
      actorId: userId,
      type: "settlement.deleted",
      settlementId,
      data: { amountMinor: locked.amountMinor, currency: locked.currency, fromUserId: locked.fromUserId, toUserId: locked.toUserId },
      notify: [locked.fromUserId, locked.toUserId]
        .filter((id) => members.includes(id))
        .map((id) => ({ userId: id, type: "settlement_recorded" as const, href: `/groups/${locked.groupId}/settle` })),
      liveKind: "settlement",
      liveRecipients: members,
    });
    return { groupId: locked.groupId };
  });
}

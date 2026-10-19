import "server-only";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db";
import { groupMembers, groups, users, type MemberRole } from "@/lib/db/schema";
import { MAX_GROUP_MEMBERS } from "@/lib/constants";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { formatMoney } from "@/lib/money/currency";
import { addMemberSchema, groupSchema, groupUpdateSchema } from "@/lib/validation";
import { getActiveMemberIds, hasRole, lockGroup, requireMember } from "./access";
import { recordActivity } from "./activity";
import { getGroupBalances } from "./balances";
import { parseInput } from "./parse";

export async function createGroup(userId: string, rawInput: unknown) {
  const input = parseInput(groupSchema, rawInput);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(groups)
      .values({ ...input, createdBy: userId })
      .returning();
    await tx.insert(groupMembers).values({ groupId: group.id, userId, role: "owner" });
    await recordActivity(tx, {
      groupId: group.id,
      actorId: userId,
      type: "group.created",
      data: { name: group.name },
      liveKind: "group",
      liveRecipients: [userId],
    });
    return group;
  });
}

export async function updateGroup(userId: string, groupId: string, rawInput: unknown) {
  const input = parseInput(groupUpdateSchema, rawInput);
  const db = await getDb();
  return db.transaction(async (tx) => {
    await requireMember(tx, groupId, userId, "admin");
    const before = await lockGroup(tx, groupId);
    const [group] = await tx.update(groups).set(input).where(eq(groups.id, groupId)).returning();
    const members = await getActiveMemberIds(tx, groupId);
    await recordActivity(tx, {
      groupId,
      actorId: userId,
      type: "group.updated",
      data: { before: { name: before.name, description: before.description }, after: { name: group.name } },
      liveKind: "group",
      liveRecipients: members,
    });
    return group;
  });
}

/**
 * Adds a user to a group, or reactivates a former member. Callers must hold
 * the group lock so the member limit cannot be exceeded concurrently.
 */
export async function addOrReactivateMember(tx: DbOrTx, groupId: string, userId: string) {
  const [existing] = await tx
    .select({ status: groupMembers.status })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  if (existing?.status === "active") return "already" as const;

  const [{ value: activeCount }] = await tx
    .select({ value: count() })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));
  if (activeCount >= MAX_GROUP_MEMBERS) {
    throw conflict(`Groups can have at most ${MAX_GROUP_MEMBERS} members.`);
  }

  if (existing) {
    await tx
      .update(groupMembers)
      .set({ status: "active", role: "member", leftAt: null, joinedAt: new Date() })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    return "reactivated" as const;
  }
  await tx.insert(groupMembers).values({ groupId, userId, role: "member" });
  return "added" as const;
}

export async function addMemberByEmail(actorId: string, rawInput: unknown) {
  const { groupId, email } = parseInput(addMemberSchema, rawInput);
  const db = await getDb();
  return db.transaction(async (tx) => {
    await requireMember(tx, groupId, actorId, "admin");
    await lockGroup(tx, groupId);
    const [target] = await tx
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (!target) {
      throw invalid("No SplitMate account uses that email yet. Send them an invite link instead.", {
        email: "No account found for this email.",
      });
    }
    const outcome = await addOrReactivateMember(tx, groupId, target.id);
    if (outcome === "already") throw conflict(`${target.name} is already in this group.`);
    const members = await getActiveMemberIds(tx, groupId);
    await recordActivity(tx, {
      groupId,
      actorId,
      type: "member.added",
      subjectUserId: target.id,
      data: { name: target.name },
      notify: [{ userId: target.id, type: "member_added", href: `/groups/${groupId}` }],
      liveKind: "membership",
      liveRecipients: members,
    });
    return { userId: target.id, name: target.name };
  });
}

async function assertSettled(tx: DbOrTx, groupId: string, userId: string, currency: string, who: string) {
  const balances = await getGroupBalances(tx, groupId);
  const balance = balances.get(userId) ?? 0;
  if (balance !== 0) {
    const amount = formatMoney(Math.abs(balance), currency);
    throw conflict(
      balance < 0
        ? `${who} still owe${who === "You" ? "" : "s"} ${amount} in this group. Settle up first.`
        : `${who} ${who === "You" ? "are" : "is"} still owed ${amount} in this group. Settle up first.`,
    );
  }
}

export async function leaveGroup(userId: string, groupId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const member = await requireMember(tx, groupId, userId);
    const group = await lockGroup(tx, groupId);
    await assertSettled(tx, groupId, userId, group.currency, "You");

    await tx
      .update(groupMembers)
      .set({ status: "left", leftAt: new Date(), role: "member" })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

    if (member.role === "owner") {
      // Hand ownership to the longest-standing admin, or else the longest-standing member.
      const [successor] = await tx
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")))
        .orderBy(sql`case when ${groupMembers.role} = 'admin' then 0 else 1 end`, asc(groupMembers.joinedAt))
        .limit(1);
      if (successor) {
        await tx
          .update(groupMembers)
          .set({ role: "owner" })
          .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, successor.userId)));
      }
    }

    const members = await getActiveMemberIds(tx, groupId);
    await recordActivity(tx, {
      groupId,
      actorId: userId,
      type: "member.left",
      subjectUserId: userId,
      liveKind: "membership",
      liveRecipients: [...members, userId],
    });
  });
}

export async function removeMember(actorId: string, groupId: string, targetUserId: string) {
  if (actorId === targetUserId) return leaveGroup(actorId, groupId);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const actor = await requireMember(tx, groupId, actorId, "admin");
    const group = await lockGroup(tx, groupId);
    const [target] = await tx
      .select({ role: groupMembers.role, status: groupMembers.status, name: users.name })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)))
      .limit(1);
    if (!target || target.status !== "active") throw notFound("Member");
    if (target.role === "owner") throw forbidden("The group owner can't be removed.");
    if (target.role === "admin" && actor.role !== "owner") throw forbidden("Only the owner can remove an admin.");
    await assertSettled(tx, groupId, targetUserId, group.currency, target.name);

    await tx
      .update(groupMembers)
      .set({ status: "removed", leftAt: new Date(), role: "member" })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
    const members = await getActiveMemberIds(tx, groupId);
    await recordActivity(tx, {
      groupId,
      actorId,
      type: "member.removed",
      subjectUserId: targetUserId,
      data: { name: target.name },
      liveKind: "membership",
      liveRecipients: [...members, targetUserId],
    });
  });
}

export async function setMemberRole(actorId: string, groupId: string, targetUserId: string, role: MemberRole) {
  if (role === "owner") throw invalid("Ownership is transferred automatically when the owner leaves.");
  const db = await getDb();
  return db.transaction(async (tx) => {
    await requireMember(tx, groupId, actorId, "owner");
    await lockGroup(tx, groupId);
    const target = await requireMember(tx, groupId, targetUserId).catch(() => {
      throw notFound("Member");
    });
    if (hasRole(target.role, "owner")) throw forbidden("You can't change the owner's role.");
    await tx
      .update(groupMembers)
      .set({ role })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId)));
    const members = await getActiveMemberIds(tx, groupId);
    await recordActivity(tx, {
      groupId,
      actorId,
      type: "member.role_changed",
      subjectUserId: targetUserId,
      data: { role },
      liveKind: "membership",
      liveRecipients: members,
    });
  });
}

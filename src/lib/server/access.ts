import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";
import { groupMembers, groups, type MemberRole } from "@/lib/db/schema";
import { forbidden, notFound } from "@/lib/errors";

const ROLE_RANK: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

export function hasRole(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Ensures `userId` is an active member of the group. Non-members get a
 * NOT_FOUND error so the existence of private groups is never revealed.
 */
export async function requireMember(
  db: DbOrTx,
  groupId: string,
  userId: string,
  minimumRole: MemberRole = "member",
) {
  const [member] = await db
    .select({ role: groupMembers.role, status: groupMembers.status })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  if (!member || member.status !== "active") throw notFound("Group");
  if (!hasRole(member.role, minimumRole)) {
    throw forbidden(minimumRole === "owner" ? "Only the group owner can do that." : "Only group admins can do that.");
  }
  return member;
}

/**
 * Takes a row lock on the group. Every write that changes the group's ledger
 * goes through this lock, so balance checks (e.g. settlement limits) and the
 * writes that depend on them are serialized per group.
 */
export async function lockGroup(db: DbOrTx, groupId: string) {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).for("update").limit(1);
  if (!group) throw notFound("Group");
  return group;
}

export async function getActiveMemberIds(db: DbOrTx, groupId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")));
  return rows.map((r) => r.userId);
}

/** Verifies that every user id is an active member of the group. */
export async function assertActiveMembers(db: DbOrTx, groupId: string, userIds: string[], allowed: string[] = []) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const rows = await db
    .select({ userId: groupMembers.userId, status: groupMembers.status })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), inArray(groupMembers.userId, unique)));
  const statusById = new Map(rows.map((r) => [r.userId, r.status]));
  for (const id of unique) {
    const status = statusById.get(id);
    if (status === "active") continue;
    if (status && allowed.includes(id)) continue;
    throw forbidden("Everyone on an expense or repayment must be a current member of the group.");
  }
}

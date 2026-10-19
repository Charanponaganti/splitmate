"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { runAction } from "@/lib/server/action";
import { createExpense, deleteExpense, setExpenseDone, updateExpense } from "@/lib/server/expenses";
import {
  addMemberByEmail,
  createGroup,
  leaveGroup,
  removeMember,
  setMemberRole,
  updateGroup,
} from "@/lib/server/groups";
import { acceptInvitation, createInvitation, revokeInvitation } from "@/lib/server/invitations";
import { parseInput } from "@/lib/server/parse";
import { markNotificationsRead } from "@/lib/server/queries";
import { deleteSettlement, recordSettlement } from "@/lib/server/settlements";
import { idSchema, profileSchema, uuidSchema } from "@/lib/validation";

const uuid = (value: unknown) => parseInput(uuidSchema, value);
const id = (value: unknown) => parseInput(idSchema, value);

/* Groups ------------------------------------------------------------------- */

export async function createGroupAction(input: unknown) {
  return runAction(async (user) => {
    const group = await createGroup(user.id, input);
    return { id: group.id };
  });
}

export async function updateGroupAction(groupId: string, input: unknown) {
  return runAction(async (user) => {
    await updateGroup(user.id, uuid(groupId), input);
    return null;
  });
}

export async function addMemberAction(input: unknown) {
  return runAction((user) => addMemberByEmail(user.id, input));
}

export async function removeMemberAction(groupId: string, userId: string) {
  return runAction(async (user) => {
    await removeMember(user.id, uuid(groupId), id(userId));
    return null;
  });
}

export async function leaveGroupAction(groupId: string) {
  return runAction(async (user) => {
    await leaveGroup(user.id, uuid(groupId));
    return null;
  });
}

export async function setMemberRoleAction(groupId: string, userId: string, role: unknown) {
  return runAction(async (user) => {
    const parsedRole = parseInput(z.enum(["admin", "member"]), role);
    await setMemberRole(user.id, uuid(groupId), id(userId), parsedRole);
    return null;
  });
}

/* Invitations -------------------------------------------------------------- */

export async function createInvitationAction(input: unknown) {
  return runAction(async (user) => {
    const result = await createInvitation(user.id, input);
    return { url: result.url, emailSent: result.emailSent, expiresAt: result.expiresAt.toISOString() };
  });
}

export async function revokeInvitationAction(invitationId: string) {
  return runAction(async (user) => {
    await revokeInvitation(user.id, uuid(invitationId));
    return null;
  });
}

export async function acceptInvitationAction(token: string) {
  return runAction(async (user) => acceptInvitation(user.id, String(token)));
}

/* Expenses ----------------------------------------------------------------- */

export async function createExpenseAction(input: unknown) {
  return runAction((user) => createExpense(user.id, input));
}

export async function updateExpenseAction(expenseId: string, input: unknown) {
  return runAction((user) => updateExpense(user.id, uuid(expenseId), input));
}

export async function deleteExpenseAction(expenseId: string) {
  return runAction((user) => deleteExpense(user.id, uuid(expenseId)));
}

export async function setExpenseDoneAction(expenseId: string, done: boolean) {
  return runAction((user) => setExpenseDone(user.id, uuid(expenseId), Boolean(done)));
}

/* Settlements -------------------------------------------------------------- */

export async function recordSettlementAction(input: unknown) {
  return runAction((user) => recordSettlement(user.id, input));
}

export async function deleteSettlementAction(settlementId: string) {
  return runAction((user) => deleteSettlement(user.id, uuid(settlementId)));
}

/* Profile & notifications -------------------------------------------------- */

export async function updateProfileAction(input: unknown) {
  return runAction(async (user) => {
    const data = parseInput(profileSchema, input);
    const db = await getDb();
    await db.update(users).set(data).where(eq(users.id, user.id));
    return null;
  });
}

export async function markNotificationsReadAction(ids?: string[]) {
  return runAction(async (user) => {
    const parsed = ids ? parseInput(z.array(uuidSchema).max(200), ids) : undefined;
    await markNotificationsRead(user.id, parsed);
    return null;
  });
}

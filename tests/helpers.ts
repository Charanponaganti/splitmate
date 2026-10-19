import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

let counter = 0;

export async function createUser(name: string) {
  const db = await getDb();
  counter += 1;
  const id = `user_${name.toLowerCase()}_${counter}_${randomUUID().slice(0, 8)}`;
  await db.insert(users).values({
    id,
    name,
    email: `${name.toLowerCase()}.${counter}.${randomUUID().slice(0, 6)}@example.test`,
    emailVerified: true,
  });
  return id;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function equalExpense(
  groupId: string,
  payerId: string,
  amountMinor: number,
  participantIds: string[],
  title = "Dinner",
) {
  return {
    groupId,
    title,
    amountMinor,
    category: "food" as const,
    expenseDate: today(),
    splitMethod: "equal" as const,
    payers: [{ userId: payerId, amountMinor }],
    participants: participantIds.map((userId) => ({ userId })),
    clientRequestId: randomUUID(),
  };
}

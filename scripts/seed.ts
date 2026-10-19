import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });
config();

/**
 * Seeds realistic demo data for local development only. Creates clearly
 * labelled demo accounts (@demo.splitmate.test) and never touches real users.
 *
 *   npm run db:seed
 *
 * All demo accounts use the password: demo-password-123
 */
async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("Refusing to seed a production database. Pass --force if you really mean it.");
  }

  const { hashPassword } = await import("better-auth/crypto");
  const { like } = await import("drizzle-orm");
  const { getDb, closeDb } = await import("../src/lib/db");
  const { accounts, users } = await import("../src/lib/db/schema");
  const { createGroup } = await import("../src/lib/server/groups");
  const { createInvitation, acceptInvitation } = await import("../src/lib/server/invitations");
  const { createExpense } = await import("../src/lib/server/expenses");
  const { recordSettlement } = await import("../src/lib/server/settlements");

  const db = await getDb();
  const existing = await db.select({ id: users.id }).from(users).where(like(users.email, "%@demo.splitmate.test")).limit(1);
  if (existing.length > 0) {
    console.log("Demo data already exists. Delete .data/ to start fresh.");
    await closeDb();
    return;
  }

  const password = await hashPassword("demo-password-123");
  const people = [
    { name: "Asha Rao", email: "asha@demo.splitmate.test" },
    { name: "Bilal Khan", email: "bilal@demo.splitmate.test" },
    { name: "Chen Wei", email: "chen@demo.splitmate.test" },
    { name: "Divya Menon", email: "divya@demo.splitmate.test" },
  ];
  const ids: string[] = [];
  for (const p of people) {
    const id = randomUUID();
    ids.push(id);
    await db.insert(users).values({ id, name: p.name, email: p.email, emailVerified: true, preferredCurrency: "INR" });
    await db.insert(accounts).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password });
  }
  const [asha, bilal, chen, divya] = ids;

  const join = async (groupId: string, inviter: string, who: string) => {
    const { url } = await createInvitation(inviter, { groupId });
    await acceptInvitation(who, url.split("/invite/")[1]);
  };
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  type Category = "food" | "travel" | "accommodation" | "transport" | "entertainment" | "groceries" | "rent" | "utilities";
  const expense = (
    groupId: string,
    actor: string,
    title: string,
    amount: number,
    category: Category,
    daysAgo: number,
    payers: [string, number][],
    participants: { userId: string; value?: number }[],
    splitMethod: "equal" | "exact" | "percentage" | "shares" = "equal",
  ) =>
    createExpense(actor, {
      groupId,
      title,
      amountMinor: amount,
      category,
      expenseDate: day(daysAgo),
      splitMethod,
      payers: payers.map(([userId, amountMinor]) => ({ userId, amountMinor })),
      participants,
      clientRequestId: randomUUID(),
    });

  const trip = await createGroup(asha, {
    name: "Goa trip",
    description: "Four days of beaches and seafood",
    category: "trip",
    currency: "INR",
  });
  await join(trip.id, asha, bilal);
  await join(trip.id, asha, chen);
  await join(trip.id, bilal, divya);
  const all = ids.map((userId) => ({ userId }));
  await expense(trip.id, asha, "Villa booking", 2400000, "accommodation", 40, [[asha, 2400000]], all);
  await expense(trip.id, bilal, "Flights to Goa", 3200000, "travel", 41, [[bilal, 2000000], [chen, 1200000]], all);
  await expense(trip.id, asha, "Dinner at the shack", 120000, "food", 38, [[asha, 120000]], [{ userId: asha }, { userId: bilal }, { userId: chen }]);
  await expense(trip.id, divya, "Scooter rental", 180000, "transport", 37, [[divya, 180000]], [{ userId: divya, value: 200 }, { userId: chen, value: 100 }], "shares");
  await expense(trip.id, chen, "Water sports", 640000, "entertainment", 36, [[chen, 640000]], [
    { userId: asha, value: 4000 },
    { userId: chen, value: 3000 },
    { userId: divya, value: 3000 },
  ], "percentage");
  await expense(trip.id, bilal, "Groceries for the villa", 345050, "groceries", 39, [[bilal, 345050]], [
    { userId: asha, value: 100000 },
    { userId: bilal, value: 145050 },
    { userId: divya, value: 100000 },
  ], "exact");
  await recordSettlement(divya, {
    groupId: trip.id,
    fromUserId: divya,
    toUserId: asha,
    amountMinor: 300000,
    settledOn: day(30),
    note: "UPI",
    clientRequestId: randomUUID(),
  });

  const flat = await createGroup(chen, { name: "Flat 4B", description: "Rent and bills", category: "roommates", currency: "INR" });
  await join(flat.id, chen, asha);
  await join(flat.id, chen, divya);
  const flatmates = [chen, asha, divya].map((userId) => ({ userId }));
  for (let m = 0; m < 3; m++) {
    await expense(flat.id, chen, "Rent", 4500000, "rent", 10 + m * 30, [[chen, 4500000]], flatmates);
    await expense(flat.id, asha, "Electricity bill", 268000 + m * 12000, "utilities", 12 + m * 30, [[asha, 268000 + m * 12000]], flatmates);
    await expense(flat.id, divya, "Groceries", 412500 - m * 20000, "groceries", 5 + m * 30, [[divya, 412500 - m * 20000]], flatmates);
  }

  console.log("Seeded demo data. Sign in as any of:");
  for (const p of people) console.log(`  ${p.email}  /  demo-password-123`);
  await closeDb();
}

main().catch((error) => {
  console.error("Seeding failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});

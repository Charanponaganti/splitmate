import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/lib/db";
import { groupMembers, notifications } from "@/lib/db/schema";
import { computeNetBalances, simplifyDebts } from "@/lib/money/balances";
import { getGroupBalances } from "@/lib/server/balances";
import { createExpense, deleteExpense, getExpenseDetail, getExpenseForEdit, updateExpense } from "@/lib/server/expenses";
import { addMemberByEmail, createGroup, leaveGroup, removeMember } from "@/lib/server/groups";
import { acceptInvitation, createInvitation, previewInvitation } from "@/lib/server/invitations";
import {
  getActivityFeed,
  getAnalytics,
  getDashboard,
  getGroupOverview,
  listExpenses,
  listNotifications,
} from "@/lib/server/queries";
import { deleteSettlement, recordSettlement } from "@/lib/server/settlements";
import { createUser, equalExpense, today } from "./helpers";

let A: string, B: string, C: string, D: string, outsider: string;
let groupId: string;

async function joinViaInvite(userId: string, gid: string, inviter: string) {
  const { url } = await createInvitation(inviter, { groupId: gid });
  const token = url.split("/invite/")[1];
  return acceptInvitation(userId, token);
}

async function balancesObject(gid: string) {
  const db = await getDb();
  const b = await getGroupBalances(db, gid);
  return Object.fromEntries([...b.entries()].filter(([, v]) => v !== 0));
}

beforeAll(async () => {
  await getDb();
  [A, B, C, D, outsider] = await Promise.all(["Asha", "Bilal", "Chen", "Divya", "Eve"].map(createUser));
  const group = await createGroup(A, { name: "Goa trip", category: "trip", currency: "INR" });
  groupId = group.id;
  await joinViaInvite(B, groupId, A);
  await joinViaInvite(C, groupId, A);
  await joinViaInvite(D, groupId, B);
});

afterAll(async () => {
  await closeDb();
});

describe("expenses and balances (database)", () => {
  it("2. subset split: A pays ₹1,200 for A, B, C — D is not charged", async () => {
    await createExpense(A, equalExpense(groupId, A, 120_000, [A, B, C]));
    expect(await balancesObject(groupId)).toEqual({ [A]: 80_000, [B]: -40_000, [C]: -40_000 });
  });

  it("is idempotent: resubmitting the same request does not duplicate the expense", async () => {
    const input = equalExpense(groupId, D, 40_000, [C, D], "Taxi");
    const first = await createExpense(D, input);
    const second = await createExpense(D, input);
    expect(second).toEqual({ id: first.id, duplicate: true });
    expect(await balancesObject(groupId)).toEqual({ [A]: 80_000, [B]: -40_000, [C]: -60_000, [D]: 20_000 });
    await deleteExpense(D, first.id);
  });

  it("3 & 7. multiple payers with the payer excluded from participants", async () => {
    const { id } = await createExpense(B, {
      groupId,
      title: "Boat tickets",
      amountMinor: 90_000,
      category: "travel",
      expenseDate: today(),
      splitMethod: "shares",
      payers: [
        { userId: B, amountMinor: 60_000 },
        { userId: D, amountMinor: 30_000 },
      ],
      participants: [
        { userId: A, value: 100 },
        { userId: C, value: 200 },
      ],
      clientRequestId: randomUUID(),
    });
    // A: 80000 - 30000 = 50000; B: -40000 + 60000 = 20000; C: -40000 - 60000 = -100000; D: +30000
    expect(await balancesObject(groupId)).toEqual({ [A]: 50_000, [B]: 20_000, [C]: -100_000, [D]: 30_000 });
    await deleteExpense(B, id);
  });

  it("rejects invalid totals on the server even if the client is bypassed", async () => {
    await expect(
      createExpense(A, {
        ...equalExpense(groupId, A, 10_000, [A, B]),
        splitMethod: "exact",
        participants: [
          { userId: A, value: 4_000 },
          { userId: B, value: 5_000 },
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createExpense(A, { ...equalExpense(groupId, A, 10_000, [A, B]), payers: [{ userId: A, amountMinor: 9_000 }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await balancesObject(groupId)).toEqual({ [A]: 80_000, [B]: -40_000, [C]: -40_000 });
  });

  it("12. editing an expense recalculates balances and enforces versions", async () => {
    const { id } = await createExpense(C, equalExpense(groupId, C, 30_000, [A, B, C], "Snacks"));
    expect(await balancesObject(groupId)).toEqual({ [A]: 70_000, [B]: -50_000, [C]: -20_000 });

    const { expense } = await getExpenseForEdit(A, id);
    const update = {
      title: "Snacks & drinks",
      amountMinor: 60_000,
      category: "food" as const,
      expenseDate: today(),
      splitMethod: "percentage" as const,
      payers: [{ userId: C, amountMinor: 60_000 }],
      participants: [
        { userId: C, value: 5_000 },
        { userId: D, value: 5_000 },
      ],
      expectedVersion: expense.version,
    };
    const result = await updateExpense(A, id, update);
    expect(result.version).toBe(expense.version + 1);
    // C paid 60000, C share 30000, D share 30000
    expect(await balancesObject(groupId)).toEqual({ [A]: 80_000, [B]: -40_000, [C]: -10_000, [D]: -30_000 });

    // A stale edit from someone who loaded the old version is rejected.
    await expect(updateExpense(B, id, update)).rejects.toMatchObject({ code: "CONFLICT" });

    const detail = await getExpenseDetail(B, id);
    expect(detail.history.map((h) => h.type)).toEqual(["expense.updated", "expense.created"]);

    // 12. deleting restores the previous balances
    await deleteExpense(B, id);
    expect(await balancesObject(groupId)).toEqual({ [A]: 80_000, [B]: -40_000, [C]: -40_000 });
    await expect(deleteExpense(B, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("9. SQL-derived balances match the pure engine across many expenses", async () => {
    const g = await createGroup(A, { name: "Flat 4B", category: "roommates", currency: "USD" });
    await joinViaInvite(B, g.id, A);
    await joinViaInvite(C, g.id, A);
    const people = [A, B, C];
    const ledger = [];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 25; i++) {
      const payer = people[Math.floor(rand() * 3)];
      const participants = people.filter(() => rand() > 0.3);
      if (participants.length === 0) participants.push(payer);
      const amount = 1 + Math.floor(rand() * 100_000);
      await createExpense(payer, equalExpense(g.id, payer, amount, participants, `E${i}`));
    }
    const listed = await listExpenses(A, { groupId: g.id, sort: "date_desc", page: 1 }, 100);
    expect(listed.total).toBe(25);
    for (const e of listed.items) {
      ledger.push({
        payers: e.payers.map((p) => ({ userId: p.id, amountMinor: p.amountMinor })),
        participants: e.participants.map((p) => ({ userId: p.id, shareMinor: p.shareMinor })),
      });
    }
    const db = await getDb();
    const sqlBalances = await getGroupBalances(db, g.id);
    const engine = computeNetBalances(ledger);
    for (const id of people) expect(sqlBalances.get(id) ?? 0).toBe(engine.get(id) ?? 0);
    expect([...sqlBalances.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("settlements (database)", () => {
  it("10. partial then full repayment clears the debt", async () => {
    await recordSettlement(B, {
      groupId,
      fromUserId: B,
      toUserId: A,
      amountMinor: 10_000,
      settledOn: today(),
      clientRequestId: randomUUID(),
    });
    expect(await balancesObject(groupId)).toEqual({ [A]: 70_000, [B]: -30_000, [C]: -40_000 });
    await recordSettlement(A, {
      groupId,
      fromUserId: B,
      toUserId: A,
      amountMinor: 30_000,
      settledOn: today(),
      note: "UPI",
      clientRequestId: randomUUID(),
    });
    expect(await balancesObject(groupId)).toEqual({ [A]: 40_000, [C]: -40_000 });
  });

  it("13. duplicate submissions and over-settlement are prevented", async () => {
    const request = {
      groupId,
      fromUserId: C,
      toUserId: A,
      amountMinor: 40_000,
      settledOn: today(),
      clientRequestId: randomUUID(),
    };
    const first = await recordSettlement(C, request);
    const retry = await recordSettlement(C, request);
    expect(retry).toEqual({ id: first.id, duplicate: true });
    expect(await balancesObject(groupId)).toEqual({});

    // A second, separate "mark as paid" for the same debt is rejected because nothing is outstanding.
    await expect(recordSettlement(C, { ...request, clientRequestId: randomUUID() })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // Concurrent duplicate clicks with different request ids: exactly one succeeds.
    await createExpense(A, equalExpense(groupId, A, 20_000, [A, B]));
    const attempt = () =>
      recordSettlement(B, { ...request, fromUserId: B, amountMinor: 10_000, clientRequestId: randomUUID() });
    const results = await Promise.allSettled([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balancesObject(groupId)).toEqual({});
  });

  it("allows an explicit overpayment and can be undone", async () => {
    const { id } = await recordSettlement(D, {
      groupId,
      fromUserId: D,
      toUserId: A,
      amountMinor: 5_000,
      settledOn: today(),
      allowOverpayment: true,
      clientRequestId: randomUUID(),
    });
    expect(await balancesObject(groupId)).toEqual({ [D]: 5_000, [A]: -5_000 });
    await deleteSettlement(A, id);
    expect(await balancesObject(groupId)).toEqual({});
  });

  it("only the people involved or an admin can record a repayment", async () => {
    await createExpense(A, equalExpense(groupId, A, 20_000, [A, C]));
    await expect(
      recordSettlement(D, {
        groupId,
        fromUserId: C,
        toUserId: A,
        amountMinor: 10_000,
        settledOn: today(),
        clientRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("11. suggested transfers settle the group exactly", async () => {
    const overview = await getGroupOverview(A, groupId);
    expect(overview.transfers).toEqual(simplifyDebts(overview.balances));
    for (const t of overview.transfers) {
      await recordSettlement(t.fromUserId, { groupId, ...t, settledOn: today(), clientRequestId: randomUUID() });
    }
    expect(await balancesObject(groupId)).toEqual({});
  });
});

describe("authorization and isolation (database)", () => {
  it("14. outsiders cannot read or write another group's data", async () => {
    const { id: expenseId } = await createExpense(A, equalExpense(groupId, A, 1_000, [A, B]));
    await expect(getGroupOverview(outsider, groupId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getExpenseDetail(outsider, expenseId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listExpenses(outsider, { groupId, sort: "date_desc", page: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getActivityFeed(outsider, { groupId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createExpense(outsider, equalExpense(groupId, outsider, 1_000, [outsider]))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      updateExpense(outsider, expenseId, {
        title: "hacked",
        amountMinor: 1,
        category: "other",
        expenseDate: today(),
        splitMethod: "equal",
        payers: [{ userId: outsider, amountMinor: 1 }],
        participants: [{ userId: outsider }],
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteExpense(outsider, expenseId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      recordSettlement(outsider, {
        groupId,
        fromUserId: B,
        toUserId: A,
        amountMinor: 500,
        settledOn: today(),
        clientRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createInvitation(outsider, { groupId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Cross-group listings never leak this group's expenses.
    const all = await listExpenses(outsider, { sort: "date_desc", page: 1 });
    expect(all.total).toBe(0);
    const dashboard = await getDashboard(outsider);
    expect(dashboard.groups).toHaveLength(0);
    expect(await getActivityFeed(outsider)).toHaveLength(0);
    await deleteExpense(A, expenseId);
  });

  it("members cannot charge non-members on an expense", async () => {
    await expect(createExpense(A, equalExpense(groupId, A, 1_000, [A, outsider]))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("regular members cannot add people directly; admins can", async () => {
    const newcomer = await createUser("Farah");
    const db = await getDb();
    const [row] = await db.select().from((await import("@/lib/db/schema")).users).where(eq((await import("@/lib/db/schema")).users.id, newcomer));
    await expect(addMemberByEmail(B, { groupId, email: row.email })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await addMemberByEmail(A, { groupId, email: row.email });
    await removeMember(A, groupId, newcomer);
  });

  it("email invitations can only be accepted by that email", async () => {
    const { url } = await createInvitation(A, { groupId, email: "someone.else@example.test" });
    const token = url.split("/invite/")[1];
    await expect(acceptInvitation(outsider, token)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const preview = await previewInvitation(token, outsider);
    expect(preview?.groupId).toBeNull();
    expect(preview?.state).toBe("valid");
    expect(await previewInvitation("not-a-real-token-xxxxxxxxxxxxxxxxxxxxxx", outsider)).toBeNull();
  });

  it("members with an outstanding balance cannot leave", async () => {
    await createExpense(A, equalExpense(groupId, A, 10_000, [A, D]));
    await expect(leaveGroup(D, groupId)).rejects.toMatchObject({ code: "CONFLICT" });
    await recordSettlement(D, {
      groupId,
      fromUserId: D,
      toUserId: A,
      amountMinor: 5_000,
      settledOn: today(),
      clientRequestId: randomUUID(),
    });
    await leaveGroup(D, groupId);
    await expect(getGroupOverview(D, groupId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const db = await getDb();
    const [m] = await db
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, D)));
    expect(m.status).toBe("left");
    // History is preserved: D still appears in the ledger, with a zero balance.
    const overview = await getGroupOverview(A, groupId);
    expect(overview.members.find((x) => x.id === D)?.balance).toBe(0);
  });
});

describe("notifications, activity and analytics (database)", () => {
  it("sends exactly one notification per user per operation and never to the actor", async () => {
    const { id } = await createExpense(B, equalExpense(groupId, B, 3_000, [B, C]));
    const db = await getDb();
    const rows = await db.select().from(notifications);
    const forExpense = (await listNotifications(C)).filter((n) => n.href?.endsWith(id));
    expect(forExpense).toHaveLength(1);
    expect(forExpense[0].type).toBe("expense_involved");
    const forA = (await listNotifications(A)).filter((n) => n.href?.endsWith(id));
    expect(forA).toHaveLength(1);
    expect(forA[0].type).toBe("expense_added");
    expect((await listNotifications(B)).filter((n) => n.href?.endsWith(id))).toHaveLength(0);
    const keys = rows.map((r) => `${r.userId}:${r.activityId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("filters, searches and computes analytics from real records", async () => {
    const search = await listExpenses(A, { groupId, q: "boat", sort: "date_desc", page: 1 });
    expect(search.total).toBe(0); // the boat expense was deleted
    const taxi = await listExpenses(A, { q: "%", sort: "date_desc", page: 1 });
    expect(taxi.total).toBe(0); // wildcards are escaped
    const byPayer = await listExpenses(A, { groupId, payerId: B, sort: "amount_desc", page: 1 });
    expect(byPayer.items.every((e) => e.payers.some((p) => p.id === B))).toBe(true);

    const analytics = await getAnalytics(A, { groupId, sort: "date_desc", page: 1 });
    expect(analytics.currency).toBe("INR");
    const listed = await listExpenses(A, { groupId, sort: "date_desc", page: 1 }, 500);
    expect(analytics.total).toBe(listed.items.reduce((s, e) => s + e.amountMinor, 0));
    expect(analytics.myShare).toBe(listed.items.reduce((s, e) => s + e.myShare, 0));
    expect(analytics.byCategory.reduce((s, c) => s + c.total, 0)).toBe(analytics.total);
    expect(analytics.byMember.reduce((s, m) => s + m.paid, 0)).toBe(analytics.total);
    expect(analytics.byMember.reduce((s, m) => s + m.share, 0)).toBe(analytics.total);

    const feed = await getActivityFeed(A, { groupId, limit: 5 });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0].createdAt.getTime()).toBeGreaterThanOrEqual(feed[feed.length - 1].createdAt.getTime());
  });

  it("dashboard totals reflect balances across groups", async () => {
    const dashboard = await getDashboard(A);
    expect(dashboard.groups.length).toBeGreaterThanOrEqual(2);
    for (const t of dashboard.totals) expect(t.net).toBe(t.owed - t.owe);
  });
});

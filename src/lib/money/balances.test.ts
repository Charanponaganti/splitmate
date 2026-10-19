import { describe, expect, it } from "vitest";
import {
  computeNetBalances,
  expenseTransfers,
  maxSettlementAmount,
  simplifyDebts,
  sumBalances,
  type Balances,
  type LedgerExpense,
  type Transfer,
} from "./balances";
import { computeSplit } from "./split";

function expense(
  payers: Record<string, number>,
  method: Parameters<typeof computeSplit>[1],
  participants: { userId: string; value?: number }[],
): LedgerExpense {
  const total = Object.values(payers).reduce((a, b) => a + b, 0);
  const split = computeSplit(total, method, participants);
  if (!split.ok) throw new Error(split.error);
  return {
    payers: Object.entries(payers).map(([userId, amountMinor]) => ({ userId, amountMinor })),
    participants: split.shares,
  };
}

function asObject(balances: Balances) {
  return Object.fromEntries([...balances.entries()].filter(([, v]) => v !== 0));
}

function applyTransfers(balances: Balances, transfers: Transfer[]): Balances {
  const result = new Map(balances);
  for (const t of transfers) {
    result.set(t.fromUserId, (result.get(t.fromUserId) ?? 0) + t.amountMinor);
    result.set(t.toUserId, (result.get(t.toUserId) ?? 0) - t.amountMinor);
  }
  return result;
}

describe("computeNetBalances", () => {
  it("1. one payer, equal split among all", () => {
    const b = computeNetBalances([
      expense({ a: 120_000 }, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }, { userId: "d" }]),
    ]);
    expect(asObject(b)).toEqual({ a: 90_000, b: -30_000, c: -30_000, d: -30_000 });
  });

  it("2. subset split: D is never charged", () => {
    const e = expense({ a: 120_000 }, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]);
    const b = computeNetBalances([e]);
    expect(asObject(b)).toEqual({ a: 80_000, b: -40_000, c: -40_000 });
    expect(b.get("d")).toBeUndefined();
    expect(expenseTransfers(e)).toEqual([
      { fromUserId: "b", toUserId: "a", amountMinor: 40_000 },
      { fromUserId: "c", toUserId: "a", amountMinor: 40_000 },
    ]);
  });

  it("3. payer excluded from participants is owed the full amount", () => {
    const b = computeNetBalances([expense({ a: 90_000 }, "equal", [{ userId: "b" }, { userId: "c" }])]);
    expect(asObject(b)).toEqual({ a: 90_000, b: -45_000, c: -45_000 });
  });

  it("7. multiple payers with unequal contributions", () => {
    const b = computeNetBalances([
      expense({ a: 100_000, b: 50_000 }, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]),
    ]);
    expect(asObject(b)).toEqual({ a: 50_000, c: -50_000 });
  });

  it("9. multiple expenses involving different participants", () => {
    const b = computeNetBalances([
      expense({ a: 120_000 }, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]),
      expense({ b: 60_000 }, "equal", [{ userId: "b" }, { userId: "d" }]),
      expense({ d: 10_000 }, "exact", [
        { userId: "a", value: 2_500 },
        { userId: "c", value: 7_500 },
      ]),
      expense({ c: 30_000 }, "percentage", [
        { userId: "a", value: 5_000 },
        { userId: "d", value: 5_000 },
      ]),
    ]);
    expect(asObject(b)).toEqual({ a: 62_500, b: -10_000, c: -17_500, d: -35_000 });
    expect(sumBalances(b)).toBe(0);
  });

  it("10. settlements partially and fully clear debts", () => {
    const expenses = [expense({ a: 120_000 }, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }])];
    const partial = computeNetBalances(expenses, [{ fromUserId: "b", toUserId: "a", amountMinor: 10_000 }]);
    expect(asObject(partial)).toEqual({ a: 70_000, b: -30_000, c: -40_000 });

    const full = computeNetBalances(expenses, [
      { fromUserId: "b", toUserId: "a", amountMinor: 40_000 },
      { fromUserId: "c", toUserId: "a", amountMinor: 40_000 },
    ]);
    expect(asObject(full)).toEqual({});
  });

  it("12. editing or deleting an expense is reflected by recomputing from the ledger", () => {
    const dinner = expense({ a: 120_000 }, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]);
    const taxi = expense({ b: 30_000 }, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]);
    const before = computeNetBalances([dinner, taxi]);
    expect(asObject(before)).toEqual({ a: 70_000, b: -20_000, c: -50_000 });

    const editedDinner = expense({ a: 60_000 }, "equal", [{ userId: "a" }, { userId: "b" }]);
    expect(asObject(computeNetBalances([editedDinner, taxi]))).toEqual({ a: 20_000, b: -10_000, c: -10_000 });

    expect(asObject(computeNetBalances([taxi]))).toEqual({ a: -10_000, b: 20_000, c: -10_000 });
  });
});

describe("simplifyDebts", () => {
  it("11. simplifies the A/B/C example while preserving balances", () => {
    // A owes B 500, C owes B 300, C owes A 200 → A: -300, B: +800, C: -500
    const balances: Balances = new Map([
      ["A", -30_000],
      ["B", 80_000],
      ["C", -50_000],
    ]);
    const transfers = simplifyDebts(balances);
    expect(transfers).toEqual([
      { fromUserId: "C", toUserId: "B", amountMinor: 50_000 },
      { fromUserId: "A", toUserId: "B", amountMinor: 30_000 },
    ]);
    expect(asObject(applyTransfers(balances, transfers))).toEqual({});
  });

  it("11. prefers exact matches to reduce the number of payments", () => {
    const balances: Balances = new Map([
      ["a", -500],
      ["b", -300],
      ["c", 300],
      ["d", 500],
    ]);
    const transfers = simplifyDebts(balances);
    expect(transfers).toHaveLength(2);
    expect(asObject(applyTransfers(balances, transfers))).toEqual({});
  });

  it("11. randomized: always settles every balance in at most n-1 transfers", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    for (let round = 0; round < 300; round++) {
      const people = Array.from({ length: 2 + Math.floor(rand() * 12) }, (_, i) => `u${i}`);
      const expenses: LedgerExpense[] = [];
      for (let i = 0; i < 1 + Math.floor(rand() * 15); i++) {
        const payer = people[Math.floor(rand() * people.length)];
        const participants = people.filter(() => rand() > 0.4);
        if (participants.length === 0) participants.push(people[0]);
        const amount = 1 + Math.floor(rand() * 500_000);
        expenses.push(expense({ [payer]: amount }, "equal", participants.map((userId) => ({ userId }))));
      }
      const balances = computeNetBalances(expenses);
      expect(sumBalances(balances)).toBe(0);
      const transfers = simplifyDebts(balances);
      const nonZero = [...balances.values()].filter((v) => v !== 0).length;
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      expect(transfers.every((t) => t.amountMinor > 0 && t.fromUserId !== t.toUserId)).toBe(true);
      expect(asObject(applyTransfers(balances, transfers))).toEqual({});
      // Deterministic
      expect(simplifyDebts(balances)).toEqual(transfers);
    }
  });

  it("returns nothing when everyone is settled", () => {
    expect(simplifyDebts(new Map([["a", 0], ["b", 0]]))).toEqual([]);
  });

  it("rejects balances that do not sum to zero", () => {
    expect(() => simplifyDebts({ a: 10, b: -5 })).toThrow();
  });
});

describe("maxSettlementAmount", () => {
  const balances: Balances = new Map([
    ["a", 70_000],
    ["b", -30_000],
    ["c", -40_000],
  ]);

  it("caps a repayment at what is outstanding", () => {
    expect(maxSettlementAmount(balances, "b", "a")).toBe(30_000);
    expect(maxSettlementAmount(balances, "c", "a")).toBe(40_000);
  });

  it("returns zero when the direction is wrong or someone is settled", () => {
    expect(maxSettlementAmount(balances, "a", "b")).toBe(0);
    expect(maxSettlementAmount(balances, "b", "c")).toBe(0);
    expect(maxSettlementAmount(balances, "x", "a")).toBe(0);
  });
});

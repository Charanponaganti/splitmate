import { describe, expect, it } from "vitest";
import { allocateProportionally, computeSplit, validatePayers } from "./split";

function sharesOf(result: ReturnType<typeof computeSplit>) {
  if (!result.ok) throw new Error(result.error);
  return Object.fromEntries(result.shares.map((s) => [s.userId, s.shareMinor]));
}

describe("allocateProportionally", () => {
  it("always sums to the total", () => {
    for (const total of [1, 2, 7, 100, 99_999, 123_457]) {
      for (const weights of [[1], [1, 1], [1, 1, 1], [3, 2, 1], [1, 0, 1], [3333, 3333, 3334]]) {
        const parts = allocateProportionally(total, weights);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("never gives anything to a zero weight", () => {
    expect(allocateProportionally(10, [1, 0, 1])).toEqual([5, 0, 5]);
    expect(allocateProportionally(11, [0, 1, 1])).toEqual([0, 6, 5]);
  });

  it("handles very large amounts without overflow", () => {
    const parts = allocateProportionally(99_999_999_999, [333_333, 333_333, 333_334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(99_999_999_999);
  });
});

describe("computeSplit — equal", () => {
  it("1. one payer, equal split among all members", () => {
    const shares = sharesOf(
      computeSplit(120_000, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }, { userId: "d" }]),
    );
    expect(shares).toEqual({ a: 30_000, b: 30_000, c: 30_000, d: 30_000 });
  });

  it("2. only a subset of members shares (the ₹1,200 dinner example)", () => {
    const shares = sharesOf(computeSplit(120_000, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]));
    expect(shares).toEqual({ a: 40_000, b: 40_000, c: 40_000 });
    expect(shares.d).toBeUndefined();
  });

  it("8. distributes leftover minor units deterministically by user id", () => {
    const shares = sharesOf(computeSplit(100, "equal", [{ userId: "c" }, { userId: "a" }, { userId: "b" }]));
    expect(shares).toEqual({ a: 34, b: 33, c: 33 });
    // Same result regardless of input order.
    const again = sharesOf(computeSplit(100, "equal", [{ userId: "b" }, { userId: "c" }, { userId: "a" }]));
    expect(again).toEqual(shares);
  });

  it("8. splits a single minor unit among several people", () => {
    const shares = sharesOf(computeSplit(1, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]));
    expect(shares).toEqual({ a: 1, b: 0, c: 0 });
  });

  it("8. works for zero-decimal currencies (¥1,000 among 3)", () => {
    const shares = sharesOf(computeSplit(1000, "equal", [{ userId: "a" }, { userId: "b" }, { userId: "c" }]));
    expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(shares).toEqual({ a: 334, b: 333, c: 333 });
  });

  it("rejects empty participants and duplicates", () => {
    expect(computeSplit(100, "equal", []).ok).toBe(false);
    expect(computeSplit(100, "equal", [{ userId: "a" }, { userId: "a" }]).ok).toBe(false);
    expect(computeSplit(0, "equal", [{ userId: "a" }]).ok).toBe(false);
  });
});

describe("computeSplit — exact", () => {
  it("4. accepts exact amounts that add up to the total", () => {
    const shares = sharesOf(
      computeSplit(100_000, "exact", [
        { userId: "a", value: 50_000 },
        { userId: "b", value: 30_000 },
        { userId: "c", value: 20_000 },
      ]),
    );
    expect(shares).toEqual({ a: 50_000, b: 30_000, c: 20_000 });
  });

  it("4. rejects totals that do not match", () => {
    const under = computeSplit(100_000, "exact", [
      { userId: "a", value: 50_000 },
      { userId: "b", value: 30_000 },
    ]);
    expect(under).toEqual({ ok: false, error: expect.stringContaining("less") });
    const over = computeSplit(100_000, "exact", [
      { userId: "a", value: 80_000 },
      { userId: "b", value: 30_000 },
    ]);
    expect(over).toEqual({ ok: false, error: expect.stringContaining("more") });
  });

  it("rejects negative, fractional and zero exact amounts", () => {
    expect(computeSplit(100, "exact", [{ userId: "a", value: -1 }, { userId: "b", value: 101 }]).ok).toBe(false);
    expect(computeSplit(100, "exact", [{ userId: "a", value: 50.5 }, { userId: "b", value: 49.5 }]).ok).toBe(false);
    expect(computeSplit(100, "exact", [{ userId: "a", value: 0 }, { userId: "b", value: 100 }]).ok).toBe(false);
  });
});

describe("computeSplit — percentage", () => {
  it("5. splits by percentage", () => {
    const shares = sharesOf(
      computeSplit(200_000, "percentage", [
        { userId: "a", value: 5_000 },
        { userId: "b", value: 3_000 },
        { userId: "c", value: 2_000 },
      ]),
    );
    expect(shares).toEqual({ a: 100_000, b: 60_000, c: 40_000 });
  });

  it("5. rounds 33.33/33.33/33.34 correctly", () => {
    const shares = sharesOf(
      computeSplit(1_000, "percentage", [
        { userId: "a", value: 3_333 },
        { userId: "b", value: 3_333 },
        { userId: "c", value: 3_334 },
      ]),
    );
    expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(1_000);
    expect(shares).toEqual({ a: 333, b: 333, c: 334 });
  });

  it("5. rejects percentages that do not total 100%", () => {
    const result = computeSplit(1_000, "percentage", [
      { userId: "a", value: 5_000 },
      { userId: "b", value: 4_000 },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("computeSplit — shares", () => {
  it("6. splits by relative shares", () => {
    const shares = sharesOf(
      computeSplit(90_000, "shares", [
        { userId: "a", value: 200 },
        { userId: "b", value: 100 },
      ]),
    );
    expect(shares).toEqual({ a: 60_000, b: 30_000 });
  });

  it("6. supports fractional shares (1.5 : 1)", () => {
    const shares = sharesOf(
      computeSplit(10_001, "shares", [
        { userId: "a", value: 150 },
        { userId: "b", value: 100 },
      ]),
    );
    expect(shares.a + shares.b).toBe(10_001);
    expect(shares).toEqual({ a: 6_001, b: 4_000 });
  });

  it("6. rejects zero or negative shares", () => {
    expect(computeSplit(100, "shares", [{ userId: "a", value: 0 }, { userId: "b", value: 100 }]).ok).toBe(false);
    expect(computeSplit(100, "shares", [{ userId: "a", value: -100 }]).ok).toBe(false);
  });
});

describe("validatePayers", () => {
  it("7. accepts multiple payers whose contributions match the total", () => {
    expect(
      validatePayers(150_000, [
        { userId: "a", amountMinor: 100_000 },
        { userId: "b", amountMinor: 50_000 },
      ]),
    ).toEqual({ ok: true });
  });

  it("7. rejects contributions that do not match", () => {
    expect(validatePayers(150_000, [{ userId: "a", amountMinor: 100_000 }]).ok).toBe(false);
    expect(
      validatePayers(150_000, [
        { userId: "a", amountMinor: 100_000 },
        { userId: "b", amountMinor: 60_000 },
      ]).ok,
    ).toBe(false);
  });

  it("rejects empty, duplicate and non-positive payers", () => {
    expect(validatePayers(100, []).ok).toBe(false);
    expect(validatePayers(100, [{ userId: "a", amountMinor: 50 }, { userId: "a", amountMinor: 50 }]).ok).toBe(false);
    expect(validatePayers(100, [{ userId: "a", amountMinor: 100 }, { userId: "b", amountMinor: 0 }]).ok).toBe(false);
  });
});

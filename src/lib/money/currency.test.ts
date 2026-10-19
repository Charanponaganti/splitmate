import { describe, expect, it } from "vitest";
import { formatMoney, minorToDecimalString, parseToMinor } from "./currency";

describe("parseToMinor", () => {
  it("parses rupee amounts exactly", () => {
    expect(parseToMinor("1200", "INR")).toBe(120_000);
    expect(parseToMinor("1,200.50", "INR")).toBe(120_050);
    expect(parseToMinor("0.01", "INR")).toBe(1);
    expect(parseToMinor("0.1", "INR")).toBe(10);
    expect(parseToMinor("19.99", "USD")).toBe(1_999);
  });

  it("avoids floating point errors", () => {
    // 0.1 + 0.2 style inputs must not drift
    expect(parseToMinor("0.29", "INR")).toBe(29);
    expect(parseToMinor("1.15", "USD")).toBe(115);
    expect(parseToMinor("4.35", "USD")).toBe(435);
  });

  it("respects currency precision", () => {
    expect(parseToMinor("1000", "JPY")).toBe(1_000);
    expect(parseToMinor("1000.5", "JPY")).toBeNull();
    expect(parseToMinor("1.234", "KWD")).toBe(1_234);
    expect(parseToMinor("1.2345", "KWD")).toBeNull();
    expect(parseToMinor("10.500", "INR")).toBe(1_050);
  });

  it("rejects invalid input", () => {
    for (const bad of ["", "abc", "-5", "1.2.3", "1e5", "  "]) {
      expect(parseToMinor(bad, "INR")).toBeNull();
    }
  });
});

describe("minorToDecimalString", () => {
  it("round-trips", () => {
    expect(minorToDecimalString(120_050, "INR")).toBe("1200.50");
    expect(minorToDecimalString(5, "INR")).toBe("0.05");
    expect(minorToDecimalString(1_000, "JPY")).toBe("1000");
    expect(minorToDecimalString(1_234, "KWD")).toBe("1.234");
    expect(minorToDecimalString(-250, "USD")).toBe("-2.50");
  });
});

describe("formatMoney", () => {
  it("formats using the currency symbol", () => {
    expect(formatMoney(120_000, "INR")).toContain("1,200.00");
    expect(formatMoney(120_000, "INR")).toContain("₹");
    expect(formatMoney(1_000, "JPY")).toContain("1,000");
    expect(formatMoney(-500, "USD")).toMatch(/^−/);
    expect(formatMoney(500, "USD", { signed: true })).toMatch(/^\+/);
  });
});

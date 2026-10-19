export const SPLIT_METHODS = ["equal", "exact", "percentage", "shares"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

/** Percentages are expressed in basis points: 100% = 10_000, 33.33% = 3_333. */
export const PERCENT_SCALE = 10_000;
/** Shares are expressed in hundredths so that 1.5 shares = 150. */
export const SHARE_SCALE = 100;

export interface SplitParticipantInput {
  userId: string;
  /**
   * Meaning depends on the method:
   * - equal: ignored
   * - exact: share in minor units
   * - percentage: basis points (1% = 100)
   * - shares: relative weight in hundredths (1 share = 100)
   */
  value?: number | null;
}

export interface ParticipantShare {
  userId: string;
  shareMinor: number;
}

export interface PayerInput {
  userId: string;
  amountMinor: number;
}

export type SplitResult =
  | { ok: true; shares: ParticipantShare[] }
  | { ok: false; error: string };

export type PayerValidation = { ok: true } | { ok: false; error: string };

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Distributes `total` minor units proportionally to `weights` using the
 * largest-remainder method. The result always sums exactly to `total`.
 * Ties are broken by position, so callers must pass weights in a
 * deterministic order. BigInt arithmetic prevents overflow on large products.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("total must be a non-negative safe integer");
  }
  if (weights.length === 0) throw new Error("weights must not be empty");
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error("weights must be non-negative safe integers");
  }
  const weightSum = weights.reduce((sum, w) => sum + BigInt(w), 0n);
  if (weightSum === 0n) throw new Error("weights must not all be zero");

  const bigTotal = BigInt(total);
  const base: bigint[] = [];
  const remainders: { index: number; remainder: bigint }[] = [];
  let allocated = 0n;
  weights.forEach((w, index) => {
    const product = bigTotal * BigInt(w);
    const share = product / weightSum;
    base.push(share);
    allocated += share;
    remainders.push({ index, remainder: product % weightSum });
  });

  let leftover = bigTotal - allocated;
  remainders.sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const entry of remainders) {
    if (leftover === 0n) break;
    if (weights[entry.index] === 0) continue;
    base[entry.index] += 1n;
    leftover -= 1n;
  }
  return base.map((v) => Number(v));
}

/**
 * Computes each participant's share of an expense. Participants are processed
 * in user-id order so the same inputs always produce the same rounding, both
 * in the browser preview and on the server.
 */
export function computeSplit(
  totalMinor: number,
  method: SplitMethod,
  participants: SplitParticipantInput[],
): SplitResult {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }
  if (participants.length === 0) {
    return { ok: false, error: "Select at least one person to share this expense." };
  }
  const ids = new Set(participants.map((p) => p.userId));
  if (ids.size !== participants.length) {
    return { ok: false, error: "Each person can only be included once." };
  }

  const ordered = [...participants].sort((a, b) => compareIds(a.userId, b.userId));
  const values = ordered.map((p) => p.value ?? 0);

  let amounts: number[];
  switch (method) {
    case "equal": {
      amounts = allocateProportionally(totalMinor, ordered.map(() => 1));
      break;
    }
    case "exact": {
      if (values.some((v) => !Number.isSafeInteger(v) || v < 0)) {
        return { ok: false, error: "Exact amounts must be valid, non-negative values." };
      }
      if (values.some((v) => v === 0)) {
        return { ok: false, error: "Remove people with a zero share instead of entering 0." };
      }
      const sum = values.reduce((a, b) => a + b, 0);
      if (sum !== totalMinor) {
        return {
          ok: false,
          error:
            sum < totalMinor
              ? "The exact amounts add up to less than the total."
              : "The exact amounts add up to more than the total.",
        };
      }
      amounts = values;
      break;
    }
    case "percentage": {
      if (values.some((v) => !Number.isSafeInteger(v) || v <= 0 || v > PERCENT_SCALE)) {
        return { ok: false, error: "Each percentage must be between 0.01% and 100%." };
      }
      const sum = values.reduce((a, b) => a + b, 0);
      if (sum !== PERCENT_SCALE) {
        return { ok: false, error: "Percentages must add up to exactly 100%." };
      }
      amounts = allocateProportionally(totalMinor, values);
      break;
    }
    case "shares": {
      if (values.some((v) => !Number.isSafeInteger(v) || v <= 0 || v > 1_000_000)) {
        return { ok: false, error: "Each share must be a positive number." };
      }
      amounts = allocateProportionally(totalMinor, values);
      break;
    }
    default:
      return { ok: false, error: "Unknown split method." };
  }

  const byId = new Map(ordered.map((p, i) => [p.userId, amounts[i]]));
  const shares = participants.map((p) => ({ userId: p.userId, shareMinor: byId.get(p.userId)! }));
  const total = shares.reduce((a, s) => a + s.shareMinor, 0);
  if (total !== totalMinor) {
    return { ok: false, error: "Shares do not add up to the total." };
  }
  return { ok: true, shares };
}

/** Validates that payer contributions are positive, unique and sum to the total. */
export function validatePayers(totalMinor: number, payers: PayerInput[]): PayerValidation {
  if (payers.length === 0) return { ok: false, error: "Select who paid." };
  const ids = new Set(payers.map((p) => p.userId));
  if (ids.size !== payers.length) return { ok: false, error: "Each payer can only be listed once." };
  if (payers.some((p) => !Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0)) {
    return { ok: false, error: "Each payer must have paid a positive amount." };
  }
  const sum = payers.reduce((a, p) => a + p.amountMinor, 0);
  if (sum !== totalMinor) {
    return {
      ok: false,
      error:
        sum < totalMinor
          ? "Payer contributions add up to less than the total."
          : "Payer contributions add up to more than the total.",
    };
  }
  return { ok: true };
}

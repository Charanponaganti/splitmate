export interface LedgerExpense {
  payers: { userId: string; amountMinor: number }[];
  participants: { userId: string; shareMinor: number }[];
}

export interface LedgerSettlement {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

export type Balances = Map<string, number>;

function add(map: Balances, userId: string, delta: number) {
  map.set(userId, (map.get(userId) ?? 0) + delta);
}

/**
 * Net balance per user = total paid − total share + repayments sent − repayments received.
 * Positive: the group owes the user. Negative: the user owes the group.
 */
export function computeNetBalances(
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[] = [],
): Balances {
  const balances: Balances = new Map();
  for (const expense of expenses) {
    for (const payer of expense.payers) add(balances, payer.userId, payer.amountMinor);
    for (const participant of expense.participants) add(balances, participant.userId, -participant.shareMinor);
  }
  for (const s of settlements) {
    add(balances, s.fromUserId, s.amountMinor);
    add(balances, s.toUserId, -s.amountMinor);
  }
  return balances;
}

export function sumBalances(balances: Balances): number {
  let total = 0;
  for (const value of balances.values()) total += value;
  return total;
}

interface Party {
  userId: string;
  amount: number;
}

function byAmountThenId(a: Party, b: Party): number {
  if (a.amount !== b.amount) return b.amount - a.amount;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

/**
 * Produces a deterministic list of transfers that settles every balance.
 *
 * 1. Debtors and creditors with exactly matching amounts are paired first,
 *    since each such pair removes two people with a single payment.
 * 2. The remainder is settled greedily, always matching the largest debtor
 *    with the largest creditor.
 *
 * The result never needs more than (people with non-zero balances − 1)
 * transfers and always reproduces the input balances exactly.
 */
export function simplifyDebts(balances: Balances | Record<string, number>): Transfer[] {
  const entries = balances instanceof Map ? [...balances.entries()] : Object.entries(balances);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (total !== 0) {
    throw new Error("Balances must sum to zero before they can be settled.");
  }

  const debtors: Party[] = [];
  const creditors: Party[] = [];
  for (const [userId, amount] of entries) {
    if (amount < 0) debtors.push({ userId, amount: -amount });
    else if (amount > 0) creditors.push({ userId, amount });
  }
  debtors.sort(byAmountThenId);
  creditors.sort(byAmountThenId);

  const transfers: Transfer[] = [];

  for (const debtor of debtors) {
    const match = creditors.find((c) => c.amount === debtor.amount && c.amount > 0);
    if (match) {
      transfers.push({ fromUserId: debtor.userId, toUserId: match.userId, amountMinor: debtor.amount });
      match.amount = 0;
      debtor.amount = 0;
    }
  }

  const openDebtors = debtors.filter((d) => d.amount > 0);
  const openCreditors = creditors.filter((c) => c.amount > 0);

  while (openDebtors.length > 0 && openCreditors.length > 0) {
    openDebtors.sort(byAmountThenId);
    openCreditors.sort(byAmountThenId);
    const debtor = openDebtors[0];
    const creditor = openCreditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountMinor: amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) openDebtors.shift();
    if (creditor.amount === 0) openCreditors.shift();
  }

  return transfers;
}

/**
 * The largest repayment from `fromUserId` to `toUserId` that does not push
 * either person past zero: the payer cannot pay more than they owe the group
 * and the receiver cannot receive more than the group owes them.
 */
export function maxSettlementAmount(balances: Balances, fromUserId: string, toUserId: string): number {
  const fromBalance = balances.get(fromUserId) ?? 0;
  const toBalance = balances.get(toUserId) ?? 0;
  if (fromBalance >= 0 || toBalance <= 0) return 0;
  return Math.min(-fromBalance, toBalance);
}

/**
 * Who owes whom for a single expense. Useful for the expense detail page
 * ("B owes A ₹400"). A payer's own share is netted out.
 */
export function expenseTransfers(expense: LedgerExpense): Transfer[] {
  return simplifyDebts(computeNetBalances([expense]));
}

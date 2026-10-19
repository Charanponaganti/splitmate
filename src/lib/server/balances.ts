import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";
import type { Balances } from "@/lib/money/balances";

/**
 * Derives every member's net balance in a group directly from the ledger:
 * amounts paid − shares owed + repayments sent − repayments received.
 * Deleted expenses and settlements are excluded. Nothing is cached, so the
 * result can never drift from the underlying records.
 */
export async function getGroupBalances(db: DbOrTx, groupId: string): Promise<Balances> {
  type Row = { user_id: string; balance: string | number };
  const result = await db.execute<Row>(sql`
    select user_id, sum(delta)::bigint as balance from (
      select ep.user_id, ep.amount_minor as delta
        from expense_payers ep join expenses e on e.id = ep.expense_id
       where e.group_id = ${groupId} and e.deleted_at is null
      union all
      select xp.user_id, -xp.share_minor
        from expense_participants xp join expenses e on e.id = xp.expense_id
       where e.group_id = ${groupId} and e.deleted_at is null
      union all
      select from_user_id, amount_minor from settlements
       where group_id = ${groupId} and deleted_at is null
      union all
      select to_user_id, -amount_minor from settlements
       where group_id = ${groupId} and deleted_at is null
    ) ledger
    group by user_id
  `);
  const balances: Balances = new Map();
  for (const row of rowsOf<Row>(result)) balances.set(row.user_id, Number(row.balance));
  return balances;
}

/** The user's net balance in each of their groups, keyed by group id. */
export async function getUserBalancesByGroup(db: DbOrTx, userId: string): Promise<Map<string, number>> {
  type Row = { group_id: string; balance: string | number };
  const result = await db.execute<Row>(sql`
    select group_id, sum(delta)::bigint as balance from (
      select e.group_id, ep.amount_minor as delta
        from expense_payers ep join expenses e on e.id = ep.expense_id
       where ep.user_id = ${userId} and e.deleted_at is null
      union all
      select e.group_id, -xp.share_minor
        from expense_participants xp join expenses e on e.id = xp.expense_id
       where xp.user_id = ${userId} and e.deleted_at is null
      union all
      select group_id, amount_minor from settlements where from_user_id = ${userId} and deleted_at is null
      union all
      select group_id, -amount_minor from settlements where to_user_id = ${userId} and deleted_at is null
    ) ledger
    group by group_id
  `);
  const map = new Map<string, number>();
  for (const row of rowsOf<Row>(result)) map.set(row.group_id, Number(row.balance));
  return map;
}

/** Normalizes raw query results across the postgres-js and PGlite drivers. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] }).rows;
  return rows ?? [];
}

import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/lib/db";
import {
  activityLog,
  expenseParticipants,
  expensePayers,
  expenses,
  groupMembers,
  groups,
  notifications,
  settlements,
  users,
} from "@/lib/db/schema";
import { EXPENSES_PAGE_SIZE } from "@/lib/constants";
import { simplifyDebts, type Transfer } from "@/lib/money/balances";
import type { ExpenseFilters } from "@/lib/validation";
import { requireMember } from "./access";
import { getGroupBalances, getUserBalancesByGroup, rowsOf } from "./balances";

export interface PersonSummary {
  id: string;
  name: string;
  image: string | null;
}

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

export async function getGroupsForUser(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      category: groups.category,
      currency: groups.currency,
      coverImageUrl: groups.coverImageUrl,
      role: groupMembers.role,
      updatedAt: groups.updatedAt,
    })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active")))
    .orderBy(desc(groups.updatedAt));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [balances, memberRows, totals, lastActivity] = await Promise.all([
    getUserBalancesByGroup(db, userId),
    db
      .select({ groupId: groupMembers.groupId, id: users.id, name: users.name, image: users.image })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(and(inArray(groupMembers.groupId, ids), eq(groupMembers.status, "active")))
      .orderBy(asc(groupMembers.joinedAt)),
    db
      .select({ groupId: expenses.groupId, total: sql<string>`coalesce(sum(${expenses.amountMinor}), 0)` })
      .from(expenses)
      .where(and(inArray(expenses.groupId, ids), isNull(expenses.deletedAt)))
      .groupBy(expenses.groupId),
    db
      .select({ groupId: activityLog.groupId, at: sql<string>`max(${activityLog.createdAt})` })
      .from(activityLog)
      .where(inArray(activityLog.groupId, ids))
      .groupBy(activityLog.groupId),
  ]);

  return rows
    .map((group) => {
      const members = memberRows.filter((m) => m.groupId === group.id);
      const last = lastActivity.find((a) => a.groupId === group.id)?.at;
      return {
        ...group,
        members: members.map(({ id, name, image }) => ({ id, name, image })),
        memberCount: members.length,
        myBalance: balances.get(group.id) ?? 0,
        totalSpent: Number(totals.find((t) => t.groupId === group.id)?.total ?? 0),
        lastActivityAt: last ? new Date(last) : group.updatedAt,
      };
    })
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}

export async function getGroupOverview(userId: string, groupId: string) {
  const db = await getDb();
  const me = await requireMember(db, groupId, userId);
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);

  const [memberRows, balances, totals] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: groupMembers.role,
        status: groupMembers.status,
        joinedAt: groupMembers.joinedAt,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(eq(groupMembers.groupId, groupId))
      .orderBy(asc(groupMembers.joinedAt)),
    getGroupBalances(db, groupId),
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amountMinor}), 0)`, n: count() })
      .from(expenses)
      .where(and(eq(expenses.groupId, groupId), isNull(expenses.deletedAt))),
  ]);

  const members = memberRows.map((m) => ({ ...m, balance: balances.get(m.id) ?? 0 }));
  const transfers: Transfer[] = simplifyDebts(balances);
  return {
    group,
    myRole: me.role,
    members,
    activeMembers: members.filter((m) => m.status === "active"),
    people: new Map(members.map((m) => [m.id, { id: m.id, name: m.name, image: m.image }])),
    balances,
    transfers,
    totalSpent: Number(totals[0]?.total ?? 0),
    expenseCount: totals[0]?.n ?? 0,
  };
}

/** Everyone the user shares (or shared) a group with, for filter menus. */
export async function getCoMembers(userId: string): Promise<PersonSummary[]> {
  const db = await getDb();
  return db
    .selectDistinct({ id: users.id, name: users.name, image: users.image })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(sql`${groupMembers.groupId} in ${accessibleGroupIds(userId)}`)
    .orderBy(asc(users.name));
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                   */
/* -------------------------------------------------------------------------- */

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function accessibleGroupIds(userId: string) {
  return sql`(select ${groupMembers.groupId} from ${groupMembers} where ${groupMembers.userId} = ${userId} and ${groupMembers.status} = 'active')`;
}

function involvesUser(memberId: string) {
  return sql`(exists (select 1 from ${expensePayers} where ${expensePayers.expenseId} = ${expenses.id} and ${expensePayers.userId} = ${memberId})
           or exists (select 1 from ${expenseParticipants} where ${expenseParticipants.expenseId} = ${expenses.id} and ${expenseParticipants.userId} = ${memberId}))`;
}

export function expenseWhere(userId: string, filters: Partial<ExpenseFilters>, extra: SQL[] = []): SQL {
  const conditions: SQL[] = [isNull(expenses.deletedAt), sql`${expenses.groupId} in ${accessibleGroupIds(userId)}`, ...extra];
  if (filters.groupId) conditions.push(eq(expenses.groupId, filters.groupId));
  if (filters.q) conditions.push(sql`${expenses.title} ilike ${`%${escapeLike(filters.q)}%`}`);
  if (filters.category) conditions.push(eq(expenses.category, filters.category));
  if (filters.from) conditions.push(gte(expenses.expenseDate, filters.from));
  if (filters.to) conditions.push(lte(expenses.expenseDate, filters.to));
  if (filters.payerId) {
    conditions.push(
      sql`exists (select 1 from ${expensePayers} where ${expensePayers.expenseId} = ${expenses.id} and ${expensePayers.userId} = ${filters.payerId})`,
    );
  }
  if (filters.participantId) {
    conditions.push(
      sql`exists (select 1 from ${expenseParticipants} where ${expenseParticipants.expenseId} = ${expenses.id} and ${expenseParticipants.userId} = ${filters.participantId})`,
    );
  }
  if (filters.memberId) conditions.push(involvesUser(filters.memberId));
  return and(...conditions)!;
}

function expenseOrder(sort: ExpenseFilters["sort"] = "date_desc") {
  switch (sort) {
    case "date_asc":
      return [asc(expenses.expenseDate), asc(expenses.createdAt)];
    case "amount_desc":
      return [desc(expenses.amountMinor), desc(expenses.expenseDate)];
    case "amount_asc":
      return [asc(expenses.amountMinor), desc(expenses.expenseDate)];
    default:
      return [desc(expenses.expenseDate), desc(expenses.createdAt)];
  }
}

export interface ExpenseListItem {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  amountMinor: number;
  currency: string;
  category: string;
  expenseDate: string;
  splitMethod: string;
  createdAt: Date;
  payers: (PersonSummary & { amountMinor: number })[];
  participants: (PersonSummary & { shareMinor: number })[];
  myPaid: number;
  myShare: number;
  hasReceipt: boolean;
  done: boolean;
}

async function hydrateExpenses(
  db: DbOrTx,
  userId: string,
  rows: {
    id: string;
    groupId: string;
    groupName: string;
    title: string;
    amountMinor: number;
    currency: string;
    category: string;
    expenseDate: string;
    splitMethod: string;
    createdAt: Date;
    receiptAttachmentId: string | null;
    doneAt: Date | null;
  }[],
): Promise<ExpenseListItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [payers, participants] = await Promise.all([
    db
      .select({ expenseId: expensePayers.expenseId, id: users.id, name: users.name, image: users.image, amountMinor: expensePayers.amountMinor })
      .from(expensePayers)
      .innerJoin(users, eq(users.id, expensePayers.userId))
      .where(inArray(expensePayers.expenseId, ids)),
    db
      .select({
        expenseId: expenseParticipants.expenseId,
        id: users.id,
        name: users.name,
        image: users.image,
        shareMinor: expenseParticipants.shareMinor,
      })
      .from(expenseParticipants)
      .innerJoin(users, eq(users.id, expenseParticipants.userId))
      .where(inArray(expenseParticipants.expenseId, ids)),
  ]);
  return rows.map(({ receiptAttachmentId, doneAt, ...row }) => {
    const p = payers
      .filter((x) => x.expenseId === row.id)
      .map(({ id, name, image, amountMinor }) => ({ id, name, image, amountMinor }));
    const q = participants
      .filter((x) => x.expenseId === row.id)
      .map(({ id, name, image, shareMinor }) => ({ id, name, image, shareMinor }));
    return {
      ...row,
      payers: p.sort((a, b) => b.amountMinor - a.amountMinor),
      participants: q,
      myPaid: p.find((x) => x.id === userId)?.amountMinor ?? 0,
      myShare: q.find((x) => x.id === userId)?.shareMinor ?? 0,
      hasReceipt: receiptAttachmentId !== null,
      done: doneAt !== null,
    };
  });
}

const expenseColumns = {
  id: expenses.id,
  groupId: expenses.groupId,
  groupName: groups.name,
  title: expenses.title,
  amountMinor: expenses.amountMinor,
  currency: expenses.currency,
  category: expenses.category,
  expenseDate: expenses.expenseDate,
  splitMethod: expenses.splitMethod,
  createdAt: expenses.createdAt,
  receiptAttachmentId: expenses.receiptAttachmentId,
  doneAt: expenses.doneAt,
};

export async function listExpenses(userId: string, filters: ExpenseFilters, pageSize = EXPENSES_PAGE_SIZE) {
  const db = await getDb();
  if (filters.groupId) await requireMember(db, filters.groupId, userId);
  const where = expenseWhere(userId, filters);
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(expenses).where(where),
    db
      .select(expenseColumns)
      .from(expenses)
      .innerJoin(groups, eq(groups.id, expenses.groupId))
      .where(where)
      .orderBy(...expenseOrder(filters.sort))
      .limit(pageSize)
      .offset((filters.page - 1) * pageSize),
  ]);
  return {
    items: await hydrateExpenses(db, userId, rows),
    total,
    page: filters.page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Streams every matching expense in pages (used by CSV export). */
export async function* iterateExpenses(userId: string, filters: ExpenseFilters, batchSize = 500) {
  const db = await getDb();
  if (filters.groupId) await requireMember(db, filters.groupId, userId);
  const where = expenseWhere(userId, filters);
  for (let offset = 0; ; offset += batchSize) {
    const rows = await db
      .select(expenseColumns)
      .from(expenses)
      .innerJoin(groups, eq(groups.id, expenses.groupId))
      .where(where)
      .orderBy(...expenseOrder(filters.sort), asc(expenses.id))
      .limit(batchSize)
      .offset(offset);
    if (rows.length === 0) return;
    yield await hydrateExpenses(db, userId, rows);
    if (rows.length < batchSize) return;
  }
}

/* -------------------------------------------------------------------------- */
/* Activity, settlements, notifications                                       */
/* -------------------------------------------------------------------------- */

export interface ActivityItem {
  id: string;
  type: string;
  groupId: string;
  groupName: string;
  actorId: string;
  actorName: string;
  actorImage: string | null;
  subjectName: string | null;
  expenseId: string | null;
  settlementId: string | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

export async function getActivityFeed(userId: string, opts: { groupId?: string; limit?: number } = {}): Promise<ActivityItem[]> {
  const db = await getDb();
  if (opts.groupId) await requireMember(db, opts.groupId, userId);
  const subject = sql<string | null>`(select name from ${users} s where s.id = ${activityLog.subjectUserId})`;
  return db
    .select({
      id: activityLog.id,
      type: activityLog.type,
      groupId: activityLog.groupId,
      groupName: groups.name,
      actorId: activityLog.actorId,
      actorName: users.name,
      actorImage: users.image,
      subjectName: subject,
      expenseId: activityLog.expenseId,
      settlementId: activityLog.settlementId,
      data: activityLog.data,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .innerJoin(groups, eq(groups.id, activityLog.groupId))
    .innerJoin(users, eq(users.id, activityLog.actorId))
    .where(
      and(
        sql`${activityLog.groupId} in ${accessibleGroupIds(userId)}`,
        opts.groupId ? eq(activityLog.groupId, opts.groupId) : undefined,
        sql`${activityLog.type} <> 'invitation.created'`,
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(opts.limit ?? 20);
}

export async function listSettlements(userId: string, groupId: string, limit = 100) {
  const db = await getDb();
  await requireMember(db, groupId, userId);
  const fromUser = sql<string>`(select name from ${users} u where u.id = ${settlements.fromUserId})`;
  const toUser = sql<string>`(select name from ${users} u where u.id = ${settlements.toUserId})`;
  const creator = sql<string>`(select name from ${users} u where u.id = ${settlements.createdBy})`;
  return db
    .select({
      id: settlements.id,
      fromUserId: settlements.fromUserId,
      toUserId: settlements.toUserId,
      fromName: fromUser,
      toName: toUser,
      createdBy: settlements.createdBy,
      createdByName: creator,
      amountMinor: settlements.amountMinor,
      currency: settlements.currency,
      settledOn: settlements.settledOn,
      note: settlements.note,
      isOverpayment: settlements.isOverpayment,
      createdAt: settlements.createdAt,
      deletedAt: settlements.deletedAt,
    })
    .from(settlements)
    .where(eq(settlements.groupId, groupId))
    .orderBy(desc(settlements.createdAt))
    .limit(limit);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const db = await getDb();
  const [{ value }] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return value;
}

export async function listNotifications(userId: string, limit = 50) {
  const db = await getDb();
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      href: notifications.href,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorName: users.name,
      actorImage: users.image,
      groupName: groups.name,
      groupId: groups.id,
      data: activityLog.data,
      activityType: activityLog.type,
    })
    .from(notifications)
    .innerJoin(activityLog, eq(activityLog.id, notifications.activityId))
    .innerJoin(users, eq(users.id, activityLog.actorId))
    .innerJoin(groups, eq(groups.id, activityLog.groupId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ids && ids.length > 0 ? inArray(notifications.id, ids) : undefined,
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export async function getDashboard(userId: string) {
  const db = await getDb();
  const groupList = await getGroupsForUser(userId);

  const totalsByCurrency = new Map<string, { owe: number; owed: number }>();
  for (const g of groupList) {
    const t = totalsByCurrency.get(g.currency) ?? { owe: 0, owed: 0 };
    if (g.myBalance < 0) t.owe += -g.myBalance;
    if (g.myBalance > 0) t.owed += g.myBalance;
    totalsByCurrency.set(g.currency, t);
  }

  const pending: (Transfer & { groupId: string; groupName: string; currency: string; counterparty: PersonSummary })[] = [];
  for (const g of groupList.filter((x) => x.myBalance !== 0)) {
    const balances = await getGroupBalances(db, g.id);
    const transfers = simplifyDebts(balances).filter((t) => t.fromUserId === userId || t.toUserId === userId);
    if (transfers.length === 0) continue;
    const otherIds = transfers.map((t) => (t.fromUserId === userId ? t.toUserId : t.fromUserId));
    const people = await db.select({ id: users.id, name: users.name, image: users.image }).from(users).where(inArray(users.id, otherIds));
    for (const t of transfers) {
      const otherId = t.fromUserId === userId ? t.toUserId : t.fromUserId;
      pending.push({
        ...t,
        groupId: g.id,
        groupName: g.name,
        currency: g.currency,
        counterparty: people.find((p) => p.id === otherId) ?? { id: otherId, name: "Former member", image: null },
      });
    }
  }

  const recent = await listExpenses(userId, { sort: "date_desc", page: 1 }, 6);
  return {
    groups: groupList,
    totals: [...totalsByCurrency.entries()]
      .map(([currency, t]) => ({ currency, ...t, net: t.owed - t.owe }))
      .sort((a, b) => b.owe + b.owed - (a.owe + a.owed)),
    pending,
    recentExpenses: recent.items,
  };
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                  */
/* -------------------------------------------------------------------------- */

export async function getAnalytics(userId: string, filters: ExpenseFilters, requestedCurrency?: string) {
  const db = await getDb();
  if (filters.groupId) await requireMember(db, filters.groupId, userId);
  const baseWhere = expenseWhere(userId, filters);

  const currencyRows = await db
    .select({ currency: expenses.currency, total: sql<string>`sum(${expenses.amountMinor})` })
    .from(expenses)
    .where(baseWhere)
    .groupBy(expenses.currency)
    .orderBy(desc(sql`sum(${expenses.amountMinor})`));
  const currencies = currencyRows.map((r) => r.currency);
  const currency =
    requestedCurrency && currencies.includes(requestedCurrency) ? requestedCurrency : (currencies[0] ?? null);
  if (!currency) return { currency: null, currencies, total: 0, myShare: 0, count: 0, monthly: [], byCategory: [], byMember: [] };

  const where = expenseWhere(userId, filters, [eq(expenses.currency, currency)]);
  const myShareExpr = sql<string>`coalesce(sum((select ${expenseParticipants.shareMinor} from ${expenseParticipants} where ${expenseParticipants.expenseId} = ${expenses.id} and ${expenseParticipants.userId} = ${userId})), 0)`;

  const [summary, monthly, byCategory, byMemberResult] = await Promise.all([
    db
      .select({ total: sql<string>`coalesce(sum(${expenses.amountMinor}), 0)`, myShare: myShareExpr, n: count() })
      .from(expenses)
      .where(where),
    db
      .select({
        month: sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`,
        total: sql<string>`sum(${expenses.amountMinor})`,
        myShare: myShareExpr,
      })
      .from(expenses)
      .where(where)
      .groupBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`),
    db
      .select({ category: expenses.category, total: sql<string>`sum(${expenses.amountMinor})`, n: count() })
      .from(expenses)
      .where(where)
      .groupBy(expenses.category)
      .orderBy(desc(sql`sum(${expenses.amountMinor})`)),
    db.execute<{ user_id: string; name: string; paid: string; share: string }>(sql`
      with filtered as (select ${expenses.id} as id from ${expenses} where ${where})
      select u.id as user_id, u.name,
             coalesce(p.paid, 0)::bigint as paid, coalesce(s.share, 0)::bigint as share
        from ${users} u
        left join (select ep.user_id, sum(ep.amount_minor) as paid from expense_payers ep
                    where ep.expense_id in (select id from filtered) group by ep.user_id) p on p.user_id = u.id
        left join (select xp.user_id, sum(xp.share_minor) as share from expense_participants xp
                    where xp.expense_id in (select id from filtered) group by xp.user_id) s on s.user_id = u.id
       where p.paid is not null or s.share is not null
       order by coalesce(s.share, 0) desc
    `),
  ]);

  return {
    currency,
    currencies,
    total: Number(summary[0]?.total ?? 0),
    myShare: Number(summary[0]?.myShare ?? 0),
    count: summary[0]?.n ?? 0,
    monthly: monthly.map((m) => ({ month: m.month, total: Number(m.total), myShare: Number(m.myShare) })),
    byCategory: byCategory.map((c) => ({ category: c.category, total: Number(c.total), count: c.n })),
    byMember: rowsOf<{ user_id: string; name: string; paid: string; share: string }>(byMemberResult).map((r) => ({
      userId: r.user_id,
      name: r.name,
      paid: Number(r.paid),
      share: Number(r.share),
    })),
  };
}

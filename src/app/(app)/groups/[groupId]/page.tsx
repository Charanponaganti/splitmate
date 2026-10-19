import type { Metadata } from "next";
import Link from "next/link";
import { HandCoins, Plus, Receipt, Settings } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { AvatarStack, UserAvatar } from "@/components/avatar";
import { ExpenseFilters } from "@/components/expense-filters";
import { ExpenseRow } from "@/components/expense-row";
import { GroupIcon } from "@/components/group-card";
import { BalanceLabel, Money } from "@/components/money";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/misc";
import { groupCategoryLabel } from "@/lib/constants";
import { orNotFound } from "@/lib/server/page";
import { getActivityFeed, getGroupOverview, listExpenses } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";
import { parseExpenseFilters } from "@/lib/validation";

export const metadata: Metadata = { title: "Group" };

type Params = Promise<{ groupId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function GroupPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await requireUser();
  const { groupId } = await params;
  const search = await searchParams;
  const overview = await orNotFound(getGroupOverview(user.id, groupId));
  const filters = { ...parseExpenseFilters(search), groupId };
  const [expenses, activity] = await Promise.all([
    listExpenses(user.id, filters),
    getActivityFeed(user.id, { groupId, limit: 12 }),
  ]);
  const { group, members, activeMembers } = overview;
  const myBalance = overview.balances.get(user.id) ?? 0;
  const ledgerMembers = members.filter((m) => m.status === "active" || m.balance !== 0);
  const memberOptions = members.map((m) => ({ value: m.id, label: m.id === user.id ? `${m.name} (you)` : m.name }));
  const filtered = Object.keys(search).some((k) => k !== "page" && k !== "sort" && search[k]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <GroupIcon category={group.category} coverImageUrl={group.coverImageUrl} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{group.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{groupCategoryLabel(group.category)}</Badge>
              <span>{group.currency}</span>
              <span aria-hidden>·</span>
              <Link href={`/groups/${groupId}/settings`} className="flex items-center gap-2 hover:text-foreground">
                <AvatarStack people={activeMembers} max={5} />
                {activeMembers.length} {activeMembers.length === 1 ? "member" : "members"}
              </Link>
            </div>
            {group.description && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{group.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild className="flex-1 sm:flex-none">
            <Link href={`/groups/${groupId}/expenses/new`}>
              <Plus /> Add expense
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <Link href={`/groups/${groupId}/settle`}>
              <HandCoins /> Settle up
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Group settings and members">
            <Link href={`/groups/${groupId}/settings`}>
              <Settings />
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Your balance</p>
          <BalanceLabel balance={myBalance} currency={group.currency} you className="mt-2 block text-base" />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total group spending</p>
          <Money minor={overview.totalSpent} currency={group.currency} className="mt-1.5 block text-xl font-semibold" />
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Payments to settle everyone</p>
          <p className="mt-1.5 text-xl font-semibold">
            {overview.transfers.length === 0 ? "All settled" : overview.transfers.length}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Expenses</CardTitle>
            <span className="text-sm text-muted-foreground">{overview.expenseCount} total</span>
          </CardHeader>
          <div className="px-4 pt-3 sm:px-5">
            <ExpenseFilters members={memberOptions} />
          </div>
          {expenses.items.length === 0 ? (
            <EmptyState
              icon={<Receipt />}
              title={filtered ? "No matching expenses" : "No expenses yet"}
              description={filtered ? "Try different filters." : "Add the first expense — choose who paid and who shared it."}
              action={
                !filtered && (
                  <Button asChild size="sm">
                    <Link href={`/groups/${groupId}/expenses/new`}>
                      <Plus /> Add expense
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
              <ul className="mt-3 divide-y border-t">
                {expenses.items.map((e) => (
                  <ExpenseRow key={e.id} expense={e} userId={user.id} />
                ))}
              </ul>
              <Pagination
                page={expenses.page}
                pageCount={expenses.pageCount}
                total={expenses.total}
                basePath={`/groups/${groupId}`}
                params={search}
              />
            </>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Balances</CardTitle>
              <Link href={`/groups/${groupId}/settle`} className="text-sm text-muted-foreground hover:text-foreground">
                Settle up
              </Link>
            </CardHeader>
            <CardContent className="pt-3">
              <ul className="flex flex-col gap-3">
                {ledgerMembers.map((m) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <UserAvatar id={m.id} name={m.name} image={m.image} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m.id === user.id ? "You" : m.name}
                        {m.status !== "active" && <span className="ml-1 text-xs font-normal text-muted-foreground">(left)</span>}
                      </p>
                      <BalanceLabel balance={m.balance} currency={group.currency} className="text-xs" />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pt-2">
              {activity.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ActivityFeed items={activity} viewerId={user.id} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

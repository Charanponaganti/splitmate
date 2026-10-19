import type { Metadata } from "next";
import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import { ActivityFeed } from "@/components/activity-feed";
import { ExpenseFilters } from "@/components/expense-filters";
import { ExpenseRow } from "@/components/expense-row";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { getActivityFeed, getAnalytics, getCoMembers, getGroupsForUser, listExpenses } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";
import { parseExpenseFilters } from "@/lib/validation";
import { CategoryChart, MonthlyChart } from "./charts";

export const metadata: Metadata = { title: "Activity & insights" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const search = await searchParams;
  const groupsList = await getGroupsForUser(user.id);
  let filters = parseExpenseFilters(search);
  // Ignore a group filter the user can't access rather than erroring.
  if (filters.groupId && !groupsList.some((g) => g.id === filters.groupId)) filters = { ...filters, groupId: undefined };
  const requestedCurrency = typeof search.currency === "string" ? search.currency : undefined;

  const [expenses, analytics, people, feed] = await Promise.all([
    listExpenses(user.id, filters),
    getAnalytics(user.id, filters, requestedCurrency),
    getCoMembers(user.id),
    getActivityFeed(user.id, { groupId: filters.groupId, limit: 15 }),
  ]);

  const exportParams = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value && k !== "page" && k !== "currency") exportParams.set(k, value);
  }
  const currencyHref = (code: string) => {
    const p = new URLSearchParams(exportParams);
    p.set("currency", code);
    return `/activity?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Activity & insights"
        description="Every expense across your groups, with spending breakdowns."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/export${exportParams.size ? `?${exportParams}` : ""}`} download>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />

      <Card className="mb-6 p-4 sm:p-5">
        <ExpenseFilters
          members={people.map((p) => ({ value: p.id, label: p.id === user.id ? `${p.name} (you)` : p.name }))}
          groups={groupsList.map((g) => ({ value: g.id, label: g.name }))}
          showPayerParticipant={false}
          showMember
        />
      </Card>

      {analytics.currency && (
        <>
          {analytics.currencies.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Insights currency:</span>
              {analytics.currencies.map((c) => (
                <Button key={c} asChild size="sm" variant={c === analytics.currency ? "secondary" : "ghost"}>
                  <Link href={currencyHref(c)} scroll={false}>
                    {c}
                  </Link>
                </Button>
              ))}
            </div>
          )}
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Total spending</p>
              <Money minor={analytics.total} currency={analytics.currency} className="mt-1.5 block text-xl font-semibold" />
              <p className="text-xs text-muted-foreground">{analytics.count} expenses</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Your share</p>
              <Money minor={analytics.myShare} currency={analytics.currency} className="mt-1.5 block text-xl font-semibold" />
              <p className="text-xs text-muted-foreground">
                {analytics.total ? Math.round((analytics.myShare / analytics.total) * 100) : 0}% of the total
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Average per month</p>
              <Money
                minor={analytics.monthly.length ? Math.round(analytics.total / analytics.monthly.length) : 0}
                currency={analytics.currency}
                className="mt-1.5 block text-xl font-semibold"
              />
              <p className="text-xs text-muted-foreground">over {analytics.monthly.length} months</p>
            </Card>
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Monthly spending</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyChart data={analytics.monthly} currency={analytics.currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By category</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryChart data={analytics.byCategory} currency={analytics.currency} />
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Individual breakdown</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Person</th>
                    <th className="py-2 text-right font-medium">Paid</th>
                    <th className="py-2 text-right font-medium">Share</th>
                    <th className="py-2 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {analytics.byMember.map((m) => (
                    <tr key={m.userId}>
                      <td className="py-2.5">{m.userId === user.id ? "You" : m.name}</td>
                      <td className="py-2.5 text-right">
                        <Money minor={m.paid} currency={analytics.currency!} />
                      </td>
                      <td className="py-2.5 text-right">
                        <Money minor={m.share} currency={analytics.currency!} />
                      </td>
                      <td className="py-2.5 text-right">
                        <Money minor={m.paid - m.share} currency={analytics.currency!} tone="auto" signed />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Based on expenses matching your filters. Repayments aren&apos;t included here — see each group&apos;s balances.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Expenses</CardTitle>
            <span className="text-sm text-muted-foreground">{expenses.total} found</span>
          </CardHeader>
          {expenses.items.length === 0 ? (
            <EmptyState icon={<Receipt />} title="No expenses found" description="Adjust the filters, or add an expense to one of your groups." />
          ) : (
            <>
              <ul className="mt-3 divide-y border-t">
                {expenses.items.map((e) => (
                  <ExpenseRow key={e.id} expense={e} userId={user.id} showGroup />
                ))}
              </ul>
              <Pagination page={expenses.page} pageCount={expenses.pageCount} total={expenses.total} basePath="/activity" params={search} />
            </>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pt-2">
            {feed.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ActivityFeed items={feed} viewerId={user.id} showGroup />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

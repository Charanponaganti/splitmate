import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, HandCoins, Plus, Receipt, Scale, Users } from "lucide-react";
import { UserAvatar } from "@/components/avatar";
import { ExpenseRow } from "@/components/expense-row";
import { GroupCard } from "@/components/group-card";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { getDashboard } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";
import { firstName } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboard(user.id);
  const totals = data.totals.length > 0 ? data.totals : [{ currency: user.preferredCurrency, owe: 0, owed: 0, net: 0 }];

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName(user.name)}`}
        description="Here's where you stand across all your groups."
        actions={
          data.groups.length > 0 && (
            <Button asChild className="hidden lg:inline-flex">
              <Link href="/expenses/new">
                <Plus /> Add expense
              </Link>
            </Button>
          )
        }
      />

      <section aria-label="Your balances" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="You owe"
          icon={<ArrowUpRight />}
          tone="negative"
          values={totals.map((t) => ({ currency: t.currency, minor: t.owe }))}
        />
        <SummaryCard
          label="You are owed"
          icon={<ArrowDownLeft />}
          tone="positive"
          values={totals.map((t) => ({ currency: t.currency, minor: t.owed }))}
        />
        <SummaryCard
          label="Net balance"
          icon={<Scale />}
          tone="auto"
          values={totals.map((t) => ({ currency: t.currency, minor: t.net }))}
          signed
        />
      </section>

      {data.groups.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            icon={<Users />}
            title="Start your first group"
            description="Create a group for a trip, your flat or a dinner, then invite friends with a link. Expenses and balances live inside groups."
            action={
              <Button asChild>
                <Link href="/groups/new">
                  <Plus /> Create a group
                </Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent expenses</CardTitle>
                <Link href="/activity" className="text-sm text-muted-foreground hover:text-foreground">
                  View all
                </Link>
              </CardHeader>
              {data.recentExpenses.length === 0 ? (
                <EmptyState
                  icon={<Receipt />}
                  title="No expenses yet"
                  description="Add the first expense and we'll do the maths."
                  action={
                    <Button asChild size="sm">
                      <Link href="/expenses/new">
                        <Plus /> Add expense
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="mt-2 divide-y border-t">
                  {data.recentExpenses.map((e) => (
                    <ExpenseRow key={e.id} expense={e} userId={user.id} showGroup />
                  ))}
                </ul>
              )}
            </Card>

            <section aria-labelledby="groups-heading">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="groups-heading" className="text-[15px] font-semibold">
                  Your groups
                </h2>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/groups/new">
                    <Plus /> New group
                  </Link>
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.groups.slice(0, 6).map((g) => (
                  <GroupCard key={g.id} group={g} />
                ))}
              </div>
              {data.groups.length > 6 && (
                <Link href="/groups" className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  All {data.groups.length} groups <ArrowRight className="size-3.5" />
                </Link>
              )}
            </section>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Pending settlements</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {data.pending.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <HandCoins className="size-6 text-primary" />
                  <p className="mt-2 text-sm font-medium">You&apos;re all settled up</p>
                  <p className="text-xs text-muted-foreground">Nothing to pay or collect right now.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {data.pending.map((p) => {
                    const youPay = p.fromUserId === user.id;
                    return (
                      <li key={`${p.groupId}-${p.fromUserId}-${p.toUserId}`}>
                        <Link
                          href={`/groups/${p.groupId}/settle`}
                          className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60"
                        >
                          <UserAvatar id={p.counterparty.id} name={p.counterparty.name} image={p.counterparty.image} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">
                              {youPay ? (
                                <>
                                  You pay <span className="font-medium">{firstName(p.counterparty.name)}</span>
                                </>
                              ) : (
                                <>
                                  <span className="font-medium">{firstName(p.counterparty.name)}</span> pays you
                                </>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{p.groupName}</p>
                          </div>
                          <Money
                            minor={p.amountMinor}
                            currency={p.currency}
                            tone={youPay ? "negative" : "positive"}
                            className="text-sm font-semibold"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function SummaryCard({
  label,
  icon,
  tone,
  values,
  signed,
}: {
  label: string;
  icon: React.ReactNode;
  tone: "positive" | "negative" | "auto";
  values: { currency: string; minor: number }[];
  signed?: boolean;
}) {
  const [primary, ...rest] = values;
  const iconTone =
    tone === "positive" ? "bg-positive-soft text-positive" : tone === "negative" ? "bg-negative-soft text-negative" : "bg-muted text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={`flex size-7 items-center justify-center rounded-md [&_svg]:size-4 ${iconTone}`}>{icon}</span>
      </div>
      <Money
        minor={primary.minor}
        currency={primary.currency}
        tone={primary.minor === 0 ? "neutral" : tone === "auto" ? "auto" : tone}
        signed={signed}
        className="mt-2 block text-2xl font-semibold tracking-tight"
      />
      {rest.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {rest.map((v) => (
            <li key={v.currency}>
              + <Money minor={v.minor} currency={v.currency} signed={signed} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

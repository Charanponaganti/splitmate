import type { Metadata } from "next";
import { BalanceLabel } from "@/components/money";
import { UserAvatar } from "@/components/avatar";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasRole } from "@/lib/server/access";
import { orNotFound } from "@/lib/server/page";
import { getGroupOverview, listSettlements } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";
import { SettleClient } from "./settle-client";

export const metadata: Metadata = { title: "Settle up" };

export default async function SettlePage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requireUser();
  const { groupId } = await params;
  const overview = await orNotFound(getGroupOverview(user.id, groupId));
  const history = await listSettlements(user.id, groupId);
  const { group } = overview;
  const ledgerMembers = overview.members.filter((m) => m.status === "active" || m.balance !== 0);

  return (
    <>
      <PageHeader title="Settle up" description={group.name} backHref={`/groups/${groupId}`} backLabel={group.name} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <SettleClient
          groupId={groupId}
          currency={group.currency}
          members={overview.activeMembers.map((m) => ({ id: m.id, name: m.name, image: m.image }))}
          balances={Object.fromEntries(overview.balances)}
          transfers={overview.transfers}
          history={history.map((h) => ({
            ...h,
            createdAt: h.createdAt.toISOString(),
            deletedAt: h.deletedAt ? h.deletedAt.toISOString() : null,
          }))}
          currentUserId={user.id}
          isAdmin={hasRole(overview.myRole, "admin")}
        />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Net balances</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {ledgerMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-3">
                  <UserAvatar id={m.id} name={m.name} image={m.image} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.id === user.id ? "You" : m.name}</p>
                    <BalanceLabel balance={m.balance} currency={group.currency} className="text-xs" />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Net balance = amount paid − share of expenses ± repayments. Balances always add up to zero.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

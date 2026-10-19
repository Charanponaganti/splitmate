import type { Metadata } from "next";
import { GroupForm } from "@/components/group-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasRole } from "@/lib/server/access";
import { listInvitations } from "@/lib/server/invitations";
import { orNotFound } from "@/lib/server/page";
import { getGroupOverview } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";
import { MembersClient } from "./members-client";

export const metadata: Metadata = { title: "Group settings" };

export default async function GroupSettingsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requireUser();
  const { groupId } = await params;
  const overview = await orNotFound(getGroupOverview(user.id, groupId));
  const invitations = await listInvitations(user.id, groupId);
  const { group } = overview;
  const isAdmin = hasRole(overview.myRole, "admin");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Members & settings" description={group.name} backHref={`/groups/${groupId}`} backLabel={group.name} />
      <div className="flex flex-col gap-6">
        <MembersClient
          groupId={groupId}
          groupName={group.name}
          currency={group.currency}
          currentUserId={user.id}
          myRole={overview.myRole}
          members={overview.activeMembers.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            image: m.image,
            role: m.role,
            balance: m.balance,
          }))}
          invitations={invitations.map((i) => ({
            id: i.id,
            email: i.email,
            expiresAt: i.expiresAt.toISOString(),
            invitedByName: i.invitedByName,
            useCount: i.useCount,
          }))}
        />
        {isAdmin && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Group details</CardTitle>
                <CardDescription>Only admins can edit these.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <GroupForm defaultCurrency={group.currency} group={group} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

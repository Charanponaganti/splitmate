import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { GroupCard } from "@/components/group-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { getGroupsForUser } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Groups" };

export default async function GroupsPage() {
  const user = await requireUser();
  const groups = await getGroupsForUser(user.id);
  return (
    <>
      <PageHeader
        title="Groups"
        description="Each group keeps its own expenses, balances and settlements."
        actions={
          <Button asChild>
            <Link href="/groups/new">
              <Plus /> New group
            </Link>
          </Button>
        }
      />
      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title="No groups yet"
            description="Create a group, then share the invite link with your friends."
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus, Users } from "lucide-react";
import { GroupIcon } from "@/components/group-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { getGroupsForUser } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Add expense" };

/** Quick add: pick a group (or skip straight to it if there's only one). */
export default async function QuickAddPage() {
  const user = await requireUser();
  const groups = await getGroupsForUser(user.id);
  if (groups.length === 1) redirect(`/groups/${groups[0].id}/expenses/new`);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Add expense" description="Which group is this for?" />
      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title="Create a group first"
            description="Expenses belong to a group so we know who can share them."
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
        <Card className="divide-y overflow-hidden">
          {groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}/expenses/new`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
              <GroupIcon category={g.category} coverImageUrl={g.coverImageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">
                  {g.memberCount} members · {g.currency}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}

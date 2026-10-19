import type { Metadata } from "next";
import { ExpenseForm } from "@/components/expense-form";
import { PageHeader } from "@/components/page-header";
import { orNotFound } from "@/lib/server/page";
import { getGroupOverview } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await requireUser();
  const { groupId } = await params;
  const overview = await orNotFound(getGroupOverview(user.id, groupId));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add expense" description={overview.group.name} backHref={`/groups/${groupId}`} backLabel={overview.group.name} />
      <ExpenseForm
        groupId={groupId}
        currency={overview.group.currency}
        currentUserId={user.id}
        members={overview.activeMembers.map((m) => ({ id: m.id, name: m.name, image: m.image }))}
      />
    </div>
  );
}

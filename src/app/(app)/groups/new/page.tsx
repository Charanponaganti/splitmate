import type { Metadata } from "next";
import { GroupForm } from "@/components/group-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "New group" };

export default async function NewGroupPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New group" description="You can invite friends right after creating it." backHref="/groups" backLabel="Groups" />
      <Card>
        <CardContent className="py-5">
          <GroupForm defaultCurrency={user.preferredCurrency} />
        </CardContent>
      </Card>
    </div>
  );
}

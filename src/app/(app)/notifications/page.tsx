import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Bell } from "lucide-react";
import { describeActivity } from "@/components/activity-feed";
import { UserAvatar } from "@/components/avatar";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { listNotifications } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { MarkAllRead } from "./mark-all-read";

export const metadata: Metadata = { title: "Notifications" };

const LABELS: Record<string, string> = {
  expense_involved: "Involves you",
  expense_added: "New expense",
  expense_updated: "Edited",
  expense_deleted: "Deleted",
  settlement_recorded: "Repayment",
  group_invitation: "Invitation",
  member_added: "Added to group",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id, 100);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Notifications" description={unread ? `${unread} unread` : "You're all caught up."} actions={unread > 0 && <MarkAllRead />} />
      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={<Bell />} title="No notifications yet" description="You'll hear about new expenses, edits, repayments and invitations here." />
        ) : (
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href ?? `/groups/${n.groupId}`}
                  className={cn("flex gap-3 px-4 py-3 transition-colors hover:bg-muted/60 sm:px-5", !n.readAt && "bg-accent/40")}
                >
                  <UserAvatar name={n.actorName} image={n.actorImage} />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="leading-snug">
                      <span className="font-medium">{n.actorName}</span>{" "}
                      <span className="text-muted-foreground">
                        {n.type === "group_invitation"
                          ? `invited you to join “${n.groupName}”`
                          : n.type === "member_added"
                            ? `added you to “${n.groupName}”`
                            : describeActivity({ type: n.activityType, data: n.data, subjectName: null, actorId: "" }, user.id)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {LABELS[n.type]} · {n.groupName} · {formatDistanceToNowStrict(n.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                  {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

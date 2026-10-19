import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { formatMoney, isSupportedCurrency } from "@/lib/money/currency";
import type { ActivityItem } from "@/lib/server/queries";
import { UserAvatar } from "./avatar";

function money(data: Record<string, unknown>) {
  const amount = typeof data.amountMinor === "number" ? data.amountMinor : null;
  const currency = typeof data.currency === "string" && isSupportedCurrency(data.currency) ? data.currency : null;
  return amount !== null && currency ? formatMoney(amount, currency) : "";
}

export function describeActivity(item: Pick<ActivityItem, "type" | "data" | "subjectName" | "actorId">, viewerId: string) {
  const d = item.data ?? {};
  const title = typeof d.title === "string" ? `“${d.title}”` : "an expense";
  switch (item.type) {
    case "expense.created":
      return `added ${title}${money(d) ? ` · ${money(d)}` : ""}`;
    case "expense.updated":
      if (d.done === true) return `marked ${title} as done`;
      if (d.done === false) return `marked ${title} as not done`;
      return `edited ${title}`;
    case "expense.deleted":
      return `deleted ${title}${money(d) ? ` · ${money(d)}` : ""}`;
    case "settlement.created": {
      const from = d.fromUserId === viewerId ? "you" : (d.fromName as string) ?? "someone";
      const to = d.toUserId === viewerId ? "you" : (d.toName as string) ?? "someone";
      return `recorded that ${from} paid ${to} ${money(d)}`;
    }
    case "settlement.deleted":
      return `undid a repayment of ${money(d)}`;
    case "group.created":
      return "created the group";
    case "group.updated":
      return "updated the group details";
    case "member.joined":
      return "joined the group";
    case "member.added":
      return `added ${item.subjectName ?? "a member"}`;
    case "member.left":
      return "left the group";
    case "member.removed":
      return `removed ${item.subjectName ?? "a member"}`;
    case "member.role_changed":
      return `made ${item.subjectName ?? "a member"} ${d.role === "admin" ? "an admin" : "a member"}`;
    default:
      return "made a change";
  }
}

function hrefFor(item: ActivityItem) {
  if (item.expenseId && item.type !== "expense.deleted") return `/groups/${item.groupId}/expenses/${item.expenseId}`;
  if (item.type.startsWith("settlement")) return `/groups/${item.groupId}/settle`;
  return `/groups/${item.groupId}`;
}

export function ActivityFeed({ items, viewerId, showGroup = false }: { items: ActivityItem[]; viewerId: string; showGroup?: boolean }) {
  return (
    <ol className="flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <Link href={hrefFor(item)} className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60">
            <UserAvatar id={item.actorId} name={item.actorName} image={item.actorImage} size="sm" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="leading-snug">
                <span className="font-medium">{item.actorId === viewerId ? "You" : item.actorName}</span>{" "}
                <span className="text-muted-foreground">{describeActivity(item, viewerId)}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {showGroup && <>{item.groupName} · </>}
                <time dateTime={item.createdAt.toISOString()} title={item.createdAt.toLocaleString()}>
                  {formatDistanceToNowStrict(item.createdAt, { addSuffix: true })}
                </time>
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

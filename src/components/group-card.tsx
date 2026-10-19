import Link from "next/link";
import { CalendarHeart, Home, MoreHorizontal, Plane, ShoppingBag, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { groupCategoryLabel } from "@/lib/constants";
import { formatMoney } from "@/lib/money/currency";
import { AvatarStack } from "./avatar";
import { BalanceLabel } from "./money";

const GROUP_ICONS: Record<string, LucideIcon> = {
  trip: Plane,
  roommates: Home,
  food: UtensilsCrossed,
  shopping: ShoppingBag,
  event: CalendarHeart,
  other: MoreHorizontal,
};

export function GroupIcon({ category, coverImageUrl, size = "md" }: { category: string; coverImageUrl?: string | null; size?: "md" | "lg" }) {
  const Icon = GROUP_ICONS[category] ?? MoreHorizontal;
  const cls = size === "lg" ? "size-14 rounded-xl" : "size-11 rounded-lg";
  if (coverImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={coverImageUrl} alt="" className={`${cls} shrink-0 object-cover`} referrerPolicy="no-referrer" />;
  }
  return (
    <span className={`${cls} flex shrink-0 items-center justify-center bg-accent text-accent-foreground`}>
      <Icon className={size === "lg" ? "size-6" : "size-5"} aria-hidden />
    </span>
  );
}

export interface GroupCardData {
  id: string;
  name: string;
  category: string;
  currency: string;
  coverImageUrl: string | null;
  members: { id: string; name: string; image: string | null }[];
  memberCount: number;
  myBalance: number;
  totalSpent: number;
}

export function GroupCard({ group }: { group: GroupCardData }) {
  return (
    <Link
      href={`/groups/${group.id}`}
      className="group flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-foreground/15"
    >
      <div className="flex items-start gap-3">
        <GroupIcon category={group.category} coverImageUrl={group.coverImageUrl} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{group.name}</h3>
          <p className="text-xs text-muted-foreground">
            {groupCategoryLabel(group.category)} · {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
          </p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <BalanceLabel balance={group.myBalance} currency={group.currency} you />
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatMoney(group.totalSpent, group.currency)} total spent
          </p>
        </div>
        <AvatarStack people={group.members} />
      </div>
    </Link>
  );
}

import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  Bed,
  Car,
  Film,
  Gift,
  HeartPulse,
  Home,
  Lightbulb,
  Paperclip,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { formatMoney } from "@/lib/money/currency";
import type { ExpenseListItem } from "@/lib/server/queries";
import { cn, firstName } from "@/lib/utils";
import { ExpenseDoneToggle } from "./expense-done-toggle";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: UtensilsCrossed,
  groceries: ShoppingCart,
  transport: Car,
  travel: Plane,
  accommodation: Bed,
  entertainment: Film,
  shopping: ShoppingBag,
  utilities: Lightbulb,
  rent: Home,
  health: HeartPulse,
  gifts: Gift,
  other: Receipt,
};

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Receipt;
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ${className ?? ""}`}>
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

function payerText(e: ExpenseListItem, userId: string) {
  if (e.payers.length > 1) return `${e.payers.length} people paid`;
  const p = e.payers[0];
  if (!p) return "";
  return p.id === userId ? "You paid" : `${firstName(p.name)} paid`;
}

function participantText(e: ExpenseListItem, userId: string) {
  const n = e.participants.length;
  const you = e.participants.some((p) => p.id === userId);
  if (n === 1) return you ? "for you" : `for ${firstName(e.participants[0].name)}`;
  return `split ${n} ways${you ? "" : " (not you)"}`;
}

/** What this expense means for the current user: lent (+) or borrowed (−). */
function impact(e: ExpenseListItem) {
  return e.myPaid - e.myShare;
}

export function ExpenseRow({ expense, userId, showGroup = false }: { expense: ExpenseListItem; userId: string; showGroup?: boolean }) {
  const net = impact(expense);
  const involved = expense.myPaid > 0 || expense.myShare > 0;
  return (
    <li className="flex items-stretch">
      <div className="flex items-center pl-3 sm:pl-4">
        <ExpenseDoneToggle expenseId={expense.id} done={expense.done} title={expense.title} />
      </div>
      <Link
        href={`/groups/${expense.groupId}/expenses/${expense.id}`}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 sm:pr-5",
          expense.done && "opacity-70",
        )}
      >
        <div className="hidden w-10 shrink-0 text-center sm:block">
          <div className="text-[11px] uppercase text-muted-foreground">{format(parseISO(expense.expenseDate), "MMM")}</div>
          <div className="text-lg font-semibold leading-none">{format(parseISO(expense.expenseDate), "d")}</div>
        </div>
        <CategoryIcon category={expense.category} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("truncate font-medium", expense.done && "line-through text-muted-foreground")}>{expense.title}</span>
            {expense.hasReceipt && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has receipt" />}
            {expense.done && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                Done
              </span>
            )}
          </div>
          <div className="truncate text-[13px] text-muted-foreground">
            <span className="sm:hidden">{format(parseISO(expense.expenseDate), "d MMM")} · </span>
            {showGroup && <span>{expense.groupName} · </span>}
            {payerText(expense, userId)} {formatMoney(expense.amountMinor, expense.currency)} {participantText(expense, userId)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {!involved ? (
            <span className="text-xs text-muted-foreground">not involved</span>
          ) : net === 0 ? (
            <span className="text-xs text-muted-foreground">no balance</span>
          ) : (
            <>
              <div className={`text-[11px] ${net > 0 ? "text-positive" : "text-negative"}`}>{net > 0 ? "you lent" : "you owe"}</div>
              <div className={`tabular text-sm font-semibold ${net > 0 ? "text-positive" : "text-negative"}`}>
                {formatMoney(Math.abs(net), expense.currency)}
              </div>
            </>
          )}
        </div>
      </Link>
    </li>
  );
}

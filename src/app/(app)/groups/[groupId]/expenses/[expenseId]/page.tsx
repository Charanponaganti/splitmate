import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { ArrowRight, FileText, Pencil, Tag } from "lucide-react";
import { UserAvatar } from "@/components/avatar";
import { ExpenseDoneToggle } from "@/components/expense-done-toggle";
import { CategoryIcon } from "@/components/expense-row";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { expenseCategoryLabel, SPLIT_METHOD_LABELS } from "@/lib/constants";
import { expenseTransfers } from "@/lib/money/balances";
import { scaledToDecimalString } from "@/lib/money/currency";
import { getExpenseDetail } from "@/lib/server/expenses";
import { orNotFound } from "@/lib/server/page";
import { requireUser } from "@/lib/session";
import { DeleteExpenseButton } from "./delete-button";

export const metadata: Metadata = { title: "Expense" };

export default async function ExpenseDetailPage({ params }: { params: Promise<{ groupId: string; expenseId: string }> }) {
  const user = await requireUser();
  const { groupId, expenseId } = await params;
  const detail = await orNotFound(getExpenseDetail(user.id, expenseId));
  const { expense, payers, participants, people, receipt, history } = detail;
  if (expense.groupId !== groupId) notFound();

  const name = (id: string) => (id === user.id ? "You" : people.get(id)?.name ?? "Former member");
  const deleted = expense.deletedAt !== null;
  const transfers = deleted
    ? []
    : expenseTransfers({
        payers: payers.map((p) => ({ userId: p.userId, amountMinor: p.amountMinor })),
        participants: participants.map((p) => ({ userId: p.userId, shareMinor: p.shareMinor })),
      });
  const methodNote = (inputValue: number | null) => {
    if (inputValue === null) return null;
    if (expense.splitMethod === "percentage") return `${scaledToDecimalString(inputValue, 2)}%`;
    if (expense.splitMethod === "shares") return `${scaledToDecimalString(inputValue, 2)} ${inputValue === 100 ? "share" : "shares"}`;
    return null;
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        backHref={`/groups/${groupId}`}
        backLabel="Back to group"
        title={
          <span className="flex items-center gap-3">
            <CategoryIcon category={expense.category} />
            <span className="truncate">{expense.title}</span>
          </span>
        }
        actions={
          !deleted && (
            <>
              <ExpenseDoneToggle expenseId={expenseId} done={expense.doneAt !== null} title={expense.title} />
              <Button asChild variant="outline">
                <Link href={`/groups/${groupId}/expenses/${expenseId}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              <DeleteExpenseButton expenseId={expenseId} groupId={groupId} title={expense.title} />
            </>
          )
        }
      />

      {deleted && (
        <div className="mb-4 rounded-lg border border-negative/30 bg-negative-soft px-4 py-3 text-sm text-negative">
          This expense was deleted and no longer affects balances. It&apos;s kept here for the record.
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-4 py-5">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <Money minor={expense.amountMinor} currency={expense.currency} className="text-3xl font-semibold tracking-tight" />
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {expense.doneAt && <Badge variant="primary">Done</Badge>}
            <Badge variant="outline">{format(parseISO(expense.expenseDate), "EEE, d MMM yyyy")}</Badge>
            <Badge variant="outline">{expenseCategoryLabel(expense.category)}</Badge>
            <Badge variant="outline">Split {SPLIT_METHOD_LABELS[expense.splitMethod].toLowerCase()}</Badge>
            {expense.tags.map((t) => (
              <Badge key={t}>
                <Tag /> {t}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Paid by</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {payers.map((p) => (
                <li key={p.userId} className="flex items-center gap-3">
                  <UserAvatar id={p.userId} name={people.get(p.userId)?.name ?? "?"} image={people.get(p.userId)?.image} />
                  <span className="flex-1 text-sm font-medium">{name(p.userId)}</span>
                  <Money minor={p.amountMinor} currency={expense.currency} className="text-sm font-semibold" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shared by</CardTitle>
            <span className="text-sm text-muted-foreground">{participants.length} people</span>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {participants.map((p) => (
                <li key={p.userId} className="flex items-center gap-3">
                  <UserAvatar id={p.userId} name={people.get(p.userId)?.name ?? "?"} image={people.get(p.userId)?.image} />
                  <span className="flex-1 text-sm">
                    <span className="font-medium">{name(p.userId)}</span>
                    {methodNote(p.inputValue) && <span className="ml-1.5 text-muted-foreground">{methodNote(p.inputValue)}</span>}
                  </span>
                  <Money minor={p.shareMinor} currency={expense.currency} className="text-sm" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {transfers.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Who owes whom</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {transfers.map((t) => (
                <li key={`${t.fromUserId}-${t.toUserId}`} className="flex items-center gap-2">
                  <span className="font-medium">{name(t.fromUserId)}</span>
                  <ArrowRight className="size-3.5 text-muted-foreground" aria-label="owe" />
                  <span className="font-medium">{name(t.toUserId)}</span>
                  <Money
                    minor={t.amountMinor}
                    currency={expense.currency}
                    tone={t.fromUserId === user.id ? "negative" : t.toUserId === user.id ? "positive" : "neutral"}
                    className="ml-auto font-semibold"
                  />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              A payer&apos;s own share is never counted as owed. These amounts are already included in the group balances.
            </p>
          </CardContent>
        </Card>
      )}

      {(expense.notes || receipt) && (
        <Card className="mt-4">
          <CardContent className="flex flex-col gap-4 py-5">
            {expense.notes && (
              <div>
                <p className="text-sm font-medium">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{expense.notes}</p>
              </div>
            )}
            {receipt && (
              <div>
                <p className="mb-2 text-sm font-medium">Receipt</p>
                {receipt.contentType.startsWith("image/") && receipt.contentType !== "image/heic" ? (
                  <a href={`/api/attachments/${receipt.id}`} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/attachments/${receipt.id}`}
                      alt={`Receipt for ${expense.title}`}
                      className="max-h-80 rounded-lg border object-contain"
                    />
                  </a>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/attachments/${receipt.id}`} target="_blank" rel="noopener noreferrer">
                      <FileText /> {receipt.fileName}
                    </a>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
                <span>
                  <span className="font-medium">{h.actorName}</span>{" "}
                  <span className="text-muted-foreground">
                    {h.type === "expense.created"
                      ? "added this expense"
                      : h.type === "expense.updated"
                        ? h.data?.done === true
                          ? "marked this as done"
                          : h.data?.done === false
                            ? "marked this as not done"
                            : "edited this expense"
                        : "deleted this expense"}
                  </span>
                </span>
                <time className="text-xs text-muted-foreground" dateTime={h.createdAt.toISOString()} title={h.createdAt.toLocaleString()}>
                  {formatDistanceToNowStrict(h.createdAt, { addSuffix: true })}
                </time>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

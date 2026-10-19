"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, HandCoins, Info, Plus, Undo2 } from "lucide-react";
import { deleteSettlementAction, recordSettlementAction } from "@/app/actions";
import { UserAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/menu";
import { Badge } from "@/components/ui/misc";
import { formatMoney, getCurrency, minorToDecimalString, parseToMinor } from "@/lib/money/currency";
import { cn, firstName, newRequestId, todayIso } from "@/lib/utils";

interface Member {
  id: string;
  name: string;
  image: string | null;
}

interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

interface HistoryItem {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  createdBy: string;
  createdByName: string;
  amountMinor: number;
  settledOn: string;
  note: string | null;
  isOverpayment: boolean;
  createdAt: string;
  deletedAt: string | null;
}

function outstanding(balances: Record<string, number>, from: string, to: string) {
  const f = balances[from] ?? 0;
  const t = balances[to] ?? 0;
  if (f >= 0 || t <= 0) return 0;
  return Math.min(-f, t);
}

export function SettleClient({
  groupId,
  currency,
  members,
  balances,
  transfers,
  history,
  currentUserId,
  isAdmin,
}: {
  groupId: string;
  currency: string;
  members: Member[];
  balances: Record<string, number>;
  transfers: Transfer[];
  history: HistoryItem[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ from: string; to: string; amount: string } | null>(null);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const label = (id: string) => (id === currentUserId ? "You" : firstName(byId.get(id)?.name ?? "Former member"));
  const canRecord = (t: { fromUserId: string; toUserId: string }) =>
    isAdmin || t.fromUserId === currentUserId || t.toUserId === currentUserId;

  const mine = transfers.filter((t) => t.fromUserId === currentUserId || t.toUserId === currentUserId);
  const others = transfers.filter((t) => !mine.includes(t));

  const openFor = (t?: Transfer) => {
    if (t) setDialog({ from: t.fromUserId, to: t.toUserId, amount: minorToDecimalString(t.amountMinor, currency) });
    else {
      const youOwe = transfers.find((x) => x.fromUserId === currentUserId);
      setDialog(
        youOwe
          ? { from: youOwe.fromUserId, to: youOwe.toUserId, amount: minorToDecimalString(youOwe.amountMinor, currency) }
          : { from: currentUserId, to: members.find((m) => m.id !== currentUserId)?.id ?? "", amount: "" },
      );
    }
  };

  const renderTransfer = (t: Transfer) => (
    <li key={`${t.fromUserId}-${t.toUserId}`} className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <UserAvatar id={t.fromUserId} name={byId.get(t.fromUserId)?.name ?? "?"} image={byId.get(t.fromUserId)?.image} size="sm" />
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <UserAvatar id={t.toUserId} name={byId.get(t.toUserId)?.name ?? "?"} image={byId.get(t.toUserId)?.image} size="sm" />
        <p className="min-w-0 text-sm">
          <span className="font-medium">{label(t.fromUserId)}</span> {t.fromUserId === currentUserId ? "pay" : "pays"}{" "}
          <span className="font-medium">{label(t.toUserId)}</span>{" "}
          <span
            className={cn(
              "tabular font-semibold",
              t.fromUserId === currentUserId && "text-negative",
              t.toUserId === currentUserId && "text-positive",
            )}
          >
            {formatMoney(t.amountMinor, currency)}
          </span>
        </p>
      </div>
      {canRecord(t) && (
        <Button size="sm" variant={t.fromUserId === currentUserId || t.toUserId === currentUserId ? "default" : "outline"} onClick={() => openFor(t)}>
          <CheckCircle2 /> Mark as paid
        </Button>
      )}
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Recording a repayment only updates balances in this app — it doesn&apos;t move any money. Pay through UPI, bank transfer or cash
          first, then record it here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Suggested payments</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {transfers.length === 0
                ? "Everyone is settled up."
                : `The fewest payments (${transfers.length}) that settle everyone.`}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openFor()}>
            <Plus /> Record repayment
          </Button>
        </CardHeader>
        <CardContent>
          {transfers.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <HandCoins className="size-7 text-primary" />
              <p className="mt-2 font-medium">All settled up</p>
              <p className="text-sm text-muted-foreground">No one owes anything in this group.</p>
            </div>
          ) : (
            <>
              {mine.length > 0 && <ul className="divide-y">{mine.map(renderTransfer)}</ul>}
              {others.length > 0 && (
                <>
                  {mine.length > 0 && <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Between others</p>}
                  <ul className="divide-y">{others.map(renderTransfer)}</ul>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Repayment history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No repayments recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {history.map((h) => {
                const undoable = !h.deletedAt && (isAdmin || [h.createdBy, h.fromUserId, h.toUserId].includes(currentUserId));
                return (
                  <li key={h.id} className={cn("flex flex-wrap items-center gap-3 py-3", h.deletedAt && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", h.deletedAt && "line-through")}>
                        <span className="font-medium">{h.fromUserId === currentUserId ? "You" : h.fromName}</span> paid{" "}
                        <span className="font-medium">{h.toUserId === currentUserId ? "you" : h.toName}</span>{" "}
                        <span className="tabular font-semibold">{formatMoney(h.amountMinor, currency)}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {format(parseISO(h.settledOn), "d MMM yyyy")} · recorded by {h.createdBy === currentUserId ? "you" : h.createdByName}
                        {h.note && <> · “{h.note}”</>}
                      </p>
                    </div>
                    {h.isOverpayment && <Badge variant="outline">Overpayment</Badge>}
                    {h.deletedAt && <Badge variant="outline">Undone</Badge>}
                    {undoable && (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Undo2 /> Undo
                          </Button>
                        }
                        title="Undo this repayment?"
                        description="Balances will go back to how they were before it was recorded. The history keeps a record that it was undone."
                        confirmLabel="Undo repayment"
                        destructive
                        onConfirm={async () => {
                          const result = await deleteSettlementAction(h.id);
                          if (!result.ok) return void toast.error(result.error);
                          toast.success("Repayment undone");
                          router.refresh();
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {dialog && (
        <RecordDialog
          key={`${dialog.from}-${dialog.to}-${dialog.amount}`}
          groupId={groupId}
          currency={currency}
          members={members}
          balances={balances}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          initial={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function RecordDialog({
  groupId,
  currency,
  members,
  balances,
  currentUserId,
  isAdmin,
  initial,
  onClose,
}: {
  groupId: string;
  currency: string;
  members: Member[];
  balances: Record<string, number>;
  currentUserId: string;
  isAdmin: boolean;
  initial: { from: string; to: string; amount: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const [requestId] = useState(newRequestId);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [amount, setAmount] = useState(initial.amount);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [overpay, setOverpay] = useState(false);
  const [pending, setPending] = useState(false);
  const { symbol } = getCurrency(currency);

  const amountMinor = parseToMinor(amount, currency);
  const max = outstanding(balances, from, to);
  const over = amountMinor !== null && amountMinor > max;
  const permitted = isAdmin || from === currentUserId || to === currentUserId;

  let error: string | null = null;
  if (from === to) error = "Choose two different people.";
  else if (!permitted) error = "Only the people involved or a group admin can record this.";
  else if (amount !== "" && (amountMinor === null || amountMinor <= 0)) error = "Enter a valid amount.";
  else if (over && !overpay)
    error = max === 0 ? "Nothing is owed in this direction. Turn on overpayment if intended." : `More than the outstanding ${formatMoney(max, currency)}.`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error || !amountMinor) return;
    setPending(true);
    const result = await recordSettlementAction({
      groupId,
      fromUserId: from,
      toUserId: to,
      amountMinor,
      settledOn: date,
      note: note.trim() || null,
      allowOverpayment: overpay,
      clientRequestId: requestId,
    });
    setPending(false);
    if (!result.ok) return void toast.error(result.error);
    toast.success(result.data.duplicate ? "Already recorded" : "Repayment recorded");
    onClose();
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a repayment</DialogTitle>
          <DialogDescription>Confirm a payment that already happened outside the app.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-from">Who paid</Label>
              <NativeSelect id="s-from" value={from} onChange={(e) => setFrom(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === currentUserId ? "You" : m.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <ArrowRight className="mb-3 size-4 text-muted-foreground" aria-hidden />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-to">Who received</Label>
              <NativeSelect id="s-to" value={to} onChange={(e) => setTo(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === currentUserId ? "You" : m.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="s-amount">Amount</Label>
              {from !== to && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:no-underline"
                  disabled={max === 0}
                  onClick={() => setAmount(minorToDecimalString(max, currency))}
                >
                  Outstanding: {formatMoney(max, currency)}
                </button>
              )}
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{symbol}</span>
              <Input
                id="s-amount"
                inputMode="decimal"
                autoComplete="off"
                className="tabular h-12 pl-9 text-lg font-semibold"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                aria-invalid={!!error && amount !== ""}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-date">Date paid</Label>
              <Input id="s-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-note">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="s-note" rows={1} className="min-h-10" placeholder="UPI ref, cash…" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {over && (
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <span>
                <span className="font-medium">Record as overpayment</span>
                <span className="block text-xs text-muted-foreground">The extra will be owed back to the payer.</span>
              </span>
              <Switch checked={overpay} onCheckedChange={setOverpay} />
            </label>
          )}

          <FieldError>{error}</FieldError>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={!!error || !amountMinor}>
              Record repayment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

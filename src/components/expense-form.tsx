"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Check, CheckCircle2, CircleAlert, Paperclip, Trash2, Upload, Users } from "lucide-react";
import { createExpenseAction, updateExpenseAction } from "@/app/actions";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_VALUES, SPLIT_METHOD_LABELS } from "@/lib/constants";
import { expenseTransfers } from "@/lib/money/balances";
import {
  formatMoney,
  getCurrency,
  minorToDecimalString,
  parseScaledDecimal,
  parseToMinor,
  scaledToDecimalString,
} from "@/lib/money/currency";
import { allocateProportionally, computeSplit, PERCENT_SCALE, SPLIT_METHODS, validatePayers, type SplitMethod } from "@/lib/money/split";
import { cn, firstName, newRequestId, todayIso } from "@/lib/utils";
import { isoDateSchema } from "@/lib/validation";
import { UserAvatar } from "./avatar";
import { Button } from "./ui/button";
import { FieldError, Input, Label, NativeSelect, Textarea } from "./ui/input";
import { Switch } from "./ui/menu";

interface Member {
  id: string;
  name: string;
  image: string | null;
}

export interface ExpenseFormInitial {
  expenseId: string;
  version: number;
  title: string;
  amountMinor: number;
  category: (typeof EXPENSE_CATEGORY_VALUES)[number];
  expenseDate: string;
  notes: string | null;
  tags: string[];
  splitMethod: SplitMethod;
  payers: { userId: string; amountMinor: number }[];
  participants: { userId: string; inputValue: number | null }[];
  receipt: { id: string; fileName: string } | null;
}

const detailsSchema = z.object({
  title: z.string().trim().min(1, "Add a short description.").max(120),
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  expenseDate: isoDateSchema,
  notes: z.string().max(1000).optional(),
  tags: z.string().max(300).optional(),
});
type Details = z.infer<typeof detailsSchema>;

const VALUE_DECIMALS = 2; // percentages and shares accept two decimal places

function parseTags(raw: string | undefined): string[] {
  return [...new Set((raw ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
}

export function ExpenseForm({
  groupId,
  currency,
  members,
  currentUserId,
  initial,
}: {
  groupId: string;
  currency: string;
  members: Member[];
  currentUserId: string;
  initial?: ExpenseFormInitial;
}) {
  const router = useRouter();
  const { decimals, symbol } = getCurrency(currency);
  const [requestId] = useState(newRequestId);
  const fileInput = useRef<HTMLInputElement>(null);

  const form = useForm<Details>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      title: initial?.title ?? "",
      category: initial?.category ?? "food",
      expenseDate: initial?.expenseDate ?? todayIso(),
      notes: initial?.notes ?? "",
      tags: initial?.tags.join(", ") ?? "",
    },
  });
  const { errors, isSubmitting } = form.formState;

  const [amount, setAmount] = useState(initial ? minorToDecimalString(initial.amountMinor, currency) : "");
  const [multiPayer, setMultiPayer] = useState((initial?.payers.length ?? 0) > 1);
  const [payerId, setPayerId] = useState(
    initial?.payers[0]?.userId ?? (members.some((m) => m.id === currentUserId) ? currentUserId : members[0]?.id),
  );
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.payers ?? []).map((p) => [p.userId, minorToDecimalString(p.amountMinor, currency)])),
  );
  const [included, setIncluded] = useState<string[]>(initial ? initial.participants.map((p) => p.userId) : members.map((m) => m.id));
  const [method, setMethod] = useState<SplitMethod>(initial?.splitMethod ?? "equal");
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!initial || initial.splitMethod === "equal") return {};
    return Object.fromEntries(
      initial.participants.map((p) => [
        p.userId,
        p.inputValue === null
          ? ""
          : initial.splitMethod === "exact"
            ? minorToDecimalString(p.inputValue, currency)
            : scaledToDecimalString(p.inputValue, VALUE_DECIMALS),
      ]),
    );
  });
  const [receipt, setReceipt] = useState(initial?.receipt ?? null);
  const [uploading, setUploading] = useState(false);

  const amountMinor = parseToMinor(amount, currency);
  const amountValid = amountMinor !== null && amountMinor > 0;
  const total = amountValid ? amountMinor : 0;
  const nameOf = (id: string) => (id === currentUserId ? "You" : firstName(members.find((m) => m.id === id)?.name ?? "Someone"));

  /* Payers ----------------------------------------------------------------- */
  const payers = useMemo(() => {
    if (!multiPayer) return payerId ? [{ userId: payerId, amountMinor: total }] : [];
    return members
      .filter((m) => (payerAmounts[m.id] ?? "").trim() !== "")
      .map((m) => ({ userId: m.id, amountMinor: parseToMinor(payerAmounts[m.id], currency) ?? -1 }));
  }, [multiPayer, payerId, total, members, payerAmounts, currency]);
  const payerSum = payers.reduce((s, p) => s + Math.max(0, p.amountMinor), 0);
  const payerCheck = payers.some((p) => p.amountMinor < 0)
    ? ({ ok: false, error: `Check the paid amounts — use up to ${decimals} decimal places.` } as const)
    : validatePayers(total, payers);

  /* Participants & split --------------------------------------------------- */
  const orderedIncluded = members.filter((m) => included.includes(m.id)).map((m) => m.id);
  const parseValue = (raw: string | undefined): number | null => {
    if (!raw || raw.trim() === "") return null;
    return method === "exact" ? parseToMinor(raw, currency) : parseScaledDecimal(raw, VALUE_DECIMALS);
  };
  const participantInputs = orderedIncluded.map((userId) => ({
    userId,
    value: method === "equal" ? null : parseValue(values[userId]),
  }));
  const invalidValue = method !== "equal" && orderedIncluded.some((id) => (values[id] ?? "").trim() !== "" && parseValue(values[id]) === null);
  const split = amountValid && !invalidValue ? computeSplit(total, method, participantInputs.map((p) => ({ ...p, value: p.value ?? 0 }))) : null;
  const shareOf = (id: string) => (split?.ok ? split.shares.find((s) => s.userId === id)?.shareMinor ?? 0 : null);
  const assigned = participantInputs.reduce((s, p) => s + (p.value ?? 0), 0);

  let splitStatus: { ok: boolean; text: string } | null = null;
  if (!amountValid) splitStatus = { ok: false, text: "Enter the total amount first." };
  else if (orderedIncluded.length === 0) splitStatus = { ok: false, text: "Choose at least one person to share this expense." };
  else if (invalidValue) splitStatus = { ok: false, text: "One of the values isn't a valid number." };
  else if (method === "exact") {
    const left = total - assigned;
    splitStatus =
      left === 0 && split?.ok
        ? { ok: true, text: "Amounts add up to the total." }
        : left === 0
          ? { ok: false, text: split && !split.ok ? split.error : "" }
          : { ok: false, text: left > 0 ? `${formatMoney(left, currency)} left to assign` : `${formatMoney(-left, currency)} over the total` };
  } else if (method === "percentage") {
    const left = PERCENT_SCALE - assigned;
    splitStatus =
      left === 0 && split?.ok
        ? { ok: true, text: "Percentages add up to 100%." }
        : left === 0
          ? { ok: false, text: split && !split.ok ? split.error : "" }
          : { ok: false, text: left > 0 ? `${scaledToDecimalString(left, 2)}% left to assign` : `${scaledToDecimalString(-left, 2)}% over 100%` };
  } else if (split && !split.ok) splitStatus = { ok: false, text: split.error };
  else if (split?.ok) {
    splitStatus = {
      ok: true,
      text:
        method === "equal"
          ? `${formatMoney(Math.floor(total / orderedIncluded.length), currency)} each${total % orderedIncluded.length ? " (remainder spread fairly)" : ""}`
          : `${scaledToDecimalString(assigned, 2)} shares in total`,
    };
  }

  const canSave = amountValid && payerCheck.ok && !!split?.ok && !uploading;
  const transfers = canSave && split?.ok ? expenseTransfers({ payers, participants: split.shares }) : [];

  /* Actions ---------------------------------------------------------------- */
  const toggleIncluded = (id: string) => setIncluded((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const changeMethod = (next: SplitMethod) => {
    setMethod(next);
    if (next === "shares") setValues(Object.fromEntries(members.map((m) => [m.id, "1"])));
    else if (next !== method) setValues({});
  };

  const fillEvenly = () => {
    if (orderedIncluded.length === 0) return;
    if (method === "percentage") {
      const parts = allocateProportionally(PERCENT_SCALE, orderedIncluded.map(() => 1));
      setValues(Object.fromEntries(orderedIncluded.map((id, i) => [id, scaledToDecimalString(parts[i], 2)])));
    } else if (method === "exact" && amountValid) {
      const parts = allocateProportionally(total, orderedIncluded.map(() => 1));
      setValues(Object.fromEntries(orderedIncluded.map((id, i) => [id, minorToDecimalString(parts[i], currency)])));
    }
  };

  const uploadReceipt = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return void toast.error("Receipts must be 5 MB or smaller.");
    setUploading(true);
    try {
      const body = new FormData();
      body.set("groupId", groupId);
      body.set("file", file);
      const response = await fetch("/api/attachments", { method: "POST", body });
      const json = (await response.json().catch(() => ({}))) as { id?: string; fileName?: string; error?: string };
      if (!response.ok || !json.id) throw new Error(json.error ?? "Upload failed.");
      setReceipt({ id: json.id, fileName: json.fileName ?? file.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const onSubmit = form.handleSubmit(async (details) => {
    if (!amountValid) return void toast.error("Enter a valid amount.");
    if (!payerCheck.ok) return void toast.error(payerCheck.error);
    if (!split?.ok) return void toast.error(splitStatus?.text || "Check how the expense is split.");

    const payload = {
      title: details.title,
      amountMinor: total,
      category: details.category,
      expenseDate: details.expenseDate,
      notes: details.notes?.trim() || null,
      tags: parseTags(details.tags),
      splitMethod: method,
      payers,
      participants: participantInputs.map((p) => ({ userId: p.userId, value: method === "equal" ? null : p.value })),
      receiptAttachmentId: receipt?.id ?? null,
    };

    if (initial) {
      const result = await updateExpenseAction(initial.expenseId, { ...payload, expectedVersion: initial.version });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Expense updated");
      router.push(`/groups/${groupId}/expenses/${initial.expenseId}`);
      return;
    }
    const result = await createExpenseAction({ ...payload, groupId, clientRequestId: requestId });
    if (!result.ok) return void toast.error(result.error);
    toast.success(result.data.duplicate ? "Already saved" : "Expense added");
    router.push(`/groups/${groupId}`);
  });

  /* Render ----------------------------------------------------------------- */
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 pb-24 lg:pb-0">
      {/* Amount & details */}
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <Label htmlFor="amount" className="text-muted-foreground">
          Total amount
        </Label>
        <div className="mt-2 flex items-center gap-2 border-b pb-2 focus-within:border-primary">
          <span className="text-2xl font-medium text-muted-foreground">{symbol}</span>
          <input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder={decimals ? `0.${"0".repeat(decimals)}` : "0"}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            aria-invalid={amount !== "" && !amountValid}
            className="tabular w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40"
          />
        </div>
        {amount !== "" && !amountValid && (
          <FieldError>Enter a positive amount with up to {decimals} decimal places.</FieldError>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="title">What was it for?</Label>
            <Input id="title" placeholder="Dinner, cab to airport, groceries…" aria-invalid={!!errors.title} {...form.register("title")} />
            <FieldError>{errors.title?.message}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <NativeSelect id="category" {...form.register("category")}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expenseDate">Date</Label>
            <Input id="expenseDate" type="date" max="2100-12-31" aria-invalid={!!errors.expenseDate} {...form.register("expenseDate")} />
            <FieldError>{errors.expenseDate?.message}</FieldError>
          </div>
        </div>
      </section>

      {/* Paid by */}
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="paid-by">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="paid-by" className="font-semibold">
              Paid by
            </h2>
            <p className="text-xs text-muted-foreground">Who handed over the money.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Multiple payers</span>
            <Switch
              checked={multiPayer}
              onCheckedChange={(checked) => {
                setMultiPayer(checked);
                if (checked && payerId && Object.keys(payerAmounts).length === 0 && amountValid) {
                  setPayerAmounts({ [payerId]: minorToDecimalString(total, currency) });
                }
              }}
            />
          </label>
        </div>

        {!multiPayer ? (
          <div role="radiogroup" aria-labelledby="paid-by" className="mt-4 flex flex-wrap gap-2">
            {members.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  payerId === m.id ? "border-primary bg-accent font-medium text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <input type="radio" name="payer" className="sr-only" checked={payerId === m.id} onChange={() => setPayerId(m.id)} />
                <UserAvatar id={m.id} name={m.name} image={m.image} size="xs" />
                {m.id === currentUserId ? "You" : m.name}
              </label>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <UserAvatar id={m.id} name={m.name} image={m.image} size="sm" />
                <label htmlFor={`pay-${m.id}`} className="min-w-0 flex-1 truncate text-sm">
                  {m.id === currentUserId ? "You" : m.name}
                </label>
                <div className="relative w-36">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{symbol}</span>
                  <Input
                    id={`pay-${m.id}`}
                    inputMode="decimal"
                    placeholder="0"
                    className="tabular pl-8 text-right"
                    value={payerAmounts[m.id] ?? ""}
                    onChange={(e) => setPayerAmounts((cur) => ({ ...cur, [m.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                  />
                </div>
              </div>
            ))}
            <StatusLine
              ok={payerCheck.ok}
              text={
                !amountValid
                  ? "Enter the total amount first."
                  : payerCheck.ok
                    ? "Contributions add up to the total."
                    : payerSum !== total
                      ? total - payerSum > 0
                        ? `${formatMoney(total - payerSum, currency)} still unaccounted for`
                        : `${formatMoney(payerSum - total, currency)} more than the total`
                      : payerCheck.error
              }
            />
          </div>
        )}
      </section>

      {/* Split */}
      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="split-heading">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="split-heading" className="font-semibold">
              Split between
            </h2>
            <p className="text-xs text-muted-foreground">Only the people selected here are charged.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIncluded(included.length === members.length ? [] : members.map((m) => m.id))}
          >
            <Users /> {included.length === members.length ? "Clear" : "Everyone"}
          </Button>
        </div>

        <div role="tablist" aria-label="Split method" className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
          {SPLIT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              onClick={() => changeMethod(m)}
              className={cn(
                "rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring outline-none",
                method === m && "bg-card text-foreground shadow-sm",
              )}
            >
              <span className="sm:hidden">{{ equal: "Equal", exact: "Exact", percentage: "%", shares: "Shares" }[m]}</span>
              <span className="hidden sm:inline">{SPLIT_METHOD_LABELS[m]}</span>
            </button>
          ))}
        </div>

        <ul className="mt-3 divide-y">
          {members.map((m) => {
            const isIn = included.includes(m.id);
            const share = isIn ? shareOf(m.id) : 0;
            return (
              <li key={m.id} className="flex min-h-14 items-center gap-3 py-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" className="peer sr-only" checked={isIn} onChange={() => toggleIncluded(m.id)} />
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                      isIn ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                    )}
                  >
                    {isIn && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <UserAvatar id={m.id} name={m.name} image={m.image} size="sm" />
                  <span className={cn("min-w-0 truncate text-sm", !isIn && "text-muted-foreground")}>
                    {m.id === currentUserId ? "You" : m.name}
                  </span>
                </label>

                {isIn && method !== "equal" && (
                  <div className="relative w-28 shrink-0">
                    {method === "exact" && (
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{symbol}</span>
                    )}
                    <Input
                      inputMode="decimal"
                      aria-label={`${SPLIT_METHOD_LABELS[method]} for ${m.name}`}
                      placeholder={method === "shares" ? "1" : "0"}
                      value={values[m.id] ?? ""}
                      onChange={(e) => setValues((cur) => ({ ...cur, [m.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                      className={cn("tabular h-9 text-right", method === "exact" && "pl-7", method === "percentage" && "pr-7")}
                    />
                    {method === "percentage" && (
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    )}
                  </div>
                )}
                <span className={cn("tabular w-24 shrink-0 text-right text-sm", isIn ? "font-medium" : "text-muted-foreground")}>
                  {!isIn ? "—" : share === null ? "…" : formatMoney(share, currency)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {splitStatus && splitStatus.text && <StatusLine ok={splitStatus.ok} text={splitStatus.text} />}
          {(method === "percentage" || method === "exact") && orderedIncluded.length > 0 && (
            <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={fillEvenly}>
              Fill in evenly
            </Button>
          )}
        </div>
      </section>

      {/* Summary */}
      {transfers.length > 0 && (
        <section className="rounded-xl border border-primary/20 bg-accent/50 p-4 sm:p-5" aria-label="Summary">
          <h2 className="text-sm font-semibold">Who owes whom for this expense</h2>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {transfers.map((t) => (
              <li key={`${t.fromUserId}-${t.toUserId}`} className="flex items-center gap-2">
                <span className="font-medium">{nameOf(t.fromUserId)}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" aria-label="owes" />
                <span className="font-medium">{nameOf(t.toUserId)}</span>
                <span className="tabular ml-auto font-semibold">{formatMoney(t.amountMinor, currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Extras */}
      <details className="group rounded-xl border bg-card p-4 sm:p-5" open={!!(initial?.notes || initial?.tags.length || initial?.receipt)}>
        <summary className="cursor-pointer list-none text-sm font-semibold">
          Notes, tags & receipt <span className="font-normal text-muted-foreground">(optional)</span>
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} {...form.register("notes")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" placeholder="beach, day-2" {...form.register("tags")} />
            <p className="text-xs text-muted-foreground">Separate with commas.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Receipt</span>
            {receipt ? (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Paperclip className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{receipt.fileName}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove receipt" onClick={() => setReceipt(null)}>
                  <Trash2 />
                </Button>
              </div>
            ) : (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  className="sr-only"
                  id="receipt"
                  onChange={(e) => e.target.files?.[0] && uploadReceipt(e.target.files[0])}
                />
                <Button type="button" variant="outline" loading={uploading} onClick={() => fileInput.current?.click()} className="w-fit">
                  <Upload /> Attach receipt
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, HEIC or PDF up to 5 MB.</p>
              </>
            )}
          </div>
        </div>
      </details>

      {/* Sticky save bar on mobile, inline on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 p-3 pb-safe backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 lg:hidden">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="tabular truncate font-semibold">{amountValid ? formatMoney(total, currency) : "—"}</p>
          </div>
          <Button type="button" variant="ghost" className="hidden lg:inline-flex" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={isSubmitting} disabled={!canSave} className="min-w-36">
            {initial ? "Save changes" : "Add expense"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function StatusLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p role="status" className={cn("flex items-center gap-1.5 text-[13px]", ok ? "text-positive" : "text-negative")}>
      {ok ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
      {text}
    </p>
  );
}

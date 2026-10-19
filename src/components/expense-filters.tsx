"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input, Label, NativeSelect } from "./ui/input";

interface Option {
  value: string;
  label: string;
}

export function ExpenseFilters({
  members,
  groups,
  showPayerParticipant = true,
  showMember = false,
}: {
  members: Option[];
  groups?: Option[];
  showPayerParticipant?: boolean;
  showMember?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const activeKeys = ["category", "payerId", "participantId", "memberId", "from", "to", "groupId"].filter((k) => params.get(k));
  const [open, setOpen] = useState(activeKeys.length > 0);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const handle = setTimeout(() => update({ q: q.trim() || null }), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const select = (key: string, label: string, options: Option[], all: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`f-${key}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <NativeSelect id={`f-${key}`} value={params.get(key) ?? ""} onChange={(e) => update({ [key]: e.target.value || null })} className="h-9">
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );

  return (
    <div className={cn("flex flex-col gap-3", pending && "opacity-70")}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search expenses"
            aria-label="Search expenses by name"
            className="h-9 pl-9"
          />
        </div>
        <NativeSelect
          aria-label="Sort"
          value={params.get("sort") ?? "date_desc"}
          onChange={(e) => update({ sort: e.target.value === "date_desc" ? null : e.target.value })}
          className="h-9 w-auto"
        >
          <option value="date_desc">Newest</option>
          <option value="date_asc">Oldest</option>
          <option value="amount_desc">Highest amount</option>
          <option value="amount_asc">Lowest amount</option>
        </NativeSelect>
        <Button
          type="button"
          variant={open ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <SlidersHorizontal />
          <span className="hidden sm:inline">Filters</span>
          {activeKeys.length > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{activeKeys.length}</span>
          )}
        </Button>
      </div>

      {open && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-3 lg:grid-cols-6">
          {groups && select("groupId", "Group", groups, "All groups")}
          {select(
            "category",
            "Category",
            EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
            "All categories",
          )}
          {showPayerParticipant && select("payerId", "Paid by", members, "Anyone")}
          {showPayerParticipant && select("participantId", "Shared by", members, "Anyone")}
          {showMember && select("memberId", "Member", members, "Anyone")}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input id="f-from" type="date" className="h-9" value={params.get("from") ?? ""} onChange={(e) => update({ from: e.target.value || null })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input id="f-to" type="date" className="h-9" value={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value || null })} />
          </div>
          {activeKeys.length > 0 && (
            <div className="col-span-full">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => update(Object.fromEntries(activeKeys.map((k) => [k, null])))}
              >
                <X /> Clear filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

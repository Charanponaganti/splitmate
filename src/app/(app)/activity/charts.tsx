"use client";

import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { expenseCategoryLabel } from "@/lib/constants";
import { formatMoney, getCurrency, minorToMajorNumber } from "@/lib/money/currency";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

export function MonthlyChart({ data, currency }: { data: { month: string; total: number; myShare: number }[]; currency: string }) {
  const rows = data.map((d) => ({
    label: format(parseISO(`${d.month}-01`), "MMM yy"),
    total: minorToMajorNumber(d.total, currency),
    mine: minorToMajorNumber(d.myShare, currency),
    totalMinor: d.total,
    mineMinor: d.myShare,
  }));
  return (
    <div className="h-64 w-full" role="img" aria-label="Monthly spending chart">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={56}
            stroke="var(--muted-foreground)"
            tickFormatter={(v: number) => formatMoney(Math.round(v * 10 ** getCurrency(currency).decimals), currency, { compact: true })}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
            formatter={(_value, name, item) => {
              const payload = item.payload as { totalMinor: number; mineMinor: number };
              return [formatMoney(name === "Group total" ? payload.totalMinor : payload.mineMinor, currency), name];
            }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="total" name="Group total" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Bar dataKey="mine" name="Your share" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({ data, currency }: { data: { category: string; total: number }[]; currency: string }) {
  const top = data.slice(0, 5);
  const rest = data.slice(5).reduce((s, d) => s + d.total, 0);
  const rows = [...top.map((d) => ({ name: expenseCategoryLabel(d.category), value: d.total })), ...(rest > 0 ? [{ name: "Other categories", value: rest }] : [])];
  const sum = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-44 w-44 shrink-0" role="img" aria-label="Spending by category chart">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none">
              {rows.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}
              formatter={(value) => formatMoney(Number(value), currency)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex w-full flex-col gap-2 text-sm">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 truncate">{r.name}</span>
            <span className="text-xs text-muted-foreground">{sum ? Math.round((r.value / sum) * 100) : 0}%</span>
            <span className="tabular w-28 text-right font-medium">{formatMoney(r.value, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

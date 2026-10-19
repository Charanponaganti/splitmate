import { formatMoney } from "@/lib/money/currency";
import { cn } from "@/lib/utils";

export function Money({
  minor,
  currency,
  tone = "neutral",
  signed,
  className,
}: {
  minor: number;
  currency: string;
  tone?: "neutral" | "auto" | "positive" | "negative";
  signed?: boolean;
  className?: string;
}) {
  const resolved = tone === "auto" ? (minor > 0 ? "positive" : minor < 0 ? "negative" : "neutral") : tone;
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        resolved === "positive" && "text-positive",
        resolved === "negative" && "text-negative",
        className,
      )}
    >
      {formatMoney(minor, currency, { signed })}
    </span>
  );
}

/** Describes a net balance in words, from the perspective of "you" or a named person. */
export function BalanceLabel({
  balance,
  currency,
  you = false,
  className,
}: {
  balance: number;
  currency: string;
  you?: boolean;
  className?: string;
}) {
  if (balance === 0) {
    return <span className={cn("text-sm text-muted-foreground", className)}>{you ? "You're settled up" : "Settled up"}</span>;
  }
  const amount = formatMoney(Math.abs(balance), currency);
  return balance > 0 ? (
    <span className={cn("text-sm text-positive", className)}>
      {you ? "You get back " : "Gets back "}
      <strong className="tabular font-semibold">{amount}</strong>
    </span>
  ) : (
    <span className={cn("text-sm text-negative", className)}>
      {you ? "You owe " : "Owes "}
      <strong className="tabular font-semibold">{amount}</strong>
    </span>
  );
}

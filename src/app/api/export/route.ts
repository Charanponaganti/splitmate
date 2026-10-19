import { format } from "date-fns";
import { expenseCategoryLabel, SPLIT_METHOD_LABELS } from "@/lib/constants";
import { csvCell } from "@/lib/csv";
import { isAppError } from "@/lib/errors";
import { minorToDecimalString } from "@/lib/money/currency";
import { iterateExpenses } from "@/lib/server/queries";
import { getCurrentUser } from "@/lib/session";
import { parseExpenseFilters } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const filters = parseExpenseFilters(Object.fromEntries(new URL(request.url).searchParams));

  const header = [
    "Date",
    "Group",
    "Title",
    "Category",
    "Currency",
    "Amount",
    "Split method",
    "Paid by",
    "Shared by",
    "You paid",
    "Your share",
  ];
  const encoder = new TextEncoder();
  const iterator = iterateExpenses(user.id, filters);

  try {
    // Pull the first batch before responding so authorization errors return a proper status.
    const first = await iterator.next();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode("\uFEFF" + header.map(csvCell).join(",") + "\r\n"));
        let batch = first;
        while (!batch.done) {
          const lines = batch.value.map((e) =>
            [
              e.expenseDate,
              e.groupName,
              e.title,
              expenseCategoryLabel(e.category),
              e.currency,
              minorToDecimalString(e.amountMinor, e.currency),
              SPLIT_METHOD_LABELS[e.splitMethod as keyof typeof SPLIT_METHOD_LABELS] ?? e.splitMethod,
              e.payers.map((p) => `${p.name} (${minorToDecimalString(p.amountMinor, e.currency)})`).join("; "),
              e.participants.map((p) => `${p.name} (${minorToDecimalString(p.shareMinor, e.currency)})`).join("; "),
              minorToDecimalString(e.myPaid, e.currency),
              minorToDecimalString(e.myShare, e.currency),
            ]
              .map(csvCell)
              .join(","),
          );
          controller.enqueue(encoder.encode(lines.join("\r\n") + "\r\n"));
          batch = await iterator.next();
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="splitmate-expenses-${format(new Date(), "yyyy-MM-dd")}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) return new Response("Not found", { status: 404 });
    console.error("[export] failed");
    return new Response("Export failed", { status: 500 });
  }
}

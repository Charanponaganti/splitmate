import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expense-form";
import { PageHeader } from "@/components/page-header";
import { getExpenseForEdit } from "@/lib/server/expenses";
import { orNotFound } from "@/lib/server/page";
import { getGroupOverview } from "@/lib/server/queries";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }: { params: Promise<{ groupId: string; expenseId: string }> }) {
  const user = await requireUser();
  const { groupId, expenseId } = await params;
  const [overview, data] = await Promise.all([
    orNotFound(getGroupOverview(user.id, groupId)),
    orNotFound(getExpenseForEdit(user.id, expenseId)),
  ]);
  if (data.expense.groupId !== groupId) notFound();
  const { expense } = data;

  // Current members, plus anyone already on this expense who has since left.
  const involved = new Set([...data.payers.map((p) => p.userId), ...data.participants.map((p) => p.userId)]);
  const members = overview.members
    .filter((m) => m.status === "active" || involved.has(m.id))
    .map((m) => ({ id: m.id, name: m.status === "active" ? m.name : `${m.name} (left)`, image: m.image }));

  let receipt: { id: string; fileName: string } | null = null;
  if (expense.receiptAttachmentId) {
    const db = await getDb();
    const [row] = await db
      .select({ id: attachments.id, fileName: attachments.fileName })
      .from(attachments)
      .where(eq(attachments.id, expense.receiptAttachmentId))
      .limit(1);
    receipt = row ?? null;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit expense" description={overview.group.name} backHref={`/groups/${groupId}/expenses/${expenseId}`} />
      <ExpenseForm
        groupId={groupId}
        currency={expense.currency}
        currentUserId={user.id}
        members={members}
        initial={{
          expenseId,
          version: expense.version,
          title: expense.title,
          amountMinor: expense.amountMinor,
          category: expense.category,
          expenseDate: expense.expenseDate,
          notes: expense.notes,
          tags: expense.tags,
          splitMethod: expense.splitMethod,
          payers: data.payers,
          participants: data.participants.map((p) => ({ userId: p.userId, inputValue: p.inputValue })),
          receipt,
        }}
      />
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteExpenseAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

export function DeleteExpenseButton({ expenseId, groupId, title }: { expenseId: string; groupId: string; title: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="text-negative hover:text-negative">
          <Trash2 /> Delete
        </Button>
      }
      title="Delete this expense?"
      description={`“${title}” will be removed from everyone's balances. The group's history will still show that it was deleted.`}
      confirmLabel="Delete expense"
      destructive
      onConfirm={async () => {
        const result = await deleteExpenseAction(expenseId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Expense deleted");
        router.push(`/groups/${groupId}`);
      }}
    />
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { setExpenseDoneAction } from "@/app/actions";
import { cn } from "@/lib/utils";

/** Shared tick so anyone in the trip room can mark an expense as done. */
export function ExpenseDoneToggle({
  expenseId,
  done,
  title,
  className,
}: {
  expenseId: string;
  done: boolean;
  title: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={done}
      aria-label={done ? `Mark “${title}” as not done` : `Mark “${title}” as done`}
      title={done ? "Done — tap to undo" : "Mark as done"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          const result = await setExpenseDoneAction(expenseId, !done);
          if (!result.ok) return void toast.error(result.error);
          router.refresh();
        });
      }}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        done
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/30 bg-card text-muted-foreground hover:border-primary/50 hover:text-primary",
        pending && "opacity-60",
        className,
      )}
    >
      <Check className="size-4" strokeWidth={done ? 3 : 2} aria-hidden />
    </button>
  );
}

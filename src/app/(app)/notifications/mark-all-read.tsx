"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { markNotificationsReadAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function MarkAllRead() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markNotificationsReadAction();
          if (!result.ok) return void toast.error(result.error);
          router.refresh();
        })
      }
    >
      <CheckCheck /> Mark all as read
    </Button>
  );
}

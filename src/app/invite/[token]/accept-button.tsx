"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { acceptInvitationAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="lg"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const result = await acceptInvitationAction(token);
        if (!result.ok) {
          setPending(false);
          toast.error(result.error);
          return;
        }
        toast.success("You joined the group");
        router.push(`/groups/${result.data.groupId}`);
      }}
    >
      Join group
    </Button>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={async () => {
        setPending(true);
        const result = await signOut();
        if (result.error) {
          setPending(false);
          toast.error("Couldn't sign out. Try again.");
          return;
        }
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut /> Sign out
    </Button>
  );
}

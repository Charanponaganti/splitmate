"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<AlertTriangle />}
        title="Something went wrong"
        description="We couldn't load this page. Your data is safe — try again in a moment."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Card>
  );
}

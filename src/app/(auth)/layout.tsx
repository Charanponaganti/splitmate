import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/lib/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="size-5" />
        </span>
        {APP_NAME}
      </Link>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8">{children}</div>
    </div>
  );
}

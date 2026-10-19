import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { GroupIcon } from "@/components/group-card";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { previewInvitation } from "@/lib/server/invitations";
import { getCurrentUser } from "@/lib/session";
import { AcceptButton } from "./accept-button";

export const metadata: Metadata = { title: "Group invitation", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  const invite = await previewInvitation(token, user?.id ?? null);
  if (invite?.alreadyMember && invite.groupId) redirect(`/groups/${invite.groupId}`);
  const next = `/invite/${token}`;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="size-5" />
        </span>
        {APP_NAME}
      </Link>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
        {!invite ? (
          <>
            <h1 className="text-lg font-semibold">Invitation not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">This link is invalid. Ask your friend to send a new one.</p>
          </>
        ) : invite.state !== "valid" ? (
          <>
            <h1 className="text-lg font-semibold">This invitation can&apos;t be used</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {invite.state === "expired"
                ? "It has expired."
                : invite.state === "revoked"
                  ? "It was revoked."
                  : "It has already been used."}{" "}
              Ask {invite.inviterName} for a new link.
            </p>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <GroupIcon category={invite.category} size="lg" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{invite.inviterName} invited you to join</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{invite.groupName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {invite.memberCount} {invite.memberCount === 1 ? "member" : "members"}
            </p>
            {invite.restrictedToEmail && (
              <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                This invitation is for {invite.restrictedToEmail}.
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2">
              {user ? (
                <>
                  <AcceptButton token={token} />
                  <p className="text-xs text-muted-foreground">Signed in as {user.email}</p>
                </>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account to join</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href={`/login?next=${encodeURIComponent(next)}`}>I already have an account</Link>
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

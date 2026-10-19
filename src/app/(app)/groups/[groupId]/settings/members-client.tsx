"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Check, Copy, Link2, LogOut, Mail, MoreVertical, Shield, ShieldOff, UserMinus, UserPlus, X } from "lucide-react";
import {
  addMemberAction,
  createInvitationAction,
  leaveGroupAction,
  removeMemberAction,
  revokeInvitationAction,
  setMemberRoleAction,
} from "@/app/actions";
import { UserAvatar } from "@/components/avatar";
import { BalanceLabel } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/menu";
import { Badge } from "@/components/ui/misc";

type Role = "owner" | "admin" | "member";

interface Member {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  balance: number;
}

interface Invitation {
  id: string;
  email: string | null;
  expiresAt: string;
  invitedByName: string;
  useCount: number;
}

export function MembersClient({
  groupId,
  groupName,
  currency,
  members,
  invitations,
  currentUserId,
  myRole,
}: {
  groupId: string;
  groupName: string;
  currency: string;
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
  myRole: Role;
}) {
  const router = useRouter();
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const me = members.find((m) => m.id === currentUserId);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  };

  const createLink = async () => {
    setCreating(true);
    const result = await createInvitationAction({ groupId });
    setCreating(false);
    if (!result.ok) return void toast.error(result.error);
    setLink(result.data.url);
    if (typeof navigator.share === "function") {
      navigator.share({ title: `Join ${groupName}`, url: result.data.url }).catch(() => {});
    }
    router.refresh();
  };

  const inviteByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    const result = await createInvitationAction({ groupId, email });
    setInviting(false);
    if (!result.ok) return void toast.error(result.error);
    setEmail("");
    if (result.data.emailSent) toast.success("Invitation email sent");
    else {
      setLink(result.data.url);
      toast.success("Invitation created — share the link below with them.");
    }
    router.refresh();
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const result = await addMemberAction({ groupId, email: addEmail });
    setAdding(false);
    if (!result.ok) return void toast.error(result.error);
    setAddEmail("");
    toast.success(`${result.data.name} was added`);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Invite friends</CardTitle>
            <CardDescription>Anyone with the link can join for 7 days. Email invites only work for that email address.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={createLink} loading={creating} className="sm:w-fit">
              <Link2 /> Create invite link
            </Button>
          </div>
          {link && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
              <Input readOnly value={link} className="h-9 bg-card text-xs" onFocus={(e) => e.target.select()} aria-label="Invite link" />
              <Button size="sm" variant="outline" onClick={() => copy(link)}>
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}

          <form onSubmit={inviteByEmail} className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Invite by email</Label>
            <div className="flex gap-2">
              <Input id="invite-email" type="email" inputMode="email" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="submit" variant="outline" loading={inviting} disabled={!email}>
                <Mail /> Invite
              </Button>
            </div>
          </form>

          {invitations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Active invitations</p>
              <ul className="divide-y rounded-lg border">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    {inv.email ? <Mail className="size-4 text-muted-foreground" /> : <Link2 className="size-4 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{inv.email ?? "Invite link"}</p>
                      <p className="text-xs text-muted-foreground">
                        by {inv.invitedByName} · expires {formatDistanceToNowStrict(new Date(inv.expiresAt), { addSuffix: true })}
                        {!inv.email && ` · used ${inv.useCount}×`}
                      </p>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Revoke invitation"
                      onClick={async () => {
                        const result = await revokeInvitationAction(inv.id);
                        if (!result.ok) return void toast.error(result.error);
                        toast.success("Invitation revoked");
                        router.refresh();
                      }}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>{members.length} people in this group</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isAdmin && (
            <form onSubmit={addMember} className="mb-4 flex gap-2">
              <Input
                type="email"
                inputMode="email"
                placeholder="Add a registered user by email"
                aria-label="Add a registered user by email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
              />
              <Button type="submit" variant="outline" loading={adding} disabled={!addEmail}>
                <UserPlus /> Add
              </Button>
            </form>
          )}
          <ul className="divide-y">
            {members.map((m) => {
              const canManage = m.id !== currentUserId && m.role !== "owner" && (myRole === "owner" || (myRole === "admin" && m.role === "member"));
              return (
                <li key={m.id} className="flex items-center gap-3 py-3">
                  <UserAvatar id={m.id} name={m.name} image={m.image} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {m.name}
                      {m.id === currentUserId && <span className="font-normal text-muted-foreground">(you)</span>}
                      {m.role !== "member" && <Badge variant={m.role === "owner" ? "primary" : "default"}>{m.role}</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <BalanceLabel balance={m.balance} currency={currency} className="hidden text-xs sm:inline" />
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Manage ${m.name}`}>
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {myRole === "owner" && (
                          <DropdownMenuItem
                            onSelect={async () => {
                              const result = await setMemberRoleAction(groupId, m.id, m.role === "admin" ? "member" : "admin");
                              if (!result.ok) return void toast.error(result.error);
                              toast.success(m.role === "admin" ? "Admin rights removed" : `${m.name} is now an admin`);
                              router.refresh();
                            }}
                          >
                            {m.role === "admin" ? <ShieldOff /> : <Shield />}
                            {m.role === "admin" ? "Remove admin" : "Make admin"}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          destructive
                          onSelect={async () => {
                            const result = await removeMemberAction(groupId, m.id);
                            if (!result.ok) return void toast.error(result.error);
                            toast.success(`${m.name} was removed`);
                            router.refresh();
                          }}
                        >
                          <UserMinus /> Remove from group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-negative/30">
        <CardHeader>
          <div>
            <CardTitle>Leave group</CardTitle>
            <CardDescription>
              You can leave once your balance is settled. Your past expenses stay in the group&apos;s history.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {me && me.balance !== 0 ? (
            <p className="text-sm text-muted-foreground">
              <BalanceLabel balance={me.balance} currency={currency} you /> — settle up before leaving.
            </p>
          ) : (
            <ConfirmDialog
              trigger={
                <Button variant="outline" className="text-negative hover:text-negative">
                  <LogOut /> Leave group
                </Button>
              }
              title={`Leave “${groupName}”?`}
              description={
                myRole === "owner"
                  ? "Ownership will pass to an admin or the longest-standing member. You'll need a new invite to rejoin."
                  : "You'll need a new invite to rejoin."
              }
              confirmLabel="Leave group"
              destructive
              onConfirm={async () => {
                const result = await leaveGroupAction(groupId);
                if (!result.ok) return void toast.error(result.error);
                toast.success("You left the group");
                router.push("/groups");
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

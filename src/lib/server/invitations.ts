import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { groupInvitations, groupMembers, groups, users } from "@/lib/db/schema";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { inviteSchema } from "@/lib/validation";
import { getActiveMemberIds, lockGroup, requireMember } from "./access";
import { recordActivity } from "./activity";
import { sendInvitationEmail } from "./email";
import { addOrReactivateMember } from "./groups";
import { parseInput } from "./parse";

const INVITE_TTL_DAYS = 7;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl(): string {
  return (process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Creates an invitation. Open links (no email) can be used by anyone holding
 * them until they expire; email invitations can only be accepted by the
 * account with that email. The raw token is returned once and never stored.
 */
export async function createInvitation(actorId: string, rawInput: unknown) {
  const { groupId, email } = parseInput(inviteSchema, rawInput);
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const result = await db.transaction(async (tx) => {
    await requireMember(tx, groupId, actorId);
    const group = await lockGroup(tx, groupId);

    const [{ value: recent }] = await tx
      .select({ value: count() })
      .from(groupInvitations)
      .where(
        and(
          eq(groupInvitations.invitedBy, actorId),
          gt(groupInvitations.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
        ),
      );
    if (recent >= 30) throw new AppError("RATE_LIMITED", "Too many invitations. Try again later.");

    let invitee: { id: string } | undefined;
    if (email) {
      [invitee] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      if (invitee) {
        const [membership] = await tx
          .select({ status: groupMembers.status })
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, invitee.id)))
          .limit(1);
        if (membership?.status === "active") throw conflict("That person is already in this group.");
      }
    }

    const [invitation] = await tx
      .insert(groupInvitations)
      .values({
        groupId,
        tokenHash: hashToken(token),
        email,
        invitedBy: actorId,
        maxUses: email ? 1 : null,
        expiresAt,
      })
      .returning({ id: groupInvitations.id });

    const path = `/invite/${token}`;
    await recordActivity(tx, {
      groupId,
      actorId,
      type: "invitation.created",
      data: { email: email ? maskEmail(email) : null },
      notify: invitee ? [{ userId: invitee.id, type: "group_invitation", href: path }] : [],
      liveKind: "notification",
    });
    return { invitationId: invitation.id, groupName: group.name, path };
  });

  const url = `${appUrl()}${result.path}`;
  let emailSent = false;
  if (email) {
    const [inviter] = await db.select({ name: users.name }).from(users).where(eq(users.id, actorId)).limit(1);
    emailSent = await sendInvitationEmail({ to: email, inviterName: inviter?.name ?? "A friend", groupName: result.groupName, url });
  }
  return { invitationId: result.invitationId, url, expiresAt, emailSent };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function listInvitations(actorId: string, groupId: string) {
  const db = await getDb();
  await requireMember(db, groupId, actorId);
  return db
    .select({
      id: groupInvitations.id,
      email: groupInvitations.email,
      expiresAt: groupInvitations.expiresAt,
      useCount: groupInvitations.useCount,
      maxUses: groupInvitations.maxUses,
      createdAt: groupInvitations.createdAt,
      invitedByName: users.name,
    })
    .from(groupInvitations)
    .innerJoin(users, eq(users.id, groupInvitations.invitedBy))
    .where(
      and(
        eq(groupInvitations.groupId, groupId),
        isNull(groupInvitations.revokedAt),
        gt(groupInvitations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(groupInvitations.createdAt))
    .limit(50);
}

export async function revokeInvitation(actorId: string, invitationId: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(groupInvitations)
      .where(eq(groupInvitations.id, invitationId))
      .for("update")
      .limit(1);
    if (!invitation) throw notFound("Invitation");
    const member = await requireMember(tx, invitation.groupId, actorId);
    if (invitation.invitedBy !== actorId && member.role === "member") {
      throw forbidden("Only the person who sent the invitation or a group admin can revoke it.");
    }
    await tx.update(groupInvitations).set({ revokedAt: new Date() }).where(eq(groupInvitations.id, invitationId));
  });
}

type InvitationState = "valid" | "expired" | "revoked" | "used";

function invitationState(inv: typeof groupInvitations.$inferSelect): InvitationState {
  if (inv.revokedAt) return "revoked";
  if (inv.expiresAt.getTime() <= Date.now()) return "expired";
  if (inv.maxUses !== null && inv.useCount >= inv.maxUses) return "used";
  return "valid";
}

/** Public preview of an invitation: reveals only the group name and inviter. */
export async function previewInvitation(token: string, viewerId: string | null) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ invitation: groupInvitations, groupName: groups.name, category: groups.category, inviterName: users.name })
    .from(groupInvitations)
    .innerJoin(groups, eq(groups.id, groupInvitations.groupId))
    .innerJoin(users, eq(users.id, groupInvitations.invitedBy))
    .where(eq(groupInvitations.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, row.invitation.groupId), eq(groupMembers.status, "active")));
  let alreadyMember = false;
  if (viewerId) {
    const [m] = await db
      .select({ status: groupMembers.status })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, row.invitation.groupId), eq(groupMembers.userId, viewerId)))
      .limit(1);
    alreadyMember = m?.status === "active";
  }
  return {
    groupId: alreadyMember ? row.invitation.groupId : null,
    groupName: row.groupName,
    category: row.category,
    inviterName: row.inviterName,
    memberCount,
    restrictedToEmail: row.invitation.email ? maskEmail(row.invitation.email) : null,
    state: invitationState(row.invitation),
    alreadyMember,
  };
}

export async function acceptInvitation(userId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound("Invitation");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select()
      .from(groupInvitations)
      .where(eq(groupInvitations.tokenHash, hashToken(token)))
      .for("update")
      .limit(1);
    if (!invitation) throw notFound("Invitation");
    const state = invitationState(invitation);
    if (state !== "valid") {
      throw conflict(
        state === "expired"
          ? "This invitation has expired. Ask for a new link."
          : state === "revoked"
            ? "This invitation was revoked."
            : "This invitation has already been used.",
      );
    }

    const [user] = await tx.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw notFound("Account");
    if (invitation.email && invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw forbidden("This invitation was sent to a different email address.");
    }

    await lockGroup(tx, invitation.groupId);
    const outcome = await addOrReactivateMember(tx, invitation.groupId, userId);
    if (outcome === "already") return { groupId: invitation.groupId, joined: false };

    await tx
      .update(groupInvitations)
      .set({ useCount: sql`${groupInvitations.useCount} + 1` })
      .where(eq(groupInvitations.id, invitation.id));

    const members = await getActiveMemberIds(tx, invitation.groupId);
    await recordActivity(tx, {
      groupId: invitation.groupId,
      actorId: userId,
      type: "member.joined",
      subjectUserId: userId,
      data: { name: user.name },
      liveKind: "membership",
      liveRecipients: members,
    });
    return { groupId: invitation.groupId, joined: true };
  });
}

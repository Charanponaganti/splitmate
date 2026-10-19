import "server-only";
import type { DbOrTx } from "@/lib/db";
import { activityLog, notifications, type ActivityType, type NotificationType } from "@/lib/db/schema";
import { publishLive, type LiveEventKind } from "./live";

export interface NotificationTarget {
  userId: string;
  type: NotificationType;
  href?: string | null;
}

interface RecordActivityInput {
  groupId: string;
  actorId: string;
  type: ActivityType;
  expenseId?: string | null;
  settlementId?: string | null;
  subjectUserId?: string | null;
  data?: Record<string, unknown>;
  /** Users to notify. The actor is never notified about their own action. */
  notify?: NotificationTarget[];
  /** Users whose open screens should refresh. */
  liveRecipients?: string[];
  liveKind: LiveEventKind;
}

/**
 * Writes exactly one activity row per operation and fans it out into
 * notifications. A unique (user_id, activity_id) index guarantees each user
 * gets at most one notification per operation even if called twice.
 */
export async function recordActivity(tx: DbOrTx, input: RecordActivityInput) {
  const [activity] = await tx
    .insert(activityLog)
    .values({
      groupId: input.groupId,
      actorId: input.actorId,
      type: input.type,
      expenseId: input.expenseId ?? null,
      settlementId: input.settlementId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      data: input.data ?? {},
    })
    .returning({ id: activityLog.id });

  const seen = new Set<string>();
  const targets = (input.notify ?? []).filter((t) => {
    if (t.userId === input.actorId || seen.has(t.userId)) return false;
    seen.add(t.userId);
    return true;
  });
  if (targets.length > 0) {
    await tx
      .insert(notifications)
      .values(targets.map((t) => ({ userId: t.userId, activityId: activity.id, type: t.type, href: t.href ?? null })))
      .onConflictDoNothing();
  }

  await publishLive(tx, {
    kind: input.liveKind,
    groupId: input.groupId,
    actorId: input.actorId,
    recipients: [...(input.liveRecipients ?? []), ...targets.map((t) => t.userId)],
  });

  return activity.id;
}

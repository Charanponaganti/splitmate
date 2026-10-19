import "server-only";
import { EventEmitter } from "node:events";
import { sql } from "drizzle-orm";
import { listen, type DbOrTx } from "@/lib/db";

export const LIVE_CHANNEL = "splitmate_live";

export type LiveEventKind = "expense" | "settlement" | "group" | "membership" | "notification";

export interface LiveEvent {
  kind: LiveEventKind;
  groupId: string | null;
  actorId: string;
  /** Users whose screens should refresh. */
  recipients: string[];
}

/**
 * Queues a live event inside the current transaction. Postgres only delivers
 * NOTIFY messages after COMMIT, so subscribers never see changes that were
 * rolled back, and every committed change is announced exactly once.
 */
export async function publishLive(tx: DbOrTx, event: LiveEvent): Promise<void> {
  const recipients = [...new Set(event.recipients)];
  if (recipients.length === 0) return;
  // NOTIFY payloads are limited to 8000 bytes; chunk recipient lists to stay well under it.
  for (let i = 0; i < recipients.length; i += 100) {
    const payload = JSON.stringify({ ...event, recipients: recipients.slice(i, i + 100) });
    await tx.execute(sql`select pg_notify(${LIVE_CHANNEL}, ${payload})`);
  }
}

const globalForLive = globalThis as unknown as {
  __splitmateLive?: { emitter: EventEmitter; started: Promise<void> | null };
};

function getState() {
  if (!globalForLive.__splitmateLive) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    globalForLive.__splitmateLive = { emitter, started: null };
  }
  return globalForLive.__splitmateLive;
}

function ensureListening(): Promise<void> {
  const state = getState();
  if (!state.started) {
    state.started = listen(LIVE_CHANNEL, (payload) => {
      try {
        const event = JSON.parse(payload) as LiveEvent;
        for (const userId of event.recipients) state.emitter.emit(userId, event);
      } catch {
        /* ignore malformed payloads */
      }
    })
      .then(() => undefined)
      .catch((error) => {
        state.started = null;
        throw error;
      });
  }
  return state.started;
}

/** Subscribes to live events for one user. Returns an unsubscribe function. */
export async function subscribeLive(userId: string, onEvent: (event: LiveEvent) => void): Promise<() => void> {
  await ensureListening();
  const { emitter } = getState();
  emitter.on(userId, onEvent);
  return () => emitter.off(userId, onEvent);
}

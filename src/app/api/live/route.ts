import { getCurrentUser } from "@/lib/session";
import { subscribeLive } from "@/lib/server/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream. Each signed-in browser keeps one connection open
 * and receives a small "something changed" event whenever a group they belong
 * to is updated. The client then re-fetches data through normal authorized
 * server rendering, so no ledger data is ever pushed over this channel.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send(`retry: 3000\n\n`);
      send(`event: ready\ndata: {}\n\n`);

      let unsubscribe = () => {};
      try {
        unsubscribe = await subscribeLive(user.id, (event) => {
          send(
            `event: change\ndata: ${JSON.stringify({
              kind: event.kind,
              groupId: event.groupId,
              self: event.actorId === user.id,
            })}\n\n`,
          );
        });
      } catch {
        send(`event: unavailable\ndata: {}\n\n`);
      }
      const heartbeat = setInterval(() => send(`: ping\n\n`), 25_000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

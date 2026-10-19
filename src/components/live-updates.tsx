"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the open page in sync with changes friends make on other devices.
 * The server pushes a lightweight "changed" event; we then re-render the
 * current route on the server, which re-runs all authorization and queries.
 */
export function LiveUpdates() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };

    const connect = () => {
      if (closed) return;
      source = new EventSource("/api/live");
      source.addEventListener("change", scheduleRefresh);
      source.addEventListener("error", () => {
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          retry = setTimeout(connect, 5000);
        }
      });
    };
    connect();

    // Catch up on anything missed while the tab was in the background or offline.
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", scheduleRefresh);

    return () => {
      closed = true;
      source?.close();
      if (retry) clearTimeout(retry);
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", scheduleRefresh);
    };
  }, [router]);

  return null;
}

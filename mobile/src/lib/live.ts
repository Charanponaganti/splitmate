import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import EventSource from 'react-native-sse';
import { getServerUrl, getToken } from './api';

type LiveEvents = 'ready' | 'change' | 'unavailable';

/**
 * Keeps every screen up to date while the app is open: the server pushes a
 * small "something changed" event whenever anyone in your groups adds, edits
 * or settles something, and we re-fetch the affected data.
 */
export function useLiveUpdates(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource<LiveEvents> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => queryClient.invalidateQueries(), 300);
    };

    const connect = () => {
      const token = getToken();
      if (!token || source) return;
      source = new EventSource<LiveEvents>(`${getServerUrl()}/api/live`, {
        headers: { Authorization: `Bearer ${token}`, Origin: 'splitmate://' },
        pollingInterval: 5000,
        timeoutBeforeConnection: 0,
      });
      source.addEventListener('change', refresh);
    };

    const disconnect = () => {
      source?.removeAllEventListeners();
      source?.close();
      source = null;
    };

    connect();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        connect();
        refresh();
      } else {
        disconnect();
      }
    });

    return () => {
      sub.remove();
      disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, queryClient]);
}

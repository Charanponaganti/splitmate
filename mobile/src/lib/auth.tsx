import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  api,
  ApiError,
  loadStoredSession,
  onUnauthorized,
  setServerUrl,
  signInWithEmail,
  signOutSession,
  signUpWithEmail,
} from './api';
import type { Me } from './types';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  me: Me['user'] | null;
  signIn: (server: string, email: string, password: string) => Promise<void>;
  signUp: (server: string, name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setMe: (user: Me['user']) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me['user'] | null>(null);

  const finishSignIn = useCallback(async () => {
    const data = await api<Me>('me');
    queryClient.setQueryData(['me'], data);
    setMe(data.user);
    setStatus('signedIn');
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { token } = await loadStoredSession();
      if (!token) return setStatus('signedOut');
      try {
        await finishSignIn();
      } catch (error) {
        if (cancelled) return;
        // Offline at launch: keep the session and let screens retry.
        if (error instanceof ApiError && error.status === 0) setStatus('signedIn');
        else setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [finishSignIn]);

  useEffect(() => {
    onUnauthorized(() => {
      queryClient.clear();
      setMe(null);
      setStatus('signedOut');
    });
    return () => onUnauthorized(null);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      setMe,
      async signIn(server, email, password) {
        await setServerUrl(server);
        await signInWithEmail(email, password);
        await finishSignIn();
      },
      async signUp(server, name, email, password) {
        await setServerUrl(server);
        await signUpWithEmail(name, email, password);
        await finishSignIn();
      },
      async signOut() {
        await signOutSession();
        queryClient.clear();
        setMe(null);
        setStatus('signedOut');
      },
    }),
    [status, me, finishSignIn, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user's id; screens behind the auth guard can rely on it. */
export function useMyId(): string {
  return useAuth().me?.id ?? '';
}

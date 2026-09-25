import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isApiError, requestJson, setAccessTokenGetter } from '@/api';
import { AuthContext } from './context';
import type { AuthContextValue, AuthUser } from './types';

/** `POST /auth/signin|signup|refresh` response (lam13-app/api/schemas/auth.py). */
interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  fullName: string;
}

const KEY = 'lam13_auth';
/** Refresh this long before the access token expires. */
const EXPIRY_MARGIN_MS = 30_000;

// Read from storage every time so tabs share one rotating refresh token.
function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function save(session: Session | null) {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode): the session lasts for this page only.
  }
}

/** JWT `exp` in ms, or 0 when unreadable (treated as expired). */
function expiresAt(token: string): number {
  try {
    const payload = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)) as { exp?: number }).exp! * 1000 || 0;
  } catch {
    return 0;
  }
}

function toUser(session: Session): AuthUser {
  return {
    id: session.userId,
    name: session.fullName?.trim() || session.email.split('@')[0] || 'Account',
    email: session.email,
    avatarUrl: null,
  };
}

/**
 * Email/password session against the LAM13 backend (`/auth/*`): tokens in localStorage, the access
 * token refreshed (rotating refresh token) shortly before expiry or after a 401.
 */
export function BackendAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load);

  const store = useCallback((next: Session | null) => {
    save(next);
    setSession(next);
  }, []);

  // One refresh at a time: parallel requests share the same rotation.
  const refresh = useMemo(() => {
    let inflight: Promise<string | null> | null = null;
    return () =>
      (inflight ??= (async () => {
        const current = load();
        if (!current) return null;
        try {
          const next = await requestJson<Session>('/auth/refresh', {
            method: 'POST',
            auth: false,
            body: { refreshToken: current.refreshToken },
          });
          store(next);
          return next.accessToken;
        } catch (error) {
          // A rejected refresh token ends the session; a network error keeps it for a later try.
          if (isApiError(error) && (error.status === 401 || error.status === 403)) store(null);
          return null;
        } finally {
          inflight = null;
        }
      })());
  }, [store]);

  const getAccessToken = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      const current = load();
      if (!current) return null;
      if (!options?.forceRefresh && expiresAt(current.accessToken) - Date.now() > EXPIRY_MARGIN_MS) {
        return current.accessToken;
      }
      return refresh();
    },
    [refresh],
  );

  useEffect(() => setAccessTokenGetter(getAccessToken), [getAccessToken]);

  // Another tab signed in or out.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setSession(load());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: session ? 'authenticated' : 'unauthenticated',
      user: session ? toUser(session) : null,
      signIn: async (email, password) => {
        store(await requestJson<Session>('/auth/signin', { method: 'POST', auth: false, body: { email, password } }));
      },
      signUp: async (email, password, fullName) => {
        store(
          await requestJson<Session>('/auth/signup', { method: 'POST', auth: false, body: { email, password, fullName } }),
        );
      },
      forgotPassword: async (email) => {
        const { message } = await requestJson<{ message: string }>('/auth/forgot-password', {
          method: 'POST',
          auth: false,
          body: { email },
        });
        return message;
      },
      resetPassword: async (token, newPassword) => {
        await requestJson('/auth/reset-password', { method: 'POST', auth: false, body: { token, newPassword } });
      },
      logout: async () => {
        const current = load();
        store(null);
        // Best effort: revoke the refresh token family server-side.
        if (current) {
          await requestJson('/auth/revoke', {
            method: 'POST',
            auth: false,
            body: { refreshToken: current.refreshToken },
          }).catch(() => {});
        }
      },
      getAccessToken,
    }),
    [session, store, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

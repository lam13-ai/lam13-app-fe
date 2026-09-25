import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setAccessTokenGetter } from '@/api';
import { AuthContext } from './context';
import type { AuthContextValue, AuthStatus, AuthUser } from './types';

export const LOCAL_DEVELOPER: AuthUser = {
  id: 'local-developer',
  name: 'Local Developer',
  email: 'developer@localhost',
  avatarUrl: null,
};

export interface MemoryAuthProviderProps {
  children: ReactNode;
  initialStatus?: AuthStatus;
  /** The user signed in initially (when authenticated) and by login()/register(). */
  user?: AuthUser;
  accessToken?: string | null;
}

/** In-memory auth provider with the same contract as the backend provider; every action succeeds. Tests only. */
export function MemoryAuthProvider({
  children,
  initialStatus = 'unauthenticated',
  user = LOCAL_DEVELOPER,
  accessToken = null,
}: MemoryAuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>(initialStatus);

  useEffect(() => setAccessTokenGetter(async () => (status === 'authenticated' ? accessToken : null)), [status, accessToken]);

  const signIn = useCallback(async () => setStatus('authenticated'), []);
  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: status === 'authenticated' ? user : null,
      signIn,
      signUp: signIn,
      forgotPassword: async () => 'If an account exists for this email, a reset link has been sent.',
      resetPassword: async () => {},
      logout: async () => setStatus('unauthenticated'),
      getAccessToken: async () => (status === 'authenticated' ? accessToken : null),
    }),
    [status, user, signIn, accessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import { KindeProvider, useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { setAccessTokenGetter } from '@/api';
import type { KindeConfig } from './config';
import { AuthContext } from './context';
import { saveReturnTo } from './returnTo';
import type { AuthContextValue } from './types';
import { toAuthUser } from './user';

const SIGN_IN_FAILED = 'Sign-in could not be completed. Please try again.';

/** Maps Kinde's context onto the vendor-neutral AuthContext and registers the API token getter. */
export function KindeBridge({ children }: { children: ReactNode }) {
  const kinde = useKindeAuth();
  const { isLoading, isAuthenticated, user, error, login, register, logout, getAccessToken } = kinde;

  // One stable API token getter for the whole session. The Kinde SDK hands out a new getAccessToken on
  // every auth-state change; re-registering it then left the API bridge empty in exactly the commit where
  // the signed-in UI's first queries start (children's effects run before this component's), so those
  // requests went out without a token. The getter reads the latest SDK function from a ref instead, and
  // layout effects run before any child's data-fetching effect.
  const getAccessTokenRef = useRef(getAccessToken);
  useLayoutEffect(() => {
    getAccessTokenRef.current = getAccessToken;
  }, [getAccessToken]);
  useLayoutEffect(() => setAccessTokenGetter(async () => (await getAccessTokenRef.current()) ?? null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: isLoading ? 'loading' : isAuthenticated ? 'authenticated' : 'unauthenticated',
      user: isAuthenticated && user ? toAuthUser(user) : null,
      // Provider error strings are not shown verbatim.
      error: error ? SIGN_IN_FAILED : null,
      login: async (options) => {
        saveReturnTo(options?.returnTo);
        await login();
      },
      register: async (options) => {
        saveReturnTo(options?.returnTo);
        await register();
      },
      logout: () => logout(),
      getAccessToken: async () => (await getAccessToken()) ?? null,
    }),
    [isLoading, isAuthenticated, user, error, login, register, logout, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Kinde browser SDK (authorization code + PKCE). The SDK completes the code exchange when the app
 * loads on the redirect URI; `/callback` then routes the user onward.
 */
export function KindeAuthProvider({ config, children }: { config: KindeConfig; children: ReactNode }) {
  return (
    <KindeProvider
      clientId={config.clientId}
      domain={config.domain}
      redirectUri={config.redirectUri}
      logoutUri={config.logoutUri}
      audience={config.audience}
      forceChildrenRender
    >
      <KindeBridge>{children}</KindeBridge>
    </KindeProvider>
  );
}

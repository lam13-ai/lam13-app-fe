/**
 * Vendor-neutral access-token bridge (frontend-architecture.md §4, §8).
 *
 * The auth feature registers a getter (backend JWT session); API adapters call `getAccessToken()` /
 * `authorizationHeaders()` without knowing which identity provider is in use.
 * Tokens are never logged, cached here, or included in error messages.
 */

/** `forceRefresh`: the API rejected the current token (401) — get a fresh one. */
export type AccessTokenGetter = (options?: { forceRefresh?: boolean }) => Promise<string | null>;

const noToken: AccessTokenGetter = async () => null;
let currentGetter: AccessTokenGetter = noToken;

/** Registers the active getter. Returns an unregister function (safe with StrictMode double effects). */
export function setAccessTokenGetter(getter: AccessTokenGetter): () => void {
  currentGetter = getter;
  return () => {
    if (currentGetter === getter) currentGetter = noToken;
  };
}

/** The current user's access token, or null when signed out or unavailable. Never throws. */
export async function getAccessToken(options?: { forceRefresh?: boolean }): Promise<string | null> {
  try {
    const token = await currentGetter(options);
    return token || null;
  } catch {
    return null;
  }
}

/** `Authorization: Bearer …` for authenticated FastAPI requests (empty when there is no token). */
export async function authorizationHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

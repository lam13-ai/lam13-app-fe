import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackendAuthProvider } from './BackendAuthProvider';
import { useAuth } from './context';
import type { AuthContextValue } from './types';

const jwt = (expSeconds: number) => `h.${btoa(JSON.stringify({ exp: expSeconds }))}.s`;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const session = (accessToken: string, refreshToken: string) => ({ accessToken, refreshToken, userId: 'u1', email: 'ada@example.com', fullName: 'Ada' });

function renderAuth() {
  let auth: AuthContextValue | null = null;
  const Probe = () => {
    auth = useAuth();
    return null;
  };
  render(
    <BackendAuthProvider>
      <Probe />
    </BackendAuthProvider>,
  );
  return () => auth!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('BackendAuthProvider', () => {
  it('uses a fresh access token as is, and refreshes (once, rotating) an expiring one', async () => {
    const fresh = jwt(nowSeconds() + 3600);
    localStorage.setItem('lam13_auth', JSON.stringify(session(jwt(nowSeconds() + 5), 'r1')));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(session(fresh, 'r2')), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = renderAuth();

    expect(auth().status).toBe('authenticated');
    const [a, b] = await act(() => Promise.all([auth().getAccessToken(), auth().getAccessToken()]));
    expect(a).toBe(fresh);
    expect(b).toBe(fresh);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/auth\/refresh$/);
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'r1' });
    expect(JSON.parse(localStorage.getItem('lam13_auth')!).refreshToken).toBe('r2');

    expect(await auth().getAccessToken()).toBe(fresh);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signs out when the refresh token is rejected', async () => {
    localStorage.setItem('lam13_auth', JSON.stringify(session(jwt(nowSeconds() - 10), 'revoked')));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Token revoked' }), { status: 401 })));
    const auth = renderAuth();

    expect(await act(() => auth().getAccessToken())).toBeNull();
    expect(auth().status).toBe('unauthenticated');
    expect(localStorage.getItem('lam13_auth')).toBeNull();
  });
});

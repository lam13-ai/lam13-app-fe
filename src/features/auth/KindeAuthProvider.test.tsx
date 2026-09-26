import { act, render, screen } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken } from '@/api';
import { useAuth } from './context';
import { KindeAuthProvider } from './KindeAuthProvider';
import { peekReturnTo } from './returnTo';

// The Kinde SDK is replaced by a controllable fake: no network, no Kinde account needed.
const kinde = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  providerProps: null as Record<string, unknown> | null,
}));

vi.mock('@kinde-oss/kinde-auth-react', () => ({
  KindeProvider: (props: Record<string, unknown> & { children: ReactNode }) => {
    kinde.providerProps = props;
    return props.children;
  },
  useKindeAuth: () => kinde.state,
}));

function base(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isAuthenticated: false,
    user: undefined,
    error: undefined,
    login: vi.fn(async () => {}),
    register: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    getAccessToken: vi.fn(async () => 'kinde-access-token'),
    ...overrides,
  };
}

const probe: { current: ReturnType<typeof useAuth> | null } = { current: null };
function Probe() {
  const auth = useAuth();
  useEffect(() => {
    probe.current = auth;
  });
  return <p>status:{auth.status}</p>;
}
const captured = () => probe.current;

const config = {
  clientId: 'client',
  domain: 'https://biz.kinde.com',
  redirectUri: 'https://app.test/callback',
  logoutUri: 'https://app.test/login',
  audience: 'lam13-api',
};

function renderProvider() {
  return render(
    <KindeAuthProvider config={config}>
      <Probe />
    </KindeAuthProvider>,
  );
}

beforeEach(() => {
  probe.current = null;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('KindeAuthProvider', () => {
  it('passes browser-safe config to Kinde (no secret involved)', () => {
    kinde.state = base();
    renderProvider();
    expect(kinde.providerProps).toMatchObject({ ...config, forceChildrenRender: true });
    expect(Object.keys(kinde.providerProps ?? {})).not.toContain('clientSecret');
  });

  it('maps loading → loading, and signed-out → unauthenticated', () => {
    kinde.state = base({ isLoading: true });
    const { rerender } = renderProvider();
    expect(screen.getByText('status:loading')).toBeTruthy();

    kinde.state = base();
    rerender(
      <KindeAuthProvider config={config}>
        <Probe />
      </KindeAuthProvider>,
    );
    expect(screen.getByText('status:unauthenticated')).toBeTruthy();
    expect(captured()?.user).toBeNull();
  });

  it('maps an authenticated Kinde user to the neutral user shape', () => {
    kinde.state = base({
      isAuthenticated: true,
      user: { id: 'kp_1', givenName: 'Ada', familyName: 'Lovelace', email: 'ada@example.com', picture: 'https://img.test/a.png' },
    });
    renderProvider();
    expect(captured()?.status).toBe('authenticated');
    expect(captured()?.user).toEqual({ id: 'kp_1', name: 'Ada Lovelace', email: 'ada@example.com', avatarUrl: 'https://img.test/a.png' });
  });

  it('login/register save the sanitised return path then hand off to Kinde; logout delegates', async () => {
    kinde.state = base();
    renderProvider();

    await act(() => captured()!.login({ returnTo: '/c/abc' }));
    expect((kinde.state.login as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect(peekReturnTo()).toBe('/c/abc');

    await act(() => captured()!.register({ returnTo: 'https://evil.example' }));
    expect((kinde.state.register as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect(peekReturnTo()).toBe('/');

    await act(() => captured()!.logout());
    expect((kinde.state.logout as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
  });

  it('registers the Kinde token with the API bridge and unregisters on unmount', async () => {
    kinde.state = base({ isAuthenticated: true, user: { id: 'kp_1', email: 'a@b.c' } });
    const { unmount } = renderProvider();
    expect(await getAccessToken()).toBe('kinde-access-token');
    unmount();
    expect(await getAccessToken()).toBeNull();
  });

  it('gives the token to API calls started in the same commit Kinde becomes authenticated (reload race)', async () => {
    // The Kinde SDK creates a new getAccessToken on every auth-state change, and children's effects (data
    // queries) run before the bridge's. The bridge must never be unregistered in between.
    const tokens: (string | null)[] = [];
    function QueryOnSignIn() {
      const { status } = useAuth();
      useEffect(() => {
        // Like request(): the bridge is read synchronously as the query starts.
        if (status === 'authenticated') void getAccessToken().then((token) => tokens.push(token));
      }, [status]);
      return null;
    }
    const tree = () => (
      <KindeAuthProvider config={config}>
        <QueryOnSignIn />
      </KindeAuthProvider>
    );

    kinde.state = base({ isLoading: true, getAccessToken: vi.fn(async () => undefined) });
    const { rerender } = render(tree());
    kinde.state = base({ isAuthenticated: true, user: { id: 'kp_1', email: 'a@b.c' }, getAccessToken: vi.fn(async () => 'fresh-token') });
    await act(async () => rerender(tree()));

    expect(tokens).toEqual(['fresh-token']);
  });

  it('never surfaces raw provider error strings', () => {
    kinde.state = base({ error: 'invalid_grant: code verifier mismatch for client abc123' });
    renderProvider();
    expect(captured()?.error).toBe('Sign-in could not be completed. Please try again.');
  });
});

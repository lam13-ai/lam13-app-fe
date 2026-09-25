import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '@/lib/env';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './context';

vi.mock('@kinde-oss/kinde-auth-react', () => ({
  KindeProvider: ({ children }: { children: unknown }) => children,
  useKindeAuth: () => ({ isLoading: true, isAuthenticated: false, getAccessToken: async () => undefined }),
}));

const base = { BASE_URL: '/', MODE: 'test', DEV: true, PROD: false, SSR: false } as ImportMetaEnv;

function Probe() {
  return <p>status:{useAuth().status}</p>;
}

afterEach(() => vi.restoreAllMocks());

describe('AuthProvider', () => {
  it('fails safely when Kinde is not configured: names only, no values, no app, no logging', () => {
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    const env = parseEnv({ ...base, VITE_KINDE_CLIENT_ID: 'public-client-id-123', VITE_KINDE_DOMAIN: 'nope' });
    const { container } = render(
      <AuthProvider env={env}>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByRole('heading', { name: "Sign-in isn't available." })).toBeTruthy();
    expect(screen.getByText('VITE_KINDE_DOMAIN')).toBeTruthy();
    expect(screen.queryByText(/status:/)).toBeNull();
    expect(container.textContent).not.toContain('public-client-id-123');
    expect(container.textContent).not.toContain('nope');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('uses Kinde when configured', () => {
    const env = parseEnv({ ...base, VITE_KINDE_CLIENT_ID: 'id', VITE_KINDE_DOMAIN: 'https://biz.kinde.com' });
    render(
      <AuthProvider env={env}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('status:loading')).toBeTruthy();
  });

  it('uses the local in-memory provider only when VITE_AUTH_MODE=dev in a development build', () => {
    const env = parseEnv({ ...base, VITE_AUTH_MODE: 'dev' });
    render(
      <AuthProvider env={env}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('status:unauthenticated')).toBeTruthy();
  });
});

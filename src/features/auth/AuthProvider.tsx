import type { ReactNode } from 'react';
import { env as defaultEnv, type Env } from '@/lib/env';
import { AuthConfigError } from './components/AuthConfigError';
import { resolveKindeConfig } from './config';
import { KindeAuthProvider } from './KindeAuthProvider';
import { MemoryAuthProvider } from './MemoryAuthProvider';

/**
 * Selects the identity provider:
 * - Kinde (default, and always in production builds).
 * - Local in-memory sign-in when `VITE_AUTH_MODE=dev` in a development build.
 * Invalid Kinde configuration renders a safe error screen instead of the app.
 */
export function AuthProvider({ children, env = defaultEnv }: { children: ReactNode; env?: Env }) {
  if (import.meta.env.DEV && env.authMode === 'dev') {
    return <MemoryAuthProvider>{children}</MemoryAuthProvider>;
  }

  const result = resolveKindeConfig(env.kinde, window.location.origin);
  if (!result.ok) return <AuthConfigError problems={result.problems} showDetails={import.meta.env.DEV} />;

  return <KindeAuthProvider config={result.config}>{children}</KindeAuthProvider>;
}

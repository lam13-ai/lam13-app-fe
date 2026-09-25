import type { ReactNode } from 'react';
import { BackendAuthProvider } from './BackendAuthProvider';

/** The app's identity provider: the LAM13 backend's email/password auth. */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <BackendAuthProvider>{children}</BackendAuthProvider>;
}

/** Vendor-neutral auth types — the rest of the app never sees Kinde's shapes. */

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface AuthRedirectOptions {
  /** In-app path to return to after sign-in (sanitised). */
  returnTo?: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Display-safe error (never raw provider output). */
  error: string | null;
  login: (options?: AuthRedirectOptions) => Promise<void>;
  register: (options?: AuthRedirectOptions) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

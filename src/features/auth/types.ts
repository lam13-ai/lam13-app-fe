/** Vendor-neutral auth types — the rest of the app never sees the backend's auth shapes. */

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** The actions below reject with ApiError (message is display-safe). */
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  /** Resolves with the server's (account-agnostic) confirmation message. */
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
}

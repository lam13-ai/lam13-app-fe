/**
 * Where to go after sign-in. Stored in sessionStorage across the hosted-login redirect
 * (same tab), and only ever a same-origin path — never an absolute URL (open-redirect safe).
 */

const KEY = 'lam13:auth:return-to';
const DEFAULT_PATH = '/';

export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) return DEFAULT_PATH;
  // Must be a single-slash absolute path: rejects "//host", "/\\host", schemes and relative paths.
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_PATH;
  // Never send the user back into the auth screens.
  if (/^\/(login|callback)(\/|\?|#|$)/.test(value)) return DEFAULT_PATH;
  return value;
}

export function saveReturnTo(value: string | undefined): void {
  try {
    sessionStorage.setItem(KEY, sanitizeReturnTo(value));
  } catch {
    // Storage unavailable (private mode): fall back to the default path after sign-in.
  }
}

export function peekReturnTo(): string {
  try {
    return sanitizeReturnTo(sessionStorage.getItem(KEY));
  } catch {
    return DEFAULT_PATH;
  }
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

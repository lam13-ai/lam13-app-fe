/** Where to go after sign-in: only ever a same-origin path — never an absolute URL (open-redirect safe). */

const DEFAULT_PATH = '/';

export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value) return DEFAULT_PATH;
  // Must be a single-slash absolute path: rejects "//host", "/\\host", schemes and relative paths.
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_PATH;
  // Never send the user back into the auth screens.
  if (/^\/(login|auth)(\/|\?|#|$)/.test(value)) return DEFAULT_PATH;
  return value;
}

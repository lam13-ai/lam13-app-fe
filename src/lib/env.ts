/**
 * Typed access to build-time environment (frontend-architecture.md §11).
 *
 * SECURITY: every VITE_* variable is compiled into the browser bundle — none of them is a secret.
 * Only browser-safe configuration belongs here; server secrets (e.g. a Kinde client secret) stay on
 * the backend. Variables are read individually by name; the env object is never spread or logged,
 * and error messages name the variable without echoing its value.
 */

export type AuthMode = 'kinde' | 'dev';
/** 'http': the FastAPI backend (default). 'mock': the in-memory mock backend. */
export type ApiMode = 'http' | 'mock';

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return value === 'true' || value === '1';
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseEnv(raw: ImportMetaEnv) {
  const apiBaseUrl = (optional(raw.VITE_API_BASE_URL) ?? '').replace(/\/+$/, '');
  if (apiBaseUrl && !/^https?:\/\//.test(apiBaseUrl)) {
    throw new Error('VITE_API_BASE_URL must be an absolute http(s) URL.');
  }

  // The local dev auth provider is only honoured in development builds; production always uses Kinde.
  const authMode: AuthMode = raw.DEV && optional(raw.VITE_AUTH_MODE) === 'dev' ? 'dev' : 'kinde';

  return Object.freeze({
    /** FastAPI origin, e.g. https://api.lam13.ai. Empty string means same origin. */
    apiBaseUrl,
    apiMode: (optional(raw.VITE_API_MODE) === 'mock' ? 'mock' : 'http') as ApiMode,
    authMode,
    kinde: Object.freeze({
      clientId: optional(raw.VITE_KINDE_CLIENT_ID),
      domain: optional(raw.VITE_KINDE_DOMAIN),
      redirectUri: optional(raw.VITE_KINDE_REDIRECT_URI),
      logoutUri: optional(raw.VITE_KINDE_LOGOUT_URI),
      audience: optional(raw.VITE_KINDE_AUDIENCE),
    }),
    vapi: Object.freeze({
      publicKey: optional(raw.VITE_VAPI_PUBLIC_KEY),
      assistantId: optional(raw.VITE_VAPI_ASSISTANT_ID),
    }),
    features: Object.freeze({
      calling: flag(raw.VITE_FEATURE_CALLING, true),
      // A kill switch: voice notes also need the API adapter's `voiceNotes` capability (the FastAPI
      // backend has no /audio endpoint yet, so its adapter hides them).
      voiceNotes: flag(raw.VITE_FEATURE_VOICE_NOTES, true),
    }),
  });
}

export type Env = ReturnType<typeof parseEnv>;

export const env: Env = parseEnv(import.meta.env);

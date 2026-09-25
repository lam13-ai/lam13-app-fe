/**
 * Typed access to build-time environment (frontend-architecture.md §11).
 *
 * SECURITY: every VITE_* variable is compiled into the browser bundle — none of them is a secret.
 * Only browser-safe configuration belongs here; server secrets stay on the backend. Variables are read individually by name; the env object is never spread or logged,
 * and error messages name the variable without echoing its value.
 */

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

  return Object.freeze({
    /** FastAPI origin, e.g. https://api.lam13.ai. Empty string means same origin. */
    apiBaseUrl,
    vapi: Object.freeze({
      publicKey: optional(raw.VITE_VAPI_PUBLIC_KEY),
      assistantId: optional(raw.VITE_VAPI_ASSISTANT_ID),
    }),
    features: Object.freeze({
      // Off by default: the backend has no /audio endpoint, and calling needs Vapi keys.
      calling: flag(raw.VITE_FEATURE_CALLING, false),
      voiceNotes: flag(raw.VITE_FEATURE_VOICE_NOTES, false),
    }),
  });
}

export type Env = ReturnType<typeof parseEnv>;

export const env: Env = parseEnv(import.meta.env);

import type { Env } from '@/lib/env';

/** Browser-safe Kinde SPA configuration (PKCE; no client secret exists on the frontend). */
export interface KindeConfig {
  clientId: string;
  domain: string;
  redirectUri: string;
  logoutUri: string;
  audience?: string;
}

/** A configuration problem, identified by variable NAME only — values are never included. */
export interface ConfigProblem {
  variable: string;
  reason: 'missing' | 'invalid';
}

export type KindeConfigResult = { ok: true; config: KindeConfig } | { ok: false; problems: ConfigProblem[] };

function isHttpsUrl(value: string, allowLocalhost: boolean): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return allowLocalhost && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Validates Kinde settings from the environment. Redirect/logout URIs default to this origin's
 * `/callback` and `/login`. Local http URLs are accepted only for localhost.
 */
export function resolveKindeConfig(kinde: Env['kinde'], origin: string): KindeConfigResult {
  const problems: ConfigProblem[] = [];
  const check = (variable: string, value: string | undefined, { required }: { required: boolean }) => {
    if (!value) {
      if (required) problems.push({ variable, reason: 'missing' });
      return;
    }
    if (!isHttpsUrl(value, true)) problems.push({ variable, reason: 'invalid' });
  };

  if (!kinde.clientId) problems.push({ variable: 'VITE_KINDE_CLIENT_ID', reason: 'missing' });
  check('VITE_KINDE_DOMAIN', kinde.domain, { required: true });
  check('VITE_KINDE_REDIRECT_URI', kinde.redirectUri, { required: false });
  check('VITE_KINDE_LOGOUT_URI', kinde.logoutUri, { required: false });

  if (problems.length > 0 || !kinde.clientId || !kinde.domain) return { ok: false, problems };

  return {
    ok: true,
    config: {
      clientId: kinde.clientId,
      domain: kinde.domain.replace(/\/+$/, ''),
      redirectUri: kinde.redirectUri ?? `${origin}/callback`,
      logoutUri: kinde.logoutUri ?? `${origin}/login`,
      audience: kinde.audience,
    },
  };
}

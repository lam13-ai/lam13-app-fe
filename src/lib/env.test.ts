import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const base = { BASE_URL: '/', MODE: 'test', DEV: false, PROD: true, SSR: false } as ImportMetaEnv;

describe('parseEnv', () => {
  it('defaults to same-origin API, Kinde auth and enabled features', () => {
    const env = parseEnv(base);
    expect(env.apiBaseUrl).toBe('');
    expect(env.authMode).toBe('kinde');
    expect(env.features).toEqual({ calling: true, voiceNotes: true });
    expect(env.kinde.clientId).toBeUndefined();
  });

  it('normalises the API URL and parses flags', () => {
    const env = parseEnv({
      ...base,
      VITE_API_BASE_URL: 'https://api.example.com/',
      VITE_FEATURE_CALLING: 'false',
      VITE_FEATURE_VOICE_NOTES: '1',
    });
    expect(env.apiBaseUrl).toBe('https://api.example.com');
    expect(env.features).toEqual({ calling: false, voiceNotes: true });
  });

  it('rejects a relative API URL without echoing the value', () => {
    expect(() => parseEnv({ ...base, VITE_API_BASE_URL: 'internal-host-name' })).toThrow(/VITE_API_BASE_URL/);
    try {
      parseEnv({ ...base, VITE_API_BASE_URL: 'internal-host-name' });
    } catch (error) {
      expect(String(error)).not.toContain('internal-host-name');
    }
  });

  it('Image to PPT: not set up by default; the endpoint is normalised and validated without echoing its value', () => {
    expect(parseEnv(base).presentation).toEqual({ endpoint: '', requireAuth: false, pollMs: 10_000, pollTimeoutMs: 900_000 });
    const env = parseEnv({
      ...base,
      VITE_PRESENTATION_ENDPOINT: 'https://service.example.com//',
      VITE_PRESENTATION_REQUIRE_AUTH: 'true',
      VITE_PRESENTATION_POLL_MS: '2500',
      VITE_PRESENTATION_POLL_TIMEOUT_MS: 'not-a-number',
    });
    expect(env.presentation).toEqual({ endpoint: 'https://service.example.com', requireAuth: true, pollMs: 2500, pollTimeoutMs: 900_000 });
    expect(() => parseEnv({ ...base, VITE_PRESENTATION_ENDPOINT: 'internal-host-name' })).toThrow(/VITE_PRESENTATION_ENDPOINT/);
    try {
      parseEnv({ ...base, VITE_PRESENTATION_ENDPOINT: 'internal-host-name' });
    } catch (error) {
      expect(String(error)).not.toContain('internal-host-name');
    }
  });

  it('honours VITE_AUTH_MODE=dev only in development builds', () => {
    expect(parseEnv({ ...base, VITE_AUTH_MODE: 'dev' }).authMode).toBe('kinde');
    expect(parseEnv({ ...base, DEV: true, PROD: false, VITE_AUTH_MODE: 'dev' }).authMode).toBe('dev');
    expect(parseEnv({ ...base, DEV: true, VITE_AUTH_MODE: 'anything' }).authMode).toBe('kinde');
  });

  it('returns only named, frozen fields (the raw env object is never exposed)', () => {
    const env = parseEnv({ ...base, VITE_UNRELATED_SETTING: 'x' } as ImportMetaEnv);
    expect(Object.isFrozen(env)).toBe(true);
    expect(JSON.stringify(env)).not.toContain('VITE_UNRELATED_SETTING');
  });
});

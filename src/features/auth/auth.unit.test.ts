import { describe, expect, it } from 'vitest';
import { resolveKindeConfig } from './config';
import { clearReturnTo, peekReturnTo, sanitizeReturnTo, saveReturnTo } from './returnTo';
import { toAuthUser } from './user';

const ORIGIN = 'https://app.example.test';
const SECRETISH = 'client-id-value-should-never-leak';

describe('resolveKindeConfig', () => {
  it('reports missing required variables by name only', () => {
    const result = resolveKindeConfig({ clientId: undefined, domain: undefined, redirectUri: undefined, logoutUri: undefined, audience: undefined }, ORIGIN);
    expect(result).toEqual({
      ok: false,
      problems: [
        { variable: 'VITE_KINDE_CLIENT_ID', reason: 'missing' },
        { variable: 'VITE_KINDE_DOMAIN', reason: 'missing' },
      ],
    });
  });

  it('flags invalid URLs without echoing any value', () => {
    const result = resolveKindeConfig(
      { clientId: SECRETISH, domain: 'not a url', redirectUri: 'http://evil.example/callback', logoutUri: undefined, audience: undefined },
      ORIGIN,
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(SECRETISH);
    expect(JSON.stringify(result)).not.toContain('not a url');
    expect(result).toMatchObject({
      problems: [
        { variable: 'VITE_KINDE_DOMAIN', reason: 'invalid' },
        { variable: 'VITE_KINDE_REDIRECT_URI', reason: 'invalid' },
      ],
    });
  });

  it('defaults redirect/logout URIs to this origin and allows localhost http', () => {
    const result = resolveKindeConfig(
      { clientId: 'id', domain: 'https://biz.kinde.com/', redirectUri: undefined, logoutUri: 'http://localhost:5173/login', audience: 'api' },
      ORIGIN,
    );
    expect(result).toEqual({
      ok: true,
      config: {
        clientId: 'id',
        domain: 'https://biz.kinde.com',
        redirectUri: `${ORIGIN}/callback`,
        logoutUri: 'http://localhost:5173/login',
        audience: 'api',
      },
    });
  });
});

describe('returnTo', () => {
  it('accepts same-origin paths and rejects open redirects and auth screens', () => {
    expect(sanitizeReturnTo('/c/abc?x=1#top')).toBe('/c/abc?x=1#top');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', 'c/abc', '/login', '/callback?code=1', '', null]) {
      expect(sanitizeReturnTo(bad)).toBe('/');
    }
  });

  it('round-trips through sessionStorage and clears', () => {
    saveReturnTo('/c/water-security-kpis');
    expect(peekReturnTo()).toBe('/c/water-security-kpis');
    clearReturnTo();
    expect(peekReturnTo()).toBe('/');
    saveReturnTo('https://evil.com');
    expect(peekReturnTo()).toBe('/');
  });
});

describe('toAuthUser', () => {
  it('builds a display name from name parts, falling back to the email local part', () => {
    expect(toAuthUser({ id: '1', givenName: 'Ada', familyName: 'Lovelace', email: 'ada@x.io' }).name).toBe('Ada Lovelace');
    expect(toAuthUser({ id: '1', email: 'grace@x.io' }).name).toBe('grace');
    expect(toAuthUser({ id: '1' }).name).toBe('Account');
  });

  it('only keeps https avatars', () => {
    expect(toAuthUser({ id: '1', picture: 'https://img.example/a.png' }).avatarUrl).toBe('https://img.example/a.png');
    expect(toAuthUser({ id: '1', picture: 'http://img.example/a.png' }).avatarUrl).toBeNull();
    expect(toAuthUser({ id: '1', picture: 'javascript:alert(1)' }).avatarUrl).toBeNull();
  });
});

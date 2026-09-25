import { afterEach, describe, expect, it } from 'vitest';
import { authorizationHeaders, getAccessToken, setAccessTokenGetter } from './auth';

let unregister: (() => void) | undefined;
afterEach(() => unregister?.());

describe('access token bridge', () => {
  it('returns null and no Authorization header when no provider is registered', async () => {
    expect(await getAccessToken()).toBeNull();
    expect(await authorizationHeaders()).toEqual({});
  });

  it('uses the registered getter and builds a Bearer header', async () => {
    unregister = setAccessTokenGetter(async () => 'token-abc');
    expect(await getAccessToken()).toBe('token-abc');
    expect(await authorizationHeaders()).toEqual({ Authorization: 'Bearer token-abc' });
  });

  it('never throws: a failing or empty getter yields null', async () => {
    unregister = setAccessTokenGetter(async () => {
      throw new Error('refresh failed');
    });
    expect(await getAccessToken()).toBeNull();
    unregister = setAccessTokenGetter(async () => '');
    expect(await getAccessToken()).toBeNull();
  });

  it('unregistering only removes the getter it registered (StrictMode-safe)', async () => {
    const removeFirst = setAccessTokenGetter(async () => 'first');
    unregister = setAccessTokenGetter(async () => 'second');
    removeFirst();
    expect(await getAccessToken()).toBe('second');
    unregister();
    expect(await getAccessToken()).toBeNull();
  });
});

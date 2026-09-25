import { describe, expect, it } from 'vitest';
import { sanitizeReturnTo } from './returnTo';

describe('returnTo', () => {
  it('accepts same-origin paths and rejects open redirects and auth screens', () => {
    expect(sanitizeReturnTo('/c/abc?x=1#top')).toBe('/c/abc?x=1#top');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', 'c/abc', '/login', '/auth?mode=reset', '', null]) {
      expect(sanitizeReturnTo(bad)).toBe('/');
    }
  });
});

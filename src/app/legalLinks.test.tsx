import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './testUtils';

function expectLegalLinks(nav: HTMLElement) {
  const privacy = within(nav).getByRole('link', { name: /Privacy/ });
  const terms = within(nav).getByRole('link', { name: /Terms/ });
  for (const link of [privacy, terms]) {
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.textContent).toContain('(opens in a new tab)');
  }
  expect(privacy.getAttribute('href')).toMatch(/\/privacy$/);
  expect(terms.getAttribute('href')).toMatch(/\/terms$/);
}

describe('legal navigation', () => {
  it('is in the sidebar account area', async () => {
    renderApp('/');
    const navs = await screen.findAllByRole('navigation', { name: 'Legal', hidden: true });
    expectLegalLinks(navs[0]!);
  });

  it('is on the sign-in screen, without changing the sign-in flow', async () => {
    renderApp('/login', { auth: { initialStatus: 'unauthenticated' } });
    await screen.findByRole('heading', { name: 'Sign in to Lam13.' }, { timeout: 8000 });
    expectLegalLinks(screen.getByRole('navigation', { name: 'Legal' }));
    // Sign-in still goes through the app's own auth provider, not an external auth URL.
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(document.querySelector('a[href*="/auth"]')).toBeNull();
  });
});

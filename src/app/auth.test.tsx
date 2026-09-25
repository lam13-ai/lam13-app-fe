import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getAccessToken } from '@/api';
import { useComposerStore } from '@/stores/composerStore';
import { renderApp, TEST_USER } from './testUtils';

// jsdom reports a narrow viewport, so the sidebar lives in the (closed, inert) mobile drawer.
const findSidebar = () => screen.findByRole('dialog', { name: 'Sidebar', hidden: true });

describe('auth flow', () => {
  it('shows only a neutral splash while the session loads (no protected content)', async () => {
    renderApp('/c/water-security-kpis', { auth: { initialStatus: 'loading' } });
    expect(await screen.findByText('Loading your workspace…')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Conversations' })).toBeNull();
    expect(screen.queryByRole('log')).toBeNull();
    expect(screen.queryByText('Water security KPIs')).toBeNull();
  });

  it('redirects signed-out users to /login, preserving a direct conversation URL', async () => {
    const { router } = renderApp('/c/water-security-kpis', { auth: { initialStatus: 'unauthenticated' } });
    expect(await screen.findByRole('heading', { name: 'Sign in to Lam13.' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?returnTo=%2Fc%2Fwater-security-kpis');
    expect(screen.queryByRole('navigation', { name: 'Conversations' })).toBeNull();
  });

  it('signing in returns to the intended conversation and shows the user identity', async () => {
    const { router } = renderApp('/c/water-security-kpis', { auth: { initialStatus: 'unauthenticated' } });
    fireEvent.click(await screen.findByRole('button', { name: /continue to sign in/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/water-security-kpis'));
    expect(await screen.findByRole('log', { name: 'Conversation' })).toBeTruthy();
    const sidebar = await findSidebar();
    expect(within(sidebar).getByText(TEST_USER.name)).toBeTruthy();
    expect(within(sidebar).getByText(TEST_USER.email)).toBeTruthy();
    expect(within(sidebar).getByText('AL')).toBeTruthy(); // initials fallback
  });

  it('offers account creation on the same screen', async () => {
    const { router } = renderApp('/login', { auth: { initialStatus: 'unauthenticated' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Create an account' }));
    expect(await screen.findByRole('heading', { name: 'Create your account.' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /create an account/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('sends signed-in users away from /login (no loop)', async () => {
    const { router } = renderApp('/login?returnTo=%2Fc%2Fgrowth-plan-stress-test');
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/growth-plan-stress-test'));
  });

  it('ignores unsafe returnTo values', async () => {
    const { router } = renderApp('/login?returnTo=%2F%2Fevil.example');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('/callback continues to the saved destination once the session is established', async () => {
    sessionStorage.setItem('lam13:auth:return-to', '/c/digital-services-roadmap');
    const { router } = renderApp('/callback');
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/digital-services-roadmap'));
    expect(sessionStorage.getItem('lam13:auth:return-to')).toBeNull();
  });

  it('/callback shows progress while loading, errors safely, and sends stray visits to /login', async () => {
    renderApp('/callback', { auth: { initialStatus: 'loading' } });
    expect(await screen.findByText('Signing you in…')).toBeTruthy();
  });

  it('/callback with a failed sign-in shows a safe error and a way back', async () => {
    const { router } = renderApp('/callback', { auth: { initialStatus: 'unauthenticated', error: 'Sign-in could not be completed. Please try again.' } });
    expect(await screen.findByRole('heading', { name: "We couldn't sign you in." })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('/callback opened directly without a sign-in goes to /login', async () => {
    const { router } = renderApp('/callback', { auth: { initialStatus: 'unauthenticated' } });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('sign out clears session state and returns to /login', async () => {
    const { router } = renderApp('/c/water-security-kpis', { auth: { accessToken: 'session-token' } });
    await screen.findByRole('log', { name: 'Conversation' });
    useComposerStore.getState().setDraft('water-security-kpis', 'unsent draft');
    expect(await getAccessToken()).toBe('session-token');

    const sidebar = await findSidebar();
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Sign out', hidden: true }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('heading', { name: 'Sign in to Lam13.' })).toBeTruthy();
    expect(useComposerStore.getState().drafts).toEqual({});
    expect(await getAccessToken()).toBeNull();
  });

  it('shows the profile picture when the provider supplies one', async () => {
    renderApp('/', { auth: { user: { ...TEST_USER, avatarUrl: 'https://img.example/ada.png' } } });
    const sidebar = await findSidebar();
    const img = sidebar.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://img.example/ada.png');
    expect(within(sidebar).queryByText('AL')).toBeNull();
  });
});

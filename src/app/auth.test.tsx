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
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/water-security-kpis'));
    expect(await screen.findByRole('log', { name: 'Conversation' })).toBeTruthy();
    const sidebar = await findSidebar();
    expect(within(sidebar).getByText(TEST_USER.name)).toBeTruthy();
    expect(within(sidebar).getByText(TEST_USER.email)).toBeTruthy();
    expect(within(sidebar).getByText('AL')).toBeTruthy(); // initials fallback
  });

  it('offers account creation on the same screen', async () => {
    const { router } = renderApp('/login', { auth: { initialStatus: 'unauthenticated' } });
    fireEvent.click(await screen.findByRole('button', { name: /create an account/i }));
    expect(await screen.findByRole('heading', { name: 'Create your account.' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('alert')).textContent).toBe("Passwords don't match.");

    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
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

  it('forgot password shows the server confirmation', async () => {
    renderApp('/login?mode=forgot', { auth: { initialStatus: 'unauthenticated' } });
    expect(await screen.findByRole('heading', { name: 'Reset your password.' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/reset link has been sent/)).toBeTruthy();
  });

  it('the emailed reset link (/auth?mode=reset&token=…) sets a new password, then offers sign-in', async () => {
    const { router } = renderApp('/auth?mode=reset&token=reset-token', { auth: { initialStatus: 'unauthenticated' } });
    expect(await screen.findByRole('heading', { name: 'Choose a new password.' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password-1' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to Lam13.' })).toBeTruthy();
    expect(screen.getByText(/Password updated/)).toBeTruthy();
    expect(router.state.location.search).toBe('');
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

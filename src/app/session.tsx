import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/features/auth';
import { useComposerStore } from '@/stores/composerStore';
import { initialStreamState, useStreamStore } from '@/stores/streamStore';
import { useUiStore } from '@/stores/uiStore';

/** Drops everything that belongs to the signed-in user: streams, cached data, drafts, UI state. */
export function resetSessionState(queryClient: QueryClient) {
  Object.values(useStreamStore.getState().active).forEach((stream) => stream.controller.abort());
  useStreamStore.setState(initialStreamState);
  useComposerStore.setState({ drafts: {} });
  useUiStore.getState().setSidebarOpen(false);
  queryClient.clear();
}

/** Clears session state whenever the signed-in user changes (sign-out, expiry, account switch). */
export function SessionBoundary() {
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === 'loading') return;
    const current = status === 'authenticated' ? (user?.id ?? null) : null;
    if (previous.current !== undefined && previous.current !== current) resetSessionState(queryClient);
    previous.current = current;
  }, [status, user?.id, queryClient]);

  return null;
}

/** Sign out: clear local session state, end the provider session, and return to `/login`. */
export function useSignOut() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useCallback(async () => {
    resetSessionState(queryClient);
    await auth.logout();
    // Hosted providers redirect to the logout URI themselves; in-memory sessions route here.
    navigate('/login', { replace: true });
  }, [auth, queryClient, navigate]);
}

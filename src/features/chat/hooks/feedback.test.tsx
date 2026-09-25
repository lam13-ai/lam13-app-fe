import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider, createMockAdapter, INSTANT_TIMING, type ApiAdapter } from '@/api';
import { ToastProvider } from '@/components/ui';
import { MessageActions } from '../components/MessageActions';
import { useMessageFeedback } from './useMessageFeedback';
import { useMessages } from './useMessages';

const CONVERSATION = 'water-security-kpis';

function Harness() {
  const { messages } = useMessages(CONVERSATION);
  const { rate, isPending } = useMessageFeedback(CONVERSATION);
  const answer = messages.findLast((m) => m.role === 'assistant');
  if (!answer) return null;
  return (
    <MessageActions
      createdAt={answer.created_at}
      feedback={{ rating: answer.feedback ?? null, pending: isPending(answer.id), onRate: (r) => void rate(answer, r) }}
    />
  );
}

function renderHarness(api: ApiAdapter) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => (
    <ApiProvider adapter={api}>
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ApiProvider>
  );
  render(wrap(<Harness />));
}

const savedRating = async (api: ApiAdapter) =>
  (await api.messages.list(CONVERSATION)).items.find((m) => m.role === 'assistant')?.feedback ?? null;

describe('message feedback (backend-ready contract, mock adapter)', () => {
  it('shows the rating at once, confirms it with the server, and clears it on a second tap', async () => {
    const api = createMockAdapter({ timing: INSTANT_TIMING });
    renderHarness(api);
    const up = await screen.findByRole('button', { name: 'Good response' });
    expect(up.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(up);
    expect(up.getAttribute('aria-pressed')).toBe('true'); // optimistic
    expect((up as HTMLButtonElement).disabled).toBe(true); // pending
    await waitFor(() => expect((up as HTMLButtonElement).disabled).toBe(false));
    expect(await savedRating(api)).toBe('up');

    await act(async () => fireEvent.click(up));
    await waitFor(() => expect(up.getAttribute('aria-pressed')).toBe('false'));
    expect(await savedRating(api)).toBeNull();
  });

  it('ignores repeated taps while a request is pending', async () => {
    const api = createMockAdapter({ timing: INSTANT_TIMING });
    const setFeedback = vi.spyOn(api.messages, 'setFeedback');
    renderHarness(api);
    const down = await screen.findByRole('button', { name: 'Bad response' });
    fireEvent.click(down);
    fireEvent.click(down);
    fireEvent.click(screen.getByRole('button', { name: 'Good response' }));
    await waitFor(() => expect((down as HTMLButtonElement).disabled).toBe(false));
    expect(setFeedback).toHaveBeenCalledTimes(1);
  });

  it('rolls back and explains when saving fails', async () => {
    const api = createMockAdapter({ timing: INSTANT_TIMING, failFeedback: true });
    renderHarness(api);
    const down = await screen.findByRole('button', { name: 'Bad response' });
    fireEvent.click(down);
    expect(down.getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText(/Couldn't save your feedback\./)).toBeTruthy();
    expect(down.getAttribute('aria-pressed')).toBe('false');
    expect(await savedRating(api)).toBeNull();
  });
});

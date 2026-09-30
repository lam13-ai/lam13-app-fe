import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import type { Env } from '@/lib/env';
import { useRtcStreamStore } from '@/stores/rtcStreamStore';
import { CallingProvider } from './CallingProvider';
import type { RtcStatus } from './rtc';
import type { SessionDetailDto } from '@/api/http';

const server = vi.hoisted(() => ({
  receive: null as null | ((snapshot: { status: RtcStatus; conversation: SessionDetailDto }, cursor: string) => void),
  subscriptions: 0,
  statusLoads: 0,
  signal: null as AbortSignal | null,
}));
vi.mock('@/lib/env', async (original) => {
  const real = await original<{ env: Env }>();
  return { ...real, env: { ...real.env, apiMode: 'http' } };
});
vi.mock('./rtc', () => ({
  getRtcStatus: vi.fn(async () => {
    server.statusLoads++;
    return { calls: [], actions: [{ id: 'action', title: 'Report', request: 'Report', status: 'queued', missing: [], error: '' }] };
  }),
  watchRtc: vi.fn(async (_id, _cursor, signal: AbortSignal, receive) => {
    server.subscriptions++;
    server.signal = signal;
    server.receive = receive;
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
  }),
  prepareRtc: vi.fn(), abandonRtc: vi.fn(), registerRtc: vi.fn(), noteHandoffTermination: vi.fn(),
}));

it('updates the reserved report from one subscription and closes it when work finishes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/c/thread']}>
    <CallingProvider><span>Thread</span></CallingProvider>
  </MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(server.receive).not.toBeNull());
  const snapshot = (status: string, content: string) => ({
    status: { calls: [], actions: [{ id: 'action', title: 'Report', request: 'Report', status, missing: [], error: '' }] },
    conversation: { sessionId: 'thread', title: 'Test', messages: [
      { id: 'voice-result-action', role: 'assistant' as const, content, voice_action_id: 'action', status: status === 'completed' ? 'completed' : 'generating' },
      { id: 'later', role: 'user' as const, content: 'A later question', status: 'completed' },
    ] },
  });
  act(() => server.receive!(snapshot('running', 'Checking evidence.'), '1'));
  act(() => server.receive!(snapshot('running', 'Preparing the report.'), '2'));
  expect(server.subscriptions).toBe(1);
  expect(server.statusLoads).toBe(1);
  act(() => server.receive!(snapshot('completed', 'The completed findings.'), '3'));
  await waitFor(() => expect(server.signal?.aborted).toBe(true));
  const cache = client.getQueryData<{ pages: { items: { id: string; content: string }[] }[] }>(queryKeys.messages('thread'));
  expect(cache?.pages[0]?.items.map((m) => m.id)).toEqual(['later', 'voice-result-action']);
  expect(cache?.pages[0]?.items[1]?.content).toBe('The completed findings.');
  expect(useRtcStreamStore.getState().sessions.thread).toBe(false);
  view.unmount();
  client.clear();
});

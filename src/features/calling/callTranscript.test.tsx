import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import type { Env } from '@/lib/env';
import { CallingProvider } from './CallingProvider';
import { CallButton } from './components/CallButton';
import { CallPanel } from './components/CallPanel';
import { createMockCallFactory } from './providers/mockProvider';
import type { CallingConfig, CreateCallProvider } from './types';

/**
 * Server-saved calls (Vapi + the HTTP backend): the backend saves a call's turns into the conversation as
 * they happen. Live, they must show only in the call panel — the chat behind it stays as it was — and the
 * chat shows the saved conversation once, after the call, including turns saved as it ended.
 */

type Row = { id: string; text: string };
const server = vi.hoisted(() => ({
  messages: [] as Row[],
  calls: [] as { id: string; status: string; finalized: boolean; saved_messages: number; summary: string }[],
  messageLoads: 0,
  create: null as unknown as CreateCallProvider,
}));

vi.mock('@/lib/env', async (importOriginal) => {
  const real = await importOriginal<{ env: Env }>();
  return { ...real, env: { ...real.env, apiMode: 'http' } };
});
// The Vapi provider itself is replaced by the controllable mock (so the call counts as a saved one).
vi.mock('./providers/vapiProvider', () => ({ createVapiProvider: (config: CallingConfig) => server.create(config) }));
vi.mock('./rtc', () => ({
  prepareRtc: vi.fn(async (sessionId: string) => ({
    id: 'call-1',
    session_id: sessionId,
    assistant_id: 'assistant',
    assistant_overrides: { variableValues: {} },
  })),
  getRtcStatus: vi.fn(async () => ({ calls: structuredClone(server.calls), actions: [] })),
  abandonRtc: vi.fn(async () => ({})),
  registerRtc: vi.fn(async () => ({})),
  manageRtcAction: vi.fn(),
}));

const ENV = { vapi: { publicKey: 'test-public-key', assistantId: 'test-assistant' }, features: { calling: true, voiceNotes: false } };

/** The chat's message list for the conversation (what ChatView renders from the same query key). */
function ChatProbe() {
  const { data } = useQuery({
    queryKey: queryKeys.messages('s1'),
    queryFn: async () => {
      server.messageLoads += 1;
      return structuredClone(server.messages);
    },
  });
  return (
    <ul aria-label="Chat">
      {data?.map((m) => (
        <li key={m.id}>{m.text}</li>
      ))}
    </ul>
  );
}

function setup() {
  const calls = createMockCallFactory();
  // Like the Vapi provider: reserve the call on the server (prepare) before starting it.
  server.create = (config) => {
    const provider = calls.create(config);
    const start = provider.start;
    provider.start = async () => {
      await config.prepare?.();
      return start();
    };
    return provider;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/c/s1']}>
        <Routes>
          <Route
            path="/c/:id"
            element={
              <CallingProvider env={ENV}>
                <ChatProbe />
                <CallButton />
                <CallPanel />
              </CallingProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  /** One poll of the server's call status (the 4 s interval, on demand). */
  const poll = () => act(() => queryClient.refetchQueries({ queryKey: ['rtc'] }));
  return { calls, poll };
}

const chat = () => within(screen.getByRole('list', { name: 'Chat' }));
const panel = () => screen.queryByRole('region', { name: 'Voice call' });
/** The server saves a turn into the conversation (as the backend's call callbacks do) and the browser hears it. */
function say(call: ReturnType<typeof createMockCallFactory>['last'], role: 'user' | 'assistant', text: string, saved = true) {
  act(() => call!.transcript({ role, text, final: true }));
  if (!saved) return;
  server.messages.push({ id: `m${server.messages.length + 1}`, text });
  server.calls = [{ id: 'call-1', status: 'active', finalized: false, saved_messages: server.messages.length - 2, summary: '' }];
}

beforeEach(() => {
  server.messages = [
    { id: 'm1', text: 'Earlier question' },
    { id: 'm2', text: 'Earlier answer' },
  ];
  server.calls = [];
  server.messageLoads = 0;
});

describe('live call transcript', () => {
  it('shows only in the call panel while the call runs; the chat behind it does not change', async () => {
    const { calls, poll } = setup();
    await chat().findByText('Earlier answer');
    const loads = server.messageLoads;

    fireEvent.click(screen.getByRole('button', { name: 'Start voice call' }));
    await waitFor(() => expect(calls.last).toBeTruthy());
    act(() => calls.last!.connect());

    say(calls.last, 'assistant', 'Hello. What strategy challenge are you working on?');
    await poll();
    say(calls.last, 'user', 'What do you mean?');
    await poll();
    say(calls.last, 'assistant', 'I mean, what specific public-sector work?');
    await poll();

    const log = within(screen.getByRole('log', { name: 'Call transcript' }));
    expect(log.getByText('What do you mean?')).toBeTruthy();
    expect(log.getByText('I mean, what specific public-sector work?')).toBeTruthy();
    // The chat is frozen: the saved turns were not reloaded into it.
    expect(chat().getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Earlier question', 'Earlier answer']);
    expect(server.messageLoads).toBe(loads);
  });

  it('after the call: the panel stays "saving" until the server finalizes it (late turn included), then the chat shows it once', async () => {
    const { calls, poll } = setup();
    await chat().findByText('Earlier answer');
    fireEvent.click(screen.getByRole('button', { name: 'Start voice call' }));
    await waitFor(() => expect(calls.last).toBeTruthy());
    act(() => calls.last!.connect());
    say(calls.last, 'assistant', 'Hello.');
    say(calls.last, 'user', 'Draft the KPI set.');
    await poll();

    await act(async () => fireEvent.click(within(panel()!).getByRole('button', { name: 'End call' })));
    // Ended, not yet saved: the panel keeps the transcript and says so; the chat still hasn't changed.
    expect(within(panel()!).getByText(/saving to chat/i)).toBeTruthy();
    expect(within(panel()!).getByText('Draft the KPI set.')).toBeTruthy();
    expect(chat().queryByText('Draft the KPI set.')).toBeNull();

    // The last turn is saved as the call ends, and the server finalizes the call.
    server.messages.push({ id: 'm5', text: 'Noted — I will draft it.' });
    server.calls = [{ id: 'call-1', status: 'ended', finalized: false, saved_messages: 3, summary: '' }];
    await poll();
    expect(panel()).toBeTruthy(); // not finalized yet
    server.calls = [{ id: 'call-1', status: 'ended', finalized: true, saved_messages: 3, summary: '' }];
    await poll();

    await waitFor(() => expect(panel()).toBeNull());
    expect(chat().getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Earlier question',
      'Earlier answer',
      'Hello.',
      'Draft the KPI set.',
      'Noted — I will draft it.',
    ]);
    // Idempotent: further polls reload the same server copy — nothing is added twice.
    await poll();
    await poll();
    expect(chat().getAllByText('Draft the KPI set.')).toHaveLength(1);
    expect(chat().getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Start voice call' })).toBeTruthy();
  });
});

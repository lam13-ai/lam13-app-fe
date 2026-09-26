import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockAdapter, INSTANT_TIMING, queryKeys, type ApiAdapter } from '@/api';
import { translateStream } from '@/api/http';
import { readSseMessages } from '@/api/stream';
import { initialStreamState, useStreamStore } from '@/stores/streamStore';
import { createChatActions } from './chatStream';
import { toChronological, type MessagesData } from './messageCache';

/**
 * The real FastAPI `/chat/stream` vocabulary, pushed frame by frame through the real SSE parser, the
 * HTTP adapter's translation, the reducer and the rAF-batched cache writes.
 */
function harness() {
  let push!: (event: string, data: object) => void;
  let raw!: (frame: string) => void;
  let fail!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      raw = (frame) => controller.enqueue(encoder.encode(frame));
      push = (event, data) => raw(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      fail = () => controller.error(new TypeError('network error'));
    },
  });
  const mock = createMockAdapter({ timing: INSTANT_TIMING });
  const api: ApiAdapter = {
    ...mock,
    messages: {
      ...mock.messages,
      send: async (conversationId, request, options) => {
        if (request.kind !== 'text') throw new Error('text only');
        return translateStream(readSseMessages(body, options?.signal), { conversationId, body: request }, async () => null);
      },
    },
  };
  const queryClient = new QueryClient();
  const actions = createChatActions({ api, queryClient });
  const assistant = () => toChronological(queryClient.getQueryData<MessagesData>(queryKeys.messages('s1'))).find((m) => m.role === 'assistant');
  const phase = () => useStreamStore.getState().active.s1?.phase;
  return { push, raw, fail: () => fail(), actions, assistant, phase, queryClient };
}

const start = { content: '', session_id: 's1', message_id: 'c1', assistantMessageId: 'a1' };
const token = (content: string) => ['token', { content, source: 'chatbot' }] as const;
const thinking = (content: string) => ['thinking', { content, source: 'chatbot', mode: 'token' }] as const;

afterEach(() => useStreamStore.setState(initialStreamState));

describe('real backend SSE → visible assistant message', () => {
  it('shows tokens as they arrive, never shows thinking text, and finalizes at done without duplicating', async () => {
    const h = harness();
    const sent = h.actions.send('s1', 'Explain X');

    h.push('start', start);
    h.push('response_started', { content: 'Generating response...' });
    h.push(...thinking('SECRET plan the answer'));
    await waitFor(() => expect(h.phase()).toBe('thinking'));
    expect(h.assistant()).toMatchObject({ id: 'a1', content: '', status: 'streaming' });

    h.push(...token('Great q'));
    await waitFor(() => expect(h.assistant()?.content).toBe('Great q'));
    expect(h.phase()).toBe('answering');

    h.push(...token('uestion, Aash'));
    h.push(...thinking('SECRET more reasoning')); // interleaved: status only
    h.push(...token('ir! Here is:\n\n**'));
    h.push(...token('Bold** and\n\n- a list'));
    await waitFor(() => expect(h.assistant()?.content).toBe('Great question, Aashir! Here is:\n\n**Bold** and\n\n- a list'));
    expect(h.phase()).toBe('answering');

    h.push('mystery_event', { content: 'ignored' });
    h.raw('event: token\ndata: {not json\n\n'); // malformed: skipped
    h.push('response_completed', { content: 'Response completed.' });
    await waitFor(() => expect(h.assistant()?.status).toBe('complete'));
    h.push('postprocess_started', { content: 'Running post-processing...' });
    h.push('postprocess_completed', { content: 'Post-processing complete.' });
    h.push('done', { content: '', session_id: 's1', assistantMessageId: 'a1', title: 'Explaining X' });
    await sent;

    const final = h.assistant();
    expect(final).toMatchObject({ content: 'Great question, Aashir! Here is:\n\n**Bold** and\n\n- a list', status: 'complete' });
    expect(final?.content).not.toContain('SECRET');
    const all = toChronological(h.queryClient.getQueryData<MessagesData>(queryKeys.messages('s1')));
    expect(all.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('Stop after partial tokens keeps the partial answer', async () => {
    const h = harness();
    const sent = h.actions.send('s1', 'Explain X');
    h.push('start', start);
    h.push(...token('Partial '));
    h.push(...token('answer'));
    await waitFor(() => expect(h.assistant()?.content).toBe('Partial answer'));

    h.actions.stop('s1');
    await sent;
    expect(h.assistant()).toMatchObject({ content: 'Partial answer', status: 'cancelled' });
  });

  it('a dropped connection after partial tokens keeps the partial answer with a retryable error', async () => {
    const h = harness();
    const sent = h.actions.send('s1', 'Explain X');
    h.push('start', start);
    h.push(...token('Partial answer'));
    await waitFor(() => expect(h.assistant()?.content).toBe('Partial answer'));

    h.fail();
    await sent;
    expect(h.assistant()).toMatchObject({ content: 'Partial answer', status: 'error' });
    expect(Object.values(useStreamStore.getState().failures)).toEqual([expect.objectContaining({ retryable: true })]);
  });
});

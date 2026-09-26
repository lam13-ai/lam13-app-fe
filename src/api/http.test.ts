import { describe, expect, it } from 'vitest';
import { translateStream } from './http';
import type { SseMessage } from './stream';

async function* sse(...events: [string, object][]): AsyncGenerator<SseMessage> {
  for (const [event, data] of events) yield { event, data: JSON.stringify(data), id: undefined };
}

const body = { kind: 'text' as const, client_message_id: 'c1', content: 'Build a strategy' };

async function collect(stream: AsyncIterable<unknown>) {
  const out = [];
  for await (const e of stream) out.push(e);
  return out as { event: string; data: Record<string, unknown> }[];
}

describe('translateStream (backend SSE → app events)', () => {
  it('maps a new-chat turn, including generated files from the saved session', async () => {
    const events = await collect(
      translateStream(
        sse(
          ['start', { session_id: 's1', message_id: 'c1', assistantMessageId: 'a1' }],
          ['response_started', { content: 'Generating response...' }],
          ['thinking', { content: 'hmm', source: 'chatbot' }],
          ['thinking', { content: 'more', source: 'chatbot' }],
          ['token', { content: 'Hello ', source: 'chatbot' }],
          ['token', { content: 'world', source: 'chatbot' }],
          ['postprocess_started', { content: 'Running post-processing...' }],
          ['done', { session_id: 's1', title: 'Growth plan', reportUrl: '' }],
        ),
        { conversationId: null, body },
        async () => ({
          sessionId: 's1',
          title: 'Growth plan',
          eshmunReportGeneratingStatus: 'in_progress',
          messages: [
            { id: 'c1', role: 'user', content: 'Build a strategy' },
            { id: 'a1', role: 'assistant', content: 'Hello world', kothar_status: 'completed', kothar_pptx_url: 'https://blob/deck.pptx' },
          ],
        }),
      ),
    );

    expect(events.map((e) => e.event)).toEqual([
      'conversation.created',
      'message.created',
      'status', // response_started: generating
      'status', // thinking: one status, never its text (post-processing adds nothing more)
      'delta',
      'delta',
      'conversation.updated', // done: the title…
      'done', // …and the whole answer, once
      'artifact', // then the saved session's files
      'artifact',
    ]);
    expect(events[0]!.data.id).toBe('s1');
    expect(events[2]!.data).toEqual({ state: 'generating' });
    expect(events[3]!.data).toEqual({ state: 'thinking' });
    expect(JSON.stringify(events)).not.toContain('hmm');
    const created = events[1]!.data as { user_message: { id: string; client_message_id: string }; assistant_message: { id: string } };
    expect(created.user_message).toMatchObject({ id: 'c1', client_message_id: 'c1' });
    expect(created.assistant_message.id).toBe('a1');
    expect(events[6]!.data).toEqual({ id: 's1', title: 'Growth plan' });
    expect((events[7]!.data.message as { content: string; status: string })).toMatchObject({ content: 'Hello world', status: 'complete' });
    expect(events[8]!.data).toMatchObject({ type: 'pptx', status: 'ready', download: { url: 'https://blob/deck.pptx' } });
    expect(events[9]!.data).toMatchObject({ type: 'report', status: 'processing', download: null });
  });

  it('the answer is complete at `done`, not `response_completed`: post-processing statuses add nothing, agent output joins the answer', async () => {
    const events = await collect(
      translateStream(
        sse(
          ['start', { session_id: 's1', message_id: 'c1', assistantMessageId: 'a1' }],
          ['token', { content: 'Answer.', source: 'chatbot' }],
          ['response_completed', { content: 'Response completed.' }],
          ['postprocess_started', { content: 'Running post-processing...' }],
          ['progress', { content: 'Drafting the report', source: 'eshmun' }],
          ['token', { content: ' Agent addendum ', source: 'eshmun' }],
          ['postprocess_completed', { content: 'Post-processing complete.' }],
          ['done', { session_id: 's1', title: 'T' }],
        ),
        { conversationId: 's1', body },
        async () => null,
      ),
    );
    expect(events.map((e) => e.event)).toEqual(['message.created', 'delta', 'status', 'delta', 'conversation.updated', 'done']);
    expect(events[2]!.data).toEqual({ state: 'thinking' }); // no progress text
    expect(JSON.stringify(events)).not.toContain('Drafting');
    expect((events[5]!.data.message as { content: string })).toMatchObject({ content: 'Answer.\n\nAgent addendum' });
  });

  it('a post-processing failure after `response_completed` still completes the answer (no error)', async () => {
    const events = await collect(
      translateStream(
        sse(
          ['start', { session_id: 's1', message_id: 'c1', assistantMessageId: 'a1' }],
          ['token', { content: 'Answer.', source: 'chatbot' }],
          ['response_completed', { content: 'Response completed.' }],
          ['postprocess_failed', { content: 'Post-processing failed.' }],
          ['done', { session_id: 's1', partial: true, recoveredContent: 'Answer.' }],
          ['error', { content: 'We encountered an issue processing your request.' }],
        ),
        { conversationId: 's1', body },
        async () => null,
      ),
    );
    expect(events.map((e) => e.event)).toEqual(['message.created', 'delta', 'done']);
    expect((events[2]!.data.message as { content: string; status: string })).toMatchObject({ content: 'Answer.', status: 'complete' });
  });

  it('a stream that closes after `response_completed` but before `done` still completes the answer', async () => {
    const events = await collect(
      translateStream(
        sse(
          ['start', { session_id: 's1', message_id: 'c1', assistantMessageId: 'a1' }],
          ['token', { content: 'Answer.', source: 'chatbot' }],
          ['response_completed', { content: 'Response completed.' }],
        ),
        { conversationId: 's1', body },
        async () => null,
      ),
    );
    expect(events.map((e) => e.event)).toEqual(['message.created', 'delta', 'done']);
  });

  // Retryable: with no regenerate endpoint, Retry asks again as a new turn (chatStream `retry`).
  it('a failed turn (partial done, then error) ends with a retryable error, not done', async () => {
    const events = await collect(
      translateStream(
        sse(
          ['start', { session_id: 's1', message_id: 'c1', assistantMessageId: 'a1' }],
          ['token', { content: 'Part', source: 'chatbot' }],
          ['done', { partial: true }],
          ['error', { content: 'We encountered an issue processing your request.' }],
        ),
        { conversationId: 's1', body },
        async () => null,
      ),
    );
    expect(events.map((e) => e.event)).toEqual(['message.created', 'delta', 'error']);
    expect(events[2]!.data).toMatchObject({ retryable: true, message: 'We encountered an issue processing your request.' });
  });
});

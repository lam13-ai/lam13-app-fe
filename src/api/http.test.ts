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
      'status', // thinking: one status for the header…
      'reasoning', // …and every reasoning chunk, shown live
      'reasoning',
      'delta',
      'delta',
      'status', // post-processing after the answer
      'progress', // its step, shown live
      'conversation.updated',
      'artifact',
      'artifact',
      'done',
    ]);
    expect(events[0]!.data.id).toBe('s1');
    expect(events[2]!.data).toEqual({ state: 'generating' });
    expect(events[3]!.data).toEqual({ state: 'thinking' });
    expect(events[4]!.data).toEqual({ message_id: 'a1', text: 'hmm' });
    expect(events[5]!.data).toEqual({ message_id: 'a1', text: 'more' });
    expect(events[9]!.data).toEqual({ message_id: 'a1', text: 'Running post-processing...' });
    const created = events[1]!.data as { user_message: { id: string; client_message_id: string }; assistant_message: { id: string } };
    expect(created.user_message).toMatchObject({ id: 'c1', client_message_id: 'c1' });
    expect(created.assistant_message.id).toBe('a1');
    expect(events[10]!.data).toEqual({ id: 's1', title: 'Growth plan' });
    expect(events[11]!.data).toMatchObject({ type: 'pptx', status: 'ready', download: { url: 'https://blob/deck.pptx' } });
    expect(events[12]!.data).toMatchObject({ type: 'report', status: 'processing', download: null });
    expect((events[13]!.data.message as { content: string; status: string })).toMatchObject({ content: 'Hello world', status: 'complete' });
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

import { describe, expect, it } from 'vitest';
import { parseSSE, type SseMessage } from './sse';
import { readEventStream } from './readEventStream';

function bodyOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

const parse = (chunks: Array<string | Uint8Array>) => collect<SseMessage>(parseSSE(bodyOf(chunks).getReader()));

describe('parseSSE', () => {
  it('parses events, ids and multi-line data; ignores comments and unknown fields', async () => {
    const messages = await parse([
      ': ping\n\n',
      'event: delta\nid: 1\ndata: {"a":1}\n\n',
      'retry: 3000\ndata: line one\ndata: line two\n\n',
    ]);
    expect(messages).toEqual([
      { event: 'delta', data: '{"a":1}', id: '1' },
      { event: 'message', data: 'line one\nline two', id: '1' },
    ]);
  });

  it('handles arbitrary chunk boundaries, CRLF split across chunks, and split UTF-8', async () => {
    const text = 'event: delta\r\ndata: café — ✓\r\n\r\n';
    const bytes = new TextEncoder().encode(text);
    // One byte per chunk: splits CRLF pairs and multi-byte characters.
    const chunks = Array.from(bytes, (b) => new Uint8Array([b]));
    expect(await parse(chunks)).toEqual([{ event: 'delta', data: 'café — ✓', id: undefined }]);
  });

  it('discards an unterminated trailing event', async () => {
    expect(await parse(['data: complete\n\n', 'data: partial'])).toEqual([
      { event: 'message', data: 'complete', id: undefined },
    ]);
  });
});

describe('readEventStream', () => {
  it('yields typed events, skips unknown events, and maps malformed JSON to an error event', async () => {
    const events = await collect(
      readEventStream(
        bodyOf([
          'event: status\ndata: {"state":"thinking"}\n\n',
          'event: future.thing\ndata: {}\n\n',
          'event: delta\ndata: {"message_id":"m1","text":"Hi"}\n\n',
          'event: done\ndata: {not json\n\n',
        ]),
      ),
    );
    expect(events).toEqual([
      { event: 'status', data: { state: 'thinking' } },
      { event: 'delta', data: { message_id: 'm1', text: 'Hi' } },
      { event: 'error', data: { code: 'malformed_event', message: 'Received a malformed response.', retryable: true } },
    ]);
  });

  it('throws AbortError and cancels the body when aborted mid-stream', async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: delta\ndata: {"message_id":"m","text":"a"}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const received: string[] = [];

    await expect(async () => {
      for await (const event of readEventStream(body, controller.signal)) {
        received.push(event.event);
        controller.abort();
      }
    }).rejects.toMatchObject({ name: 'AbortError' });
    expect(received).toEqual(['delta']);
    expect(cancelled).toBe(true);
  });
});

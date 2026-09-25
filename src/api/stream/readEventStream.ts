import { abortError } from '../errors';
import { parseSSE, type SseMessage } from './sse';
import { STREAM_EVENT_NAMES, type StreamEvent } from './types';

function toStreamEvent(message: SseMessage): StreamEvent | null {
  // Unknown events are ignored for forward compatibility.
  if (!STREAM_EVENT_NAMES.has(message.event)) return null;
  try {
    return { event: message.event, data: JSON.parse(message.data) } as StreamEvent;
  } catch {
    return {
      event: 'error',
      data: { code: 'malformed_event', message: 'Received a malformed response.', retryable: true },
    };
  }
}

/** Turns an SSE response body (`text/event-stream` bytes) into typed events (mock adapter). */
export async function* readEventStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  for await (const message of readSseMessages(body, signal)) {
    const event = toStreamEvent(message);
    if (event) yield event;
  }
}

/**
 * Raw SSE messages from a response body. Aborting `signal` cancels the body and makes iteration
 * throw an AbortError. The HTTP adapter translates these backend events itself.
 */
export async function* readSseMessages(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseMessage> {
  if (signal?.aborted) {
    await body.cancel().catch(() => {});
    throw abortError();
  }

  const reader = body.getReader();
  const onAbort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', onAbort, { once: true });
  let finished = false;

  try {
    for await (const message of parseSSE(reader)) {
      if (signal?.aborted) break;
      yield message;
    }
    if (signal?.aborted) throw abortError();
    finished = true;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    // Consumer stopped early (break/return/throw): release the underlying source.
    if (!finished && !signal?.aborted) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

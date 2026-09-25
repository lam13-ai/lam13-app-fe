import { isAbortError } from '../errors';
import type { StreamEvent } from '../stream';

export function encodeSSE(event: StreamEvent, id: number): string {
  return `event: ${event.event}\nid: ${id}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export interface EventWriter {
  emit: (event: StreamEvent) => void;
  /** Heartbeat comment line, as a real server sends every ~15s. */
  ping: () => void;
}

/**
 * Builds a `text/event-stream` byte body driven by `run`, like a server response.
 * Each encoded event is split at random points so the client parser sees realistic chunking.
 * Cancelling the body (client abort) aborts the `signal` passed to `run`.
 */
export function createEventBody(
  run: (writer: EventWriter, signal: AbortSignal) => Promise<void>,
  random: () => number,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const disconnected = new AbortController();
  let seq = 0;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        if (disconnected.signal.aborted) return;
        const cut = 1 + Math.floor(random() * Math.max(1, text.length - 1));
        controller.enqueue(encoder.encode(text.slice(0, cut)));
        if (cut < text.length) controller.enqueue(encoder.encode(text.slice(cut)));
      };
      const writer: EventWriter = {
        emit: (event) => write(encodeSSE(event, ++seq)),
        ping: () => write(': ping\n\n'),
      };

      run(writer, disconnected.signal).then(
        () => {
          if (!disconnected.signal.aborted) controller.close();
        },
        (error: unknown) => {
          if (disconnected.signal.aborted || isAbortError(error)) return;
          controller.error(error);
        },
      );
    },
    cancel() {
      disconnected.abort();
    },
  });
}

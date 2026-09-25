/** One dispatched Server-Sent Event. */
export interface SseMessage {
  event: string;
  data: string;
  id: string | undefined;
}

/**
 * Incremental SSE parser (WHATWG "event stream interpretation") over a byte reader.
 * Handles chunk boundaries anywhere (even inside CRLF or multi-byte UTF-8), multi-line
 * `data:`, `id:`, and `:` comment/heartbeat lines. An unterminated final event is discarded.
 */
export async function* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<SseMessage> {
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = '';
  let data: string[] = [];
  let lastEventId: string | undefined;

  for (;;) {
    const { value, done } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (ch !== '\n' && ch !== '\r') continue;
      // A trailing CR may be the first half of CRLF split across chunks — wait for more input.
      if (ch === '\r' && i === buffer.length - 1 && !done) break;

      const line = buffer.slice(start, i);
      if (ch === '\r' && buffer[i + 1] === '\n') i++;
      start = i + 1;

      if (line === '') {
        if (data.length > 0) yield { event: eventType || 'message', data: data.join('\n'), id: lastEventId };
        eventType = '';
        data = [];
        continue;
      }
      if (line.startsWith(':')) continue;

      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let fieldValue = colon === -1 ? '' : line.slice(colon + 1);
      if (fieldValue.startsWith(' ')) fieldValue = fieldValue.slice(1);

      if (field === 'event') eventType = fieldValue;
      else if (field === 'data') data.push(fieldValue);
      else if (field === 'id' && !fieldValue.includes('\0')) lastEventId = fieldValue;
    }
    buffer = buffer.slice(start);

    if (done) return;
  }
}

#!/usr/bin/env node
/**
 * Real-backend streaming smoke test: sends ONE prompt to POST /chat/stream and reports WHEN each SSE event
 * arrives, so you can see whether answer tokens reach the client incrementally or all at once (a backend or
 * proxy buffering the response).
 *
 *   LAM13_API_URL=https://<api-host>  LAM13_TOKEN=<access token>  node scripts/stream-smoke.mjs ["your prompt"]
 *
 * The token is the same `Authorization: Bearer` value the app sends (or one from POST /auth/signin). It is
 * read from the environment and never printed. This creates one real conversation in that account.
 */
const base = (process.env.LAM13_API_URL ?? '').replace(/\/+$/, '');
const token = process.env.LAM13_TOKEN ?? '';
const prompt =
  process.argv[2] ??
  'Explain the baseline in detail and give me a framework for how I should build a strategy around the baseline.';
if (!base || !token) {
  console.error('Set LAM13_API_URL and LAM13_TOKEN (see the comment at the top of this file).');
  process.exit(2);
}

const id = crypto.randomUUID();
const t0 = performance.now();
const at = () => `${String(Math.round(performance.now() - t0)).padStart(6)} ms`;

const response = await fetch(`${base}/chat/stream`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: id, message_id: id, user_message: prompt }),
});
console.log(`${at()}  HTTP ${response.status}  content-type: ${response.headers.get('content-type')}`);
for (const name of ['cache-control', 'x-accel-buffering', 'content-encoding', 'transfer-encoding', 'via', 'server']) {
  if (response.headers.get(name)) console.log(`           ${name}: ${response.headers.get(name)}`);
}
if (!response.ok || !response.body) {
  console.error((await response.text()).slice(0, 300));
  process.exit(1);
}

const counts = {};
const tokenTimes = [];
let chunks = 0;
let answer = 0;
let buffer = '';
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  chunks += 1;
  buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
  let end;
  while ((end = buffer.indexOf('\n\n')) !== -1) {
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    const event = /^event: (.*)$/m.exec(frame)?.[1] ?? (frame.startsWith(':') ? '(comment)' : 'message');
    let data = {};
    try {
      data = JSON.parse(/^data: (.*)$/m.exec(frame)?.[1] ?? '{}');
    } catch {
      // not JSON: counted, not shown
    }
    counts[event] = (counts[event] ?? 0) + 1;
    if (event === 'token') {
      tokenTimes.push(performance.now() - t0);
      answer += String(data.content ?? '').length;
      // Tokens are summarised below; print the first few so the start of the answer is visible.
      if (counts.token <= 3) console.log(`${at()}  token  ${JSON.stringify(String(data.content ?? '').slice(0, 40))}`);
      else if (counts.token === 4) console.log('           … (further tokens summarised below)');
    } else if (event === 'thinking') {
      // Reasoning text is not echoed: only that it arrived, and how much.
      console.log(`${at()}  thinking  (${String(data.content ?? '').length} chars, mode=${data.mode ?? '?'})`);
    } else {
      console.log(`${at()}  ${event}${data.source ? `  [${data.source}]` : ''}`);
    }
  }
}

const span = tokenTimes.length ? tokenTimes.at(-1) - tokenTimes[0] : 0;
const gaps = tokenTimes.slice(1).map((t, i) => t - tokenTimes[i]);
const bursts = 1 + gaps.filter((g) => g > 20).length; // tokens ≥20 ms apart arrived in separate deliveries
console.log('\n── summary ──');
console.log(`events: ${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ')}`);
console.log(`network chunks: ${chunks}; answer: ${answer} chars in ${tokenTimes.length} token events`);
if (tokenTimes.length) {
  console.log(`first token at ${Math.round(tokenTimes[0])} ms, last at ${Math.round(tokenTimes.at(-1))} ms (${Math.round(span)} ms apart), in ${bursts} separate deliveries`);
}
const incremental = tokenTimes.length >= 5 && bursts >= 5 && span > 500;
console.log(
  incremental
    ? 'RESULT: tokens arrive INCREMENTALLY — the stream is not buffered.'
    : tokenTimes.length < 5
      ? 'RESULT: too few token events to judge (try a prompt with a longer answer).'
      : 'RESULT: tokens arrived in one or a few bursts — something between the model and this client is BUFFERING the response (a proxy, compression, or the backend).',
);
process.exit(incremental || tokenTimes.length < 5 ? 0 : 1);

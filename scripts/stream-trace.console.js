/**
 * Streaming trace for the REAL app — paste into Chrome DevTools → Console on app.lam13.ai (signed in),
 * then send a long prompt. When the answer finishes it prints, for that one response:
 *
 *   NETWORK  when each chunk of POST /chat/stream reached the browser
 *   EVENTS   when each `token` event was complete in those chunks
 *   RENDER   when the visible answer text actually grew
 *
 * so it is clear which layer batches: the network/proxy (few chunks, all at the end), or the page (chunks
 * arrive steadily but the text grows late). It reads only the response body of /chat/stream — no headers,
 * tokens, cookies or storage — and logs counts and timings, never the answer or the reasoning text.
 * Reload the page to remove it.
 */
(() => {
  if (window.__lam13Trace) return console.log('[stream-trace] already installed — send a message.');
  window.__lam13Trace = true;
  const fetch0 = window.fetch;

  window.fetch = async (...args) => {
    const response = await fetch0(...args);
    const url = String(args[0]?.url ?? args[0]);
    if (!/\/chat\/stream(\?|$)/.test(url) || !response.body) return response;

    const t0 = performance.now();
    const ms = () => Math.round(performance.now() - t0);
    const chunks = []; // { t, bytes, tokens }
    const events = {}; // name → count
    const tokenTimes = [];
    const renders = []; // { t, length }
    let answerChars = 0;

    // RENDER: the last answer's Markdown text length, sampled on every DOM change.
    const visibleLength = () => {
      const answers = document.querySelectorAll('[role="log"] article .md-content');
      return answers.length ? answers[answers.length - 1].textContent.length : 0;
    };
    const before = visibleLength();
    const observer = new MutationObserver(() => {
      const length = visibleLength();
      if (length !== (renders.at(-1)?.length ?? before)) renders.push({ t: ms(), length });
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    const [forApp, forTrace] = response.body.tee();
    (async () => {
      const reader = forTrace.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const t = ms();
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let tokens = 0;
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const name = /^event: (.*)$/m.exec(frame)?.[1] ?? (frame.startsWith(':') ? '(comment)' : 'message');
          events[name] = (events[name] ?? 0) + 1;
          if (name === 'token') {
            tokens += 1;
            tokenTimes.push(t);
            try {
              answerChars += String(JSON.parse(/^data: (.*)$/m.exec(frame)[1]).content ?? '').length;
            } catch {
              // not JSON: counted only
            }
          }
        }
        chunks.push({ t, bytes: value.length, tokens });
      }
      await new Promise((resolve) => setTimeout(resolve, 600)); // let the last render land
      observer.disconnect();

      const tokenChunks = chunks.filter((c) => c.tokens > 0);
      const span = (times) => (times.length ? times.at(-1) - times[0] : 0);
      const maxGap = (times) => times.slice(1).reduce((max, t, i) => Math.max(max, t - times[i]), 0);
      const netTimes = tokenChunks.map((c) => c.t);
      const renderTimes = renders.map((r) => r.t);
      // How far the page lags the network: for each render, the time since the newest chunk that had arrived.
      const lags = renders.map((r) => r.t - (netTimes.filter((t) => t <= r.t).at(-1) ?? r.t));
      const typicalLag = lags.length ? [...lags].sort((a, b) => a - b)[Math.floor(lags.length / 2)] : 0;

      console.log('%c[stream-trace] one /chat/stream response', 'font-weight:bold');
      console.table({
        'HTTP status / content-type': `${response.status} / ${response.headers.get('content-type')}`,
        'cache-control · x-accel-buffering · content-encoding': ['cache-control', 'x-accel-buffering', 'content-encoding']
          .map((h) => response.headers.get(h) ?? '—')
          .join(' · '),
        events: Object.entries(events).map(([k, v]) => `${k}×${v}`).join(', '),
        'NETWORK chunks (all / carrying tokens)': `${chunks.length} / ${tokenChunks.length}`,
        'NETWORK first → last token chunk': `${netTimes[0] ?? '—'} ms → ${netTimes.at(-1) ?? '—'} ms (${span(netTimes)} ms apart, longest gap ${maxGap(netTimes)} ms)`,
        'EVENTS token events / answer chars': `${tokenTimes.length} / ${answerChars}`,
        'RENDER visible growth steps': renders.length,
        'RENDER first → last growth': `${renderTimes[0] ?? '—'} ms → ${renderTimes.at(-1) ?? '—'} ms (${span(renderTimes)} ms apart, longest gap ${maxGap(renderTimes)} ms)`,
        'RENDER typical lag behind the network': `${Math.round(typicalLag)} ms`,
      });

      const networkIncremental = tokenChunks.length >= 5 && span(netTimes) > 500;
      const renderIncremental = renders.length >= 5 && span(renderTimes) > 500;
      console.log(
        !tokenTimes.length
          ? 'VERDICT: no token events in this response.'
          : !networkIncremental
            ? 'VERDICT: the NETWORK delivered the tokens in one or a few bursts — the response is being buffered before it reaches the browser (proxy / gateway / compression / backend). The page cannot fix that.'
            : !renderIncremental
              ? 'VERDICT: the network delivered tokens incrementally but the PAGE showed them late — a frontend rendering/batching problem.'
              : 'VERDICT: tokens arrived incrementally over the network AND the visible answer grew with them.',
      );
      window.__lam13LastTrace = { chunks, events, tokenTimes, renders };
    })();

    return new Response(forApp, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  console.log('[stream-trace] installed — send a long prompt and wait for the answer to finish.');
})();

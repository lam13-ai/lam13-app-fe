import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessTokenGetter } from './auth';
import { FILE_FIELD, generatePresentation, parseJobResponse, parseStartResponse, PresentationError, type PresentationConfig } from './presentation';

/**
 * The image→PowerPoint service client: the Kothar frontend's tests for its `presentationApi.ts`, over a fake
 * fetch. Nothing is sent anywhere. What is pinned down: the request, the polling cadence (never overlapping),
 * the timeout, abort, transient failures and how a job's end is read.
 */

const BASE = 'https://api.test';
const config = (over: Partial<PresentationConfig> = {}): PresentationConfig => ({ endpoint: BASE, requireAuth: false, pollMs: 1, pollTimeoutMs: 900_000, ...over });
const file = (name = 'a.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const isStart = (input: unknown) => String(input).endsWith('/generate/pptx/deck/start');
const started = { job_id: 'img2pptx__1', state: 'running', asked: 1 };
const finished = { state: 'done', converted: true, file_id: 'img2pptx__1', asked: 2, slide_count: 2 };

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;
const service = (impl: FetchImpl) => {
  const fetch = vi.fn(impl);
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
const rejection = async (run: Promise<unknown>) => run.then(() => expect.unreachable('should have rejected'), (error: unknown) => error as Error & { category?: string });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reading the service', () => {
  it('a start response yields the job id, anything else is malformed', () => {
    expect(parseStartResponse(started)).toBe('img2pptx__1');
    for (const bad of [null, undefined, {}, [], 'nope', 42, { job_id: '' }, { job_id: 5 }]) {
      expect(() => parseStartResponse(bad)).toThrow(PresentationError);
    }
  });

  it('a finished job builds the download URL from file_id', () => {
    expect(parseJobResponse(finished, BASE)).toEqual({
      state: 'completed',
      result: { kind: 'url', downloadUrl: 'https://api.test/studio/download/img2pptx__1', slideCount: 2, asked: 2 },
    });
  });

  it('an unfinished or unrecognised poll keeps waiting', () => {
    for (const payload of [{ state: 'running' }, {}, null, 'nope', { state: 'queued' }]) expect(parseJobResponse(payload, BASE).state).toBe('pending');
  });

  it('failed, unconverted and file-less jobs are all failures', () => {
    for (const payload of [{ state: 'failed', error: 'provider exploded' }, { state: 'done', converted: false, file_id: 'x' }, { state: 'done', converted: true }]) {
      expect(parseJobResponse(payload, BASE).state).toBe('failed');
    }
  });

  it('a partial deck still succeeds, carrying both counts', () => {
    const state = parseJobResponse({ ...finished, asked: 5, slide_count: 3 }, BASE);
    expect(state).toMatchObject({ state: 'completed', result: { slideCount: 3, asked: 5 } });
  });
});

describe('the request', () => {
  it('posts every file as multipart under the agreed field, with no Content-Type set, then returns the download link', async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    service(async (input, init) => {
      if (isStart(input)) {
        seen = { url: input, init };
        return json(started);
      }
      return json(finished);
    });
    const files = ['a.png', 'b.png', 'c.png'].map(file);
    const result = await generatePresentation(files, { config: config() });
    expect(seen!.url).toBe('https://api.test/generate/pptx/deck/start');
    expect(seen!.init!.method).toBe('POST');
    const body = seen!.init!.body as FormData;
    expect(body.getAll(FILE_FIELD).map((f) => (f as File).name)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(seen!.init!.headers).toEqual({}); // no Content-Type (the browser adds the boundary), and no token unless asked for
    expect(result.downloadUrl).toBe('https://api.test/studio/download/img2pptx__1');
  });

  it('a trailing slash on the base URL does not double up in a path', async () => {
    let polled = '';
    service(async (input) => {
      if (isStart(input)) return json(started);
      polled = input;
      return json(finished);
    });
    await generatePresentation([file()], { config: config({ endpoint: `${BASE}/` }) });
    expect(polled).toBe('https://api.test/generate/pptx/job/img2pptx__1?wait=20');
  });

  it('sends the signed-in user’s token only when the service is configured to require it', async () => {
    const restore = setAccessTokenGetter(async () => 'test-token-not-real');
    try {
      const fetch = service(async (input) => (isStart(input) ? json(started) : json(finished)));
      await generatePresentation([file()], { config: config({ requireAuth: true }) });
      for (const call of fetch.mock.calls) expect(call[1]!.headers).toEqual({ Authorization: 'Bearer test-token-not-real' });
    } finally {
      restore();
    }
    const restoreNone = setAccessTokenGetter(async () => null);
    try {
      const fetch = service(async () => json(started));
      const error = await rejection(generatePresentation([file()], { config: config({ requireAuth: true }) }));
      expect(error).toBeInstanceOf(PresentationError);
      expect(fetch).not.toHaveBeenCalled(); // no token, no request
    } finally {
      restoreNone();
    }
  });

  it('non-2xx start responses (e.g. the service refusing too many images or a wrong format) become an http error', async () => {
    for (const status of [400, 413, 415, 422, 500, 502, 503]) {
      const fetch = service(async () => new Response(JSON.stringify({ detail: 'at most 3 images per deck, you sent 4' }), { status }));
      const error = await rejection(generatePresentation([file()], { config: config() }));
      expect([error instanceof PresentationError, error.category]).toEqual([true, 'http']);
      expect(fetch).toHaveBeenCalledTimes(1); // refused at the start: nothing is polled
    }
  });

  it('invalid JSON becomes a malformed error, a network failure a network error', async () => {
    for (const body of ['not json', '']) {
      service(async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
      expect((await rejection(generatePresentation([file()], { config: config() }))).category).toBe('malformed');
    }
    service(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect((await rejection(generatePresentation([file()], { config: config() }))).category).toBe('network');
  });

  it('an abort surfaces as AbortError, not as a backend failure', async () => {
    const controller = new AbortController();
    service(async () => {
      controller.abort();
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    const error = await rejection(generatePresentation([file()], { signal: controller.signal, config: config() }));
    expect([error.name, error instanceof PresentationError]).toEqual(['AbortError', false]);
  });

  it('a missing endpoint fails before any request is made', async () => {
    const fetch = service(async () => json({}));
    const error = await rejection(generatePresentation([file()], { config: config({ endpoint: '' }) }));
    expect([error.category, error.message]).toEqual(['network', 'the presentation endpoint is not configured']);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('polling', () => {
  it('the job is long-polled until it is done', async () => {
    let polls = 0;
    service(async (input) => {
      if (isStart(input)) return json(started);
      polls++;
      expect(input).toMatch(/\/generate\/pptx\/job\/img2pptx__1\?wait=20$/);
      return polls < 3 ? json({ state: 'running' }) : json(finished);
    });
    const result = await generatePresentation([file()], { config: config() });
    expect([polls, result.downloadUrl]).toEqual([3, 'https://api.test/studio/download/img2pptx__1']);
  });

  it('a failed job stops polling and surfaces one controlled error', async () => {
    let polls = 0;
    service(async (input) => {
      if (isStart(input)) return json(started);
      polls++;
      return json({ state: 'failed', error: 'provider exploded' });
    });
    expect(await rejection(generatePresentation([file()], { config: config() }))).toBeInstanceOf(PresentationError);
    expect(polls).toBe(1); // no further polls after the verdict
  });

  it('a transient blip does not fail the job, but a 404 does', async () => {
    let polls = 0;
    service(async (input) => {
      if (isStart(input)) return json(started);
      polls++;
      if (polls === 1) throw new TypeError('Failed to fetch');
      if (polls === 2) return new Response('nope', { status: 503 });
      return json(finished);
    });
    expect((await generatePresentation([file()], { config: config() })).downloadUrl).toBe('https://api.test/studio/download/img2pptx__1');
    expect(polls).toBe(3);

    let gone = 0;
    service(async (input) => {
      if (isStart(input)) return json(started);
      gone++;
      return new Response(JSON.stringify({ detail: 'job not found' }), { status: 404 });
    });
    expect((await rejection(generatePresentation([file()], { config: config() }))).category).toBe('http');
    expect(gone).toBe(1); // a vanished job is not retried
  });

  it('status checks that keep failing give up after five in a row', async () => {
    let polls = 0;
    service(async (input) => {
      if (isStart(input)) return json(started);
      polls++;
      return new Response('down', { status: 502 });
    });
    const error = await rejection(generatePresentation([file()], { config: config() }));
    expect([error.category, error.message, polls]).toEqual(['network', 'status polling kept failing', 6]);
  });

  it('aborting a run stops the polling loop', async () => {
    const controller = new AbortController();
    let polls = 0;
    service(async (input) => {
      if (isStart(input)) return json(started);
      polls++;
      if (polls === 2) controller.abort();
      return json({ state: 'running' });
    });
    expect((await rejection(generatePresentation([file()], { signal: controller.signal, config: config() }))).name).toBe('AbortError');
    expect(polls).toBeLessThanOrEqual(3);
  });

  it('a job that never settles gives up at the ceiling', async () => {
    let polls = 0;
    service(async (input) => {
      if (isStart(input)) return json(started);
      polls++;
      return json({ state: 'running' });
    });
    const error = await rejection(generatePresentation([file()], { config: config({ pollTimeoutMs: 20 }) }));
    expect([error.category, error.message]).toEqual(['network', 'job did not settle before the polling ceiling']);
    expect(polls).toBeGreaterThan(0);
  });

  /**
   * Runs on a virtual clock: Date.now() is controlled and every timer fires at once after advancing the clock
   * by its delay, so minutes of polling take milliseconds.
   */
  const onVirtualClock = async (fn: (clock: { now: number }) => Promise<void>) => {
    const realSetTimeout = globalThis.setTimeout;
    const clock = { now: 1_000_000 };
    vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
    vi.stubGlobal('setTimeout', (cb: () => void, ms = 0) => {
      clock.now += ms;
      return realSetTimeout(cb, 0);
    });
    await fn(clock);
  };

  it('long polls for the first 2 minutes, then a check every 5 seconds, never overlapping', async () => {
    await onVirtualClock(async (clock) => {
      const t0 = clock.now;
      const checks: { at: number; wait: number }[] = [];
      let inFlight = 0;
      let maxInFlight = 0;
      service(async (input) => {
        if (isStart(input)) return json(started);
        const wait = Number(new URL(input).searchParams.get('wait'));
        checks.push({ at: (clock.now - t0) / 1000, wait });
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        // the service holds a running job for the whole wait; a wait=0 check answers at once
        clock.now += wait ? wait * 1000 : 100;
        inFlight--;
        return checks.at(-1)!.at < 140 ? json({ state: 'running' }) : json(finished);
      });
      await generatePresentation([file()], { config: config({ pollMs: 10_000 }) }); // the shipped defaults
      // before 2:00: back-to-back long polls, the last one capped so it ends at 2:00
      expect(checks.slice(0, 6)).toEqual([
        { at: 0, wait: 20 },
        { at: 21, wait: 20 },
        { at: 42, wait: 20 },
        { at: 63, wait: 20 },
        { at: 84, wait: 20 },
        { at: 105, wait: 15 },
      ]);
      // after 2:00: an immediate check every 5 seconds until the deck is ready
      expect(checks.slice(6)).toEqual([
        { at: 125, wait: 0 },
        { at: 130, wait: 0 },
        { at: 135, wait: 0 },
        { at: 140, wait: 0 },
      ]);
      expect(maxInFlight).toBe(1); // status requests never overlap
    });
  });

  it('after 2 minutes a failed job still stops the 5-second checks at once', async () => {
    await onVirtualClock(async (clock) => {
      const t0 = clock.now;
      let checks = 0;
      service(async (input) => {
        if (isStart(input)) return json(started);
        checks++;
        const wait = Number(new URL(input).searchParams.get('wait'));
        clock.now += wait ? wait * 1000 : 100;
        return clock.now - t0 < 130_000 ? json({ state: 'running' }) : json({ state: 'failed', error: 'x' });
      });
      const error = await rejection(generatePresentation([file()], { config: config({ pollMs: 10_000 }) }));
      expect(error.message).toMatch(/job failed/);
      expect(checks).toBe(8); // six long polls, checks at 2:05 and 2:10, then nothing more
    });
  });
});

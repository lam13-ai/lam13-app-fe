import { env } from '@/lib/env';
import { getAccessToken } from './auth';

/**
 * The image→PowerPoint service (ported from the Kothar frontend's `services/presentationApi.ts`; the request,
 * polling, timeout and error handling are that implementation's, unchanged). It is a separate backend from
 * the chat API, reached at `VITE_PRESENTATION_ENDPOINT` — the service *base* URL.
 *
 * One documented contract, three calls off that base:
 *   POST /generate/pptx/deck/start   multipart "files" → { job_id, state, asked }
 *   GET  /generate/pptx/job/{id}?wait=20   long poll → state running|done|failed
 *   GET  /studio/download/{file_id}  the finished deck
 *
 * Callers get a PresentationResult or a thrown PresentationError — they never see status codes, JSON, or
 * backend wording.
 */

/** Discriminated so a future `{ kind: 'blob' }` result slots in beside it. */
export type PresentationResult = {
  kind: 'url';
  downloadUrl: string;
  fileName?: string;
  /** Slides in the file, and images sent. Lower when one image failed to convert. */
  slideCount?: number;
  asked?: number;
};

/** Where and how to reach the service. Defaults to the build's configuration; tests pass their own. */
export interface PresentationConfig {
  /** Base URL, no trailing slash. Empty = not configured. */
  endpoint: string;
  /** Send the signed-in user's bearer token (only when the service is configured to check it). */
  requireAuth: boolean;
  /** Wait before retrying a status check that failed transiently; also caps the gap between early long polls. */
  pollMs: number;
  /** Safety ceiling so a job that never settles cannot poll forever. */
  pollTimeoutMs: number;
}

/** Field name the service expects for each image. */
export const FILE_FIELD = 'files';

/** Seconds the service holds a poll open. Its documented range is 0–25. */
const WAIT_S = 20;

/**
 * Until a run reaches this age the long polls run back to back, so a fast deck or an early failure lands as
 * soon as it happens. From then on the job is checked every FAST_CHECK_MS with an immediate (wait=0) request.
 */
const FAST_CHECK_AFTER_MS = 120_000;
const FAST_CHECK_MS = 5_000;

const startUrl = (base: string) => `${base}/generate/pptx/deck/start`;
const jobUrl = (base: string, jobId: string, waitS: number) => `${base}/generate/pptx/job/${encodeURIComponent(jobId)}?wait=${waitS}`;
const downloadUrlFor = (base: string, fileId: string) => `${base}/studio/download/${encodeURIComponent(fileId)}`;

export type PresentationErrorCategory = 'network' | 'http' | 'malformed';

export class PresentationError extends Error {
  category: PresentationErrorCategory;

  /** `message` is development detail only — it is never rendered. */
  constructor(category: PresentationErrorCategory, message: string) {
    super(message);
    this.name = 'PresentationError';
    this.category = category;
  }
}

const asRecord = (data: unknown): Record<string, unknown> | null =>
  data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;

const text = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const count = (record: Record<string, unknown>, key: string) => {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

/** The start call answers with a job id and nothing else worth keeping. */
export function parseStartResponse(data: unknown): string {
  const record = asRecord(data);
  const jobId = record && text(record, 'job_id');
  if (!jobId) throw new PresentationError('malformed', 'start response carried no job_id');
  return jobId;
}

export type JobState = { state: 'pending' } | { state: 'completed'; result: PresentationResult } | { state: 'failed'; detail: string };

/**
 * Reads one poll. Anything other than a verdict counts as still working, so an unexpected payload waits
 * rather than failing the run.
 */
export function parseJobResponse(data: unknown, base: string): JobState {
  const record = asRecord(data);
  if (!record) return { state: 'pending' };
  const state = (text(record, 'state') ?? '').toLowerCase();

  if (state === 'failed') return { state: 'failed', detail: text(record, 'error') ?? text(record, 'detail') ?? 'failed' };
  if (state !== 'done') return { state: 'pending' };

  // "done" without a usable file is a failure, however the service labels it
  const fileId = text(record, 'file_id');
  if (!fileId || record.converted === false) return { state: 'failed', detail: text(record, 'detail') ?? 'the deck was not produced' };

  return {
    state: 'completed',
    result: {
      kind: 'url',
      downloadUrl: downloadUrlFor(base, fileId),
      // no fileName: the service names the file itself via Content-Disposition; the UI labels it for display
      slideCount: count(record, 'slide_count'),
      asked: count(record, 'asked'),
    },
  };
}

export type GenerateOptions = {
  signal?: AbortSignal;
  /** Defaults to the build's configuration (`env.presentation`). */
  config?: PresentationConfig;
};

/** Reads the error body only for the development detail — never for the user. */
const httpError = async (response: Response) => {
  const body = await response.text().catch(() => '');
  let detail = body;
  try {
    detail = (JSON.parse(body) as { detail?: string }).detail ?? body;
  } catch {
    // not JSON; the raw body is already the best detail available
  }
  return new PresentationError('http', `${response.status} ${String(detail).slice(0, 200)}`);
};

/** Starts one job for the images and polls it to its end. Aborting `signal` ends the request and the polling. */
export async function generatePresentation(files: File[], { signal, config = env.presentation }: GenerateOptions = {}): Promise<PresentationResult> {
  const base = config.endpoint.replace(/\/+$/, '');
  if (!base) throw new PresentationError('network', 'the presentation endpoint is not configured');

  const body = new FormData();
  // Content-Type is deliberately unset so the browser adds the multipart boundary.
  files.forEach((file) => body.append(FILE_FIELD, file, file.name));

  const headers: Record<string, string> = {};
  if (config.requireAuth) {
    // Never logged, never rendered, never persisted by this layer.
    const token = await getAccessToken();
    if (!token) throw new PresentationError('network', 'an access token is required but was unavailable');
    headers.Authorization = `Bearer ${token}`;
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(startUrl(base), { method: 'POST', body, signal, headers });
  } catch (error) {
    if (signal?.aborted) throw error; // the caller's abort, not a backend failure
    throw new PresentationError('network', String(error));
  }

  if (!response.ok) throw await httpError(response);

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PresentationError('malformed', 'response body was not valid JSON');
  }

  return pollJob(parseStartResponse(data), base, { signal, headers, startedAt, config });
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    });
  });

/** Consecutive transient failures tolerated before giving up. */
const MAX_TRANSIENT_FAILURES = 5;

/**
 * Polls one job until it completes or fails. There is a single loop per generation — it lives inside the
 * request promise the caller already owns, so aborting the run (cancel, start over, sign out, unmount, a new
 * generation) ends the polling too, and a stale job can never settle a newer run. The next check is only
 * ever made once the previous one has answered: status requests never overlap.
 */
async function pollJob(
  jobId: string,
  base: string,
  { signal, headers, startedAt, config }: { signal?: AbortSignal; headers: Record<string, string>; startedAt: number; config: PresentationConfig },
): Promise<PresentationResult> {
  const deadline = startedAt + config.pollTimeoutMs;
  let transient = 0;

  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() > deadline) throw new PresentationError('network', 'job did not settle before the polling ceiling');

    // Long polls before the switch, capped so none holds past it; quick checks after.
    const checkedAt = Date.now();
    const untilFast = startedAt + FAST_CHECK_AFTER_MS - checkedAt;
    const waitS = untilFast > 0 ? Math.min(WAIT_S, Math.ceil(untilFast / 1000)) : 0;

    let payload: unknown;
    try {
      const response = await fetch(jobUrl(base, jobId, waitS), { headers, signal });
      if (response.status >= 500) throw new Error(`status ${response.status}`);
      if (!response.ok) throw await httpError(response); // 404 means the job is gone: fatal
      payload = await response.json();
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof PresentationError) throw error;
      // a blip in the network or a 5xx is not a failed job
      if (++transient > MAX_TRANSIENT_FAILURES) throw new PresentationError('network', 'status polling kept failing');
      await wait(config.pollMs, signal);
      continue;
    }

    transient = 0;
    const state = parseJobResponse(payload, base);
    if (state.state === 'completed') return state.result;
    if (state.state === 'failed') throw new PresentationError('http', `job failed: ${state.detail}`);

    // Before the switch the server's wait does the throttling; the small gap only stops a hot loop if it
    // answers instantly. After it, checks start FAST_CHECK_MS apart — the next one only once this one has answered.
    const now = Date.now();
    const gap = now - startedAt < FAST_CHECK_AFTER_MS ? Math.min(1_000, config.pollMs) : Math.max(0, FAST_CHECK_MS - (waitS === 0 ? now - checkedAt : 0));
    await wait(gap, signal);
  }
}

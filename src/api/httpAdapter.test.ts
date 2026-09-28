import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessTokenGetter } from './auth';
import { isAbortError } from './errors';
import { createHttpAdapter } from './http';
import type { StreamEvent } from './stream';

/**
 * createHttpAdapter against a stubbed `fetch` (the API boundary): requests, auth, errors, upload and the
 * backend's real `POST /chat/stream` SSE format (lam13-app api/routers/chat.py `_sse()`).
 */

const TOKEN = 'test-token-not-real';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
}

function stubFetch(respond: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = { url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body };
    calls.push(call);
    return respond(call, calls.length - 1);
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** An SSE body delivered in the given chunks (frame boundaries anywhere). */
function sse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

const frame = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const start = (session = 'sess-1') => frame('start', { content: '', session_id: session, message_id: 'client-1', assistantMessageId: 'a-1' });
const sendBody = (content: string) => ({ client_message_id: 'client-1', kind: 'text' as const, content });

async function collect(stream: AsyncIterable<StreamEvent>) {
  const events: StreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

/** Stream responses for POST /chat/stream; session detail (after `done`) is not found. */
function streamBackend(chunks: string[]) {
  return stubFetch((call) => (call.url === '/chat/stream' ? sse(chunks) : json({ detail: 'Conversation not found' }, 404)));
}

let unregister: () => void;
beforeEach(() => {
  unregister = setAccessTokenGetter(async () => TOKEN);
});
afterEach(() => {
  unregister();
  vi.unstubAllGlobals();
});

describe('HTTP adapter — sessions and messages', () => {
  it('lists GET /chat/sessions with the bearer token, and sends none when signed out', async () => {
    const { calls } = stubFetch(() =>
      json([{ sessionId: 's2', title: 'Newer', createdAt: '2026-09-24T10:00:00', updatedAt: '2026-09-25T09:30:00', totalCost: 0 }]),
    );
    const page = await createHttpAdapter().conversations.list();
    expect(calls[0]).toMatchObject({ url: '/chat/sessions', method: 'GET' });
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(page).toEqual({
      items: [{ id: 's2', title: 'Newer', created_at: '2026-09-24T10:00:00', updated_at: '2026-09-25T09:30:00', last_message_preview: null }],
      next_cursor: null,
    });

    unregister();
    await createHttpAdapter().conversations.list();
    expect(calls[1]!.headers.Authorization).toBeUndefined();
  });

  it('retries once with a refreshed token after a 401', async () => {
    const seen: (boolean | undefined)[] = [];
    unregister();
    unregister = setAccessTokenGetter(async (options) => {
      seen.push(options?.forceRefresh);
      return TOKEN;
    });
    const { calls } = stubFetch((_call, i) => (i === 0 ? json({ detail: 'Token has expired.' }, 401) : json([])));
    await createHttpAdapter().conversations.list();
    expect(calls).toHaveLength(2);
    expect(seen).toEqual([false, true]);
  });

  it('renames with PATCH { title } and deletes with DELETE (ids encoded)', async () => {
    const { calls } = stubFetch((call) => (call.method === 'PATCH' ? json({ sessionId: 'a/b', title: 'Renamed' }) : json({ message: 'ok' })));
    const api = createHttpAdapter();
    expect(await api.conversations.rename('a/b', 'Renamed')).toMatchObject({ id: 'a/b', title: 'Renamed' });
    await api.conversations.remove('a/b');
    expect(calls[0]).toMatchObject({ url: '/chat/sessions/a%2Fb', method: 'PATCH', body: JSON.stringify({ title: 'Renamed' }) });
    expect(calls[0]!.headers['Content-Type']).toBe('application/json');
    expect(calls[1]).toMatchObject({ url: '/chat/sessions/a%2Fb', method: 'DELETE' });
  });

  it('loads a session’s messages newest first, mapping roles, statuses and documents', async () => {
    stubFetch(() =>
      json({
        sessionId: 's1',
        title: 'T',
        messages: [
          { id: 'u1', role: 'user', content: 'Hi', has_document: true, doc_name: 'brief.pdf' },
          { id: 'a1', role: 'assistant', content: '**Hello**', status: 'completed' },
          { id: 'a2', role: 'assistant', content: 'Part', status: 'generating' },
        ],
      }),
    );
    const page = await createHttpAdapter().messages.list('s1');
    expect(page.next_cursor).toBeNull();
    expect(page.items.map((m) => [m.id, m.role, m.status])).toEqual([
      ['a2', 'assistant', 'streaming'],
      ['a1', 'assistant', 'complete'],
      ['u1', 'user', 'complete'],
    ]);
    expect(page.items[2]!.attachments).toEqual([expect.objectContaining({ kind: 'document', filename: 'brief.pdf' })]);
  });
});

describe('HTTP adapter — one request per session load', () => {
  it('the conversation (header) and its messages, requested together, share one GET /chat/sessions/{id}', async () => {
    const detail = { sessionId: 's1', title: 'Growth plan', messages: [{ id: 'u1', role: 'user', content: 'Hi' }] };
    const { calls } = stubFetch(() => json(detail));
    const api = createHttpAdapter();

    const [conversation, page] = await Promise.all([api.conversations.get('s1'), api.messages.list('s1')]);
    expect(calls.filter((c) => c.url === '/chat/sessions/s1')).toHaveLength(1);
    expect(conversation).toMatchObject({ id: 's1', title: 'Growth plan' });
    expect(page.items.map((m) => m.id)).toEqual(['u1']);

    // Not a cache: once settled, the next load asks the server again.
    await api.messages.list('s1');
    expect(calls.filter((c) => c.url === '/chat/sessions/s1')).toHaveLength(2);
  });
});

describe('HTTP adapter — errors', () => {
  it.each([
    [400, { detail: 'Title is required' }, 'Title is required'],
    [404, { detail: 'Conversation not found' }, 'Conversation not found'],
    [422, { detail: [{ loc: ['body', 'title'], msg: 'Field required', type: 'missing' }] }, 'Field required'],
    [400, { detail: 'Traceback (most recent call last): File "/srv/app.py"' }, 'Request failed.'],
    [500, { detail: 'internal details' }, 'Something went wrong on our side. Please try again.'],
  ])('maps HTTP %i to a safe ApiError', async (status, body, message) => {
    stubFetch(() => json(body, status));
    await expect(createHttpAdapter().conversations.list()).rejects.toMatchObject({ name: 'ApiError', status, code: `http_${status}`, message });
  });

  it('turns a network failure into a status-0 error, and lets aborts through', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(createHttpAdapter().conversations.list()).rejects.toMatchObject({ status: 0, code: 'network_error', retryable: true });

    const controller = new AbortController();
    controller.abort();
    const error = await createHttpAdapter()
      .messages.send('s1', sendBody('x'), { signal: controller.signal })
      .catch((e: unknown) => e);
    expect(isAbortError(error)).toBe(true);
  });
});

describe('HTTP adapter — upload', () => {
  it('posts multipart `file` (+ `session_id`) and maps the response to a document attachment', async () => {
    const { calls } = stubFetch(() => json({ id: 'doc1', pdfName: 'brief.pdf', memoryStatus: 'pending', tokenCount: 0 }));
    const file = new Blob(['pdf-bytes'], { type: 'application/pdf' });
    const ref = await createHttpAdapter().attachments.upload({ file, filename: 'brief.pdf', conversation_id: 's1' });
    expect(calls[0]).toMatchObject({ url: '/chat/upload', method: 'POST' });
    const form = calls[0]!.body as FormData;
    expect((form.get('file') as File).name).toBe('brief.pdf');
    expect(form.get('session_id')).toBe('s1');
    expect(calls[0]!.headers['Content-Type']).toBeUndefined(); // the browser sets the boundary
    expect(ref).toMatchObject({ id: 'doc1', kind: 'document', filename: 'brief.pdf', size_bytes: 9 });
  });
});

describe('HTTP adapter — POST /chat/stream (real backend SSE)', () => {
  it('new chat: sends its own session_id (the message client id); the whole answer, with agent output, completes at done', async () => {
    const { calls } = streamBackend([
      start(),
      frame('response_started', { content: 'Generating response...' }),
      ': keep-alive\n\n',
      frame('thinking', { content: 'Let me think', source: 'chatbot', mode: 'token' }),
      frame('token', { content: 'Hello', source: 'chatbot' }),
      frame('token', { content: ' world', source: 'chatbot' }),
      frame('response_completed', { content: 'Response completed.' }),
      frame('postprocess_started', { content: 'Running post-processing...' }),
      frame('progress', { content: 'Drafting', source: 'eshmun' }),
      frame('token', { content: '  Agent report  ', source: 'eshmun' }),
      frame('postprocess_completed', { content: 'Post-processing complete.' }),
      frame('done', { content: '', session_id: 'sess-1', assistantMessageId: 'a-1', title: 'Greeting' }),
    ]);
    const events = await collect(await createHttpAdapter().messages.send(null, sendBody('Hi there')));

    expect(calls[0]).toMatchObject({ url: '/chat/stream', method: 'POST' });
    // Chosen client-side so a resend of the same message reaches the same session (no duplicate chat).
    expect(JSON.parse(calls[0]!.body as string)).toEqual({ session_id: 'client-1', message_id: 'client-1', user_message: 'Hi there' });
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(events.map((e) => e.event)).toEqual([
      'conversation.created',
      'message.created',
      'status', // response_started: generating
      'status', // thinking (its text is never forwarded; progress adds nothing)
      'delta',
      'delta',
      'delta', // post-processing: agent output appended after a blank line
      'conversation.updated', // done: the generated title…
      'done', // …and the whole answer
    ]);
    expect(events[0]).toMatchObject({ data: { id: 'sess-1', title: 'New conversation' } });
    expect(JSON.stringify(events)).not.toContain('Let me think');
    expect(JSON.stringify(events)).not.toContain('Drafting');
    expect(events[6]).toEqual({ event: 'delta', data: { message_id: 'a-1', text: '\n\nAgent report' } });
    expect(events[7]).toEqual({ event: 'conversation.updated', data: { id: 'sess-1', title: 'Greeting' } });
    expect(events[8]).toMatchObject({ data: { message: { id: 'a-1', status: 'complete', content: 'Hello world\n\nAgent report' } } });
  });

  it('continues an existing session with document ids, across fragmented CRLF frames', async () => {
    const whole = (start('s9') + frame('token', { content: 'Hé', source: 'chatbot' }) + frame('response_completed', {})).replace(/\n/g, '\r\n');
    const { calls } = streamBackend([whole.slice(0, 7), whole.slice(7, 60), whole.slice(60, 61), whole.slice(61)]);
    const events = await collect(await createHttpAdapter().messages.send('s9', { ...sendBody('Next'), attachment_ids: ['doc1'] }));
    expect(JSON.parse(calls[0]!.body as string)).toEqual({ session_id: 's9', message_id: 'client-1', user_message: 'Next', users_document_ids: ['doc1'] });
    expect(events.map((e) => e.event)).toEqual(['message.created', 'delta', 'done']);
    expect(events.at(-1)).toMatchObject({ data: { message: { content: 'Hé' } } });
  });

  it('keeps the partial answer and ends with a retryable error when the stream fails', async () => {
    streamBackend([
      start(),
      frame('token', { content: 'Partial', source: 'chatbot' }),
      frame('done', { session_id: 'sess-1', assistantMessageId: 'a-1', partial: true, recoveredContent: 'Partial' }),
      frame('error', { content: 'We encountered an issue processing your request.' }),
    ]);
    const events = await collect(await createHttpAdapter().messages.send('sess-1', sendBody('x')));
    expect(events.map((e) => e.event)).toEqual(['message.created', 'delta', 'error']);
    expect(events.at(-1)).toMatchObject({ data: { message: 'We encountered an issue processing your request.', retryable: true } });
  });

  it('ignores a post-processing failure after the answer completed', async () => {
    streamBackend([
      start(),
      frame('token', { content: 'Answer', source: 'chatbot' }),
      frame('response_completed', {}),
      frame('postprocess_failed', { content: 'Post-processing failed.' }),
      frame('done', { session_id: 'sess-1', partial: true }),
      frame('error', { content: 'We encountered an issue processing your request.' }),
    ]);
    const events = await collect(await createHttpAdapter().messages.send('sess-1', sendBody('x')));
    expect(events.map((e) => e.event)).toEqual(['message.created', 'delta', 'done']);
  });

  it('hides unsafe error text, skips malformed data and unknown events', async () => {
    streamBackend([start(), 'event: token\ndata: {not json\n\n', frame('brand_new', { a: 1 }), frame('error', { content: 'line one\nTraceback' })]);
    const events = await collect(await createHttpAdapter().messages.send('s1', sendBody('x')));
    expect(events.map((e) => e.event)).toEqual(['message.created', 'error']);
    expect(events[1]).toMatchObject({ data: { message: 'We encountered an issue processing your request.' } });
  });

  it('rejects before the stream opens with the backend’s HTTP error', async () => {
    stubFetch(() => json({ detail: 'user_message is required.' }, 400));
    await expect(createHttpAdapter().messages.send(null, sendBody('x'))).rejects.toMatchObject({ status: 400, message: 'user_message is required.' });
  });
});

describe('HTTP adapter — capabilities', () => {
  it('declares what the backend lacks and rejects those calls with 501', async () => {
    const { fetch } = stubFetch(() => json({}));
    const api = createHttpAdapter();
    expect(api.capabilities).toEqual({ regenerate: false, voiceNotes: false, transcription: false });
    await expect(api.audio.transcribe({ file: new Blob(), duration_ms: 1000 })).rejects.toMatchObject({ status: 501 });
    await expect(api.messages.regenerate('s', 'm')).rejects.toMatchObject({ status: 501, code: 'not_supported' });
    await expect(api.messages.send('s', { client_message_id: 'c', kind: 'voice', audio_id: 'x' })).rejects.toMatchObject({ status: 501 });
    await expect(api.audio.upload({ file: new Blob(), duration_ms: 1000 })).rejects.toMatchObject({ status: 501 });
    await expect(api.messages.cancel('s', 'm')).resolves.toBeUndefined();
    expect(await api.models.list()).toEqual({ items: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('HTTP adapter — My Contacts (/contacts)', () => {
  const contact = {
    id: '66f0c0ffee',
    full_name: 'Daniel Brandt',
    position: 'CFO',
    company: 'Harbor & Finch',
    description: null,
    email: 'd.brandt@harborfinch.example',
    phone: null,
    linkedin: null,
    current_version: 3,
    created_at: '2026-09-20T10:00:00',
    updated_at: '2026-09-27T09:30:00',
  };
  const suggestion = (over: Record<string, unknown> = {}) => ({
    id: 'sug1',
    contact_id: '66f0c0ffee',
    kind: 'update',
    status: 'pending',
    suggested: { position: 'Chief Financial Officer', phone: '+1 555 0142', linkedin: null },
    applied: {},
    reason: 'Mentioned in the meeting',
    source: { type: 'meeting', ref_id: 'm-9', title: 'Q4 board prep', occurred_at: null },
    base_version: 3,
    resolved_version: null,
    created_at: '2026-09-27T09:00:00',
    resolved_at: null,
    ...over,
  });
  const profile = {
    id: '66f0c0ffee',
    full_name: 'Daniel Brandt',
    position: 'CFO',
    company: 'Harbor & Finch',
    description: '',
    email: 'd.brandt@harborfinch.example',
    phone: null,
    linkedin: null,
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-27T09:30:00Z',
  };

  it('list: GET /contacts, mapped to the UI profile (missing text fields become empty strings)', async () => {
    const { calls } = stubFetch(() => json([{ ...contact, pending_suggestions: 1 }]));
    const page = await createHttpAdapter().profiles.list({ limit: 100 });
    expect(calls[0]).toMatchObject({ url: '/contacts', method: 'GET' });
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(page).toEqual({ items: [profile], next_cursor: null });
  });

  it('create / update / delete: POST /contacts, PATCH and DELETE /contacts/{id}', async () => {
    const { calls } = stubFetch((call) =>
      call.method === 'DELETE' ? new Response(null, { status: 204 }) : json(call.method === 'POST' ? contact : { ...contact, position: 'Chief Financial Officer' }, call.method === 'POST' ? 201 : 200),
    );
    const api = createHttpAdapter();
    const body = { full_name: 'Daniel Brandt', position: 'CFO', company: 'Harbor & Finch', description: '', email: 'd.brandt@harborfinch.example', phone: null, linkedin: null };

    expect(await api.profiles.create(body)).toEqual(profile);
    expect(calls[0]).toMatchObject({ url: '/contacts', method: 'POST' });
    expect(JSON.parse(calls[0]!.body as string)).toEqual(body);

    expect((await api.profiles.update('66f0c0ffee', { ...body, position: 'Chief Financial Officer' })).position).toBe('Chief Financial Officer');
    expect(calls[1]).toMatchObject({ url: '/contacts/66f0c0ffee', method: 'PATCH' });

    await expect(api.profiles.delete('66f0c0ffee')).resolves.toBeUndefined();
    expect(calls[2]).toMatchObject({ url: '/contacts/66f0c0ffee', method: 'DELETE' });
  });

  it('pending suggestions: GET /contacts/suggestions?status=pending, as Current-vs-Suggested changes; new-contact proposals are left out', async () => {
    const { calls } = stubFetch(() => json([suggestion(), suggestion({ id: 'sug2', kind: 'create', contact_id: null, suggested: { full_name: 'New Person' } })]));
    const { items } = await createHttpAdapter().profileSuggestions.list({ status: 'pending' });
    expect(calls[0]).toMatchObject({ url: '/contacts/suggestions?status=pending', method: 'GET' });
    expect(items).toEqual([
      {
        id: 'sug1',
        profile_id: '66f0c0ffee',
        source_type: 'meeting',
        source_id: 'm-9',
        source_title: 'Q4 board prep',
        created_at: '2026-09-27T09:00:00Z',
        status: 'pending',
        changes: [
          { field: 'position', to: 'Chief Financial Officer' },
          { field: 'phone', to: '+1 555 0142' },
          { field: 'linkedin', to: null },
        ],
      },
    ]);
  });

  it('approve applies the suggestion as proposed (no body) and returns the updated contact; reject leaves it', async () => {
    const { calls } = stubFetch((call) =>
      call.url.endsWith('/approve')
        ? json({ suggestion: suggestion({ status: 'approved' }), contact: { ...contact, position: 'Chief Financial Officer' } })
        : json(suggestion({ status: 'rejected' })),
    );
    const api = createHttpAdapter();

    const approved = await api.profileSuggestions.approve('sug1');
    expect(calls[0]).toMatchObject({ url: '/contacts/suggestions/sug1/approve', method: 'POST', body: undefined });
    expect(approved.suggestion.status).toBe('approved');
    expect(approved.profile).toEqual({ ...profile, position: 'Chief Financial Officer' });

    expect((await api.profileSuggestions.reject('sug1')).status).toBe('rejected');
    expect(calls[1]).toMatchObject({ url: '/contacts/suggestions/sug1/reject', method: 'POST' });
  });

  it('reads offset-less timestamps as UTC, and leaves offset-aware ones alone', async () => {
    stubFetch(() => json([{ ...contact, created_at: '2026-09-20T10:00:00.123456', updated_at: '2026-09-27T09:30:00+05:00' }]));
    const [p] = (await createHttpAdapter().profiles.list()).items;
    expect(p!.created_at).toBe('2026-09-20T10:00:00.123456Z');
    expect(p!.updated_at).toBe('2026-09-27T09:30:00+05:00');
  });

  it('surfaces the backend reasons: 404 / 409 / field validation', async () => {
    const responses = [
      json({ detail: 'Pending suggestion not found.' }, 404),
      json({ detail: 'Contact was changed elsewhere. Reload and try again.' }, 409),
      json({ detail: [{ msg: 'value is not a valid email address' }] }, 422),
    ];
    stubFetch((_call, i) => responses[i]!);
    const api = createHttpAdapter();
    await expect(api.profileSuggestions.approve('gone')).rejects.toMatchObject({ status: 404, message: 'Pending suggestion not found.' });
    await expect(api.profiles.update('66f0c0ffee', { position: 'X' })).rejects.toMatchObject({ status: 409, message: 'Contact was changed elsewhere. Reload and try again.' });
    await expect(api.profiles.create({ ...profile, email: 'nope' })).rejects.toMatchObject({ status: 422, message: 'value is not a valid email address' });
  });
});

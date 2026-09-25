import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors';
import type { StreamEvent } from '../stream';
import { createMockAdapter, INSTANT_TIMING } from './mockAdapter';

const adapter = () => createMockAdapter({ timing: INSTANT_TIMING, random: () => 0.5 });

async function collect(stream: AsyncIterable<StreamEvent>) {
  const events: StreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const body = (content: string, id = 'client-1') => ({ client_message_id: id, kind: 'text' as const, content });

describe('mock adapter — conversations', () => {
  it('lists newest first with cursor pagination and 404s unknown ids', async () => {
    const api = adapter();
    const first = await api.conversations.list({ limit: 2 });
    expect(first.items.map((c) => c.id)).toEqual(['national-ai-strategy', 'growth-plan-stress-test']);
    expect(first.next_cursor).toBe('2');

    const rest = await api.conversations.list({ cursor: first.next_cursor, limit: 10 });
    expect(rest.items).toHaveLength(3);
    expect(rest.next_cursor).toBeNull();

    await expect(api.conversations.get('missing')).rejects.toMatchObject({ status: 404, code: 'conversation_not_found' });
  });

  it('renames with validation and deletes', async () => {
    const api = adapter();
    await expect(api.conversations.rename('water-security-kpis', '  ')).rejects.toBeInstanceOf(ApiError);
    expect((await api.conversations.rename('water-security-kpis', 'Water KPIs')).title).toBe('Water KPIs');
    await api.conversations.remove('water-security-kpis');
    await expect(api.conversations.get('water-security-kpis')).rejects.toMatchObject({ status: 404 });
  });

  it('returns detached copies (callers cannot mutate the store)', async () => {
    const api = adapter();
    const c = await api.conversations.get('water-security-kpis');
    c.title = 'mutated';
    expect((await api.conversations.get('water-security-kpis')).title).toBe('Water security KPIs');
  });
});

describe('mock adapter — messages', () => {
  it('pages history newest-first with a `before` cursor', async () => {
    const api = adapter();
    const page1 = await api.messages.list('national-ai-strategy', { limit: 20 });
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0]?.role).toBe('assistant'); // newest first
    const page2 = await api.messages.list('national-ai-strategy', { before: page1.next_cursor, limit: 20 });
    expect(page2.items).toHaveLength(8);
    expect(page2.next_cursor).toBeNull();
  });

  it('streams the contract sequence for a lazily created conversation and persists it', async () => {
    const api = adapter();
    const events = await collect(await api.messages.send(null, body('Draft KPIs for digital services')));
    const names = events.map((e) => e.event);

    expect(names.slice(0, 4)).toEqual(['conversation.created', 'message.created', 'status', 'status']);
    expect(names.at(-2)).toBe('conversation.updated');
    expect(names.at(-1)).toBe('done');

    const done = events.at(-1) as Extract<StreamEvent, { event: 'done' }>;
    const text = events.flatMap((e) => (e.event === 'delta' ? [e.data.text] : [])).join('');
    expect(done.data.message.content).toBe(text);
    expect(text).toContain('| KPI |');

    const created = events[0] as Extract<StreamEvent, { event: 'conversation.created' }>;
    const saved = await api.conversations.get(created.data.id);
    expect(saved.title).toBe('Draft KPIs for digital services');
    expect((await api.messages.list(saved.id)).items.map((m) => m.status)).toEqual(['complete', 'complete']);
  });

  it('rejects before streaming for empty content, simulated failure and duplicates', async () => {
    const api = adapter();
    await expect(api.messages.send('water-security-kpis', body('   '))).rejects.toMatchObject({ status: 422 });
    await expect(api.messages.send('water-security-kpis', body('hello /fail'))).rejects.toMatchObject({ status: 503 });

    await collect(await api.messages.send('water-security-kpis', body('hi', 'dup')));
    await expect(api.messages.send('water-security-kpis', body('hi', 'dup'))).rejects.toMatchObject({ status: 409 });
  });

  it('fails mid-stream with /error, keeping the partial answer, and regenerates successfully', async () => {
    const api = adapter();
    const events = await collect(await api.messages.send('water-security-kpis', body('Assess risks /error')));
    expect(events.at(-1)).toMatchObject({ event: 'error', data: { retryable: true } });
    const partial = events.flatMap((e) => (e.event === 'delta' ? [e.data.text] : [])).join('');
    expect(partial.length).toBeGreaterThan(0);

    const created = events.find((e) => e.event === 'message.created') as Extract<StreamEvent, { event: 'message.created' }>;
    const assistantId = created.data.assistant_message.id;
    const [stored] = (await api.messages.list('water-security-kpis', { limit: 1 })).items;
    expect(stored).toMatchObject({ id: assistantId, status: 'error', content: partial });

    const retry = await collect(await api.messages.regenerate('water-security-kpis', assistantId));
    expect(retry.at(-1)).toMatchObject({ event: 'done', data: { message: { id: assistantId, status: 'complete' } } });
  });

  it('marks the answer cancelled with partial content when the client disconnects', async () => {
    const api = createMockAdapter({ timing: { ...INSTANT_TIMING, token: [2, 2], chunk: [3, 3] } });
    const controller = new AbortController();
    const stream = await api.messages.send('water-security-kpis', body('Tell me more'), { signal: controller.signal });
    let assistantId = '';
    await expect(async () => {
      for await (const event of stream) {
        if (event.event === 'message.created') assistantId = event.data.assistant_message.id;
        if (event.event === 'delta') controller.abort();
      }
    }).rejects.toMatchObject({ name: 'AbortError' });

    // Let the server loop observe the disconnect.
    await new Promise((r) => setTimeout(r, 20));
    const [stored] = (await api.messages.list('water-security-kpis', { limit: 1 })).items;
    expect(stored).toMatchObject({ id: assistantId, status: 'cancelled' });
    expect(stored?.content.length).toBeGreaterThan(0);
  });
});

describe('mock adapter — audio & voice messages', () => {
  const audioBlob = (type = 'audio/webm;codecs=opus', bytes = 'voice-bytes') => new Blob([bytes], { type });

  it('uploads audio with validation and returns a playable reference', async () => {
    const api = adapter();
    const ref = await api.audio.upload({ file: audioBlob(), duration_ms: 4200, peaks: [0.2, 1.5, -1] });
    expect(ref).toMatchObject({ mime_type: 'audio/webm', duration_ms: 4200, peaks: [0.2, 1, 0] });
    expect(ref.url).toMatch(/^blob:/);
    expect(await api.audio.get(ref.id)).toEqual(ref);

    await expect(api.audio.upload({ file: audioBlob(), duration_ms: 200 })).rejects.toMatchObject({ status: 422, code: 'audio_too_short' });
    await expect(api.audio.upload({ file: audioBlob('video/mp4'), duration_ms: 4000 })).rejects.toMatchObject({ status: 415 });
    await expect(api.audio.upload({ file: audioBlob(), duration_ms: 6 * 60_000 })).rejects.toMatchObject({ code: 'audio_too_long' });
    await expect(api.audio.get('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('can simulate upload failure', async () => {
    const api = createMockAdapter({ timing: INSTANT_TIMING, failAudioUploads: true });
    await expect(api.audio.upload({ file: audioBlob(), duration_ms: 3000 })).rejects.toMatchObject({ status: 503, code: 'upload_failed' });
  });

  it('sends a voice message: message.created (voice) → transcript → streamed answer', async () => {
    const api = adapter();
    const ref = await api.audio.upload({ file: audioBlob(), duration_ms: 3000 });
    const events = await collect(await api.messages.send('water-security-kpis', { client_message_id: 'v1', kind: 'voice', audio_id: ref.id }));

    const created = events.find((e) => e.event === 'message.created') as Extract<StreamEvent, { event: 'message.created' }>;
    expect(created.data.user_message).toMatchObject({ kind: 'voice', content: '', audio: { id: ref.id } });

    const transcript = events.find((e) => e.event === 'transcript') as Extract<StreamEvent, { event: 'transcript' }>;
    expect(transcript.data.message_id).toBe(created.data.user_message.id);
    expect(transcript.data.text.length).toBeGreaterThan(10);
    expect(events.at(-1)?.event).toBe('done');

    const [, user] = (await api.messages.list('water-security-kpis', { limit: 2 })).items;
    expect(user).toMatchObject({ kind: 'voice', content: transcript.data.text });
  });

  it('rejects a voice message for unknown audio', async () => {
    const api = adapter();
    await expect(api.messages.send('water-security-kpis', { client_message_id: 'v2', kind: 'voice', audio_id: 'nope' })).rejects.toMatchObject({
      status: 404,
      code: 'audio_not_found',
    });
  });
});

describe('mock adapter — backend-ready contracts', () => {
  it('accepts feedback only on completed answers, and a regenerated answer starts unrated', async () => {
    const api = adapter();
    const [answer, question] = (await api.messages.list('water-security-kpis')).items;
    expect(await api.messages.setFeedback('water-security-kpis', answer!.id, 'down')).toEqual({ message_id: answer!.id, rating: 'down' });
    await expect(api.messages.setFeedback('water-security-kpis', question!.id, 'up')).rejects.toMatchObject({ status: 422 });
    await expect(api.messages.setFeedback('water-security-kpis', 'missing', 'up')).rejects.toMatchObject({ status: 404 });

    await collect(await api.messages.regenerate('water-security-kpis', answer!.id));
    expect((await api.messages.list('water-security-kpis')).items[0]!.feedback).toBeNull();
  });

  it('never invents artifacts: lookups report not found until a backend generates them', async () => {
    const api = adapter();
    await expect(api.artifacts.get('ar_1')).rejects.toMatchObject({ status: 404, code: 'artifact_not_found' });
    await expect(api.artifacts.download('ar_1')).rejects.toMatchObject({ status: 404 });
  });
});


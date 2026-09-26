import { describe, expect, it } from 'vitest';
import type { StreamEvent } from '@/api';
import type { Artifact, Message } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { applyStreamEvent, type StreamDraft } from './applyStreamEvent';

const message = (over: Partial<MessageView>): MessageView => ({
  id: 'x',
  conversation_id: 'c1',
  client_message_id: null,
  role: 'assistant',
  kind: 'text',
  content: '',
  audio: null,
  call: null,
  status: 'streaming',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

const initial: StreamDraft = {
  conversationId: 'c1',
  user: message({ id: 'local:u', client_message_id: 'u', role: 'user', content: 'Hi', status: 'complete' }),
  assistant: message({ id: 'local:a:u', local_key: 'local:a:u' }),
  status: 'sending',
  error: null,
  title: null,
};

const run = (events: StreamEvent[], draft = initial) => events.reduce(applyStreamEvent, draft);

const serverUser = message({ id: 'm1', client_message_id: 'u', role: 'user', content: 'Hi', status: 'complete' }) as Message;
const serverAssistant = message({ id: 'm2' }) as Message;

describe('applyStreamEvent', () => {
  it('reconciles server ids while keeping the local key', () => {
    const draft = run([{ event: 'message.created', data: { user_message: serverUser, assistant_message: serverAssistant } }]);
    expect(draft.user?.id).toBe('m1');
    expect(draft.assistant).toMatchObject({ id: 'm2', local_key: 'local:a:u' });
  });

  it('tracks status and accumulates deltas for the current assistant only', () => {
    const draft = run([
      { event: 'message.created', data: { user_message: serverUser, assistant_message: serverAssistant } },
      { event: 'status', data: { state: 'thinking' } },
      { event: 'delta', data: { message_id: 'm2', text: '## Ti' } },
      { event: 'delta', data: { message_id: 'other', text: 'IGNORED' } },
      { event: 'delta', data: { message_id: 'm2', text: 'tle' } },
      // Reasoning interleaved with the answer (real backend `thinking` after `token`): stays answering.
      { event: 'status', data: { state: 'thinking' } },
    ]);
    expect(draft.status).toBe('answering');
    expect(draft.assistant.content).toBe('## Title');
  });

  it('takes the final message from done as authoritative', () => {
    const draft = run([
      { event: 'message.created', data: { user_message: serverUser, assistant_message: serverAssistant } },
      { event: 'delta', data: { message_id: 'm2', text: 'partial' } },
      { event: 'done', data: { message: { ...serverAssistant, content: 'final', status: 'complete' } } },
    ]);
    expect(draft).toMatchObject({ status: 'done', assistant: { content: 'final', status: 'complete', local_key: 'local:a:u' } });
  });

  it('marks cancelled from a cancelled done, and errors keep partial content', () => {
    const cancelled = run([
      { event: 'message.created', data: { user_message: serverUser, assistant_message: serverAssistant } },
      { event: 'done', data: { message: { ...serverAssistant, content: 'part', status: 'cancelled' } } },
    ]);
    expect(cancelled.status).toBe('cancelled');

    const errored = run([
      { event: 'message.created', data: { user_message: serverUser, assistant_message: serverAssistant } },
      { event: 'delta', data: { message_id: 'm2', text: 'partial' } },
      { event: 'error', data: { code: 'upstream_unavailable', message: 'Interrupted', retryable: true } },
    ]);
    expect(errored).toMatchObject({ status: 'error', error: { code: 'upstream_unavailable' }, assistant: { content: 'partial', status: 'error' } });
  });

  it('records lazy creation and auto-title', () => {
    const draft = run([
      { event: 'conversation.created', data: { id: 'c9', title: 'New', created_at: '', updated_at: '', last_message_preview: null } },
      { event: 'conversation.updated', data: { id: 'c9', title: 'Better title' } },
    ]);
    expect(draft).toMatchObject({ conversationId: 'c9', title: 'Better title' });
  });

  it('upserts streamed artifacts on the answer by id, in order, through progress → ready / error', () => {
    const created = run([{ event: 'message.created', data: { user_message: serverUser, assistant_message: serverAssistant } }]);
    const artifact = (over: Partial<Artifact>): Artifact => ({
      id: 'ar1',
      conversation_id: 'c1',
      message_id: 'm2',
      type: 'pptx',
      filename: 'Board deck.pptx',
      status: 'queued',
      progress: null,
      download: null,
      error: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...over,
    });

    const draft = run(
      [
        { event: 'artifact', data: artifact({}) },
        { event: 'artifact', data: artifact({ id: 'ar2', type: 'xlsx', filename: 'Model.xlsx', status: 'processing', progress: 0.2 }) },
        { event: 'artifact', data: artifact({ status: 'ready', progress: 1, download: { url: 'https://files.example/deck', expires_at: null } }) },
        { event: 'artifact', data: artifact({ id: 'ar2', type: 'xlsx', filename: 'Model.xlsx', status: 'error', error: { code: 'failed', message: 'Generation failed.', retryable: true } }) },
        // Another message's artifact is ignored.
        { event: 'artifact', data: artifact({ id: 'ar3', message_id: 'other' }) },
      ],
      created,
    );
    expect(draft.assistant.artifacts?.map((a) => [a.id, a.status])).toEqual([
      ['ar1', 'ready'],
      ['ar2', 'error'],
    ]);
    expect(draft.assistant.artifacts?.[0]?.download?.url).toBe('https://files.example/deck');
  });

  it('accumulates live reasoning, closes it at the first answer word, tracks progress, and keeps both through done', () => {
    const created = run([{ event: 'message.created', data: { user_message: serverUser, assistant_message: serverAssistant } }]);
    const thinking = run(
      [
        { event: 'reasoning', data: { message_id: 'm2', text: 'Weigh ' } },
        { event: 'reasoning', data: { message_id: 'm2', text: 'options' } },
        { event: 'reasoning', data: { message_id: 'other', text: 'ignored' } },
      ],
      created,
    );
    expect(thinking.assistant.reasoning).toEqual({ text: 'Weigh options', startedAt: expect.any(Number) });

    const answering = run([{ event: 'delta', data: { message_id: 'm2', text: 'Answer' } }], thinking);
    expect(answering.assistant.reasoning?.endedAt).toEqual(expect.any(Number));

    const done = run(
      [
        { event: 'progress', data: { message_id: 'm2', text: 'Building framework pillars' } },
        { event: 'done', data: { message: message({ id: 'm2', content: 'Answer', status: 'complete' }) as Message } },
      ],
      answering,
    );
    expect(done.assistant).toMatchObject({
      content: 'Answer',
      status: 'complete',
      local_key: 'local:a:u',
      progress: 'Building framework pillars',
      reasoning: { text: 'Weigh options', endedAt: expect.any(Number) },
    });
  });
});

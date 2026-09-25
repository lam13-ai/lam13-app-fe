import type { AttachmentRef, AudioRef, Conversation, Message } from '@/types/api';
import { ApiError, isAbortError } from '../errors';
import { ATTACHMENT_LIMITS } from '../limits';
import type {
  ApiAdapter,
  AttachmentUploadInput,
  AudioUploadInput,
  MessageListParams,
  ListParams,
  SendMessageBody,
  StreamOptions,
} from '../services';
import { readEventStream, type EventStream } from '../stream';
import { createSeed, MOCK_MODELS } from './fixtures';
import { composeReply, deriveTitle } from './responder';
import { createEventBody, type EventWriter } from './sseEncoder';
import { mockTranscribe } from './transcripts';
import { between, clone, sleep, type Range } from './utils';

export interface MockTiming {
  /** Request latency before a response (or the stream) starts. */
  request: Range;
  /** "Thinking" time before the first token. */
  think: Range;
  /** Delay between streamed chunks. */
  token: Range;
  /** Characters per streamed chunk. */
  chunk: Range;
  /** Audio upload latency. */
  upload: Range;
  /** Mock transcription time before the `transcript` event. */
  transcribe: Range;
}

/** ≈160 chars/s — matches the reference demo's measured streaming speed. */
export const REALISTIC_TIMING: MockTiming = {
  request: [250, 650],
  think: [500, 1100],
  token: [16, 36],
  chunk: [2, 7],
  upload: [500, 1200],
  transcribe: [700, 1400],
};
export const INSTANT_TIMING: MockTiming = {
  request: [0, 0],
  think: [0, 0],
  token: [0, 0],
  chunk: [40, 80],
  upload: [0, 0],
  transcribe: [0, 0],
};

export interface MockAdapterOptions {
  timing?: MockTiming;
  random?: () => number;
  now?: () => number;
  /** Makes every audio upload fail with a 503 (to exercise the upload-failed UI). */
  failAudioUploads?: boolean;
  /** Makes every feedback request fail with a 503 (to exercise rollback). */
  failFeedback?: boolean;
}

/**
 * Prompt directives for exercising failure paths in the UI:
 * - `/fail`  → the request is rejected before the stream opens (503).
 * - `/error` → the stream fails part-way (first attempt only; Retry succeeds).
 */
export const SIMULATE_REQUEST_FAILURE = '/fail';
export const SIMULATE_STREAM_ERROR = '/error';

const DEFAULT_PAGE = 20;

/** Upload limits mirrored from api-contract.md §4.4 (the real backend enforces its own). */
export const AUDIO_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  minDurationMs: 500,
  maxDurationMs: 5 * 60_000 + 2_000,
  mimeTypes: ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav'],
};

/** In-memory implementation of the API contract, including SSE streaming. */
export function createMockAdapter(options: MockAdapterOptions = {}): ApiAdapter {
  const timing = options.timing ?? REALISTIC_TIMING;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;

  const seed = createSeed(now());
  const conversations: Conversation[] = seed.conversations;
  const messagesByConversation = seed.messages;
  /** Generations in progress, by assistant message id (for the cancel endpoint). */
  const running = new Map<string, AbortController>();
  /** Regeneration count per assistant message (varies the answer). */
  const attempts = new Map<string, number>();
  /**
   * MOCK audio storage: uploaded blobs are served from local object URLs, standing in for the
   * backend's storage / signed URLs. Nothing leaves the browser.
   */
  const audioStore = new Map<string, AudioRef>();
  /** MOCK image storage, same approach as audio: local object URLs, nothing leaves the browser. */
  const attachmentStore = new Map<string, AttachmentRef>();
  let counter = 0;
  let transcripts = 0;

  const newId = (prefix: string) => `${prefix}_${now().toString(36)}${(++counter).toString(36)}`;
  const iso = () => new Date(now()).toISOString();
  const respond = (signal?: AbortSignal) => sleep(between(random, timing.request), signal);

  function findConversation(id: string): Conversation {
    const conversation = conversations.find((c) => c.id === id);
    if (!conversation) throw new ApiError(404, 'conversation_not_found', 'This conversation does not exist.');
    return conversation;
  }

  function messagesOf(id: string): Message[] {
    findConversation(id);
    let list = messagesByConversation.get(id);
    if (!list) {
      list = [];
      messagesByConversation.set(id, list);
    }
    return list;
  }

  function touch(conversation: Conversation, preview: string) {
    conversation.updated_at = iso();
    conversation.last_message_preview = preview.slice(0, 80);
  }

  interface Generation {
    writer: EventWriter;
    disconnected: AbortSignal;
    conversation: Conversation;
    assistant: Message;
    reply: string;
    /** Character offset at which the stream fails, or null. */
    failAt: number | null;
    /** Auto-title to announce, or null. */
    title: string | null;
  }

  /** Server-side generation loop: status → deltas → done / error; persists as it goes. */
  async function generate({ writer, disconnected, conversation, assistant, reply, failAt, title }: Generation) {
    const cancelled = new AbortController();
    running.set(assistant.id, cancelled);
    const stop = () => cancelled.abort();
    disconnected.addEventListener('abort', stop, { once: true });

    try {
      writer.emit({ event: 'status', data: { state: 'thinking' } });
      writer.ping();
      await sleep(between(random, timing.think), cancelled.signal);
      writer.emit({ event: 'status', data: { state: 'answering' } });

      let offset = 0;
      while (offset < reply.length) {
        const size = Math.max(1, Math.round(between(random, timing.chunk)));
        const text = reply.slice(offset, offset + size);
        await sleep(between(random, timing.token), cancelled.signal);
        if (failAt !== null && offset + text.length >= failAt) {
          assistant.status = 'error';
          writer.emit({
            event: 'error',
            data: { code: 'upstream_unavailable', message: 'The response was interrupted.', retryable: true },
          });
          return;
        }
        offset += text.length;
        assistant.content += text;
        writer.emit({ event: 'delta', data: { message_id: assistant.id, text } });
      }

      assistant.status = 'complete';
      touch(conversation, assistant.content);
      if (title) {
        conversation.title = title;
        writer.emit({ event: 'conversation.updated', data: { id: conversation.id, title } });
      }
      writer.emit({
        event: 'done',
        data: {
          message: clone(assistant),
          usage: { input_tokens: 120, output_tokens: Math.ceil(assistant.content.length / 4) },
        },
      });
    } catch (error) {
      if (!isAbortError(error)) throw error;
      assistant.status = 'cancelled';
      // Cancelled via the cancel endpoint while the client is still connected.
      if (!disconnected.aborted) writer.emit({ event: 'done', data: { message: clone(assistant) } });
    } finally {
      disconnected.removeEventListener('abort', stop);
      running.delete(assistant.id);
    }
  }

  function stream(run: (writer: EventWriter, disconnected: AbortSignal) => Promise<void>, signal?: AbortSignal): EventStream {
    return readEventStream(createEventBody(run, random), signal);
  }

  return {
    conversations: {
      async list({ cursor, limit = DEFAULT_PAGE }: ListParams = {}) {
        await respond();
        const sorted = [...conversations].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
        const start = cursor ? Number(cursor) : 0;
        const end = start + limit;
        return { items: clone(sorted.slice(start, end)), next_cursor: end < sorted.length ? String(end) : null };
      },

      async get(id) {
        await respond();
        return clone(findConversation(id));
      },

      async create({ title }) {
        await respond();
        const conversation: Conversation = {
          id: newId('c'),
          title: title?.trim() || 'New conversation',
          created_at: iso(),
          updated_at: iso(),
          last_message_preview: null,
        };
        conversations.unshift(conversation);
        messagesByConversation.set(conversation.id, []);
        return clone(conversation);
      },

      async rename(id, title) {
        await respond();
        const conversation = findConversation(id);
        const trimmed = title.trim();
        if (!trimmed) {
          throw new ApiError(422, 'validation_error', 'Title cannot be empty.', { details: { title: 'required' } });
        }
        conversation.title = trimmed.slice(0, 120);
        return clone(conversation);
      },

      async remove(id) {
        await respond();
        const index = conversations.indexOf(findConversation(id));
        conversations.splice(index, 1);
        for (const message of messagesByConversation.get(id) ?? []) {
          if (message.audio && audioStore.delete(message.audio.id)) URL.revokeObjectURL(message.audio.url);
        }
        messagesByConversation.delete(id);
      },
    },

    messages: {
      async list(conversationId, { before, limit = DEFAULT_PAGE }: MessageListParams = {}) {
        await respond();
        const newestFirst = [...messagesOf(conversationId)].reverse();
        let start = 0;
        if (before) {
          const index = newestFirst.findIndex((m) => m.id === before);
          if (index === -1) throw new ApiError(400, 'invalid_cursor', 'Unknown pagination cursor.');
          start = index + 1;
        }
        const items = newestFirst.slice(start, start + limit);
        const hasMore = start + limit < newestFirst.length;
        return { items: clone(items), next_cursor: hasMore ? (items.at(-1)?.id ?? null) : null };
      },

      async send(conversationId: string | null, body: SendMessageBody, { signal }: StreamOptions = {}) {
        await respond(signal);
        let content = '';
        let audio: AudioRef | null = null;
        let attachments: AttachmentRef[] | undefined;
        if (body.kind === 'voice') {
          const stored = audioStore.get(body.audio_id);
          if (!stored) throw new ApiError(404, 'audio_not_found', 'This recording is no longer available.');
          audio = stored;
        } else {
          content = body.content.trim();
          if (!content) throw new ApiError(422, 'validation_error', 'Message cannot be empty.');
          if (content.includes(SIMULATE_REQUEST_FAILURE)) {
            throw new ApiError(503, 'upstream_unavailable', 'Lam13 is temporarily unavailable. Please try again.');
          }
          if (body.attachment_ids?.length) {
            if (body.attachment_ids.length > ATTACHMENT_LIMITS.maxFiles) {
              throw new ApiError(422, 'too_many_attachments', `Attach up to ${ATTACHMENT_LIMITS.maxFiles} images.`);
            }
            attachments = body.attachment_ids.map((id) => {
              const ref = attachmentStore.get(id);
              if (!ref) throw new ApiError(422, 'attachment_not_found', 'An attached image is no longer available.');
              return clone(ref);
            });
          }
        }

        let conversation: Conversation;
        const created = conversationId === null;
        if (created) {
          conversation = { id: newId('c'), title: 'New conversation', created_at: iso(), updated_at: iso(), last_message_preview: null };
          conversations.unshift(conversation);
          messagesByConversation.set(conversation.id, []);
        } else {
          conversation = findConversation(conversationId);
        }

        const list = messagesOf(conversation.id);
        if (list.some((m) => m.client_message_id === body.client_message_id)) {
          throw new ApiError(409, 'duplicate_client_message_id', 'This message was already sent.');
        }

        const base = { conversation_id: conversation.id, call: null };
        const user: Message = {
          ...base,
          id: newId('m'),
          client_message_id: body.client_message_id,
          role: 'user',
          kind: audio ? 'voice' : 'text',
          audio: audio ? clone(audio) : null,
          content,
          ...(attachments && { attachments }),
          status: 'complete',
          created_at: iso(),
        };
        const assistant: Message = {
          ...base,
          id: newId('m'),
          client_message_id: null,
          role: 'assistant',
          kind: 'text',
          audio: null,
          content: '',
          status: 'streaming',
          model: body.model,
          effort: body.effort,
          created_at: iso(),
        };
        const isFirstExchange = list.length === 0;
        list.push(user, assistant);
        touch(conversation, audio ? 'Voice message' : content);

        return stream(async (writer, disconnected) => {
          if (created) writer.emit({ event: 'conversation.created', data: clone(conversation) });
          writer.emit({ event: 'message.created', data: { user_message: clone(user), assistant_message: clone(assistant) } });

          if (audio) {
            // MOCK transcription: a canned transcript after a short delay (see transcripts.ts).
            writer.emit({ event: 'status', data: { state: 'thinking', label: 'Transcribing' } });
            await sleep(between(random, timing.transcribe), disconnected);
            user.content = mockTranscribe(audio.duration_ms, transcripts++);
            touch(conversation, user.content);
            writer.emit({ event: 'transcript', data: { message_id: user.id, text: user.content } });
          }

          const prompt = user.content;
          const reply = composeReply(prompt);
          await generate({
            writer,
            disconnected,
            conversation,
            assistant,
            reply,
            failAt: !audio && prompt.includes(SIMULATE_STREAM_ERROR) ? Math.floor(reply.length * 0.4) : null,
            title: isFirstExchange ? deriveTitle(prompt) : null,
          });
        }, signal);
      },

      async cancel(conversationId, messageId) {
        await respond();
        const message = messagesOf(conversationId).find((m) => m.id === messageId);
        if (!message) throw new ApiError(404, 'message_not_found', 'This message does not exist.');
        running.get(messageId)?.abort();
        if (message.status === 'streaming') message.status = 'cancelled';
      },

      async setFeedback(conversationId, messageId, rating) {
        await respond();
        const message = messagesOf(conversationId).find((m) => m.id === messageId);
        if (!message) throw new ApiError(404, 'message_not_found', 'This message does not exist.');
        if (message.role !== 'assistant' || message.status !== 'complete') {
          throw new ApiError(422, 'feedback_not_allowed', 'Only completed answers can be rated.');
        }
        if (options.failFeedback) throw new ApiError(503, 'feedback_failed', "Your feedback couldn't be saved.");
        message.feedback = rating;
        return { message_id: message.id, rating };
      },

      async regenerate(conversationId, messageId, { signal }: StreamOptions = {}) {
        await respond(signal);
        const conversation = findConversation(conversationId);
        const list = messagesOf(conversationId);
        const index = list.findIndex((m) => m.id === messageId);
        const assistant = list[index];
        const user = list[index - 1];
        if (!assistant || assistant.role !== 'assistant' || !user || user.role !== 'user') {
          throw new ApiError(404, 'message_not_found', 'This message cannot be regenerated.');
        }
        if (running.has(messageId)) throw new ApiError(409, 'already_streaming', 'This response is still being generated.');

        const attempt = (attempts.get(messageId) ?? 0) + 1;
        attempts.set(messageId, attempt);
        assistant.content = '';
        assistant.status = 'streaming';
        assistant.feedback = null; // a new answer starts unrated

        return stream(async (writer, disconnected) => {
          writer.emit({ event: 'message.created', data: { user_message: clone(user), assistant_message: clone(assistant) } });
          await generate({
            writer,
            disconnected,
            conversation,
            assistant,
            reply: composeReply(user.content, attempt),
            failAt: null,
            title: null,
          });
        }, signal);
      },
    },

    attachments: {
      async upload({ file, filename }: AttachmentUploadInput, { signal }: StreamOptions = {}) {
        await sleep(between(random, timing.upload), signal);
        const mimeType = file.type.split(';')[0]?.trim() ?? '';
        if (!(ATTACHMENT_LIMITS.mimeTypes as readonly string[]).includes(mimeType)) {
          throw new ApiError(415, 'unsupported_image_format', 'Attach PNG, JPEG, WebP or GIF images.');
        }
        if (file.size > ATTACHMENT_LIMITS.maxBytes) {
          throw new ApiError(413, 'image_too_large', 'This image is too large to attach.');
        }
        const ref: AttachmentRef = {
          id: newId('at'),
          kind: 'image',
          filename: filename.slice(0, 255) || 'image',
          mime_type: mimeType,
          size_bytes: file.size,
          // The mock doesn't decode images; the real backend may report dimensions.
          width: null,
          height: null,
          url: URL.createObjectURL(file),
          expires_at: null,
        };
        attachmentStore.set(ref.id, ref);
        return clone(ref);
      },
    },

    // MOCK: nothing generates artifacts yet, so lookups report "not found" rather than inventing one.
    artifacts: {
      async get() {
        await respond();
        throw new ApiError(404, 'artifact_not_found', 'This file is not available.');
      },
      async download() {
        await respond();
        throw new ApiError(404, 'artifact_not_found', 'This file is not available.');
      },
    },

    audio: {
      async upload({ file, duration_ms, peaks }: AudioUploadInput, { signal }: StreamOptions = {}) {
        await sleep(between(random, timing.upload), signal);
        if (options.failAudioUploads) {
          throw new ApiError(503, 'upload_failed', "The recording couldn't be uploaded. Please try again.");
        }
        const mimeType = file.type.split(';')[0]?.trim() || 'audio/webm';
        if (file.size > AUDIO_LIMITS.maxBytes) {
          throw new ApiError(413, 'audio_too_large', 'This recording is too large to send.');
        }
        if (!AUDIO_LIMITS.mimeTypes.includes(mimeType)) {
          throw new ApiError(415, 'unsupported_audio_format', 'This audio format is not supported.');
        }
        if (duration_ms < AUDIO_LIMITS.minDurationMs) {
          throw new ApiError(422, 'audio_too_short', 'That recording is too short. Hold on a little longer.');
        }
        if (duration_ms > AUDIO_LIMITS.maxDurationMs) {
          throw new ApiError(422, 'audio_too_long', 'Voice messages can be up to 5 minutes long.');
        }

        const ref: AudioRef = {
          id: newId('au'),
          url: URL.createObjectURL(file),
          mime_type: mimeType,
          duration_ms: Math.round(duration_ms),
          expires_at: null,
          peaks: peaks?.slice(0, 200).map((p) => Math.min(1, Math.max(0, p))),
        };
        audioStore.set(ref.id, ref);
        return clone(ref);
      },

      async get(id) {
        await respond();
        const ref = audioStore.get(id);
        if (!ref) throw new ApiError(404, 'audio_not_found', 'This recording is no longer available.');
        return clone(ref);
      },
    },

    models: {
      async list() {
        await respond();
        return { items: clone(MOCK_MODELS) };
      },
    },
  };
}

import { env } from '@/lib/env';
import type { Artifact, AttachmentRef, Conversation, Message } from '@/types/api';
import { getAccessToken } from './auth';
import { abortError, ApiError } from './errors';
import { createMockProfiles } from './mock/profiles';
import type { ApiAdapter, SendMessageBody } from './services';
import { readSseMessages, type SseMessage, type StreamEvent } from './stream';

/*
 * HTTP adapter for the LAM13 FastAPI backend (lam13-app/api/routers).
 * The backend's routes and SSE events differ from api-contract.md, so this file maps them onto the
 * app's ApiAdapter / StreamEvent shapes; nothing outside src/api knows the backend's wire format.
 */

export interface RequestOptions {
  method?: string;
  /** JSON-serialised, or sent as-is when FormData. */
  body?: unknown;
  signal?: AbortSignal;
  /** Send the Bearer token (default). Auth endpoints pass false. */
  auth?: boolean;
}

/** fetch against the backend: Bearer auth, one retry with a refreshed token on 401, ApiError on non-2xx. */
export async function request(path: string, { method = 'GET', body, signal, auth = true }: RequestOptions = {}) {
  const isForm = body instanceof FormData;
  const send = async (forceRefresh: boolean) => {
    const headers: Record<string, string> = {};
    if (auth) {
      const token = await getAccessToken({ forceRefresh });
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    try {
      return await fetch(`${env.apiBaseUrl}${path}`, {
        method,
        headers,
        signal,
        body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      });
    } catch {
      if (signal?.aborted) throw abortError();
      throw new ApiError(0, 'network_error', 'Connection lost. Check your network and try again.');
    }
  };

  let response = await send(false);
  if (response.status === 401 && auth) response = await send(true);
  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function requestJson<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await request(path, options);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** A backend message is shown only when it is a short, single-line sentence (never a traceback or dump). */
function safeText(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= 200 && !/[\r\n]|Traceback|File "/.test(text) ? text : undefined;
}

/** FastAPI errors are `{detail: string}` or `{detail: [{msg}]}`; 5xx details are never shown. */
async function toApiError(response: Response): Promise<ApiError> {
  let message = response.status >= 500 ? 'Something went wrong on our side. Please try again.' : 'Request failed.';
  if (response.status < 500) {
    try {
      const { detail } = (await response.json()) as { detail?: unknown };
      const text = safeText(typeof detail === 'string' ? detail : Array.isArray(detail) ? detail[0]?.msg : undefined);
      if (text) message = text;
    } catch {
      // Not JSON — keep the generic message.
    }
  }
  return new ApiError(response.status, `http_${response.status}`, message);
}

const notSupported = (what: string) => new ApiError(501, 'not_supported', `${what} isn't available yet.`);

// ── Backend DTOs (lam13-app/api/schemas/chat.py) ─────────────────────────────

interface SessionSummaryDto {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
}

interface MessageDto {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  doc_name?: string | null;
  has_document?: boolean;
  /** 'generating' | 'completed' | 'error' | null */
  status?: string | null;
  /** 'running' | 'completed' | 'failed' | null */
  kothar_status?: string | null;
  kothar_pptx_url?: string | null;
}

interface SessionDetailDto {
  sessionId: string;
  title: string | null;
  messages: MessageDto[];
  /** 'not_started' | 'in_progress' | 'completed' | 'failed' */
  eshmunReportGeneratingStatus?: string;
  reportUrl?: string;
}

interface UploadDto {
  id: string;
  pdfName: string;
}

// ── Mapping ──────────────────────────────────────────────────────────────────

function toConversation(dto: { sessionId: string; title?: string | null; createdAt?: string; updatedAt?: string }): Conversation {
  const created = dto.createdAt || new Date().toISOString();
  return {
    id: dto.sessionId,
    title: dto.title || 'New conversation',
    created_at: created,
    updated_at: dto.updatedAt || created,
    last_message_preview: null,
  };
}

function artifact(
  conversationId: string,
  messageId: string,
  type: 'pptx' | 'report',
  status: string | null | undefined,
  url: string | null | undefined,
): Artifact | null {
  const state: Artifact['status'] | null =
    url ? 'ready'
    : status === 'running' || status === 'in_progress' ? 'processing'
    : status === 'failed' ? 'error'
    : null;
  if (!state) return null;
  const now = new Date().toISOString();
  return {
    id: `${messageId}:${type}`,
    conversation_id: conversationId,
    message_id: messageId,
    type,
    filename: type === 'pptx' ? 'Presentation.pptx' : 'Strategy report.pdf',
    status: state,
    progress: null,
    download: url ? { url, expires_at: null } : null,
    error: state === 'error' ? { code: 'generation_failed', message: 'This file could not be generated.', retryable: false } : null,
    created_at: now,
    updated_at: now,
  };
}

/** Deliverables of one assistant message; the session's report belongs to its last assistant message. */
function artifactsFor(detail: SessionDetailDto, m: MessageDto, isLastAssistant: boolean): Artifact[] {
  return [
    artifact(detail.sessionId, m.id, 'pptx', m.kothar_status, m.kothar_pptx_url),
    isLastAssistant ? artifact(detail.sessionId, m.id, 'report', detail.eshmunReportGeneratingStatus, detail.reportUrl) : null,
  ].filter((a): a is Artifact => a !== null);
}

function toMessages(detail: SessionDetailDto): Message[] {
  const lastAssistant = detail.messages.findLast((m) => m.role === 'assistant');
  return detail.messages.map((m) => {
    const artifacts = m.role === 'assistant' ? artifactsFor(detail, m, m === lastAssistant) : [];
    const attachments: AttachmentRef[] =
      m.role === 'user' && m.has_document && m.doc_name ? [documentRef(`${m.id}:doc`, m.doc_name)] : [];
    return {
      id: m.id,
      conversation_id: detail.sessionId,
      // The client sends its id as the backend `message_id`, so user messages round-trip it.
      client_message_id: m.role === 'user' ? m.id : null,
      role: m.role,
      kind: 'text',
      content: m.content ?? '',
      audio: null,
      call: null,
      status: m.status === 'generating' ? 'streaming' : m.status === 'error' ? 'error' : 'complete',
      ...(attachments.length && { attachments }),
      ...(artifacts.length && { artifacts }),
      // The backend stores no per-message time; an empty value hides the time label.
      created_at: '',
    };
  });
}

function documentRef(id: string, filename: string, file?: Blob): AttachmentRef {
  return {
    id,
    kind: 'document',
    filename,
    mime_type: file?.type ?? '',
    size_bytes: file?.size ?? 0,
    width: null,
    height: null,
    url: '',
    expires_at: null,
  };
}

// ── Stream translation ───────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const str = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Backend SSE (`start, thinking, token, progress, response_completed, done, error` …, see routers/chat.py)
 * → app events. `loadDetail` fetches the session after `done` so generated files (report / PPTX) arrive as
 * `artifact` events.
 *
 * `response_completed` means the answer text is final, but the backend then post-processes for several
 * seconds before `done`. The answer is completed there (the UI frees the composer); what follows on the
 * same response — agent output appended to the answer, the title, generated files — arrives as trailing
 * `delta` / `conversation.updated` / `artifact` events. A failure after that point is a post-processing
 * failure: the answer stands.
 */
export async function* translateStream(
  messages: AsyncIterable<SseMessage>,
  request: { conversationId: string | null; body: Extract<SendMessageBody, { kind: 'text' }> },
  loadDetail: (sessionId: string) => Promise<SessionDetailDto | null>,
): AsyncGenerator<StreamEvent> {
  const startedAt = new Date().toISOString();
  let sessionId = request.conversationId ?? '';
  let assistantId = '';
  let content = '';
  let thinking = false;
  let partial = false;
  /** `response_completed` was mapped to `done`. */
  let completed = false;

  const assistant = (patch: Partial<Message> = {}): Message => ({
    id: assistantId,
    conversation_id: sessionId,
    client_message_id: null,
    role: 'assistant',
    kind: 'text',
    content,
    audio: null,
    call: null,
    status: 'streaming',
    created_at: startedAt,
    ...patch,
  });

  for await (const message of messages) {
    let data: Json;
    try {
      data = JSON.parse(message.data) as Json;
    } catch {
      continue;
    }

    switch (message.event) {
      case 'start': {
        sessionId = str(data.session_id);
        assistantId = str(data.assistantMessageId);
        if (!request.conversationId) {
          yield { event: 'conversation.created', data: toConversation({ sessionId, title: null, createdAt: startedAt }) };
        }
        const user: Message = {
          id: str(data.message_id) || request.body.client_message_id,
          conversation_id: sessionId,
          client_message_id: request.body.client_message_id,
          role: 'user',
          kind: 'text',
          content: request.body.content,
          audio: null,
          call: null,
          status: 'complete',
          created_at: startedAt,
        };
        yield { event: 'message.created', data: { user_message: user, assistant_message: assistant() } };
        break;
      }
      case 'thinking':
      case 'progress':
      case 'postprocess_started':
        if (completed) break;
        if (!thinking) yield { event: 'status', data: { state: 'thinking', label: str(data.content) } };
        thinking = true;
        break;
      case 'token': {
        // Agent output is stored as `answer.strip() + "\n\n" + addition.strip()` (append_assistant_message).
        const raw = str(data.content);
        const text =
          data.source === 'chatbot' || !data.source ? raw : raw.trim() && (content.trim() ? '\n\n' : '') + raw.trim();
        if (!text) break;
        content += text;
        thinking = false;
        yield { event: 'delta', data: { message_id: assistantId, text } };
        break;
      }
      case 'response_completed':
        if (!assistantId || completed) break;
        completed = true;
        yield { event: 'done', data: { message: assistant({ status: 'complete' }) } };
        break;

      case 'done': {
        // A failed turn sends a partial `done` followed by `error`; let the error end the stream.
        if (data.partial) {
          partial = true;
          break;
        }
        const title = str(data.title);
        if (title) yield { event: 'conversation.updated', data: { id: sessionId, title } };
        const detail = await loadDetail(sessionId).catch(() => null);
        const saved = detail?.messages.find((m) => m.id === assistantId);
        const artifacts = saved && detail ? artifactsFor(detail, saved, true) : [];
        for (const a of artifacts) yield { event: 'artifact', data: a };
        // Already completed at `response_completed`: the above were trailing updates.
        if (completed) return;
        yield {
          event: 'done',
          data: {
            message: assistant({
              content: saved?.content || content,
              status: 'complete',
              ...(artifacts.length && { artifacts }),
            }),
          },
        };
        return;
      }
      case 'error':
        // After `response_completed` this is a post-processing failure; the completed answer stands.
        if (completed) return;
        yield {
          event: 'error',
          data: {
            code: partial ? 'generation_failed' : 'stream_error',
            message: safeText(data.content) ?? 'We encountered an issue processing your request.',
            // Not regenerated in place (no endpoint): Retry asks again as a new turn (see chatStream `retry`).
            retryable: true,
          },
        };
        return;
    }
  }
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export function createHttpAdapter(): ApiAdapter {
  const loadDetail = (id: string) => requestJson<SessionDetailDto>(`/chat/sessions/${encodeURIComponent(id)}`);
  let counter = 0;

  return {
    // No regenerate or /audio endpoint: the UI hides Regenerate and voice notes.
    capabilities: { regenerate: false, voiceNotes: false },

    conversations: {
      async list() {
        const items = await requestJson<SessionSummaryDto[]>('/chat/sessions');
        return { items: items.map(toConversation), next_cursor: null };
      },
      async get(id) {
        return toConversation(await loadDetail(id));
      },
      async create() {
        // The backend creates a session on the first message (`send(null, …)`).
        throw notSupported('Creating an empty conversation');
      },
      async rename(id, title) {
        await requestJson(`/chat/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: { title } });
        return { ...toConversation({ sessionId: id, title }) };
      },
      async remove(id) {
        await request(`/chat/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      },
    },

    messages: {
      async list(conversationId) {
        // ponytail: the backend returns the whole history in one response; add paging if chats get very long.
        const messages = toMessages(await loadDetail(conversationId));
        return { items: messages.reverse(), next_cursor: null };
      },
      async send(conversationId, body, options) {
        if (body.kind !== 'text') throw notSupported('Voice notes');
        const response = await request('/chat/stream', {
          method: 'POST',
          signal: options?.signal,
          body: {
            session_id: conversationId ?? undefined,
            message_id: body.client_message_id,
            user_message: body.content,
            ...(body.attachment_ids?.length && { users_document_ids: body.attachment_ids }),
          },
        });
        if (!response.body) throw new ApiError(0, 'network_error', 'The response could not be read.');
        return translateStream(readSseMessages(response.body, options?.signal), { conversationId, body }, loadDetail);
      },
      // No cancel endpoint: the backend finishes and saves the answer; the client just stops reading.
      async cancel() {},
      async regenerate() {
        throw notSupported('Regenerating an answer');
      },
      async setFeedback() {
        throw notSupported('Feedback');
      },
    },

    attachments: {
      async upload({ file, filename, conversation_id }, options) {
        const form = new FormData();
        form.append('file', file, filename);
        if (conversation_id) form.append('session_id', conversation_id);
        const dto = await requestJson<UploadDto>('/chat/upload', { method: 'POST', body: form, signal: options?.signal });
        return documentRef(dto.id, dto.pdfName || filename, file);
      },
    },

    artifacts: {
      // Artifacts carry permanent blob URLs; there is no separate endpoint.
      async get() {
        throw notSupported('Artifact lookup');
      },
      async download() {
        throw notSupported('Artifact lookup');
      },
    },

    audio: {
      async upload() {
        throw notSupported('Voice notes');
      },
      async get() {
        throw notSupported('Voice notes');
      },
    },

    models: {
      // One model, chosen by the backend: the composer hides its model chips.
      async list() {
        return { items: [] };
      },
    },

    // Not part of the chat backend: My Contacts stays in memory until its API exists.
    ...createMockProfiles({
      now: Date.now,
      respond: async () => {},
      newId: (prefix) => `${prefix}_${Date.now().toString(36)}${(++counter).toString(36)}`,
    }),
  };
}

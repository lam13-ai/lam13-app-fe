import { env } from '@/lib/env';
import type {
  Artifact,
  AttachmentRef,
  Conversation,
  Meeting,
  MeetingSourceConnection,
  MeetingSummary,
  Message,
  Profile,
  ProfileField,
  ProfileInput,
  ProfileSuggestionSource,
  ProfileSuggestionStatus,
  ProfileUpdateSuggestion,
} from '@/types/api';
import { getAccessToken } from './auth';
import { abortError, ApiError } from './errors';
import { createMockAdapter } from './mock/mockAdapter';
import { createHttpProjects } from './httpWorkspace';
import { isDemoConversation } from './mock/projectChatFixtures';
import { createMockWhatsApp } from './mock/whatsapp';
import { generatePresentation } from './presentation';
import { createMockCalendar } from './mock/workspace';
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

/**
 * FastAPI errors are `{detail: string}` or `{detail: [{msg}]}`. 5xx details are never shown, except a 503:
 * the backend answers it on purpose, with a sentence written for the user ("… is not set up on the server yet").
 */
async function toApiError(response: Response): Promise<ApiError> {
  let message = response.status >= 500 ? 'Something went wrong on our side. Please try again.' : 'Request failed.';
  if (response.status < 500 || response.status === 503) {
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
/** A demo conversation is local sample data: nothing from it may reach the backend, and nothing is faked in its place. */
const notInDemo = (what: string) => new ApiError(501, 'not_supported', `${what} isn't available in demo conversations.`);

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
  /** Set when the session is a project's chat. */
  projectId?: string | null;
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

function toConversation(dto: { sessionId: string; title?: string | null; createdAt?: string; updatedAt?: string; projectId?: string | null }): Conversation {
  const created = dto.createdAt || new Date().toISOString();
  return {
    id: dto.sessionId,
    title: dto.title || 'New conversation',
    created_at: created,
    updated_at: dto.updatedAt || created,
    last_message_preview: null,
    ...(dto.projectId && { project_id: dto.projectId }),
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

// ── Voice (routers/voice_route.py) ────────────────────────────────────────────

/** POST /voice/transcribe accepts up to 25 MB. */
export const MAX_TRANSCRIBE_BYTES = 25_000_000;

/**
 * The backend decides the format from the file NAME's extension (mp3, mp4, mpeg, mpga, m4a, wav, webm), so
 * the name follows the recording's real container: Chrome / Edge / Firefox record WebM (Opus), Safari MP4.
 * Anything else keeps its own extension and gets the backend's 415 message.
 */
function recordingFilename(file: Blob): string {
  const container = file.type.split(';')[0]!.trim().toLowerCase();
  const ext: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
  };
  return `recording.${ext[container] ?? (container.split('/')[1] || 'webm')}`;
}

// ── Contacts (routers/contacts_routes.py) ────────────────────────────────────

/** ContactOut / ContactSummary / ContactDetail. Timestamps are the server's ISO strings, passed through. */
interface ContactDto {
  id: string;
  full_name: string;
  position: string | null;
  company: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  created_at: string;
  updated_at: string;
}

/** SuggestionOut. `kind: 'create'` proposes a new contact (no `contact_id`). */
interface ContactSuggestionDto {
  id: string;
  contact_id: string | null;
  kind: string;
  status: string;
  suggested: Record<string, unknown>;
  reason?: string;
  source: { type: string; ref_id: string | null; title: string | null } | null;
  merged_sources?: { type: string; title: string | null }[];
  created_at: string;
}

const SOURCE_TYPES: ReadonlySet<string> = new Set<ProfileSuggestionSource>(['meeting', 'chat', 'voice_call']);
const toSourceType = (type?: string | null) => (SOURCE_TYPES.has(type ?? '') ? type : 'meeting') as ProfileSuggestionSource;

const PROFILE_FIELDS: ReadonlySet<string> = new Set<ProfileField>([
  'full_name',
  'position',
  'company',
  'description',
  'email',
  'phone',
  'linkedin',
]);

/**
 * The contacts service stamps records with a naive `datetime.now()` (no offset). The server clock is UTC,
 * so read offset-less timestamps as UTC; otherwise browsers take them as local time and a contact
 * created a moment ago shows as "5h ago" in UTC+5. [CONFIRM: backend to send offset-aware times]
 */
const asUtc = (iso: string) => (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`);

function toProfile(dto: ContactDto): Profile {
  return {
    id: dto.id,
    full_name: dto.full_name,
    position: dto.position ?? '',
    company: dto.company ?? '',
    description: dto.description ?? '',
    email: dto.email ?? null,
    phone: dto.phone ?? null,
    linkedin: dto.linkedin ?? null,
    created_at: asUtc(dto.created_at),
    updated_at: asUtc(dto.updated_at),
  };
}

function toSuggestion(dto: ContactSuggestionDto): ProfileUpdateSuggestion {
  return {
    id: dto.id,
    kind: dto.kind === 'create' ? 'create' : 'update',
    profile_id: dto.contact_id ?? '',
    source_type: toSourceType(dto.source?.type),
    source_id: dto.source?.ref_id ?? '',
    source_title: dto.source?.title ?? null,
    ...(dto.merged_sources?.length && {
      merged_sources: dto.merged_sources.map((m) => ({ type: toSourceType(m.type), title: m.title })),
    }),
    created_at: asUtc(dto.created_at),
    status: dto.status as ProfileSuggestionStatus,
    // `suggested` maps field → proposed value; null clears an optional field.
    changes: Object.entries(dto.suggested)
      .filter(([field]) => PROFILE_FIELDS.has(field))
      .map(([field, to]) => ({ field: field as ProfileField, to: to == null ? null : String(to) })),
    ...(dto.reason && { reason: dto.reason }),
  };
}

/** The UI shows update suggestions for an existing contact, and new-contact (`create`) suggestions. */
const isShown = (dto: ContactSuggestionDto) => dto.kind === 'create' || (dto.kind === 'update' && Boolean(dto.contact_id));

// ── Stream translation ───────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const str = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Backend SSE (`start, response_started, thinking, token, response_completed, postprocess_*, done, error`, see
 * routers/chat.py) → app events. `token` text streams into the answer; `thinking` (the model's reasoning, in
 * whole sentences, redacted by the backend for display) becomes `reasoning`; `progress` (an agent working) only
 * ever produces the `solving` status, never text. The answer is complete at the backend's `done`, after post-processing
 * (which may append agent output as more `token`s); `response_completed` only marks the text final, so a
 * later post-processing failure — or the stream closing before `done` — still completes it. `loadDetail`
 * fetches the saved session afterwards so generated files (report / PPTX) arrive as trailing `artifact` events.
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
  /** `response_completed` arrived: the answer is final even if post-processing then fails. */
  let completed = false;

  /** The whole answer (`done`), then the files the saved session lists (trailing `artifact` events). */
  async function* finish(): AsyncGenerator<StreamEvent> {
    yield { event: 'done', data: { message: assistant({ status: 'complete' }) } };
    const detail = await loadDetail(sessionId).catch(() => null);
    const saved = detail?.messages.find((m) => m.id === assistantId);
    if (saved && detail) for (const a of artifactsFor(detail, saved, true)) yield { event: 'artifact', data: a };
  }

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
          yield { event: 'conversation.created', data: toConversation({ sessionId, title: null, createdAt: startedAt, projectId: request.body.project_id }) };
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
      case 'response_started':
        if (!content) yield { event: 'status', data: { state: 'generating' } };
        break;
      case 'progress':
        // An agent is working (typically after the chatbot's text, before its own output is appended). The
        // backend's text names internal agents, so only the state is passed on — never the content.
        yield { event: 'status', data: { state: 'solving' } };
        break;
      case 'thinking':
      case 'postprocess_started':
      case 'postprocess_completed': {
        // Post-processing is a status only; `thinking` also carries the model's reasoning.
        if (!thinking && !completed) yield { event: 'status', data: { state: 'thinking' } };
        thinking = true;
        const text = message.event === 'thinking' ? str(data.content) : '';
        if (text && assistantId && !completed) yield { event: 'reasoning', data: { message_id: assistantId, text } };
        break;
      }
      case 'token': {
        // Agent output is stored as `answer.strip() + "\n\n" + addition.strip()` (append_assistant_message).
        const raw = str(data.content);
        const text =
          data.source === 'chatbot' || !data.source ? raw : raw.trim() && (content.trim() ? '\n\n' : '') + raw.trim();
        if (!text) break;
        content += text;
        yield { event: 'delta', data: { message_id: assistantId, text } };
        break;
      }
      case 'response_completed':
        // The chatbot's text is final, but post-processing may still append agent output: keep going to `done`.
        completed = Boolean(assistantId);
        // No more answer text is arriving: the turn is finishing (saving, title, a possible agent), not answering.
        if (completed) yield { event: 'status', data: { state: 'finishing' } };
        break;

      case 'done': {
        // A turn that failed before its answer was final sends a partial `done`, then `error`.
        if (data.partial && !completed) {
          partial = true;
          break;
        }
        const title = str(data.title);
        if (title) yield { event: 'conversation.updated', data: { id: sessionId, title } };
        yield* finish();
        return;
      }
      case 'error':
        // After `response_completed` this is a post-processing failure: the answer stands.
        if (completed) {
          yield* finish();
          return;
        }
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
  // Closed after the answer was final but before `done`: still reveal it.
  if (completed) yield* finish();
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export function createHttpAdapter(): ApiAdapter {
  // One endpoint serves both the conversation (header) and its messages, which are separate queries that
  // mount together: callers asking for the same session while a request is in flight share it.
  const inFlight = new Map<string, Promise<SessionDetailDto>>();
  const loadDetail = (id: string) => {
    let pending = inFlight.get(id);
    if (!pending) {
      pending = requestJson<SessionDetailDto>(`/chat/sessions/${encodeURIComponent(id)}`).finally(() => inFlight.delete(id));
      inFlight.set(id, pending);
    }
    return pending;
  };

  // DEMO: the sample projects' conversations are local data, not backend sessions. Reading or continuing one
  // goes to an in-memory mock (canned replies, nothing sent to the backend, gone on reload).
  let demoAdapter: ApiAdapter | undefined;
  const demo = () => (demoAdapter ??= createMockAdapter());

  return {
    // No regenerate or /audio (voice-message) endpoint: the UI hides Regenerate and audio messages. Recordings
    // are transcribed (POST /voice/transcribe) into the message box and sent as text.
    capabilities: { regenerate: false, voiceNotes: false, transcription: true },

    conversations: {
      async list() {
        const items = await requestJson<SessionSummaryDto[]>('/chat/sessions');
        return { items: items.map(toConversation), next_cursor: null };
      },
      async get(id) {
        if (isDemoConversation(id)) return demo().conversations.get(id);
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
      async list(conversationId, params) {
        if (isDemoConversation(conversationId)) return demo().messages.list(conversationId, params);
        // ponytail: the backend returns the whole history in one response; add paging if chats get very long.
        const messages = toMessages(await loadDetail(conversationId));
        return { items: messages.reverse(), next_cursor: null };
      },
      async send(conversationId, body, options) {
        if (isDemoConversation(conversationId)) return demo().messages.send(conversationId, body, options);
        if (body.kind !== 'text') throw notSupported('Voice notes');
        const response = await request('/chat/stream', {
          method: 'POST',
          signal: options?.signal,
          body: {
            // A new chat's session id is chosen here (the backend gets-or-creates by it), derived from the
            // message's client id: resending the same message (Retry after a drop or an early Stop) reaches
            // the same session instead of creating a second conversation.
            session_id: conversationId ?? body.client_message_id,
            message_id: body.client_message_id,
            user_message: body.content,
            ...(body.attachment_ids?.length && { users_document_ids: body.attachment_ids }),
            ...(body.meeting_ids?.length && { meeting_ids: body.meeting_ids }),
            // A chat in a project: the backend creates it there, and checks project membership on every turn.
            ...(body.project_id && { project_id: body.project_id }),
          },
        });
        if (!response.body) throw new ApiError(0, 'network_error', 'The response could not be read.');
        return translateStream(readSseMessages(response.body, options?.signal), { conversationId, body }, loadDetail);
      },
      // No cancel endpoint: the backend finishes and saves the answer; the client just stops reading.
      async cancel(conversationId, messageId) {
        if (isDemoConversation(conversationId)) await demo().messages.cancel(conversationId, messageId);
      },
      async regenerate() {
        throw notSupported('Regenerating an answer');
      },
      async setFeedback() {
        throw notSupported('Feedback');
      },
    },

    attachments: {
      async upload({ file, filename, conversation_id }, options) {
        if (isDemoConversation(conversation_id)) throw notInDemo('Attaching files');
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
      /** POST /voice/transcribe — multipart `file` → `{ text }` (TranscriptionResponse). Stores nothing. */
      async transcribe({ file, conversation_id }, options) {
        if (isDemoConversation(conversation_id)) throw notInDemo('Voice input');
        if (file.size > MAX_TRANSCRIBE_BYTES) throw new ApiError(413, 'payload_too_large', 'Audio file must be 25 MB or smaller.');
        const form = new FormData();
        form.append('file', file, recordingFilename(file));
        const { text } = await requestJson<{ text: string }>('/voice/transcribe', { method: 'POST', body: form, signal: options?.signal });
        return { text };
      },
    },

    models: {
      // One model, chosen by the backend: the composer hides its model chips.
      async list() {
        return { items: [] };
      },
    },

    // Meetings: /meetings, and the Granola connection under /integrations/granola.
    meetings: {
      async list() {
        return requestJson<MeetingSummary[]>('/meetings');
      },
      async get(id) {
        return requestJson<Meeting>(`/meetings/${encodeURIComponent(id)}`);
      },
      async setActionItemCompleted(meetingId, itemId, completed) {
        const path = `/meetings/${encodeURIComponent(meetingId)}/action-items/${encodeURIComponent(itemId)}`;
        return requestJson<Meeting>(path, { method: 'PATCH', body: { completed } });
      },
      async connection() {
        return requestJson<MeetingSourceConnection>('/integrations/granola');
      },
      async setConnected(connected) {
        if (!connected) return requestJson<MeetingSourceConnection>('/integrations/granola', { method: 'DELETE' });
        const { authorization_url } = await requestJson<{ authorization_url: string }>('/integrations/granola/connect', { method: 'POST' });
        // Granola sign-in; Granola sends the browser back to /integrations/granola/callback.
        window.location.assign(authorization_url);
        return { provider: 'granola', status: 'disconnected' };
      },
      async finishGranolaSignIn(code, state) {
        return requestJson<MeetingSourceConnection>('/integrations/granola/callback', { method: 'POST', body: { code, state } });
      },
    },
    // TODO(backend): WhatsApp connection is not on the backend yet — a local mock that sends nothing. Replace
    // with the real integration here (OTP, Meta embedded signup, …); the UI only uses WhatsAppService.
    whatsapp: createMockWhatsApp(),
    // Projects (with their chats, archives, team and contacts): httpWorkspace.ts.
    projects: createHttpProjects(),
    // DEMO: the calendar shows the local sample data, as before the backend integration: no request is made.
    // The backend-backed one is `createHttpCalendar()` (httpWorkspace.ts), ready to be put here.
    calendar: createMockCalendar(),
    // Image → PPT: the separate generation service (presentation.ts). Not set up without its endpoint.
    presentations: {
      available: Boolean(env.presentation.endpoint),
      generate: (files, options) => generatePresentation(files, options),
    },

    // My Contacts: /contacts. The UI searches and sorts the (unpaginated) list itself; version history has
    // no UI yet and is not called.
    profiles: {
      async list() {
        const items = await requestJson<ContactDto[]>('/contacts');
        return { items: items.map(toProfile), next_cursor: null };
      },
      async get(id) {
        return toProfile(await requestJson<ContactDto>(`/contacts/${encodeURIComponent(id)}`));
      },
      async create(body: ProfileInput) {
        return toProfile(await requestJson<ContactDto>('/contacts', { method: 'POST', body }));
      },
      async update(id, body) {
        return toProfile(await requestJson<ContactDto>(`/contacts/${encodeURIComponent(id)}`, { method: 'PATCH', body }));
      },
      async delete(id) {
        await request(`/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      },
    },

    profileSuggestions: {
      async list(params) {
        const query = new URLSearchParams();
        if (params?.status) query.set('status', params.status);
        if (params?.profile_id) query.set('contact_id', params.profile_id);
        const qs = query.toString();
        const items = await requestJson<ContactSuggestionDto[]>(`/contacts/suggestions${qs ? `?${qs}` : ''}`);
        return { items: items.filter(isShown).map(toSuggestion) };
      },
      async approve(id) {
        // No body: the suggestion is applied as proposed (the UI has no partial-apply step).
        const result = await requestJson<{ suggestion: ContactSuggestionDto; contact: ContactDto }>(
          `/contacts/suggestions/${encodeURIComponent(id)}/approve`,
          { method: 'POST' },
        );
        return { suggestion: toSuggestion(result.suggestion), profile: toProfile(result.contact) };
      },
      async reject(id) {
        return toSuggestion(
          await requestJson<ContactSuggestionDto>(`/contacts/suggestions/${encodeURIComponent(id)}/reject`, { method: 'POST' }),
        );
      },
      // TODO(temporary): demo control for /contacts/test-adding-suggestions. Remove when AI/Granola suggestion
      // generation is integrated.
      async addTest(body) {
        const dto = await requestJson<ContactSuggestionDto | null>('/contacts/test-adding-suggestions', { method: 'POST', body });
        return dto ? toSuggestion(dto) : null;
      },
    },
  };
}

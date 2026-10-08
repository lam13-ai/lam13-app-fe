import type {
  Artifact,
  AttachmentRef,
  AudioRef,
  Conversation,
  Effort,
  FeedbackRating,
  CalendarEvent,
  CalendarTask,
  Meeting,
  MeetingSourceConnection,
  MeetingSummary,
  Project,
  ProjectSummary,
  Message,
  ModelOption,
  Page,
  Profile,
  ProfileInput,
  ProfileSuggestionStatus,
  ProfileUpdateSuggestion,
  WhatsAppConnection,
  WhatsAppVerification,
  ContactImportResult,
  IntegrationConnection,
  IntegrationProvider,
  McpServer,
} from '@/types/api';
import type { EventStream } from './stream';

/**
 * Backend-agnostic service interfaces (api-contract.md §4). The UI depends only on these;
 * the mock adapter implements them today and an HTTP adapter (fetch + readEventStream)
 * replaces it when FastAPI is available.
 */

export interface ListParams {
  cursor?: string | null;
  limit?: number;
}

export interface MessageListParams {
  /** Return messages older than this message id. */
  before?: string | null;
  limit?: number;
}

interface SendMessageBase {
  client_message_id: string;
  model?: string;
  effort?: Effort;
}

/** api-contract.md §4.3 — text, or a voice note previously uploaded via `audio.upload`. */
export type SendMessageBody =
  /**
   * `attachment_ids`: images previously uploaded via `attachments.upload` (api-contract.md §4.7).
   * `meeting_ids`: meetings added as context for this message.
   * `project_id`: the project this chat belongs to (a new chat is created in it; omitted for a personal chat).
   */
  | (SendMessageBase & { kind: 'text'; content: string; attachment_ids?: string[]; meeting_ids?: string[]; project_id?: string })
  | (SendMessageBase & { kind: 'voice'; audio_id: string });

/** Fields of `POST /audio` (multipart/form-data, api-contract.md §4.4). */
export interface AudioUploadInput {
  file: Blob;
  duration_ms: number;
  conversation_id?: string | null;
  /** Optional client-computed waveform (0..1); the server may ignore it and compute its own. */
  peaks?: number[];
}

/** Fields of `POST /attachments` (multipart/form-data, api-contract.md §4.7). [CONFIRM] */
export interface AttachmentUploadInput {
  file: Blob;
  filename: string;
  conversation_id?: string | null;
}

export interface StreamOptions {
  signal?: AbortSignal;
}

export interface ConversationsService {
  /** GET /conversations — newest first. */
  list(params?: ListParams): Promise<Page<Conversation>>;
  /** GET /conversations/{id} */
  get(id: string): Promise<Conversation>;
  /** POST /conversations */
  create(body: { title?: string }): Promise<Conversation>;
  /** PATCH /conversations/{id} */
  rename(id: string, title: string): Promise<Conversation>;
  /** DELETE /conversations/{id} */
  remove(id: string): Promise<void>;
}

export interface MessagesService {
  /** GET /conversations/{id}/messages — newest first; `next_cursor` pages further back. */
  list(conversationId: string, params?: MessageListParams): Promise<Page<Message>>;
  /**
   * POST /conversations/{id}/messages (streaming). `conversationId: null` creates the conversation
   * lazily (`/conversations/new/messages`). Rejects with ApiError before the stream opens.
   */
  send(conversationId: string | null, body: SendMessageBody, options?: StreamOptions): Promise<EventStream>;
  /** POST /conversations/{id}/messages/{message_id}/cancel */
  cancel(conversationId: string, messageId: string): Promise<void>;
  /** POST /conversations/{id}/messages/{message_id}/regenerate (streaming, same event format). */
  regenerate(conversationId: string, messageId: string, options?: StreamOptions): Promise<EventStream>;
  /**
   * PUT /conversations/{id}/messages/{message_id}/feedback — rate an assistant message; `null` clears
   * it. Idempotent. [CONFIRM] (api-contract.md §4.8)
   */
  setFeedback(
    conversationId: string,
    messageId: string,
    rating: FeedbackRating | null,
  ): Promise<{ message_id: string; rating: FeedbackRating | null }>;
}

export interface AttachmentsService {
  /** POST /attachments — uploads one image. Rejects with ApiError (413 / 415 / 422 …). [CONFIRM] */
  upload(input: AttachmentUploadInput, options?: StreamOptions): Promise<AttachmentRef>;
}

export interface ArtifactsService {
  /** GET /artifacts/{id} — current state of a generated deliverable. [CONFIRM] */
  get(id: string): Promise<Artifact>;
  /** GET /artifacts/{id}/download — a fresh download reference (signed URLs expire). [CONFIRM] */
  download(id: string): Promise<{ url: string; expires_at: string | null }>;
}

/** Fields of `POST /audio/transcriptions` (multipart/form-data). [CONFIRM] */
export interface TranscriptionInput {
  file: Blob;
  duration_ms: number;
  /** The conversation the recording was made in, when there is one. Not part of the request: it only lets an adapter refuse a demo conversation. */
  conversation_id?: string | null;
}

export interface AudioService {
  /** POST /audio — uploads a recorded voice note. Rejects with ApiError (413 / 415 / 422 …). */
  upload(input: AudioUploadInput, options?: StreamOptions): Promise<AudioRef>;
  /** GET /audio/{id} — a fresh playback reference (e.g. when a signed URL expired). */
  get(id: string): Promise<AudioRef>;
  /**
   * POST /audio/transcriptions — transcribes a recording so the user can review it before sending.
   * Stateless: nothing is stored or sent to the conversation. Empty `text` = no speech detected. [CONFIRM]
   */
  transcribe(input: TranscriptionInput, options?: StreamOptions): Promise<{ text: string }>;
}

export interface ModelsService {
  /** GET /models (optional endpoint). */
  list(): Promise<{ items: ModelOption[] }>;
}

/** My Contacts (api-contract.md §4.10). Rejects with ApiError (404 / 422 …). [CONFIRM] */
export interface ProfilesService {
  /** GET /profiles — sorted by `full_name`. */
  list(params?: ListParams): Promise<Page<Profile>>;
  /** GET /profiles/{id} */
  get(id: string): Promise<Profile>;
  /** POST /profiles — 422 `validation_error` for a missing name/position/company or a bad email. */
  create(body: ProfileInput): Promise<Profile>;
  /** PATCH /profiles/{id} — the user's own edit; sets `updated_at`. */
  update(id: string, body: Partial<ProfileInput>): Promise<Profile>;
  /** DELETE /profiles/{id} — also discards the profile's suggestions. */
  delete(id: string): Promise<void>;
}

export interface ProfileSuggestionListParams {
  profile_id?: string;
  status?: ProfileSuggestionStatus;
}

/**
 * Meeting-derived profile suggestions (api-contract.md §4.11). Nothing here changes a profile
 * except `approve`. 409 `suggestion_not_pending` once decided. [CONFIRM]
 */
export interface ProfileSuggestionsService {
  /** GET /profile-suggestions?profile_id=&status= — oldest first. */
  list(params?: ProfileSuggestionListParams): Promise<{ items: ProfileUpdateSuggestion[] }>;
  /** POST /profile-suggestions/{id}/approve — applies the changes; returns both updated records. */
  approve(id: string): Promise<{ suggestion: ProfileUpdateSuggestion; profile: Profile }>;
  /** POST /profile-suggestions/{id}/reject — the profile is not modified. */
  reject(id: string): Promise<ProfileUpdateSuggestion>;
  /**
   * TODO(temporary): demo control for POST /contacts/test-adding-suggestions. Remove when AI/Granola
   * suggestion generation is integrated. Only the HTTP adapter has it; resolves null when nothing is new.
   */
  addTest?(body: TestSuggestionBody): Promise<ProfileUpdateSuggestion | null>;
}

/** The backend's CreateSuggestionRequest. No `contact_id` = a new-contact suggestion (needs `full_name`). */
export interface TestSuggestionBody {
  contact_id?: string | null;
  fields: Partial<ProfileInput>;
  reason?: string;
  source?: { type: 'meeting'; ref_id?: string | null; title?: string | null; occurred_at?: string | null };
}

/**
 * Meetings from the user's meeting source (Granola). The HTTP adapter calls the backend; the mock
 * adapter serves local fixtures. The UI depends only on this interface.
 */
export interface MeetingsService {
  /** Newest first. */
  list(): Promise<MeetingSummary[]>;
  /** 404 `not_found` for an unknown id. */
  get(id: string): Promise<Meeting>;
  /** Tick or untick one action item; returns the updated meeting. 404 for an unknown meeting or item. */
  setActionItemCompleted(meetingId: string, itemId: string, completed: boolean): Promise<Meeting>;
  /** The meeting source's connection. Connecting over HTTP leaves the app for Granola's sign-in page. */
  connection(): Promise<MeetingSourceConnection>;
  setConnected(connected: boolean): Promise<MeetingSourceConnection>;
  /** Finish the Granola sign-in with what Granola returned to /integrations/granola/callback. 400 if it failed. */
  finishGranolaSignIn(code: string, state: string): Promise<MeetingSourceConnection>;
}

/**
 * Connecting a WhatsApp number (so Lam13 can receive its messages and voice notes): request a code for a
 * number, then verify it. The backend has no WhatsApp integration yet: the HTTP adapter rejects every call
 * (`capabilities.whatsapp` is false); only the mock adapter simulates the flow. Rejects with ApiError:
 * 422 `invalid_phone` · 422 `invalid_code` · 410 `code_expired` · 409 `no_pending_verification`.
 */
export interface WhatsAppService {
  /**
   * The link and what the page needs about it (method, the Lam13 WhatsApp contact link). A link made from
   * WhatsApp happens entirely there (backend); the page learns about it here.
   */
  status(): Promise<WhatsAppConnection>;
  /** `phoneNumber` in E.164. Replaces any pending verification. */
  requestVerification(phoneNumber: string): Promise<WhatsAppVerification>;
  /** A new code for the pending number (same number, cooldown restarts). */
  resendCode(): Promise<WhatsAppVerification>;
  verifyCode(code: string): Promise<WhatsAppConnection>;
  disconnect(): Promise<WhatsAppConnection>;
}

/**
 * Outside accounts (Gmail, Outlook, storage, video conferencing) and the custom MCP server: `/integrations…`.
 * A provider is `connected` only after its own sign-in succeeded; one the server has no credentials for is
 * `configured: false` and cannot be connected (503). The mock adapter has no provider configured.
 */
export interface IntegrationsService {
  /** GET /integrations — every provider with the user's real state. */
  list(): Promise<IntegrationConnection[]>;
  /** POST /integrations/{provider}/connect — over HTTP this leaves the app for the provider's sign-in page. */
  connect(provider: IntegrationProvider): Promise<void>;
  /** POST /integrations/{provider}/callback with what the provider returned. 400 if the sign-in failed. */
  finishSignIn(provider: IntegrationProvider, code: string, state: string): Promise<IntegrationConnection>;
  /** DELETE /integrations/{provider}. */
  disconnect(provider: IntegrationProvider): Promise<IntegrationConnection>;
  /** POST /integrations/{provider}/import-contacts — adds the account's contacts that are not in My Contacts yet. 409 when not connected. */
  importContacts(provider: 'gmail' | 'outlook'): Promise<ContactImportResult>;
  /** GET /integrations/custom-mcp — null when none is saved. */
  mcpServer(): Promise<McpServer | null>;
  /** PUT /integrations/custom-mcp — `api_key` omitted keeps the stored key; "" removes it. */
  saveMcpServer(body: { name: string; url: string; api_key?: string }): Promise<McpServer>;
  /** DELETE /integrations/custom-mcp. */
  removeMcpServer(): Promise<void>;
}

/** What the connected backend supports; the UI hides the rest instead of offering failing actions. */
export interface ApiCapabilities {
  /** `messages.regenerate` (Regenerate, and Retry of a server-side answer in place). */
  regenerate: boolean;
  /** `audio.upload` + voice messages. */
  voiceNotes: boolean;
  /** `audio.transcribe`: the transcript is shown in the preview before sending. */
  transcription: boolean;
  /** `whatsapp`: false while the backend has no WhatsApp integration (the page says so instead of a flow). */
  whatsapp: boolean;
}

/**
 * Projects: a workspace's chats, instructions, archived files, team and contacts. The HTTP adapter calls
 * the backend (`/projects…`); the mock adapter serves sample data. Every change resolves with the project
 * as it is afterwards. Rejects with ApiError: 404 (no such project, or not a member), 403 (a member doing
 * an owner-only thing), 409 (already there), 4xx with the backend's own message otherwise.
 */
export interface ProjectsService {
  /** GET /projects — only projects the user owns or is a member of. */
  list(): Promise<ProjectSummary[]>;
  /** GET /projects/{id} with its chats, files, folders, members and contacts. */
  get(id: string): Promise<Project>;
  /** POST /projects — the signed-in user becomes the owner. */
  create(body: { name: string; instructions?: string; summary?: string }): Promise<ProjectSummary>;
  /** PATCH /projects/{id} `{name}` — owner only. */
  rename(id: string, name: string): Promise<Project>;
  /** DELETE /projects/{id} — owner only. Removes its chats, files and folders too. */
  remove(id: string): Promise<void>;
  /** PATCH /projects/{id} `{instructions}`. */
  saveInstructions(id: string, instructions: string): Promise<Project>;
  /**
   * A conversation opened under the project is the project's. The backend ties a chat to its project when
   * it is created (`project_id` on the first message), so over HTTP this only reloads the project.
   */
  linkChat(projectId: string, chat: { id: string; title: string }): Promise<Project>;
  /** PATCH /projects/{id}/chats/{chatId} `{title}`. */
  renameChat(projectId: string, chatId: string, title: string): Promise<Project>;
  /** DELETE /projects/{id}/chats/{chatId} — the chat's creator or the project owner (403 otherwise). */
  deleteChat(projectId: string, chatId: string): Promise<Project>;
  /** POST /projects/{id}/members `{email}` — an existing Lam13 account (404 otherwise; 409 when already in). */
  addMember(projectId: string, member: { email: string; role: 'member' }): Promise<Project>;
  /** DELETE /projects/{id}/members/{memberId} — owner only; the owner cannot be removed (409). */
  removeMember(projectId: string, memberId: string): Promise<Project>;
  /** POST /projects/{id}/contacts `{contact_id}` — one of the user's own contacts (409 when already linked). */
  linkContact(projectId: string, contactId: string): Promise<Project>;
  /** DELETE /projects/{id}/contacts/{contactId} — whoever linked it, or the owner (403 otherwise). */
  unlinkContact(projectId: string, contactId: string): Promise<Project>;
  /** POST /projects/{id}/folders `{name}` (409 when the name is taken). */
  createFolder(projectId: string, name: string): Promise<Project>;
  /** PATCH /projects/{id}/folders/{folderId} `{name}`. */
  renameFolder(projectId: string, folderId: string, name: string): Promise<Project>;
  /** DELETE /projects/{id}/folders/{folderId} — owner only; its files stay in the project. */
  deleteFolder(projectId: string, folderId: string): Promise<Project>;
  /** POST /projects/{id}/files (multipart `file`, optional `folder_id`) — PDF, DOCX, PPTX or an image, up to 50 MB. */
  uploadFile(projectId: string, file: File, folderId?: string | null): Promise<Project>;
  /** PATCH /projects/{id}/files/{fileId} `{folder_id}` — null takes it out of its folder. */
  moveFile(projectId: string, fileId: string, folderId: string | null): Promise<Project>;
  /** DELETE /projects/{id}/files/{fileId} — its uploader or the owner (403 otherwise). */
  deleteFile(projectId: string, fileId: string): Promise<Project>;
  /** GET /projects/{id}/files/{fileId}/download — a link that works for a few minutes. */
  fileDownloadUrl(projectId: string, fileId: string): Promise<string>;
}

/**
 * Calendar: scheduled events, meetings already recorded, and the actions that came out of them. The HTTP
 * adapter calls the backend (`/calendar…`, read-only); the mock adapter serves sample data.
 */
export interface CalendarService {
  /** GET /calendar/events — the user's own events and recorded meetings, and their projects' events. */
  events(): Promise<CalendarEvent[]>;
  /** GET /calendar/events/upcoming — what starts from now on, soonest first. */
  upcoming(): Promise<CalendarEvent[]>;
  /** GET /calendar/events/{id} — 404 for someone else's. */
  event(id: string): Promise<CalendarEvent>;
  /** GET /calendar/tasks — the action items of the user's meetings. */
  tasks(): Promise<CalendarTask[]>;
  /** PATCH /meetings/{meetingId}/action-items/{index} — the task's id names both. */
  setTaskCompleted(id: string, completed: boolean): Promise<CalendarTask>;
}

export interface ApiAdapter {
  capabilities: ApiCapabilities;
  conversations: ConversationsService;
  messages: MessagesService;
  audio: AudioService;
  models: ModelsService;
  attachments: AttachmentsService;
  artifacts: ArtifactsService;
  profiles: ProfilesService;
  profileSuggestions: ProfileSuggestionsService;
  meetings: MeetingsService;
  whatsapp: WhatsAppService;
  integrations: IntegrationsService;
  projects: ProjectsService;
  calendar: CalendarService;
}

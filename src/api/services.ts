import type {
  Artifact,
  AttachmentRef,
  AudioRef,
  Conversation,
  Effort,
  FeedbackRating,
  Message,
  ModelOption,
  Page,
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
  /** `attachment_ids`: images previously uploaded via `attachments.upload` (api-contract.md §4.7). */
  | (SendMessageBase & { kind: 'text'; content: string; attachment_ids?: string[] })
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

export interface AudioService {
  /** POST /audio — uploads a recorded voice note. Rejects with ApiError (413 / 415 / 422 …). */
  upload(input: AudioUploadInput, options?: StreamOptions): Promise<AudioRef>;
  /** GET /audio/{id} — a fresh playback reference (e.g. when a signed URL expired). */
  get(id: string): Promise<AudioRef>;
}

export interface ModelsService {
  /** GET /models (optional endpoint). */
  list(): Promise<{ items: ModelOption[] }>;
}

export interface ApiAdapter {
  conversations: ConversationsService;
  messages: MessagesService;
  audio: AudioService;
  models: ModelsService;
  attachments: AttachmentsService;
  artifacts: ArtifactsService;
}

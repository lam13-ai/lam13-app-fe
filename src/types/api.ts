/**
 * Wire DTOs — mirror api-contract.md §3. snake_case is kept on purpose (no key transforms).
 */

export type Id = string;
export type IsoDateTime = string;

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface User {
  id: Id;
  email: string;
  name: string;
  avatar_url: string | null;
  created_at: IsoDateTime;
}

export interface Conversation {
  id: Id;
  title: string;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  last_message_preview: string | null;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageKind = 'text' | 'voice' | 'call_transcript';
export type MessageStatus = 'complete' | 'streaming' | 'cancelled' | 'error';
export type Effort = 'low' | 'medium' | 'high';

export interface AudioRef {
  id: Id;
  url: string;
  mime_type: string;
  duration_ms: number;
  expires_at: IsoDateTime | null;
  peaks?: number[];
}

/** A file attached to a user message: an image preview, or a document shown by name. */
export interface AttachmentRef {
  id: Id;
  kind: 'image' | 'document';
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  /** Short-lived signed URL or auth-protected endpoint. */
  url: string;
  expires_at: IsoDateTime | null;
}

/** The current user's rating of an assistant message (api-contract.md §4.8). [CONFIRM] */
export type FeedbackRating = 'up' | 'down';

/** `report`: the strategy report generated for a conversation. */
export type ArtifactType = 'pptx' | 'xlsx' | 'report';
export type ArtifactStatus = 'queued' | 'processing' | 'ready' | 'error';

/**
 * A generated deliverable (PowerPoint, Excel) attached to an assistant message (api-contract.md §4.9).
 * Created and updated by the server — streamed as `artifact` events while it is produced. [CONFIRM]
 */
export interface Artifact {
  id: Id;
  conversation_id: Id;
  message_id: Id;
  type: ArtifactType;
  filename: string;
  status: ArtifactStatus;
  /** 0..1 while processing, when the server can estimate it. */
  progress: number | null;
  /** Present once `status` is 'ready'; the URL may be short-lived (see `ArtifactsService.download`). */
  download: { url: string; expires_at: IsoDateTime | null } | null;
  error: ErrorInfo | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface Message {
  id: Id;
  conversation_id: Id;
  client_message_id: string | null;
  role: MessageRole;
  kind: MessageKind;
  /** Markdown for assistant messages, plain text for user messages, transcript for voice. */
  content: string;
  audio: AudioRef | null;
  call: { call_session_id: Id; duration_ms: number } | null;
  status: MessageStatus;
  model?: string;
  effort?: Effort;
  /** Images sent with a user message. */
  attachments?: AttachmentRef[];
  /** Deliverables generated with an assistant message. */
  artifacts?: Artifact[];
  /** The current user's rating (assistant messages). */
  feedback?: FeedbackRating | null;
  created_at: IsoDateTime;
}

export interface ModelOption {
  id: string;
  label: string;
  efforts: Effort[];
  default_effort: Effort;
}

export interface CallSession {
  id: Id;
  conversation_id: Id;
  vapi: {
    public_key: string;
    assistant_id: string | null;
    assistant_overrides: Record<string, unknown> | null;
  };
  metadata: Record<string, string>;
  created_at: IsoDateTime;
}

/** Shape of a terminal stream `error` event and of client-side error summaries. */
export interface ErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id?: string;
  };
}

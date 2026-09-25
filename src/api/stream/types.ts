import type { Artifact, Conversation, ErrorInfo, Message } from '@/types/api';

/** Typed stream events — mirrors api-contract.md §5. */
export type StreamEvent =
  | { event: 'conversation.created'; data: Conversation }
  | { event: 'message.created'; data: { user_message: Message; assistant_message: Message } }
  | { event: 'transcript'; data: { message_id: string; text: string } }
  /**
   * Processing state for the header. `solving` is only shown when the server emits it — the client
   * never simulates phases. Unknown states are treated as `thinking` (forward compatible).
   */
  | { event: 'status'; data: { state: 'thinking' | 'solving' | 'answering' | 'tool'; label?: string } }
  | { event: 'delta'; data: { message_id: string; text: string } }
  | { event: 'conversation.updated'; data: { id: string; title: string } }
  /** A generated deliverable was created or changed (progress, ready, error): the full artifact, upserted by id. */
  | { event: 'artifact'; data: Artifact }
  | { event: 'done'; data: { message: Message; usage?: { input_tokens: number; output_tokens: number } } }
  | { event: 'error'; data: ErrorInfo };

export type StreamEventName = StreamEvent['event'];

/** A backend-agnostic stream of typed events. Iteration throws an AbortError when aborted. */
export type EventStream = AsyncIterable<StreamEvent>;

export const STREAM_EVENT_NAMES: ReadonlySet<string> = new Set<StreamEventName>([
  'conversation.created',
  'message.created',
  'transcript',
  'status',
  'delta',
  'conversation.updated',
  'artifact',
  'done',
  'error',
]);

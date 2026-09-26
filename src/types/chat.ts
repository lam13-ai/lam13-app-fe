import type { Message } from './api';

/** UI-level chat types (not wire DTOs). */

/**
 * Header status label — reference §3 ("Online" / "Thinking…" / "Answering…"). "Solving…" appears only
 * when the server's stream reports that state.
 */
export type AgentStatus = 'online' | 'transcribing' | 'thinking' | 'solving' | 'answering';

/**
 * A message as held in the client cache. `local_key` keeps a stable React key / scroll anchor
 * for messages created on this client, across optimistic → server id reconciliation.
 */
export type MessageView = Message & {
  local_key?: string;
  /** Live reasoning from this client's stream (not persisted by the server). Times are `Date.now()` ms. */
  reasoning?: { text: string; startedAt: number; endedAt?: number };
  /** Latest server-side work step while the response is still open; cleared when the stream ends. */
  progress?: string | null;
};

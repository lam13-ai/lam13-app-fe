import type { StreamEvent } from '@/api';
import type { ErrorInfo } from '@/types/api';
import type { MessageView } from '@/types/chat';

export type DraftStatus = 'sending' | 'thinking' | 'generating' | 'answering' | 'done' | 'error' | 'cancelled';

/** Progress only moves forward: a late `thinking` never sends a generating/answering response back. */
const PROGRESS: Partial<Record<DraftStatus, number>> = { sending: 0, thinking: 1, generating: 2, answering: 3 };

/** Client-side state of one streamed exchange. */
export interface StreamDraft {
  conversationId: string | null;
  /** Null when regenerating an existing answer. */
  user: MessageView | null;
  assistant: MessageView;
  status: DraftStatus;
  error: ErrorInfo | null;
  title: string | null;
}

export function isTerminal(status: DraftStatus): boolean {
  return status === 'done' || status === 'error' || status === 'cancelled';
}

/** Closes a reasoning block still open (the answer started, or the response ended). */
function endReasoning(reasoning: MessageView['reasoning']): MessageView['reasoning'] {
  return reasoning && !reasoning.endedAt ? { ...reasoning, endedAt: Date.now() } : reasoning;
}

/**
 * Server messages keep the client's local_key so React keys / scroll anchors stay stable, and the
 * client-only live fields (reasoning, progress), which the server never sends.
 */
function reconcile(server: MessageView, local: MessageView | null): MessageView {
  if (!local) return server;
  return {
    ...server,
    ...(local.local_key && { local_key: local.local_key }),
    ...(local.reasoning && { reasoning: endReasoning(local.reasoning) }),
    ...(local.progress && { progress: local.progress }),
  };
}

/** Pure reducer: applies one stream event to the draft (api-contract.md §5). */
export function applyStreamEvent(draft: StreamDraft, event: StreamEvent): StreamDraft {
  switch (event.event) {
    case 'conversation.created':
      return { ...draft, conversationId: event.data.id };

    case 'message.created':
      return {
        ...draft,
        user: draft.user ? reconcile(event.data.user_message, draft.user) : null,
        assistant: reconcile({ ...event.data.assistant_message, content: '' }, draft.assistant),
      };

    case 'transcript':
      if (!draft.user || event.data.message_id !== draft.user.id) return draft;
      return { ...draft, user: { ...draft.user, content: event.data.text } };

    case 'status': {
      const next: DraftStatus =
        event.data.state === 'answering' ? 'answering' : event.data.state === 'generating' ? 'generating' : 'thinking';
      const current = PROGRESS[draft.status];
      if (current === undefined) return draft; // already terminal
      return (PROGRESS[next] ?? 0) > current ? { ...draft, status: next } : draft;
    }

    case 'delta':
      if (event.data.message_id !== draft.assistant.id) return draft;
      return {
        ...draft,
        status: 'answering',
        assistant: {
          ...draft.assistant,
          content: draft.assistant.content + event.data.text,
          // The first words of the answer end the thinking.
          reasoning: endReasoning(draft.assistant.reasoning),
        },
      };

    case 'reasoning': {
      if (event.data.message_id !== draft.assistant.id) return draft;
      const current = draft.assistant.reasoning;
      const reasoning = current
        ? { ...current, text: current.text + event.data.text }
        : { text: event.data.text, startedAt: Date.now() };
      return { ...draft, assistant: { ...draft.assistant, reasoning } };
    }

    case 'progress':
      if (event.data.message_id !== draft.assistant.id) return draft;
      return { ...draft, assistant: { ...draft.assistant, progress: event.data.text } };

    case 'conversation.updated':
      return { ...draft, title: event.data.title };

    case 'artifact': {
      if (event.data.message_id !== draft.assistant.id) return draft;
      const list = draft.assistant.artifacts ?? [];
      // Updated artifacts keep their position; new ones are appended.
      const artifacts = list.some((a) => a.id === event.data.id)
        ? list.map((a) => (a.id === event.data.id ? event.data : a))
        : [...list, event.data];
      return { ...draft, assistant: { ...draft.assistant, artifacts } };
    }

    case 'done':
      return {
        ...draft,
        status: event.data.message.status === 'cancelled' ? 'cancelled' : 'done',
        assistant: reconcile(event.data.message, draft.assistant),
      };

    case 'error':
      return { ...draft, status: 'error', error: event.data, assistant: { ...draft.assistant, status: 'error' } };

    default:
      return draft;
  }
}

import type { StreamEvent } from '@/api';
import type { ErrorInfo } from '@/types/api';
import type { MessageView } from '@/types/chat';

export type DraftStatus = 'sending' | 'thinking' | 'answering' | 'done' | 'error' | 'cancelled';

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

/** Server messages keep the client's local_key so React keys / scroll anchors stay stable. */
function reconcile(server: MessageView, local: MessageView | null): MessageView {
  return local?.local_key ? { ...server, local_key: local.local_key } : server;
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

    case 'status':
      return { ...draft, status: event.data.state === 'answering' ? 'answering' : 'thinking' };

    case 'delta':
      if (event.data.message_id !== draft.assistant.id) return draft;
      return {
        ...draft,
        status: 'answering',
        assistant: { ...draft.assistant, content: draft.assistant.content + event.data.text },
      };

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

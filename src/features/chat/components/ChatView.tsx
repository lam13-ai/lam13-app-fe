import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { queryKeys } from '@/api';
import { ErrorState } from '@/components/ErrorState';
import { useToast } from '@/components/ui';
import { env } from '@/lib/env';
import { createId } from '@/lib/id';
import { useStreamStore } from '@/stores/streamStore';
import { useUiStore } from '@/stores/uiStore';
import type { Conversation } from '@/types/api';
import type { AgentStatus } from '@/types/chat';
import { AGENT_NAME, AGENT_TAGLINE } from '../constants';
import { useChatActions } from '../hooks/useChatActions';
import { useMessages } from '../hooks/useMessages';
import { NEW_CONVERSATION_KEY } from '../lib/messageCache';
import { ChatHeader } from './ChatHeader';
import { Composer } from './composer/Composer';
import { EmptyState } from './EmptyState';
import { MessageLog } from './MessageLog';
import { MessagesSkeleton } from './MessagesSkeleton';

export interface ChatViewProps {
  /** Undefined for a new, unsaved chat (`/`). */
  conversationId?: string;
  /** Undefined while loading, or for a new chat. */
  conversation?: Conversation;
  /** The route's React key for this view; handed to the created conversation's URL to keep this instance. */
  viewKey?: string;
}

/**
 * Chat workspace: header + log + composer. Desktop renders the reference's bordered 12px card;
 * mobile is full-bleed. Mount with a `key` per route so view state resets per conversation.
 */
export function ChatView({ conversationId, conversation, viewKey }: ChatViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // Arrived via New Chat: the empty state plays its entrance transition.
  const enteringNewChat = !conversationId && (location.state as { newChat?: boolean } | null)?.newChat === true;
  const queryClient = useQueryClient();
  const toast = useToast();
  const actions = useChatActions();
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  const created = useStreamStore((s) => s.created);
  // Identifies this new-chat view so only it follows a lazily created conversation.
  const [origin] = useState(createId);
  // The stream and its messages move to the created conversation's id at once; follow them there
  // while the URL catches up, so the view never briefly reads the abandoned 'new' state.
  const effectiveId = conversationId ?? (created?.origin === origin ? created.id : undefined);
  const key = effectiveId ?? NEW_CONVERSATION_KEY;

  const history = useMessages(effectiveId);
  const active = useStreamStore((s) => s.active[key]);
  const failures = useStreamStore((s) => s.failures);

  // A fresh `/` starts empty unless its previous stream is still running.
  useEffect(() => {
    if (!conversationId && !useStreamStore.getState().active[NEW_CONVERSATION_KEY]) {
      queryClient.removeQueries({ queryKey: queryKeys.messages(NEW_CONVERSATION_KEY), exact: true });
    }
  }, [conversationId, queryClient]);

  // Lazy creation: the first send from `/` creates the conversation — move to its URL.
  // The hand-off is cleared only once the URL has caught up.
  useEffect(() => {
    if (created?.origin !== origin) return;
    if (conversationId) useStreamStore.getState().setCreated(null);
    else navigate(`/c/${created.id}`, { replace: true, state: { viewKey } });
  }, [created, origin, conversationId, navigate, viewKey]);

  const status: AgentStatus = !active
    ? 'online'
    : active.phase === 'answering' || active.phase === 'transcribing' || active.phase === 'solving'
      ? active.phase
      : 'thinking';
  const title = conversationId ? conversation?.title : AGENT_NAME;
  const send = (text: string) => void actions.send(conversationId, text, { origin });
  const loadingHistory = Boolean(conversationId) && history.isPending;

  let body;
  if (loadingHistory) {
    body = <MessagesSkeleton />;
  } else if (history.isError && history.messages.length === 0) {
    body = (
      <ErrorState
        className="min-h-0 flex-1"
        eyebrow="Error"
        title="Couldn't load messages."
        description="Something went wrong while loading this conversation."
        action={{ label: 'Try again', onClick: () => void history.refetch() }}
      />
    );
  } else if (history.messages.length === 0) {
    body = <EmptyState onSuggestion={send} entering={enteringNewChat} />;
  } else {
    body = (
      <MessageLog
        messages={history.messages}
        failures={failures}
        older={{
          hasOlder: Boolean(history.hasNextPage),
          loading: history.isFetchingNextPage,
          error: history.isFetchNextPageError,
          load: () => void history.fetchNextPage(),
        }}
        onRetry={active ? undefined : (message) => void actions.retry(key, message, history.messages, { origin })}
        streaming={Boolean(active)}
      />
    );
  }

  return (
    <section
      aria-label="Chat"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-bg md:rounded-card md:border md:border-hairline-strong md:shadow-card"
    >
      <ChatHeader
        title={title}
        subtitle={conversationId ? AGENT_NAME : AGENT_TAGLINE}
        status={status}
        onOpenSidebar={() => setSidebarOpen(true)}
      />

      {body}

      <div className="shrink-0 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:px-5">
        <div className="mx-auto w-full max-w-[var(--chat-max-w)]">
          <Composer
            draftKey={key}
            streaming={Boolean(active)}
            disabled={loadingHistory || (history.isError && history.messages.length === 0)}
            onSend={send}
            onStop={() => actions.stop(key)}
            onSendVoice={
              env.features.voiceNotes
                ? (recording, signal) => actions.sendVoice(conversationId, recording, { origin, signal })
                : undefined
            }
            onAttach={() => toast.show("Image attachments aren't available yet.")}
          />
        </div>
      </div>
    </section>
  );
}

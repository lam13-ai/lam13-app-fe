import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router';
import { isNotFound } from '@/api';
import { ChatView } from '@/features/chat';
import { useConversation } from '@/features/conversations';
import NotFoundRoute from './NotFoundRoute';
import { RoutePanel } from './RoutePanel';

/** `/` (new chat) and `/c/:conversationId`. */
export default function ChatRoute() {
  const { conversationId } = useParams();
  const location = useLocation();
  const conversation = useConversation(conversationId);

  useEffect(() => {
    document.title = conversation.data ? `${conversation.data.title} · Lam13` : 'Lam13';
  }, [conversation.data]);

  if (conversationId && conversation.isError && !conversation.data) {
    if (isNotFound(conversation.error)) return <NotFoundRoute />;
    return (
      <RoutePanel
        eyebrow="Error"
        title="Couldn't load this conversation."
        description="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => void conversation.refetch() }}
      />
    );
  }

  // Each visit to `/` (e.g. "New chat") gets a fresh view. A new chat moving to its created
  // conversation's URL carries its view key along, so the view (composer, focus, stream) isn't remounted.
  const viewKey = (location.state as { viewKey?: string } | null)?.viewKey ?? conversationId ?? `new:${location.key}`;
  return (
    <ChatView
      key={viewKey}
      viewKey={viewKey}
      conversationId={conversationId}
      conversation={conversation.data}
    />
  );
}

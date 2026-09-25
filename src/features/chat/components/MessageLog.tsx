import { ArrowDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ScrollArea';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ErrorInfo } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { useAnchoredScroll } from '../hooks/useAnchoredScroll';
import { useLogScroll } from '../hooks/useLogScroll';
import { isLocalId, messageKey } from '../lib/messageCache';
import { AssistantMessage } from './AssistantMessage';
import { MessageNotice } from './MessageNotice';
import { UserMessage } from './UserMessage';

export interface OlderMessagesState {
  hasOlder: boolean;
  loading: boolean;
  error: boolean;
  load: () => void;
}

export interface MessageLogProps {
  messages: MessageView[];
  failures: Record<string, ErrorInfo>;
  older: OlderMessagesState;
  /** Undefined while a response is streaming (one stream per conversation). */
  onRetry?: (message: MessageView) => void;
  /** A response is streaming for the latest turn. */
  streaming?: boolean;
}

interface Turn {
  key: string;
  /** Starts with a user message (the scroll anchor). */
  anchored: boolean;
  messages: MessageView[];
}

/** A turn is a user message plus the answers after it; wrappers keep stable keys so nothing remounts. */
function groupTurns(messages: MessageView[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const current = turns.at(-1);
    if (message.role === 'user' || !current) {
      turns.push({ key: `turn:${messageKey(message)}`, anchored: message.role === 'user', messages: [message] });
    } else {
      current.messages.push(message);
    }
  }
  return turns;
}

export function MessageLog({ messages, failures, older, onRetry, streaming = false }: MessageLogProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const lastUser = messages.findLast((m) => m.role === 'user');
  useAnchoredScroll({ logRef, contentRef, anchorId: lastUser ? messageKey(lastUser) : undefined });

  const { showJump, onScroll, jumpToLatest, resetLoadOlder } = useLogScroll({
    logRef,
    contentRef,
    firstKey: messages[0] ? messageKey(messages[0]) : undefined,
    canLoadOlder: older.hasOlder && !older.loading && !older.error,
    onLoadOlder: older.load,
  });

  useEffect(() => {
    if (!older.loading) resetLoadOlder();
  }, [older.loading, resetLoadOlder]);

  const turns = groupTurns(messages);

  const renderMessages = (list: MessageView[]) =>
    list.map((message) => {
      const key = messageKey(message);
      // Only messages created on this client animate in (keys are stable, so no replays).
      const animate = Boolean(message.local_key) || isLocalId(message.id);
      const retry = onRetry && (() => onRetry(message));
      return message.role === 'user' ? (
        <UserMessage
          key={key}
          anchorKey={key}
          message={message}
          failure={failures[key]}
          onRetry={retry}
          animate={animate}
          sending={streaming && message === lastUser}
        />
      ) : (
        <AssistantMessage
          key={key}
          anchorKey={key}
          message={message}
          failure={failures[key]}
          onRetry={retry}
          // ponytail: no Regenerate — the backend has no regenerate endpoint yet.
          animate={animate}
        />
      );
    });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col [view-transition-name:chat-body]">
      <ScrollArea
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        // Keyboard users can focus the history to scroll it with arrow/page keys.
        tabIndex={0}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 px-4 py-5 [container-type:size] [overflow-anchor:none] focus-visible:outline-offset-[-2px] md:px-5"
      >
        <div ref={contentRef} className="mx-auto flex w-full max-w-[var(--chat-max-w)] flex-col gap-2.5">
          {older.loading && (
            <div className="flex justify-center py-2" role="status" aria-label="Loading earlier messages">
              <Spinner size={20} state="active" className="text-fg-muted" />
            </div>
          )}
          {older.error && (
            <div className="flex justify-center">
              <MessageNotice tone="muted" text="Couldn't load earlier messages." onAction={older.load} />
            </div>
          )}

          {turns.map((turn, i) => (
            <div
              key={turn.key}
              className={cn(
                'flex flex-col gap-2.5 [&:not(:first-child)]:mt-4',
                // The latest turn fills at least the viewport so its user message can sit at the top.
                i === turns.length - 1 && turn.anchored && 'min-h-[100cqh]',
              )}
            >
              {renderMessages(turn.messages)}
            </div>
          ))}
        </div>
      </ScrollArea>

      <button
        type="button"
        onClick={jumpToLatest}
        aria-label="Jump to latest"
        tabIndex={showJump ? 0 : -1}
        aria-hidden={!showJump}
        className={cn(
          'hit-area absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full',
          'border border-border bg-bg text-fg shadow-card transition-all duration-200 ease-standard hover:border-fg/40',
          showJump ? 'visible opacity-100' : 'pointer-events-none invisible translate-y-2 opacity-0',
        )}
      >
        <ArrowDown size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

import { ArrowDown } from 'lucide-react';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { useApi } from '@/api';
import { Spinner, iconProps } from '@/components/ui';
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
  /** What the streaming response is doing before its first words ("Generating response…"). */
  activity?: string;
  /** More work is running after the answer's text so far (an agent): its status shows under the text. */
  working?: boolean;
  /** Other things said in this conversation (presentation runs), placed by time among the turns. */
  inserts?: LogInsert[];
}

export interface LogInsert {
  key: string;
  /** When it happened (ms): it follows the last turn that started before it. */
  at: number;
  node: ReactNode;
}

interface MessageRowProps {
  message: MessageView;
  failure: ErrorInfo | undefined;
  /** Only for a row that offers Retry / Regenerate; otherwise undefined, so the row's props stay stable. */
  onRetry?: (message: MessageView) => void;
  regenerate: boolean;
  animate: boolean;
  sending: boolean;
  activity: string | undefined;
  working: boolean;
}

/**
 * One message. Memoized: a finished message keeps the same props (the same cached object, no callbacks),
 * so a long history doesn't re-render while a new answer is generating — only the rows that change do.
 */
const MessageRow = memo(function MessageRow({
  message,
  failure,
  onRetry,
  regenerate,
  animate,
  sending,
  activity,
  working,
}: MessageRowProps) {
  const key = messageKey(message);
  const retry = onRetry && (() => onRetry(message));
  return message.role === 'user' ? (
    <UserMessage anchorKey={key} message={message} failure={failure} onRetry={retry} animate={animate} sending={sending} />
  ) : (
    <AssistantMessage
      anchorKey={key}
      message={message}
      failure={failure}
      onRetry={retry}
      onRegenerate={regenerate ? retry : undefined}
      animate={animate}
      activity={activity}
      working={working}
    />
  );
});

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

const NO_INSERTS: LogInsert[] = [];

export function MessageLog({ messages, failures, older, onRetry, streaming = false, activity, working = false, inserts = NO_INSERTS }: MessageLogProps) {
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
  // Each insert follows the last turn that started before it (-1: before every turn).
  const turnTimes = turns.map((turn) => Date.parse(turn.messages[0]!.created_at));
  const insertsAfter = (index: number) =>
    inserts.filter((insert) => turnTimes.findLastIndex((time) => !(time > insert.at)) === index).map((insert) => <div key={insert.key}>{insert.node}</div>);
  const last = messages.at(-1);
  const canRegenerate = useApi().capabilities.regenerate;

  const renderMessages = (list: MessageView[]) =>
    list.map((message) => {
      const key = messageKey(message);
      // Regenerate the latest completed server answer (api-contract.md §4.3) when the backend can; never while streaming.
      const regenerate =
        Boolean(onRetry) && canRegenerate && message === last && message.status === 'complete' && !isLocalId(message.id);
      // Retry belongs to a failed / stopped message only (and Regenerate to the latest answer).
      const offersRetry = message.status === 'error' || message.status === 'cancelled' || regenerate;
      return (
        <MessageRow
          key={key}
          message={message}
          failure={failures[key]}
          onRetry={offersRetry ? onRetry : undefined}
          regenerate={regenerate}
          // Only messages created on this client animate in (keys are stable, so no replays).
          animate={Boolean(message.local_key) || isLocalId(message.id)}
          sending={streaming && message === lastUser}
          activity={message === last ? activity : undefined}
          working={working && message === last}
        />
      );
    });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col [view-transition-name:chat-body]">
      {/* Visible thin scrollbar (same as the sidebar history), unlike the shared hidden-scrollbar ScrollArea. */}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        // Keyboard users can focus the history to scroll it with arrow/page keys.
        tabIndex={0}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-subtle px-4 py-5 [container-type:size] [overflow-anchor:none] focus-visible:outline-offset-[-2px] md:px-5"
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

          {insertsAfter(-1)}
          {turns.flatMap((turn, i) => {
            const after = insertsAfter(i);
            return [
              <div
                key={turn.key}
                className={cn(
                  'flex flex-col gap-2.5 [&:not(:first-child)]:mt-4',
                  // The latest turn fills at least the viewport so its user message can sit at the top
                  // (unless something follows it: that would be pushed out of sight).
                  i === turns.length - 1 && turn.anchored && after.length === 0 && 'min-h-[100cqh]',
                )}
              >
                {renderMessages(turn.messages)}
              </div>,
              ...after,
            ];
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={jumpToLatest}
        aria-label="Jump to latest"
        tabIndex={showJump ? 0 : -1}
        aria-hidden={!showJump}
        className={cn(
          'hit-area absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full',
          'border border-border bg-bg text-fg shadow-card transition-all duration-200 ease-standard hover:border-fg/40',
          showJump ? 'visible opacity-100' : 'pointer-events-none invisible translate-y-2 opacity-0',
        )}
      >
        <ArrowDown {...iconProps} />
      </button>
    </div>
  );
}

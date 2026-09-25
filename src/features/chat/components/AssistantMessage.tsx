import { Markdown } from '@/components/Markdown';
import { VisuallyHidden } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ErrorInfo } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { MessageActions } from './MessageActions';
import { MessageNotice } from './MessageNotice';

/**
 * Full-width document-style answer: no bubble, no avatar (reference §4).
 * While streaming the text grows in place; before the first token nothing is shown here —
 * the header status carries "Thinking…", as in the reference.
 */
export function AssistantMessage({
  message,
  anchorKey,
  failure,
  onRetry,
  onRegenerate,
  animate,
}: {
  message: MessageView;
  anchorKey: string;
  failure?: ErrorInfo;
  /** Undefined while another response is streaming. */
  onRetry?: () => void;
  /** Regenerate a completed answer (only the latest one, and never while streaming). */
  onRegenerate?: () => void;
  animate?: boolean;
}) {
  const streaming = message.status === 'streaming';
  const hasContent = message.content.length > 0;

  return (
    <article
      data-message-id={anchorKey}
      aria-busy={streaming}
      className={cn('group/message w-full self-start py-1', animate && 'animate-fade')}
    >
      <VisuallyHidden>Lam13 replied:</VisuallyHidden>
      {hasContent && <Markdown content={message.content} />}
      {message.status === 'complete' && hasContent && (
        <MessageActions createdAt={message.created_at} copyText={message.content} onRegenerate={onRegenerate} />
      )}

      {message.status === 'cancelled' && (
        <MessageNotice
          tone="muted"
          text={hasContent ? 'Response stopped.' : 'Stopped before a response was generated.'}
          onAction={onRetry}
        />
      )}
      {message.status === 'error' && (
        <MessageNotice
          tone="danger"
          text={failure?.message ?? 'Something went wrong while generating this response.'}
          onAction={failure?.retryable === false ? undefined : onRetry}
        />
      )}
    </article>
  );
}

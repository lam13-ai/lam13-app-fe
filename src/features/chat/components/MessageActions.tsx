import { Check, Copy, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { memo } from 'react';
import { IconButton, Tooltip, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { describeMessageTime, formatMessageTime } from '@/lib/format';
import type { FeedbackRating } from '@/types/api';
import { useCopyText } from '../hooks/useCopyText';

export interface MessageActionsProps {
  /** Message `created_at` (ISO). */
  createdAt: string;
  /** Raw message text (Markdown for answers) — omit to hide Copy. */
  copyText?: string;
  /** Regenerate this answer — only passed when the API supports it for this message. */
  onRegenerate?: () => void;
  /** Thumbs up / down — only passed once the feedback endpoint exists (backend-dependent). */
  feedback?: {
    rating: FeedbackRating | null;
    pending: boolean;
    onRate: (rating: FeedbackRating | null) => void;
  };
  align?: 'start' | 'end';
}

/**
 * Subtle row under a message: time, Copy and (for the latest answer) Regenerate.
 * With a mouse it appears on hover / keyboard focus of the message (same pattern as the sidebar's
 * row actions); on touch screens it is always shown, since there is no hover.
 * Rendered only when a parent carries `group/message`.
 */
// Memoised: the log re-renders every message on each streamed chunk; unchanged rows skip the work.
export const MessageActions = memo(function MessageActions({
  createdAt,
  copyText,
  onRegenerate,
  feedback,
  align = 'start',
}: MessageActionsProps) {
  const { copied, copy } = useCopyText();
  const time = formatMessageTime(createdAt);

  return (
    <div
      className={cn(
        'mt-1 flex items-center gap-1 transition-opacity duration-150 ease-standard',
        align === 'end' && 'flex-row-reverse',
        'pointer-fine:opacity-0 pointer-fine:group-hover/message:opacity-100 pointer-fine:group-focus-within/message:opacity-100',
      )}
    >
      {time && (
        <time dateTime={createdAt} title={describeMessageTime(createdAt)} className="px-1 text-2xs text-fg-muted">
          {time}
        </time>
      )}
      {copyText && (
        <Tooltip content={copied ? 'Copied' : 'Copy'} align={align}>
          <IconButton
            label={copied ? 'Copied' : 'Copy message'}
            icon={copied ? <Check {...smallIconProps} /> : <Copy {...smallIconProps} />}
            onClick={() => void copy(copyText)}
          />
        </Tooltip>
      )}
      {onRegenerate && (
        <Tooltip content="Regenerate" align={align}>
          <IconButton label="Regenerate response" icon={<RefreshCw {...smallIconProps} />} onClick={onRegenerate} />
        </Tooltip>
      )}
      {feedback &&
        (['up', 'down'] as const).map((rating) => {
          const active = feedback.rating === rating;
          const Icon = rating === 'up' ? ThumbsUp : ThumbsDown;
          return (
            <IconButton
              key={rating}
              label={rating === 'up' ? 'Good response' : 'Bad response'}
              aria-pressed={active}
              disabled={feedback.pending}
              icon={<Icon {...smallIconProps} fill={active ? 'currentColor' : 'none'} />}
              // Tapping the chosen rating again clears it.
              onClick={() => feedback.onRate(active ? null : rating)}
              className={cn(active && 'text-fg')}
            />
          );
        })}
      <span role="status" className="sr-only">
        {copied ? 'Copied to clipboard.' : ''}
      </span>
    </div>
  );
});

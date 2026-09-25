import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Inline status row under a message: "Response stopped · Retry", "Not sent · Retry", errors. */
export function MessageNotice({
  tone,
  text,
  actionLabel = 'Retry',
  onAction,
  align = 'start',
}: {
  tone: 'muted' | 'danger';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  align?: 'start' | 'end';
}) {
  return (
    <div
      className={cn(
        'mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs',
        align === 'end' && 'justify-end',
        tone === 'danger' ? 'text-danger' : 'text-fg-muted',
      )}
    >
      <span>{text}</span>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex min-h-11 items-center gap-1.5 font-bold text-fg underline-offset-4 hover:underline md:min-h-0"
        >
          <RotateCcw size={12} strokeWidth={1.75} aria-hidden />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

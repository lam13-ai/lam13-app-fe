import { VisuallyHidden } from '@/components/ui';
import { VoicePlayer } from '@/features/voice';
import { cn } from '@/lib/cn';
import type { ErrorInfo } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { MessageActions } from './MessageActions';
import { MessageNotice } from './MessageNotice';

/**
 * Black square block, right-aligned (reference §4). Voice notes use the same block with the
 * reusable player and their transcript. A failed send shows "Not sent · Retry".
 */
export function UserMessage({
  message,
  anchorKey,
  failure,
  onRetry,
  animate,
  sending,
}: {
  message: MessageView;
  anchorKey: string;
  failure?: ErrorInfo;
  onRetry?: () => void;
  animate?: boolean;
  /** The send is in flight (not yet accepted by the server). */
  sending?: boolean;
}) {
  const failed = message.status === 'error';
  const voice = message.kind === 'voice' && message.audio;

  return (
    <div data-message-id={anchorKey} className={cn('group/message flex flex-col items-end', animate && 'animate-enter')}>
      <div
        aria-busy={sending || undefined}
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words bg-fg px-4 py-2.5 text-user text-bg md:max-w-[60%]',
          voice && 'w-[320px] py-3',
          failed && 'opacity-60',
        )}
      >
        {voice ? (
          <>
            <VisuallyHidden>You sent a voice message.</VisuallyHidden>
            <VoicePlayer
              src={message.audio!.url}
              durationMs={message.audio!.duration_ms}
              peaks={message.audio!.peaks}
              tone="inverse"
            />
            {message.content ? (
              <p className="mt-2.5 border-t border-bg/15 pt-2 text-xs leading-relaxed text-bg/75">
                <VisuallyHidden>Transcript: </VisuallyHidden>
                {message.content}
              </p>
            ) : (
              !failed &&
              sending && (
                <p className="mt-2.5 border-t border-bg/15 pt-2 text-xs text-bg/60 motion-safe:animate-pulse">
                  Transcribing…
                </p>
              )
            )}
          </>
        ) : (
          <>
            {message.attachments && message.attachments.length > 0 && (
              <ul aria-label="Attached images" className="mb-2 flex flex-wrap justify-end gap-1.5">
                {message.attachments.map((image) => (
                  <li key={image.id}>
                    <img src={image.url} alt={image.filename} loading="lazy" className="size-16 bg-bg/10 object-cover" />
                  </li>
                ))}
              </ul>
            )}
            <VisuallyHidden>You said: </VisuallyHidden>
            {message.content}
          </>
        )}
      </div>
      {!failed && (
        <MessageActions createdAt={message.created_at} copyText={message.content || undefined} align="end" />
      )}
      {failed && (
        <MessageNotice
          tone="danger"
          align="end"
          text={failure ? `Not sent — ${failure.message}` : 'Not sent.'}
          onAction={onRetry}
        />
      )}
    </div>
  );
}

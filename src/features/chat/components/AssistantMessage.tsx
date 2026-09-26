import { Download, FileText, Presentation } from 'lucide-react';
import { Markdown } from '@/components/Markdown';
import { Spinner, VisuallyHidden, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Artifact, ErrorInfo } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { MessageActions } from './MessageActions';
import { MessageNotice } from './MessageNotice';

/**
 * Full-width document-style answer: no bubble, no avatar (reference §4).
 * While streaming the text grows in place. Before the first token a quiet status box stands in for it
 * ("Generating response…", as in the reference); it never shows the model's reasoning.
 */
export function AssistantMessage({
  message,
  anchorKey,
  failure,
  onRetry,
  onRegenerate,
  animate,
  activity,
}: {
  message: MessageView;
  anchorKey: string;
  failure?: ErrorInfo;
  /** Undefined while another response is streaming. */
  onRetry?: () => void;
  /** Regenerate a completed answer (only the latest one, and never while streaming). */
  onRegenerate?: () => void;
  animate?: boolean;
  /** High-level status while this answer has no text yet. */
  activity?: string;
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
      {streaming && !hasContent && (
        <p role="status" className="inline-flex items-center gap-2 border border-hairline-strong px-3 py-2 text-xs text-fg-muted">
          <Spinner size={14} state="active" />
          {activity ?? 'Generating response…'}
        </p>
      )}
      {message.artifacts && message.artifacts.length > 0 && <Artifacts artifacts={message.artifacts} />}
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

const artifactLabels: Record<Artifact['type'], string> = {
  report: 'Strategy report',
  pptx: 'PowerPoint deck',
  xlsx: 'Excel workbook',
};

/** Generated deliverables (report PDF, PPTX): building → download link. */
function Artifacts({ artifacts }: { artifacts: Artifact[] }) {
  return (
    <ul aria-label="Generated files" className="mt-3 flex flex-wrap gap-2">
      {artifacts.map((a) => {
        const Icon = a.type === 'pptx' ? Presentation : FileText;
        const label = artifactLabels[a.type];
        const box = 'inline-flex items-center gap-2 border border-hairline-strong px-3 py-2 text-xs';
        return (
          <li key={a.id}>
            {a.status === 'ready' && a.download ? (
              <a href={a.download.url} target="_blank" rel="noopener noreferrer" className={cn(box, 'text-fg hover:border-fg/60')}>
                <Icon {...smallIconProps} />
                {label}
                <Download {...smallIconProps} className="text-fg-muted" />
              </a>
            ) : a.status === 'error' ? (
              <span className={cn(box, 'text-danger')}>
                <Icon {...smallIconProps} />
                {label} couldn&apos;t be generated
              </span>
            ) : (
              <span role="status" className={cn(box, 'text-fg-muted')}>
                <Spinner size={14} state="active" />
                Building {label.toLowerCase()}…
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

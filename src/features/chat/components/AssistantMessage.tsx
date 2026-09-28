import { Download, FileText, Presentation } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Markdown } from '@/components/Markdown';
import { Spinner, VisuallyHidden, iconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Artifact, ErrorInfo } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { separateDocumentLinks } from '../lib/documentLinks';
import { ActivityStatus } from './ActivityStatus';
import { MessageActions } from './MessageActions';
import { MessageNotice } from './MessageNotice';

/**
 * Full-width document-style answer: no bubble, no avatar (reference §4).
 * While the answer is generating only a quiet, rotating status box is shown (ActivityStatus): no partial
 * text, never the model's reasoning; the complete answer replaces it at once. A stopped or failed answer
 * shows what arrived.
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
  // A generated document's link at the end of the answer becomes its card: one download UI per file.
  const { content, artifacts } = useMemo(() => separateDocumentLinks(message), [message]);

  return (
    <article
      data-message-id={anchorKey}
      aria-busy={streaming}
      className={cn('group/message w-full self-start py-1', animate && 'animate-fade')}
    >
      <VisuallyHidden>Lam13 replied:</VisuallyHidden>
      {/* Never a partial answer while generating: the status stands in until the whole answer is there. */}
      {content && !streaming && <Markdown content={content} />}
      {streaming && <ActivityStatus label={activity ?? 'Putting the answer together…'} />}
      {artifacts.length > 0 && <Artifacts artifacts={artifacts} />}
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

const artifactLabels: Record<Artifact['type'], { name: string; kind: string }> = {
  report: { name: 'Strategy report', kind: 'PDF document' },
  pptx: { name: 'PowerPoint deck', kind: 'PowerPoint presentation' },
  xlsx: { name: 'Excel workbook', kind: 'Excel workbook' },
};

/** Compact document card: file icon, name over a quiet meta line, and the state or download icon at the end. */
const card =
  'flex w-full min-w-0 items-center gap-3 border border-hairline-strong bg-fg/[0.03] px-3 py-2 text-left transition-colors duration-150 ease-standard';

/** Generated deliverables (report PDF, PPTX), each one card: building → ready (the card is the download). */
function Artifacts({ artifacts }: { artifacts: Artifact[] }) {
  return (
    <ul aria-label="Generated files" className="mt-3 flex flex-col gap-2 sm:max-w-sm">
      {artifacts.map((a) => {
        const Icon = a.type === 'pptx' ? Presentation : FileText;
        const { name, kind } = artifactLabels[a.type];
        const body = (meta: string, end: ReactNode) => (
          <>
            <Icon {...iconProps} className="shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-fg">{name}</span>
              <span className="block truncate text-2xs text-fg-muted">{meta}</span>
            </span>
            {end}
          </>
        );
        return (
          <li key={a.id}>
            {a.status === 'ready' && a.download ? (
              <a
                href={a.download.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Download ${name} (${kind})`}
                className={cn(card, 'group/doc hover:border-accent/60 hover:bg-accent-wash focus-visible:border-accent')}
              >
                {body(
                  `${kind} · Download`,
                  <Download {...iconProps} className="shrink-0 text-fg-muted transition-colors group-hover/doc:text-accent group-focus-visible/doc:text-accent" />,
                )}
              </a>
            ) : a.status === 'error' ? (
              <div className={cn(card, 'border-danger/40')}>{body("Couldn't be generated", null)}</div>
            ) : (
              <div role="status" className={card}>
                {body(`Building ${kind.toLowerCase()}…`, <Spinner size={14} state="active" className="shrink-0" />)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

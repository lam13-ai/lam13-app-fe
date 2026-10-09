import { Download, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Spinner, smallIconProps } from '@/components/ui';
import { formatElapsed, formatWhen, statusesAt, type GenerationState } from '../lib/generation';

/**
 * One run's answer (the Kothar frontend's `ProcessingFlow`, on this app's surface): one status line that
 * advances in place, then the result or the failure.
 *
 * Stage copy is UX progress only — high-level phases of making a deck by elapsed time, never backend telemetry.
 */
export function ProcessingFlow({
  generation,
  onRetry,
  onCancel,
}: {
  generation: Extract<GenerationState, { startedAt: number }>;
  /** Omitted when the images are no longer held (a result restored after a reload). */
  onRetry?: () => void;
  /** Development-only escape hatch out of an in-flight run (as in the source implementation). */
  onCancel: () => void;
}) {
  const processing = generation.status === 'processing';
  const [elapsed, setElapsed] = useState(() => Date.now() - generation.startedAt);

  useEffect(() => {
    if (!processing) return;
    const tick = () => setElapsed(Date.now() - generation.startedAt);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [processing, generation.startedAt]);

  // A result that arrives early simply ends the sequence where it stands: the list is derived from elapsed
  // time, so nothing is queued to fire later.
  const currentStatus = statusesAt(elapsed).at(-1);

  return (
    <div className="flex max-w-[85%] flex-col gap-3 md:max-w-[75%]">
      {/* One persistent box for the whole run — the text updates in place rather than stacking a message per stage. */}
      {processing && (
        <section aria-label="Presentation progress" className="rounded-card border border-border bg-bg-subtle p-4">
          <p className="flex items-center gap-2.5 text-sm">
            <Spinner size={14} state="active" />
            <span>{currentStatus}</span>
          </p>
          <p className="mt-2 text-2xs text-fg-muted">
            Processing for {formatElapsed(elapsed)}
            {import.meta.env.DEV && (
              <>
                {' · '}
                <button type="button" className="underline underline-offset-2 hover:text-fg" onClick={onCancel}>
                  Cancel run (development only)
                </button>
              </>
            )}
          </p>
        </section>
      )}

      {/* Only the current stage is announced; the elapsed timer is not. */}
      <p className="sr-only" aria-live="polite">
        {processing ? currentStatus : generation.status === 'success' ? 'Your presentation is ready.' : generation.message}
      </p>

      {generation.status === 'success' && (
        <section aria-label="Presentation ready" className="flex flex-col gap-3 rounded-card border border-border bg-bg p-4">
          <p className="eyebrow">Deliverable ready</p>
          <p className="text-sm font-bold">Your presentation is ready.</p>

          <div className="flex items-center gap-3 rounded-card border border-hairline bg-bg-subtle px-3 py-2.5">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-card bg-accent-wash text-accent">
              <FileText size={16} strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold" title={generation.result.fileName}>
                {generation.result.fileName}
              </span>
              <span className="mt-0.5 block text-2xs text-fg-muted">PowerPoint · Generated {formatWhen(generation.startedAt)}</span>
            </span>
          </div>

          {/* a deck can be short a slide when one image failed to convert */}
          {generation.result.asked !== undefined && generation.result.slideCount !== undefined && generation.result.slideCount < generation.result.asked && (
            <p className="text-sm text-fg-muted">
              {generation.result.slideCount} of {generation.result.asked} images were converted. The rest could not be read.
            </p>
          )}

          <div>
            {/* the URL lives only behind this action, exactly as returned */}
            <a
              href={generation.result.downloadUrl}
              download={generation.result.fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="relative inline-flex h-11 select-none items-center justify-center gap-2.5 whitespace-nowrap bg-fg px-3 font-mono text-nav text-bg transition-colors duration-150 ease-standard hover:bg-fg/85 md:h-9"
            >
              <Download {...smallIconProps} />
              Download presentation
            </a>
          </div>
        </section>
      )}

      {generation.status === 'error' && (
        <section aria-label="Presentation failed" className="flex flex-col gap-3 rounded-card border border-border bg-bg p-4">
          <p className="eyebrow text-danger">Generation failed</p>
          <p role="alert" className="text-sm font-bold">
            {generation.message}
          </p>
          <p className="text-sm text-fg-muted">{onRetry ? 'Please try again. If the issue continues, send your images again.' : 'Send your images again to retry.'}</p>
          {onRetry && (
            <div>
              <Button variant="primary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

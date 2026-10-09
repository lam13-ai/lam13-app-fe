import { FileText } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useApi } from '@/api';
import { VisuallyHidden, smallIconProps } from '@/components/ui';
import { cancelRun, canRetry, retryRun, type PresentationRun } from '../lib/runs';
import { ProcessingFlow } from './ProcessingFlow';

/**
 * One Image → PPT run in a conversation: what the user sent (the images, and any text typed with them), then
 * the run's progress, deck or failure. Shaped like a chat turn; the run itself is `lib/runs.ts`.
 */
export function PresentationTurn({ run, onCancelled }: { run: PresentationRun; onCancelled?: (given: { files: File[]; text: string }) => void }) {
  const api = useApi();
  const ref = useRef<HTMLDivElement>(null);
  // A run that has just been sent is brought into view, like a sent message.
  useEffect(() => {
    if (run.generation.status === 'processing') ref.current?.scrollIntoView?.({ block: 'end' });
    // only when the run first appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} data-presentation-run={run.id} className="mt-4 flex flex-col gap-2.5">
      <div className="flex flex-col items-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words bg-inverse px-4 py-2.5 text-user text-on-inverse md:max-w-[60%]">
          <ul aria-label="Images for the presentation" className={`flex flex-wrap justify-end gap-1.5 ${run.text ? 'mb-2' : ''}`}>
            {run.images.map((image, i) => (
              <li key={`${image.name}:${i}`}>
                {image.url ? (
                  <img src={image.url} alt={image.name} className="size-16 bg-on-inverse/10 object-cover" />
                ) : (
                  <span className="inline-flex max-w-60 items-center gap-1.5 bg-on-inverse/10 px-2 py-1 text-xs">
                    <FileText {...smallIconProps} className="shrink-0" />
                    <span className="truncate">{image.name}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {run.text && (
            <>
              <VisuallyHidden>You said: </VisuallyHidden>
              {run.text}
            </>
          )}
        </div>
      </div>
      <ProcessingFlow
        generation={run.generation}
        onRetry={canRetry(run.id) ? () => retryRun(run.id, api.presentations.generate) : undefined}
        onCancel={() => {
          const given = cancelRun(run.id);
          if (given) onCancelled?.(given);
        }}
      />
    </div>
  );
}

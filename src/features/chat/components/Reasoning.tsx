import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { MessageView } from '@/types/chat';

const seconds = (ms: number) => Math.max(1, Math.round(ms / 1000));

/** One step per sentence or line. */
// ponytail: naive split (an abbreviation before a capital splits early); display only.
export const toSteps = (text: string) =>
  text
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])|\n+/)
    .map((step) => step.trim())
    .filter(Boolean);

/**
 * The model's reasoning above an answer, as a collapsible window. Live: pulsing dots, the latest step as the
 * title and the elapsed time, with every step listed below. Once the answer starts it collapses to
 * "Thought for Ns". The header toggles it at any time.
 */
export function Reasoning({
  reasoning,
  streaming,
}: {
  reasoning: NonNullable<MessageView['reasoning']>;
  /** The answer is still generating; a response stopped mid-thought stops the clock too. */
  streaming: boolean;
}) {
  const live = streaming && reasoning.endedAt === undefined;
  // Open while thinking, collapsed once the answer starts — until the user chooses.
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? live;
  const [now, setNow] = useState(() => Date.now());
  const bodyId = useId();

  // Tick the elapsed time only while thinking.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const steps = toSteps(reasoning.text);
  const latest = steps.at(-1) ?? 'Thinking…';
  const elapsed = `${seconds((reasoning.endedAt ?? Math.max(now, reasoning.startedAt)) - reasoning.startedAt)}s`;

  return (
    <div data-reasoning className="mb-3 border border-hairline-strong">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setChoice(!open)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-fg-muted hover:text-fg"
      >
        {live && (
          <span aria-hidden="true" className="flex shrink-0 gap-1">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            <span className="size-1.5 animate-pulse rounded-full bg-accent [animation-delay:400ms]" />
          </span>
        )}
        <span className="min-w-0 truncate">{live ? latest : `Thought for ${elapsed}`}</span>
        {live && <span className="shrink-0 text-fg-soft">{elapsed}</span>}
        <ChevronDown
          {...smallIconProps}
          className={cn('ml-auto shrink-0 transition-transform duration-150', open && 'rotate-180')}
        />
      </button>

      {/* 0fr → 1fr rows animate the height without measuring it. */}
      <div
        id={bodyId}
        aria-hidden={!open}
        className={cn('grid transition-[grid-template-rows] duration-200 ease-standard', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="overflow-hidden">
          <div className="mx-3 mb-3 border border-hairline bg-bg-subtle px-3 py-2 text-xs leading-relaxed">
            <p className="flex items-center gap-1.5 text-fg-muted">
              <span className="min-w-0 truncate">{latest}</span>
              <ChevronDown {...smallIconProps} className="shrink-0" />
            </p>
            {/* column-reverse keeps the newest step in view as the list grows (no scroll code). */}
            <div className="mt-2 flex max-h-60 flex-col-reverse overflow-y-auto scrollbar-subtle">
              <ol className="flex flex-col gap-1">
                {steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

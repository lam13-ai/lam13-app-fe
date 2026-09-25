import { useState } from 'react';
import { ScrollArea } from '@/components/ScrollArea';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { SUGGESTED_PROMPTS } from '../constants';

/**
 * Centred listening ring + prompt line (reference §7) with our suggested prompts.
 *
 * `entering` (New Chat from a conversation): the same agent ring settles in first, then the prompt
 * content follows — one continuous animation that becomes the resting empty state (≈300ms).
 */
export function EmptyState({
  onSuggestion,
  entering = false,
}: {
  onSuggestion: (prompt: string) => void;
  entering?: boolean;
}) {
  const [phase, setPhase] = useState<'entering' | 'idle'>(entering ? 'entering' : 'idle');
  const animate = phase === 'entering';

  return (
    <ScrollArea data-transition={phase} className="flex min-h-0 flex-1 flex-col px-6 py-8 [view-transition-name:chat-body]">
      <div className="m-auto flex max-w-xl flex-col items-center gap-5 text-center">
        {/* Entrance lives on a wrapper so the ring's own breathing animation keeps running. */}
        <span className={cn('inline-flex', animate && 'animate-agent-in')}>
          <Spinner size={64} state="listening" label="Agent listening" className="text-accent" />
        </span>
        <div
          className={cn('flex flex-col items-center gap-5', animate && 'animate-reveal-late')}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setPhase('idle');
          }}
        >
          <p className="max-w-[34ch] text-sm leading-relaxed text-fg-muted">
            Ask me to design, stress-test, or package a strategy.
          </p>
          <ul aria-label="Suggested prompts" className="mt-1 flex flex-wrap justify-center gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  onClick={() => onSuggestion(prompt)}
                  className="min-h-11 border border-fg/20 bg-bg px-3 py-2 text-xs text-fg-muted transition-colors duration-150 ease-standard hover:border-fg/60 hover:text-fg md:min-h-0"
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ScrollArea>
  );
}

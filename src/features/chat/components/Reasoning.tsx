import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Spinner, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { MessageView } from '@/types/chat';

const seconds = (ms: number) => Math.max(1, Math.round(ms / 1000));

/**
 * The model's reasoning above an answer (reference §9: a collapsible block). Live: dot-ring + "Thinking · Ns"
 * with the text streaming below. Once the answer starts: a collapsed "Thought for Ns" row that expands it.
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
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyId = useId();

  // Tick the elapsed time only while thinking.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // Follow the newest reasoning while it streams.
  useEffect(() => {
    if (live && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [live, reasoning.text]);

  const elapsed = seconds((reasoning.endedAt ?? Math.max(now, reasoning.startedAt)) - reasoning.startedAt);
  const showBody = live || open;

  return (
    <div className="mb-3 border border-hairline-strong">
      {live ? (
        <p className="eyebrow flex items-center gap-2.5 px-3 py-2">
          <Spinner size={14} state="active" />
          Thinking · {elapsed}s
        </p>
      ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="eyebrow flex w-full items-center gap-2.5 px-3 py-2 text-left hover:text-fg"
        >
          Thought for {elapsed}s
          <ChevronDown {...smallIconProps} className={cn('ml-auto transition-transform duration-150', open && 'rotate-180')} />
        </button>
      )}
      {showBody && (
        <div
          id={bodyId}
          ref={bodyRef}
          className="max-h-60 animate-enter-sm overflow-y-auto whitespace-pre-wrap border-t border-hairline bg-bg-subtle px-3 py-2 text-xs leading-relaxed text-fg-muted"
        >
          {reasoning.text}
        </div>
      )}
    </div>
  );
}

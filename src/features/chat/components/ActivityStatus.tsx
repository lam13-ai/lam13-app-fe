import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui';

/**
 * Generic "still working" labels shown in turn while the answer is generating. They are UX copy, not
 * model steps: the model's reasoning is never shown. Real events move the sequence forward (start →
 * "Thinking…", response_started → "Generating response…", first token → "Putting the answer together…");
 * it never goes back. After one pass it keeps cycling through the later labels, so a long answer never
 * looks frozen.
 */
export const ACTIVITY_STEPS = [
  'Thinking…',
  'Preparing your answer…',
  'Working on it…',
  'Generating response…',
  'Putting the answer together…',
  'Almost there…',
] as const;
export const ACTIVITY_STEP_MS = 3500;
/** Where the sequence continues after its first pass. */
const LOOP_FROM = 2;
/** Re-render cadence; the label itself is derived from elapsed time, so throttled timers only delay it. */
const TICK_MS = 500;
const LAST = ACTIVITY_STEPS.length - 1;

/** Absolute position (keeps growing) → the label index shown. */
const labelIndex = (position: number) =>
  position <= LAST ? position : LOOP_FROM + ((position - LOOP_FROM) % (LAST - LOOP_FROM + 1));

/**
 * The quiet status box in an answer's place. `label`: what the stream reports (an ACTIVITY_STEPS entry
 * rotates from there; anything else, e.g. "Solving…", is shown as is). Mounted only while the answer is
 * generating, so completion, Stop or an error unmount it and clear its timer.
 */
export function ActivityStatus({ label }: { label: string }) {
  const anchor = ACTIVITY_STEPS.indexOf(label as (typeof ACTIVITY_STEPS)[number]);
  // `now` is the last tick: the step comes from time elapsed since `at`, so a hidden tab's throttled
  // timers can't leave a stale label — the first tick back shows where the sequence should be.
  const [clock, setClock] = useState(() => {
    const now = Date.now();
    return { anchor, step: Math.max(anchor, 0), at: now, now };
  });
  const step = clock.step + Math.floor((clock.now - clock.at) / ACTIVITY_STEP_MS);
  if (anchor !== clock.anchor) {
    // A real event: continue from it, unless the sequence is already past it (never backwards).
    setClock({ anchor, step: Math.max(anchor, step), at: clock.now, now: clock.now });
  }

  const rotating = anchor >= 0;
  useEffect(() => {
    if (!rotating) return;
    const tick = () => setClock((c) => ({ ...c, now: Date.now() }));
    const id = setInterval(tick, TICK_MS);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [rotating]);

  const text = anchor >= 0 ? ACTIVITY_STEPS[labelIndex(step)] : label;
  return (
    <p data-activity className="inline-flex items-center gap-2 border border-hairline-strong px-3 py-2 text-xs text-fg-muted">
      <Spinner size={14} state="active" />
      {/* Fades in on each change; screen readers get one stable announcement instead of every label. */}
      <span key={text} aria-hidden="true" className="animate-fade">
        {text}
      </span>
      <span role="status" className="sr-only">
        Lam13 is working on the answer.
      </span>
    </p>
  );
}

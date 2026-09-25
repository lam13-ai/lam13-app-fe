import { PhoneOff, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AgentMark } from '@/components/AgentMark';
import { ScrollArea } from '@/components/ScrollArea';
import { Button, iconProps } from '@/components/ui';
import { Waveform } from '@/components/Waveform';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { useCall } from '../CallingProvider';
import type { CallState } from '../lib/callMachine';

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, now - startedAt);
}

function statusLine(state: CallState, elapsedMs: number): string {
  switch (state.status) {
    case 'connecting':
      return 'Connecting…';
    case 'active':
      return `Live · ${formatDuration(elapsedMs)}`;
    case 'ending':
      return 'Ending call…';
    case 'error':
      return state.error.code === 'ended-unexpectedly' || state.error.code === 'call-failed' ? 'Call ended' : "Couldn't start call";
    default:
      return '';
  }
}

/**
 * Live voice-call panel (desktop: floating card under the chat header; mobile: bottom sheet).
 * Shows state, duration, a level meter, the live transcript (this call only — not saved, not added to
 * chat history) and End Call. Rendered only while a call exists or has just failed.
 */
export function CallPanel() {
  const { state, transcript, missingConfig, end, start, dismiss, getLevel } = useCall();
  const startedAt = state.status === 'active' || state.status === 'ending' ? (state.startedAt ?? null) : null;
  const elapsed = useElapsed(startedAt);
  const logRef = useRef<HTMLDivElement>(null);

  // Live transcript follows the newest line.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [transcript]);

  if (state.status === 'idle') return null;

  const live = state.status === 'active';
  const error = state.status === 'error' ? state.error : null;

  return (
    <section
      aria-label="Voice call"
      className={cn(
        'z-40 flex animate-enter flex-col bg-bg',
        // Mobile: bottom sheet. Desktop: floating card inside the chat card, under its header.
        'fixed inset-x-0 bottom-0 max-h-[70dvh] rounded-t-card border-t border-hairline-strong shadow-elevated pb-[env(safe-area-inset-bottom)]',
        'md:absolute md:inset-x-auto md:bottom-auto md:right-6 md:top-[calc(var(--header-h)+1.25rem)] md:max-h-[min(70dvh,520px)] md:w-[360px] md:rounded-card md:border md:pb-0 lg:right-8',
      )}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
        <AgentMark size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-bold leading-5">Lam13 Strategy Agent</p>
          <p role="status" className="flex items-center gap-1.5 text-2xs text-fg-muted">
            <span
              aria-hidden="true"
              className={cn('size-1.5', error ? 'bg-danger' : live ? 'bg-accent motion-safe:animate-pulse' : 'bg-fg/30')}
            />
            {statusLine(state, elapsed)}
          </p>
        </div>
        <div aria-hidden="true" className="w-16 shrink-0">
          <Waveform mode="live" getLevel={getLevel} active={live} className={cn('h-5', live ? 'text-accent' : 'text-fg/20')} />
        </div>
      </header>

      <ScrollArea
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Call transcript"
        tabIndex={0}
        className="flex min-h-24 flex-1 flex-col gap-3 px-4 py-3 focus-visible:outline-offset-[-2px]"
      >
        {error ? (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-xs text-danger">{error.message}</p>
            {error.code === 'not-configured' && import.meta.env.DEV && missingConfig.length > 0 && (
              <p className="text-2xs text-fg-muted">
                Set {missingConfig.map((name) => <code key={name} className="mr-1 bg-muted px-1">{name}</code>)} in your
                local env file (see .env.example).
              </p>
            )}
          </div>
        ) : transcript.length === 0 ? (
          <p className="text-xs text-fg-muted">
            {state.status === 'connecting' ? 'Connecting to Lam13…' : 'Say hello — Lam13 is listening.'}
          </p>
        ) : (
          transcript.map((entry) => (
            <div key={entry.id}>
              <p className="eyebrow">{entry.role === 'assistant' ? 'Lam13' : 'You'}</p>
              <p className={cn('text-body leading-relaxed', entry.final ? 'text-fg' : 'text-fg-muted')}>
                {entry.text}
                {!entry.final && <span className="sr-only"> (speaking)</span>}
              </p>
            </div>
          ))
        )}
      </ScrollArea>

      <footer className="flex shrink-0 items-center gap-3 border-t border-hairline px-4 py-3">
        {error ? (
          <>
            <Button variant="ghost" size="sm" onClick={dismiss} className="ml-auto">
              Dismiss
            </Button>
            {error.code !== 'not-configured' && error.code !== 'unsupported' && (
              <Button variant="primary" size="sm" onClick={start} leadingIcon={<RotateCcw {...iconProps} size={14} />}>
                Try again
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-2xs text-fg-muted">Transcript isn&apos;t saved.</p>
            <Button
              variant="danger"
              size="sm"
              onClick={end}
              disabled={state.status === 'ending'}
              leadingIcon={<PhoneOff {...iconProps} size={14} />}
            >
              {state.status === 'ending' ? 'Ending…' : 'End call'}
            </Button>
          </>
        )}
      </footer>
    </section>
  );
}

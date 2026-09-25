import type { ReactNode, RefObject } from 'react';
import { ArrowUp, Mic } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SendButtonMode = 'voice' | 'send' | 'stop';

const hidden = 'scale-50 rotate-45 opacity-0 blur-[1px]';
const shown = 'scale-100 rotate-0 opacity-100 blur-[0px]';

const labels: Record<SendButtonMode, string> = {
  voice: 'Record voice message',
  send: 'Send message',
  stop: 'Stop generating',
};

const icons: Record<SendButtonMode, ReactNode> = {
  send: <ArrowUp size={14} strokeWidth={1.75} aria-hidden />,
  voice: <Mic size={14} strokeWidth={1.75} aria-hidden />,
  // Square stop glyph — echoes the reference's square geometry.
  stop: <span aria-hidden="true" className="size-2.5 bg-current" />,
};

/**
 * 32px black round button whose icon morphs (reference §6):
 * empty → mic, has text → arrow, streaming → stop.
 */
export function SendButton({
  mode,
  onSend,
  onVoice,
  onStop,
  disabled,
  ref,
}: {
  mode: SendButtonMode;
  onSend: () => void;
  onVoice: () => void;
  onStop: () => void;
  disabled?: boolean;
  ref?: RefObject<HTMLButtonElement | null>;
}) {
  const actions: Record<SendButtonMode, () => void> = { send: onSend, voice: onVoice, stop: onStop };

  return (
    <button
      ref={ref}
      type="button"
      onClick={actions[mode]}
      aria-label={labels[mode]}
      disabled={disabled && mode !== 'stop'}
      className={cn(
        'hit-area relative flex size-8 items-center justify-center rounded-full',
        'transition-[opacity,background-color] duration-300 ease-spring disabled:opacity-40',
        // Idle mic uses the product blue; send/stop stay near-black.
        mode === 'voice'
          ? 'bg-accent text-white hover:bg-accent-deep focus-visible:outline-accent/60'
          : 'bg-fg text-bg hover:opacity-90',
      )}
    >
      {(Object.keys(icons) as SendButtonMode[]).map((m) => (
        <span
          key={m}
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-300 ease-spring',
            m === mode ? shown : hidden,
          )}
        >
          {icons[m]}
        </span>
      ))}
    </button>
  );
}

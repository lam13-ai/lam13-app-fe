import { Phone, PhoneOff } from 'lucide-react';
import { IconButton, Spinner, Tooltip, iconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useCall } from '../CallingProvider';

/** Round 32px action with a ≥44px hit area, matching the header's icon buttons. */
function RoundAction({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone: 'wash' | 'accent';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'hit-area relative inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-standard',
        'focus-visible:outline-accent/60 disabled:cursor-default',
        tone === 'accent' ? 'bg-accent text-white hover:bg-accent-deep' : 'bg-accent-wash text-accent',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Header call action: idle → call · connecting → cancel · active → end · ending → busy · error → retry.
 */
export function CallButton() {
  const { state, enabled, start, end } = useCall();
  if (!enabled) return null;

  switch (state.status) {
    case 'connecting':
      return (
        <Tooltip content="Cancel call" side="bottom" align="end">
          <RoundAction label="Cancel call" tone="wash" onClick={end}>
            <Spinner size={18} state="active" />
          </RoundAction>
        </Tooltip>
      );
    case 'active':
      return (
        <Tooltip content="End call" side="bottom" align="end">
          <RoundAction label="End call" tone="accent" onClick={end}>
            <PhoneOff {...iconProps} size={15} />
          </RoundAction>
        </Tooltip>
      );
    case 'ending':
      return (
        <RoundAction label="Ending call" tone="wash" disabled>
          <Spinner size={18} state="active" />
        </RoundAction>
      );
    case 'error':
      return (
        <Tooltip content="Retry voice call" side="bottom" align="end">
          <span className="relative inline-flex">
            <IconButton label="Retry voice call" size="md" icon={<Phone {...iconProps} />} onClick={start} />
            <span aria-hidden="true" className="pointer-events-none absolute right-1 top-1 size-1.5 bg-danger" />
          </span>
        </Tooltip>
      );
    default:
      return (
        <Tooltip content="Start voice call" side="bottom" align="end">
          <IconButton
            label="Start voice call"
            size="md"
            icon={<Phone {...iconProps} />}
            onClick={start}
            className="hover:text-accent"
          />
        </Tooltip>
      );
  }
}

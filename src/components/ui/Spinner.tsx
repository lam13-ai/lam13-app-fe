import { cn } from '@/lib/cn';

export type SpinnerState = 'idle' | 'active' | 'listening';

export interface SpinnerProps {
  size?: number;
  /** idle: still ring · active: stepping rotation · listening: slow breathe. */
  state?: SpinnerState;
  /** When set the spinner is announced; otherwise it is decorative. */
  label?: string;
  className?: string;
}

const OUTER = 12;
const INNER = 8;

function ring(count: number, radius: number, dot: number, opacity: (i: number) => number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return (
      <circle
        key={`${radius}-${i}`}
        cx={16 + radius * Math.cos(angle)}
        cy={16 + radius * Math.sin(angle)}
        r={dot}
        fill="currentColor"
        opacity={opacity(i)}
      />
    );
  });
}

/** Dot-ring indicator — SVG stand-in for the reference's canvas status animation (reference §3, §7). */
export function Spinner({ size = 20, state = 'idle', label, className }: SpinnerProps) {
  const active = state === 'active';
  const large = size >= 48;

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'shrink-0 origin-center',
        active && 'animate-dot-spin',
        state === 'listening' && 'animate-breathe',
        className,
      )}
    >
      {ring(OUTER, 13, large ? 1.1 : 1.7, (i) => (active ? 0.15 + 0.85 * (i / (OUTER - 1)) : 0.55))}
      {large && ring(INNER, 7, 0.9, () => 0.3)}
    </svg>
  );
}

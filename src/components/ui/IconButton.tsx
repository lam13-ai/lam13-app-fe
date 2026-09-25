import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'ghost' | 'solid';
type Size = 'sm' | 'md';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'aria-label' | 'children'> {
  /** Accessible name — required because the button has no visible text. */
  label: string;
  icon: ReactNode;
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  ghost: 'text-fg-soft hover:bg-accent-wash hover:text-fg aria-expanded:bg-accent-wash aria-expanded:text-fg',
  solid: 'bg-fg text-bg hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'size-7',
  md: 'size-8',
};

/** Round icon button (reference §8). Visual 28/32px, hit area ≥ 44px. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'sm',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'hit-area relative inline-flex shrink-0 items-center justify-center rounded-full',
        'transition-all duration-200 ease-standard',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}

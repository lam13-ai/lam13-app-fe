import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ChipProps extends ComponentProps<'button'> {
  leading?: ReactNode;
}

/** Small rounded composer chip (model / effort) — reference §6. */
export function Chip({ leading, className, children, type = 'button', ...props }: ChipProps) {
  return (
    <button
      type={type}
      className={cn(
        'group hit-area relative inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2',
        'select-none text-xs font-bold text-fg-soft transition-all duration-200 ease-standard',
        'hover:bg-accent-wash hover:text-fg aria-expanded:bg-accent-wash aria-expanded:text-fg',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {leading}
      {children}
    </button>
  );
}

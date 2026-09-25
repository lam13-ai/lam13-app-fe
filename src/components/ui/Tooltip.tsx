import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'center' | 'start' | 'end';
}

const aligns = {
  center: 'left-1/2 -translate-x-1/2',
  start: 'left-0',
  end: 'right-0',
};

/**
 * Visual hint on hover (after a short delay) or keyboard focus.
 * Decorative only (aria-hidden): the wrapped control must carry its own accessible name.
 * Tailwind's hover variant only applies on hover-capable pointers, so touch devices never see it.
 */
export function Tooltip({ content, children, side = 'top', align = 'center' }: TooltipProps) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap bg-fg px-2 py-1 text-2xs text-bg',
          'opacity-0 transition-opacity duration-150 ease-standard',
          'group-hover/tooltip:opacity-100 group-hover/tooltip:delay-500',
          'group-has-[:focus-visible]/tooltip:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          aligns[align],
        )}
      >
        {content}
      </span>
    </span>
  );
}

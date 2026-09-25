import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Vertical scroll container with the reference's hidden scrollbar. */
export function ScrollArea({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('overflow-y-auto overscroll-contain scrollbar-none', className)} {...props} />;
}

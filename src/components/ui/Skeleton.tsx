import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';

/** Square placeholder block for loading content. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={cn('animate-pulse bg-fg/[0.07]', className)} style={style} />;
}

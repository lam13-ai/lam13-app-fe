import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface ErrorStateProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** 1 = page-level (large editorial title), 2 = in-panel. */
  level?: 1 | 2;
  /** Extra content, e.g. a mobile menu button. */
  children?: ReactNode;
  className?: string;
}

/** Centred error / not-found panel in the reference's editorial style. */
export function ErrorState({ eyebrow, title, description, action, level = 2, children, className }: ErrorStateProps) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-4 px-6 text-center', className)}>
      {children}
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <Heading className={cn('font-bold', level === 1 ? 'text-title' : 'text-base')}>{title}</Heading>
      {description && <p className="max-w-[42ch] text-sm text-fg-muted">{description}</p>}
      {action && (
        <Button variant={level === 1 ? 'primary' : 'outline'} size={level === 1 ? 'md' : 'sm'} onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      )}
    </div>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Small building blocks shared by the admin pages. */

export function Section({ title, description, action, children }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border border-hairline-strong bg-bg p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">{title}</h2>
          {description && <p className="mt-1 font-sans text-xs leading-relaxed text-fg-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: 'muted' | 'strong' | 'danger'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center border px-1.5 py-0.5 text-2xs whitespace-nowrap',
        tone === 'strong' && 'border-fg bg-fg text-bg',
        tone === 'muted' && 'border-hairline-strong text-fg-muted',
        tone === 'danger' && 'border-danger text-danger',
      )}
    >
      {children}
    </span>
  );
}

export const fieldClass =
  'w-full border border-hairline-strong bg-bg px-3 py-2 font-sans text-sm text-fg outline-none focus-visible:border-accent/60 disabled:opacity-60';

export const labelClass = 'mb-1 block text-xs text-fg-muted';

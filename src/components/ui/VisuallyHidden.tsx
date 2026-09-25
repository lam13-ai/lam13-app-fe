import type { ReactNode } from 'react';

/** Content for assistive technology only. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

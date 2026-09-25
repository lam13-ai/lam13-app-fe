import { cn } from '@/lib/cn';

/**
 * Legal pages are published on the public Lam13 site (lam13-website-v2 routes `/privacy` and
 * `/terms`); the app links to them instead of keeping a second copy of the text.
 */
export const LEGAL_LINKS = [
  { label: 'Privacy', href: 'https://lam13.ai/privacy' },
  { label: 'Terms', href: 'https://lam13.ai/terms' },
] as const;

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={cn('flex items-center gap-3 text-2xs text-fg-muted', className)}>
      {LEGAL_LINKS.map(({ label, href }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center underline-offset-4 hover:text-fg hover:underline md:min-h-0"
        >
          {label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
    </nav>
  );
}

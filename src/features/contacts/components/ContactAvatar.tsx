import { cn } from '@/lib/cn';
import { initials } from '@/lib/initials';

/** Square initials tile, restrained so a grid of them stays calm in both themes. */
export function ContactAvatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-muted font-bold text-fg',
        size === 'lg' ? 'size-12 text-sm' : 'size-10 text-xs',
      )}
    >
      {initials(name)}
    </span>
  );
}

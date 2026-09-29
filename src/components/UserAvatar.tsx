import { User } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/initials';

/**
 * The signed-in person's avatar: their profile picture; if there is none (or it fails to load) their
 * initials; if there is no usable name either, a generic person icon. Decorative — the name is shown next
 * to it. Same square tile everywhere it appears.
 */
export function UserAvatar({ name, src, className }: { name?: string | null; src?: string | null; className?: string }) {
  // Remember which picture failed, so a new URL gets its own chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const box = cn('size-8 shrink-0', className);

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        className={cn(box, 'bg-muted object-cover')}
      />
    );
  }
  return (
    <span aria-hidden="true" className={cn(box, 'flex items-center justify-center bg-fg text-2xs font-bold text-bg')}>
      {name?.trim() ? initials(name) : <User size={14} strokeWidth={1.75} />}
    </span>
  );
}

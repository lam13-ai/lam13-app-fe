import { User } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/initials';

/**
 * A picture URL worth showing, or null. Gravatar placeholders (what identity providers such as Kinde hand
 * out when someone has no photo — `d=blank` is a transparent image that "loads" fine) are asked for
 * `d=404` instead: a real Gravatar still shows, a missing one errors and falls back to initials.
 */
export function avatarSource(src: string | null | undefined): string | null {
  if (!src?.trim()) return null;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (/(^|\.)gravatar\.com$/i.test(url.hostname) && url.pathname.startsWith('/avatar/')) {
    url.searchParams.delete('default');
    url.searchParams.set('d', '404');
    return url.toString();
  }
  return src;
}

/**
 * The signed-in person's avatar: their profile picture over their initials (so a transparent, blank or
 * still-loading picture never leaves an empty square), initials alone when there is no picture or it fails
 * to load, and a generic person icon when there is no usable name either. Decorative — the name is shown
 * next to it. Same square tile everywhere it appears.
 */
export function UserAvatar({ name, src, className }: { name?: string | null; src?: string | null; className?: string }) {
  const picture = avatarSource(src);
  // Remember which picture failed, so a new URL gets its own chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <span
      aria-hidden="true"
      className={cn('relative flex size-8 shrink-0 items-center justify-center overflow-hidden bg-fg text-2xs font-bold text-bg', className)}
    >
      {name?.trim() ? initials(name) : <User size={14} strokeWidth={1.75} />}
      {picture && picture !== failedSrc && (
        <img
          src={picture}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(picture)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

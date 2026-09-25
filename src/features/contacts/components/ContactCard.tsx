import { useId } from 'react';
import { describeMessageTime, formatRelativeTime } from '@/lib/format';
import type { Profile } from '@/types/api';
import { ContactAvatar } from './ContactAvatar';

const plural = (n: number) => `${n} suggested update${n === 1 ? '' : 's'}`;

/**
 * Grid card. The name is the card's button; its ::after stretches over the whole card, so the card is
 * one click/tab target with a real heading, and the focus ring is drawn around the card.
 */
export function ContactCard({ profile, pendingCount, onOpen }: { profile: Profile; pendingCount: number; onOpen: () => void }) {
  const roleId = useId();
  const pendingId = useId();

  return (
    <article className="relative flex min-w-0 flex-1 flex-col gap-3 border border-hairline-strong bg-bg p-4 transition-colors duration-150 ease-standard hover:border-fg/40 has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-focus">
      <div className="flex items-start gap-3">
        <ContactAvatar name={profile.full_name} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-body font-bold leading-5">
            <button
              type="button"
              onClick={onOpen}
              aria-describedby={pendingCount > 0 ? `${roleId} ${pendingId}` : roleId}
              className="text-left outline-none after:absolute after:inset-0 after:content-['']"
            >
              {profile.full_name}
            </button>
          </h2>
          <div id={roleId} className="text-xs text-fg-muted">
            <p className="truncate">{profile.position}</p>
            <p className="truncate">{profile.company}</p>
          </div>
        </div>
      </div>

      {profile.email && <p className="truncate text-xs">{profile.email}</p>}

      {profile.description && (
        <div>
          <p className="eyebrow">About</p>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-fg-muted">{profile.description}</p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1 text-2xs text-fg-muted">
        <span>
          Updated{' '}
          <time dateTime={profile.updated_at} title={describeMessageTime(profile.updated_at)}>
            {formatRelativeTime(profile.updated_at)}
          </time>
        </span>
        {pendingCount > 0 && (
          <span id={pendingId} className="flex items-center gap-1.5 font-bold text-fg">
            <span aria-hidden="true" className="size-1.5 bg-accent" />
            {plural(pendingCount)}
          </span>
        )}
      </div>
    </article>
  );
}

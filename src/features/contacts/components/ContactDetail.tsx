import { Pencil, Trash2, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ScrollArea } from '@/components/ScrollArea';
import { Button, IconButton, iconProps, smallIconProps } from '@/components/ui';
import { describeMessageTime } from '@/lib/format';
import type { Profile, ProfileUpdateSuggestion } from '@/types/api';
import { linkedinHref } from '../lib/contacts';
import { ContactAvatar } from './ContactAvatar';
import { SuggestionCard } from './SuggestionCard';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

function Timestamp({ iso }: { iso: string }) {
  return (
    <time dateTime={iso}>{describeMessageTime(iso)}</time>
  );
}

const linkClass = 'break-all text-link underline-offset-4 hover:underline';

/** Contact details present on the profile; empty optional fields are left out. */
function ContactInfo({ profile }: { profile: Profile }) {
  const rows = [
    profile.email && { label: 'Email', node: <a href={`mailto:${profile.email}`} className={linkClass}>{profile.email}</a> },
    profile.phone && {
      label: 'Phone',
      node: <a href={`tel:${profile.phone.replace(/[^\d+]/g, '')}`} className={linkClass}>{profile.phone}</a>,
    },
    profile.linkedin && {
      label: 'LinkedIn',
      node: (
        <a href={linkedinHref(profile.linkedin)} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {profile.linkedin.replace(/^https?:\/\/(www\.)?/i, '')}
        </a>
      ),
    },
  ].filter((row) => !!row);
  if (rows.length === 0) return null;
  return (
    <Section title="Contact">
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-fg-muted">{row.label}</dt>
            <dd>{row.node}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** Delete, kept apart from Edit and confirmed in place. */
function DeleteConfirm({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <div role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} className="flex w-full flex-col gap-3">
      <div>
        <p id={titleId} className="text-xs font-bold">
          Delete {name}?
        </p>
        <p id={descriptionId} className="text-2xs text-fg-muted">
          The contact and its pending suggestions are removed permanently.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" autoFocus onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm}>
          Delete contact
        </Button>
      </div>
    </div>
  );
}

export interface ContactDetailProps {
  profile: Profile;
  suggestions: ProfileUpdateSuggestion[];
  /** Focus Edit on mount (returning from the edit form). */
  focusEdit?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onApprove: (suggestion: ProfileUpdateSuggestion) => void;
  onReject: (suggestion: ProfileUpdateSuggestion) => void;
}

/** Expanded profile: pending suggestions first, then contact details, About and timestamps. */
export function ContactDetail({ profile, suggestions, focusEdit, onEdit, onDelete, onClose, onApprove, onReject }: ContactDetailProps) {
  const [confirming, setConfirming] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reviewHeadingId = useId();

  /** A reviewed card disappears; keep keyboard focus in the sheet. */
  const decide = (action: (s: ProfileUpdateSuggestion) => void, suggestion: ProfileUpdateSuggestion) => {
    action(suggestion);
    headingRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start gap-3 border-b border-hairline py-4 pl-5 pr-3">
        <ContactAvatar name={profile.full_name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} tabIndex={-1} className="break-words text-base font-bold outline-none">
            {profile.full_name}
          </h2>
          <p className="text-xs text-fg-muted">{profile.position}</p>
          <p className="text-xs text-fg-muted">{profile.company}</p>
        </div>
        <IconButton label="Close" size="md" icon={<X {...iconProps} />} onClick={onClose} />
      </div>

      <ScrollArea className="flex min-h-0 flex-1 flex-col gap-8 px-5 py-6">
        {suggestions.length > 0 && (
          <section aria-labelledby={reviewHeadingId} className="flex flex-col gap-3">
            <div>
              <h3 id={reviewHeadingId} className="text-xs font-bold">
                Review {suggestions.length === 1 ? '1 suggested update' : `${suggestions.length} suggested updates`}
              </h3>
              <p className="mt-0.5 text-2xs text-fg-muted">From your meetings. Nothing changes until you approve.</p>
            </div>
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                profile={profile}
                onApprove={() => decide(onApprove, s)}
                onReject={() => decide(onReject, s)}
              />
            ))}
          </section>
        )}

        <ContactInfo profile={profile} />

        <Section title="About">
          {profile.description ? (
            <p className="whitespace-pre-wrap break-words text-body leading-relaxed">{profile.description}</p>
          ) : (
            <p className="text-xs text-fg-muted">No description yet.</p>
          )}
        </Section>

        <Section title="Details">
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
            <dt className="text-fg-muted">Created</dt>
            <dd>
              <Timestamp iso={profile.created_at} />
            </dd>
            <dt className="text-fg-muted">Last updated</dt>
            <dd>
              <Timestamp iso={profile.updated_at} />
            </dd>
          </dl>
        </Section>
      </ScrollArea>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline px-5 py-3">
        {confirming ? (
          <DeleteConfirm name={profile.full_name} onCancel={() => setConfirming(false)} onConfirm={onDelete} />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex h-11 items-center gap-2 px-3 text-nav text-danger transition-colors duration-150 ease-standard hover:bg-danger/10 md:h-9"
            >
              <Trash2 {...smallIconProps} />
              Delete
            </button>
            <Button variant="outline" size="sm" leadingIcon={<Pencil {...smallIconProps} />} autoFocus={focusEdit} onClick={onEdit}>
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

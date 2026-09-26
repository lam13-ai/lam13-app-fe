import { Clock3, Maximize2, Minimize2, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ScrollArea } from '@/components/ScrollArea';
import { Button, IconButton, Tooltip, iconProps, smallIconProps } from '@/components/ui';
import { describeMessageTime } from '@/lib/format';
import type { Profile, ProfileUpdateSuggestion } from '@/types/api';
import { linkedinHref } from '../lib/contacts';
import { ContactAvatar } from './ContactAvatar';
import { FieldIcon } from './FieldIcon';
import { SuggestionCard } from './SuggestionCard';

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-eyebrow text-fg-muted">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Timestamp({ iso }: { iso: string }) {
  return <time dateTime={iso}>{describeMessageTime(iso)}</time>;
}

const linkClass = 'break-all text-link underline-offset-4 hover:underline';

interface Row {
  label: string;
  icon: ReactNode;
  node: ReactNode;
}

/** Icon, muted label, value: the value reads strongest. */
function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-1.5 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <span aria-hidden="true" className="self-center text-fg-muted">
            {row.icon}
          </span>
          <dt className="text-fg-muted">{row.label}</dt>
          <dd className="min-w-0">{row.node}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Contact details present on the profile; empty optional fields are left out. */
function ContactInfo({ profile }: { profile: Profile }) {
  const rows = [
    profile.email && {
      label: 'Email',
      icon: <FieldIcon field="email" />,
      node: <a href={`mailto:${profile.email}`} className={linkClass}>{profile.email}</a>,
    },
    profile.phone && {
      label: 'Phone',
      icon: <FieldIcon field="phone" />,
      node: <a href={`tel:${profile.phone.replace(/[^\d+]/g, '')}`} className={linkClass}>{profile.phone}</a>,
    },
    profile.linkedin && {
      label: 'LinkedIn',
      icon: <FieldIcon field="linkedin" />,
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
      <Rows rows={rows} />
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
  /** Desktop only: expand the sheet to its maximum width, or restore the previous width. */
  expand?: { expanded: boolean; onToggle: () => void };
}

/** Expanded profile: About, contact details, pending suggestions, then timestamps. */
export function ContactDetail({
  profile,
  suggestions,
  focusEdit,
  onEdit,
  onDelete,
  onClose,
  onApprove,
  onReject,
  expand,
}: ContactDetailProps) {
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
      <div className="flex shrink-0 items-start gap-3 border-b border-hairline py-3 pl-4 pr-2 md:pl-5">
        <ContactAvatar name={profile.full_name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} tabIndex={-1} className="break-words text-base font-bold outline-none">
            {profile.full_name}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs">
            <span className="shrink-0 text-fg-muted"><FieldIcon field="position" /></span>
            <span className="min-w-0 break-words">{profile.position}</span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
            <span className="shrink-0"><FieldIcon field="company" /></span>
            <span className="min-w-0 break-words">{profile.company}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {expand && (
            <Tooltip content={expand.expanded ? 'Restore' : 'Expand'} side="bottom" align="end">
              <IconButton
                label={expand.expanded ? 'Restore contact panel' : 'Expand contact panel'}
                size="md"
                icon={expand.expanded ? <Minimize2 {...iconProps} /> : <Maximize2 {...iconProps} />}
                onClick={expand.onToggle}
              />
            </Tooltip>
          )}
          <IconButton label="Close" size="md" icon={<X {...iconProps} />} onClick={onClose} />
        </div>
      </div>

      <ScrollArea className="flex min-h-0 flex-1 flex-col gap-5 px-4 py-4 md:px-5">
        <Section title="About" icon={<FieldIcon field="description" />}>
          {profile.description ? (
            <p className="whitespace-pre-wrap break-words text-body leading-relaxed">{profile.description}</p>
          ) : (
            <p className="text-xs text-fg-muted">No description yet.</p>
          )}
        </Section>

        <ContactInfo profile={profile} />

        {suggestions.length > 0 && (
          <section aria-labelledby={reviewHeadingId} className="flex flex-col gap-2">
            <div>
              <h3 id={reviewHeadingId} className="flex items-center gap-1.5 text-xs font-bold">
                <Sparkles {...smallIconProps} className="shrink-0 text-accent" />
                Review {suggestions.length === 1 ? '1 suggested update' : `${suggestions.length} suggested updates`}
              </h3>
              <p className="text-2xs text-fg-muted">From your meetings. Nothing changes until you approve.</p>
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

        <Section title="Details">
          <Rows
            rows={[
              { label: 'Created', icon: <Clock3 {...smallIconProps} />, node: <Timestamp iso={profile.created_at} /> },
              { label: 'Last updated', icon: <Clock3 {...smallIconProps} />, node: <Timestamp iso={profile.updated_at} /> },
            ]}
          />
        </Section>
      </ScrollArea>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline px-4 py-2 md:px-5">
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

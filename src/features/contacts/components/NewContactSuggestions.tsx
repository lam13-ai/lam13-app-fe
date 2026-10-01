import { Check, Sparkles, X } from 'lucide-react';
import { useId, useRef } from 'react';
import { toErrorInfo } from '@/api';
import { Button, smallIconProps, useToast } from '@/components/ui';
import { describeMessageTime, formatRelativeTime } from '@/lib/format';
import type { ProfileField, ProfileUpdateSuggestion } from '@/types/api';
import { useApproveSuggestion, useRejectSuggestion } from '../hooks/useContacts';
import { FIELD_LABELS, linkedinHref, mergedSourcesText, sourceText } from '../lib/contacts';
import { ContactAvatar } from './ContactAvatar';
import { FieldIcon } from './FieldIcon';

const DETAIL_FIELDS: ProfileField[] = ['email', 'phone', 'linkedin'];
const linkClass = 'break-all text-link underline-offset-4 hover:underline';

function detailNode(field: ProfileField, value: string) {
  if (field === 'email') return <a href={`mailto:${value}`} className={linkClass}>{value}</a>;
  if (field === 'phone') return <a href={`tel:${value.replace(/[^\d+]/g, '')}`} className={linkClass}>{value}</a>;
  return (
    <a href={linkedinHref(value)} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {value.replace(/^https?:\/\/(www\.)?/i, '')}
    </a>
  );
}

/** One proposed person: only the fields the suggestion carries, then Reject / Add to contacts. */
function NewContactCard({
  suggestion,
  busy,
  onApprove,
  onReject,
}: {
  suggestion: ProfileUpdateSuggestion;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const titleId = useId();
  const fields = Object.fromEntries(suggestion.changes.map((c) => [c.field, c.to ?? ''])) as Partial<Record<ProfileField, string>>;
  const name = fields.full_name || 'Suggested contact';

  return (
    <article aria-labelledby={titleId} className="flex min-w-0 flex-1 flex-col border border-dashed border-accent/50 bg-accent-wash/40">
      <div className="flex items-start gap-3 p-4 pb-3">
        <ContactAvatar name={name} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="truncate text-body font-bold leading-5">
            {name}
          </h3>
          {(fields.position || fields.company) && (
            <div className="text-xs text-fg-muted">
              {fields.position && <p className="truncate">{fields.position}</p>}
              {fields.company && <p className="truncate">{fields.company}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-3">
        {DETAIL_FIELDS.some((f) => fields[f]) && (
          <dl className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-0.5 text-xs leading-4">
            {DETAIL_FIELDS.filter((f) => fields[f]).map((f) => (
              <div key={f} className="contents">
                <span aria-hidden="true" className="self-center text-fg-muted">
                  <FieldIcon field={f} />
                </span>
                <dt className="text-fg-muted">{FIELD_LABELS[f]}</dt>
                <dd className="min-w-0">{detailNode(f, fields[f]!)}</dd>
              </div>
            ))}
          </dl>
        )}
        {fields.description && <p className="line-clamp-3 text-xs leading-relaxed text-fg-muted">{fields.description}</p>}
        {suggestion.reason && <p className="text-xs leading-relaxed">{suggestion.reason}</p>}
        <p className="text-2xs text-fg-muted">
          {sourceText(suggestion)} ·{' '}
          <time dateTime={suggestion.created_at} title={describeMessageTime(suggestion.created_at)}>
            {formatRelativeTime(suggestion.created_at)}
          </time>
        </p>
        {mergedSourcesText(suggestion) && <p className="text-2xs text-fg-muted">{mergedSourcesText(suggestion)}</p>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline px-4 py-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          leadingIcon={<X {...smallIconProps} />}
          aria-label={`Reject suggested contact ${name}`}
          onClick={onReject}
        >
          Reject
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          leadingIcon={<Check {...smallIconProps} />}
          aria-label={`Add ${name} to contacts`}
          onClick={onApprove}
        >
          Add to contacts
        </Button>
      </div>
    </article>
  );
}

/**
 * Pending new-contact (`create`) suggestions from meetings, chats and calls, above the contact grid — visibly proposals
 * (dashed, tinted), not contacts. Nothing is added until the user chooses "Add to contacts".
 */
export function NewContactSuggestions({ suggestions }: { suggestions: ProfileUpdateSuggestion[] }) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const toast = useToast();
  // Here, not in the cards: a decided card unmounts at once (optimistic), and a mutation's per-call
  // callbacks don't run for an unmounted component — the confirmation or error would be lost.
  const approve = useApproveSuggestion();
  const reject = useRejectSuggestion();
  const failed = (what: string) => (error: unknown) =>
    toast.show(`Couldn't ${what}. ${toErrorInfo(error).message}`, { tone: 'danger' });
  // A decided card disappears: keep keyboard focus in the section.
  const refocus = () => headingRef.current?.focus();
  if (suggestions.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="mb-6 flex flex-col gap-3">
      <div>
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="flex items-center gap-1.5 text-xs font-bold outline-none">
          <Sparkles {...smallIconProps} className="shrink-0 text-accent" />
          Suggested new {suggestions.length === 1 ? 'contact' : `contacts (${suggestions.length})`}
        </h2>
        <p className="text-2xs text-fg-muted">From your meetings, chats and calls. Nothing is added until you approve.</p>
      </div>
      <ul aria-label="Suggested new contacts" className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
        {suggestions.map((s) => (
          <li key={s.id} className="flex">
            <NewContactCard
              suggestion={s}
              busy={(approve.isPending && approve.variables?.id === s.id) || (reject.isPending && reject.variables?.id === s.id)}
              onApprove={() => {
                refocus();
                approve.mutate(s, {
                  onSuccess: ({ profile }) => toast.show(`${profile.full_name} added to contacts.`),
                  onError: failed('add the contact'),
                });
              }}
              onReject={() => {
                refocus();
                reject.mutate(s, { onSuccess: () => toast.show('Suggestion rejected.'), onError: failed('reject the suggestion') });
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

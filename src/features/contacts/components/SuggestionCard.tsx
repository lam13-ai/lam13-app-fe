import { Check, X } from 'lucide-react';
import { useId } from 'react';
import { Button, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { describeMessageTime, formatRelativeTime } from '@/lib/format';
import type { Profile, ProfileFieldChange, ProfileUpdateSuggestion } from '@/types/api';
import { FIELD_LABELS } from '../lib/contacts';
import { FieldIcon } from './FieldIcon';

/**
 * One side of a before/after pair. Told apart by the "Current"/"Suggested" label and the −/+
 * gutter (like a code review), not by colour alone.
 */
function Side({ kind, value }: { kind: 'current' | 'suggested'; value: string | null }) {
  const suggested = kind === 'suggested';
  return (
    <div
      className={cn(
        'grid grid-cols-[1rem_4.25rem_minmax(0,1fr)] items-baseline border px-2 py-1.5',
        suggested ? 'border-accent/40 bg-accent-wash' : 'border-hairline bg-fg/[0.03]',
      )}
    >
      <span aria-hidden="true" className={cn('text-xs', suggested ? 'text-fg' : 'text-fg-muted')}>
        {suggested ? '+' : '−'}
      </span>
      <span className="text-2xs text-fg-muted">{suggested ? 'Suggested' : 'Current'}</span>
      <p className={cn('whitespace-pre-wrap break-words text-xs leading-relaxed', suggested ? 'font-bold text-fg' : 'text-fg-muted')}>
        {value || <span className="font-normal italic">{suggested ? 'Remove this value' : 'Not set'}</span>}
      </p>
    </div>
  );
}

function FieldChange({ change, current }: { change: ProfileFieldChange; current: string | null }) {
  const label = FIELD_LABELS[change.field];
  return (
    <div role="group" aria-label={`${label}: current and suggested`}>
      <p className="mb-1 flex items-center gap-1.5 text-xs text-fg-muted">
        <FieldIcon field={change.field} />
        {label}
      </p>
      <div className="flex flex-col gap-1">
        <Side kind="current" value={current} />
        <Side kind="suggested" value={change.to} />
      </div>
    </div>
  );
}

/**
 * A meeting-derived suggestion awaiting review. It compares against the profile as it is now, so the
 * user sees exactly what Approve would change. Nothing changes until they choose.
 */
export function SuggestionCard({
  suggestion,
  profile,
  onApprove,
  onReject,
}: {
  suggestion: ProfileUpdateSuggestion;
  profile: Profile;
  onApprove: () => void;
  onReject: () => void;
}) {
  const titleId = useId();
  const fields = suggestion.changes.map((c) => FIELD_LABELS[c.field]).join(', ');

  return (
    <article aria-labelledby={titleId} className="border border-hairline-strong bg-bg">
      <header className="flex flex-wrap items-baseline gap-x-2 border-b border-hairline px-3 py-2">
        <h4 id={titleId} className="flex items-center gap-1.5 self-center text-xs font-bold">
          <span aria-hidden="true" className="size-1.5 shrink-0 bg-accent" />
          Suggested update
        </h4>
        <p className="text-2xs text-fg-muted">
          From meeting
          {suggestion.source_title && ` · ${suggestion.source_title}`} ·{' '}
          <time dateTime={suggestion.created_at} title={describeMessageTime(suggestion.created_at)}>
            {formatRelativeTime(suggestion.created_at)}
          </time>
        </p>
      </header>

      <div className="flex flex-col gap-3 p-3">
        {suggestion.changes.map((change) => (
          <FieldChange key={change.field} change={change} current={profile[change.field]} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2">
        <Button variant="outline" size="sm" leadingIcon={<X {...smallIconProps} />} aria-label={`Reject update to ${fields}`} onClick={onReject}>
          Reject
        </Button>
        <Button variant="primary" size="sm" leadingIcon={<Check {...smallIconProps} />} aria-label={`Approve update to ${fields}`} onClick={onApprove}>
          Approve
        </Button>
      </div>
    </article>
  );
}

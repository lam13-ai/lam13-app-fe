import { ArrowLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { IconButton, Menu, MenuItem, Spinner, VisuallyHidden, iconProps, smallIconProps } from '@/components/ui';
import type { MeetingSummary } from '@/types/api';
import { useMeetings, useMeetingSource } from '../hooks/useMeetings';
import { dayLabel, filterMeetings } from '../lib/meetings';

const SHOWN = 8;

/**
 * Second step of the composer's "+" menu: pick a meeting to add as context. Same menu language as the
 * rest of the composer (Popover + Menu); the caller's popover closes on select.
 */
export function MeetingPicker({ onSelect, onBack }: { onSelect: (meeting: MeetingSummary) => void; onBack: () => void }) {
  const source = useMeetingSource();
  const connected = source.data?.status === 'connected';
  const meetings = useMeetings({ enabled: connected });
  const [query, setQuery] = useState('');
  const matches = useMemo(() => filterMeetings(meetings.data ?? [], query).slice(0, SHOWN), [meetings.data, query]);

  let body;
  if (source.isPending || (connected && meetings.isPending)) {
    body = (
      <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-fg-muted">
        <Spinner size={14} state="active" /> Loading meetings…
      </p>
    );
  } else if (!connected) {
    body = (
      <p className="px-2.5 py-2 text-xs leading-relaxed text-fg-muted">
        Granola isn&apos;t connected.{' '}
        <Link to="/meetings" className="font-bold text-fg underline-offset-4 hover:underline">
          Connect it in Meetings
        </Link>
      </p>
    );
  } else if (meetings.isError || source.isError) {
    body = <p className="px-2.5 py-2 text-xs text-danger">Couldn&apos;t load meetings.</p>;
  } else if (matches.length === 0) {
    body = <p className="px-2.5 py-2 text-xs text-fg-muted">{query.trim() ? 'No meetings match.' : 'No meetings yet.'}</p>;
  } else {
    body = (
      <Menu label="Meetings">
        {matches.map((m) => (
          <MenuItem key={m.id} onSelect={() => onSelect(m)}>
            <span className="min-w-0 flex-1 truncate">{m.title}</span>
            <span className="shrink-0 font-normal text-fg-muted">{dayLabel(m.started_at)}</span>
          </MenuItem>
        ))}
      </Menu>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 pb-1">
        <IconButton label="Back" size="sm" icon={<ArrowLeft {...iconProps} />} onClick={onBack} />
        <p className="eyebrow">Add a meeting</p>
      </div>
      {connected && (
        <label className="relative flex items-center">
          <VisuallyHidden>Search meetings</VisuallyHidden>
          <Search {...smallIconProps} className="pointer-events-none absolute left-2.5 text-fg-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings"
            autoFocus
            className="h-9 w-full border border-border bg-bg pl-8 pr-2 text-base text-fg outline-none placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring sm:text-xs"
          />
        </label>
      )}
      {body}
    </div>
  );
}

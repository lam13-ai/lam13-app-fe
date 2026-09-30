import { Menu as MenuIcon, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '@/components/ErrorState';
import { ScrollArea } from '@/components/ScrollArea';
import { IconButton, Skeleton, VisuallyHidden, iconProps } from '@/components/ui';
import { useUiStore } from '@/stores/uiStore';
import type { MeetingSummary } from '@/types/api';
import { useMeetings, useMeetingSource } from '../hooks/useMeetings';
import { filterMeetings, formatMeetingDuration, formatMeetingTime, groupByDay, participantsLabel } from '../lib/meetings';
import { ConnectGranolaButton, GranolaStatus } from './GranolaConnection';

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading meetings" className="flex flex-col">
      <Skeleton className="mb-3 h-3 w-16" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-hairline py-3.5">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function MeetingRow({ meeting }: { meeting: MeetingSummary }) {
  return (
    <Link
      to={`/meetings/${meeting.id}`}
      className="flex min-h-11 flex-col gap-1 border-b border-hairline px-2 py-3 outline-offset-[-2px] transition-colors duration-150 ease-standard hover:bg-fg/[0.035]"
    >
      <span className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 truncate text-sm font-bold">{meeting.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-fg-muted">{formatMeetingTime(meeting.started_at)}</span>
      </span>
      <span className="truncate text-xs text-fg-muted">
        {[
          meeting.duration_seconds > 0 && formatMeetingDuration(meeting.duration_seconds),
          meeting.participants.length > 0 && participantsLabel(meeting.participants),
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </Link>
  );
}

/** An editorial empty state (like My Contacts'): eyebrow, one line, one sentence, at most one action. */
function Empty({ title, children, action }: { title: string; children: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <p className="eyebrow">Meetings</p>
      <h2 className="text-base font-bold">{title}</h2>
      <p className="max-w-[44ch] text-sm leading-relaxed text-fg-muted">{children}</p>
      {action}
    </div>
  );
}

/** `/meetings`: the user's meetings from Granola, grouped by day and searchable. */
export function MeetingsView() {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const source = useMeetingSource();
  const connected = source.data?.status === 'connected';
  const meetings = useMeetings({ enabled: connected });
  const [query, setQuery] = useState('');
  const all = meetings.data;
  const groups = useMemo(() => groupByDay(filterMeetings(all ?? [], query)), [all, query]);
  const matchCount = groups.reduce((n, g) => n + g.meetings.length, 0);

  let body;
  if (source.isPending || (connected && meetings.isPending)) {
    body = <ListSkeleton />;
  } else if (source.isError || meetings.isError) {
    body = (
      <ErrorState
        title="Couldn't load your meetings."
        description="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => void (source.isError ? source.refetch() : meetings.refetch()) }}
        className="py-16"
      />
    );
  } else if (!connected) {
    body = (
      <Empty title="Bring your meetings into Lam13." action={<ConnectGranolaButton variant="primary" size="md" />}>
        Connect Granola to see your meetings here and ask Lam13 about their decisions, action items and notes.
      </Empty>
    );
  } else if (all?.length === 0) {
    body = (
      <Empty title="No meetings yet.">Meetings you record in Granola will appear here, newest first.</Empty>
    );
  } else {
    body = (
      <>
        <label className="relative mb-5 flex items-center">
          <VisuallyHidden>Search meetings</VisuallyHidden>
          <Search {...iconProps} className="pointer-events-none absolute left-3 text-fg-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or participant"
            className="h-11 w-full border border-border bg-bg pl-9 pr-3 text-base text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus-visible:outline-none focus:border-composer-focus focus:ring-1 focus:ring-composer-ring sm:text-sm md:h-10"
          />
        </label>
        <p aria-live="polite" className="sr-only">
          {query.trim() ? `${matchCount} of ${all?.length ?? 0} meetings` : ''}
        </p>
        {matchCount === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm">No meetings match “{query.trim()}”.</p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="min-h-11 text-xs font-bold underline-offset-4 hover:underline md:min-h-0"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {groups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h2 className="eyebrow mb-1 px-2">{group.label}</h2>
                <ul>
                  {group.meetings.map((m) => (
                    <li key={m.id}>
                      <MeetingRow meeting={m} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <section
      aria-labelledby="meetings-heading"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-bg md:rounded-card md:border md:border-frame md:shadow-card"
    >
      <header className="bright-chrome flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-hairline px-3 md:px-5">
        <IconButton
          label="Open sidebar"
          size="md"
          icon={<MenuIcon {...iconProps} />}
          onClick={() => setSidebarOpen(true)}
          className="md:hidden"
        />
        <div className="min-w-0 flex-1">
          <h1 id="meetings-heading" className="truncate text-body font-bold leading-5">
            Meetings
          </h1>
          <p className="hidden truncate text-2xs text-fg-muted sm:block">Your meetings from Granola, ready to discuss with Lam13.</p>
        </div>
        {connected && <GranolaStatus />}
      </header>

      <ScrollArea className="min-h-0 flex-1 px-3 py-4 md:px-6 md:py-6">
        <div className="mx-auto w-full max-w-[var(--chat-max-w)]">{body}</div>
      </ScrollArea>
    </section>
  );
}

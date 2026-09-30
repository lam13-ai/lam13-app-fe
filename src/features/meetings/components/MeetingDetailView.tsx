import { ArrowLeft, ArrowUp, Check, Menu as MenuIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '@/api';
import { ErrorState } from '@/components/ErrorState';
import { Markdown } from '@/components/Markdown';
import { ScrollArea } from '@/components/ScrollArea';
import { IconButton, Skeleton, iconProps, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';
import type { Meeting } from '@/types/api';
import { useMeeting } from '../hooks/useMeetings';
import { formatMeetingDate, formatMeetingDuration, formatMeetingTime } from '../lib/meetings';

/** Router state that opens a new chat with a meeting as context (read by the chat view). */
export interface AskAboutMeetingState {
  newChat: true;
  meetingContext: { id: string; title: string };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

/** Styled like the idle composer: this is where the conversation about the meeting starts. */
function AskLam13({ meeting }: { meeting: Meeting }) {
  const navigate = useNavigate();
  const state: AskAboutMeetingState = { newChat: true, meetingContext: { id: meeting.id, title: meeting.title } };
  return (
    <button
      type="button"
      onClick={() => navigate('/', { state })}
      className="group flex h-12 w-full items-center gap-3 rounded-composer border border-border bg-composer pl-4 pr-2 text-left shadow-xs outline-offset-2 transition-[border-color] duration-150 ease-standard hover:border-fg/25"
    >
      <span className="min-w-0 flex-1 truncate text-base font-medium sm:text-sm">Ask Lam13 about this meeting</span>
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fg text-bg">
        <ArrowUp size={14} strokeWidth={1.75} />
      </span>
    </button>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading meeting" className="flex flex-col gap-3">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="mt-6 h-12 w-full" />
      <Skeleton className="mt-6 h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}

function MeetingDocument({ meeting }: { meeting: Meeting }) {
  const actions = meeting.action_items ?? [];
  const decisions = meeting.decisions ?? [];
  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="break-words text-lg font-bold leading-snug">{meeting.title}</h1>
        <p className="text-xs text-fg-muted">
          <time dateTime={meeting.started_at}>
            {formatMeetingDate(meeting.started_at)}, {formatMeetingTime(meeting.started_at)}
          </time>
          {meeting.duration_seconds > 0 && ` · ${formatMeetingDuration(meeting.duration_seconds)}`}
        </p>
      </header>

      <AskLam13 meeting={meeting} />

      {meeting.participants.length > 0 && (
        <Section title={`Participants (${meeting.participants.length})`}>
          <ul className="flex flex-col gap-1.5 text-sm">
            {meeting.participants.map((p) => (
              <li key={p.id} className="min-w-0">
                <span className="font-bold">{p.name}</span>
                {p.role && <span className="text-fg-muted"> · {p.role}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {meeting.summary && (
        <Section title="Summary">
          <p className="text-sm leading-relaxed">{meeting.summary}</p>
        </Section>
      )}

      {decisions.length > 0 && (
        <Section title="Key decisions">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed marker:text-fg-muted">
            {decisions.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Section>
      )}

      {actions.length > 0 && (
        <Section title="Action items">
          <ul className="flex flex-col gap-2 text-sm leading-relaxed">
            {actions.map((a) => (
              <li key={a.id} className="flex gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    'mt-[3px] flex size-4 shrink-0 items-center justify-center border',
                    a.completed ? 'border-fg bg-fg text-bg' : 'border-hairline-strong',
                  )}
                >
                  {a.completed && <Check {...smallIconProps} size={12} />}
                </span>
                <span className="min-w-0">
                  <span className={cn(a.completed && 'text-fg-muted line-through')}>{a.text}</span>
                  {a.completed && <span className="sr-only"> (done)</span>}
                  {a.assignee && <span className="text-fg-muted"> — {a.assignee}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {meeting.notes && (
        <Section title="Notes">
          <Markdown content={meeting.notes} className="text-sm" />
        </Section>
      )}
    </article>
  );
}

/** `/meetings/:meetingId`: one meeting as a readable document, and the way into a chat about it. */
export function MeetingDetailView({ meetingId }: { meetingId: string }) {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const meeting = useMeeting(meetingId);
  const notFound = meeting.error instanceof ApiError && meeting.error.status === 404;

  let body;
  if (meeting.isPending) body = <DetailSkeleton />;
  else if (meeting.isError)
    body = notFound ? (
      <ErrorState title="This meeting isn't available." description="It may have been removed from Granola." className="py-16" />
    ) : (
      <ErrorState
        title="Couldn't load this meeting."
        description="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => void meeting.refetch() }}
        className="py-16"
      />
    );
  else body = <MeetingDocument meeting={meeting.data} />;

  return (
    <section
      aria-label="Meeting"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-bg md:rounded-card md:border md:border-frame md:shadow-card"
    >
      <header className="bright-chrome flex h-[var(--header-h)] shrink-0 items-center gap-2 border-b border-hairline px-3 md:px-5">
        <IconButton
          label="Open sidebar"
          size="md"
          icon={<MenuIcon {...iconProps} />}
          onClick={() => setSidebarOpen(true)}
          className="md:hidden"
        />
        <Link
          to="/meetings"
          className="flex min-h-11 items-center gap-2 pr-2 text-nav text-fg-muted transition-colors duration-150 ease-standard hover:text-fg md:min-h-0"
        >
          <ArrowLeft {...iconProps} />
          Back to Meetings
        </Link>
      </header>

      <ScrollArea className="min-h-0 flex-1 px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto w-full max-w-[var(--chat-max-w)]">{body}</div>
      </ScrollArea>
    </section>
  );
}

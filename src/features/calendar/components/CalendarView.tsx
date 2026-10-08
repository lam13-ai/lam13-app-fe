import { Check, ChevronDown, ChevronLeft, ChevronRight, MapPin, Video } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { BrandLogo, type Brand } from '@/components/BrandLogo';
import { ErrorState } from '@/components/ErrorState';
import { PageFrame } from '@/components/PageFrame';
import { Button, IconButton, Menu, MenuItem, Popover, Skeleton, iconProps, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useDemoStore, type NoteTaker } from '@/stores/demoStore';
import type { CalendarEvent, CalendarTask } from '@/types/api';
import { useCalendarEvents, useCalendarTasks, useCalendarUpcoming, useSetTaskCompleted } from '../hooks/useCalendar';

const TABS = ['Calendar', 'Upcoming Meetings', 'Tasks & Actions'] as const;
type Tab = (typeof TABS)[number];
type View = 'month' | 'week';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NOTE_TAKERS: { id: NoteTaker; name: string }[] = [
  { id: 'granola', name: 'Granola' },
  { id: 'otter', name: 'Otter' },
  { id: 'fireflies', name: 'Fireflies' },
];

/** Local calendar day as a sortable key, e.g. "2026-10-06". */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const keyOf = (iso: string) => dayKey(new Date(iso));
const fromKey = (key: string) => new Date(`${key}T00:00:00`);
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const longDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
/** The Monday of the week containing `d`. */
const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

/** The six-week grid (Monday first) that contains `month`. */
function monthGrid(month: Date): Date[] {
  const start = weekStart(new Date(month.getFullYear(), month.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Which note taker the calendar shows as its source. A demo choice: it only changes this label, never a meeting's location. */
function NoteTakerSelect() {
  const noteTaker = useDemoStore((s) => s.noteTaker);
  const setNoteTaker = useDemoStore((s) => s.setNoteTaker);
  const current = NOTE_TAKERS.find((t) => t.id === noteTaker)!;
  return (
    <Popover
      placement="bottom-end"
      className="w-60"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`Note taker: ${current.name} Connected`}
          className="group flex h-9 shrink-0 items-center gap-2 rounded-full border border-border pl-1.5 pr-2.5 text-xs transition-colors duration-150 ease-standard hover:border-fg/40 aria-expanded:border-fg/40"
        >
          <BrandLogo brand={current.id} size={22} />
          <span className="max-sm:sr-only">{current.name}</span>
          <span className="flex items-center gap-1.5 text-fg-muted">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
            <span className="max-sm:sr-only">Connected</span>
          </span>
          <ChevronDown {...smallIconProps} size={14} className="text-fg-muted transition-transform duration-200 group-aria-expanded:rotate-180" />
        </button>
      )}
    >
      <Menu label="Note taker">
        {NOTE_TAKERS.map((t) => (
          <MenuItem key={t.id} checked={t.id === noteTaker} onSelect={() => setNoteTaker(t.id)} leading={<BrandLogo brand={t.id} size={18} />}>
            {t.name}
          </MenuItem>
        ))}
      </Menu>
      <p className="mt-1.5 border-t border-hairline px-2.5 pt-2 text-2xs leading-snug text-fg-muted">Demo: choosing a note taker only changes this label.</p>
    </Popover>
  );
}

const LOCATIONS: Record<NonNullable<CalendarEvent['location']>, { name: string; brand?: Brand }> = {
  meet: { name: 'Google Meet', brand: 'meet' },
  teams: { name: 'Microsoft Teams', brand: 'teams' },
  zoom: { name: 'Zoom', brand: 'zoom' },
  webex: { name: 'Webex' },
  online: { name: 'Online meeting' },
  'in-person': { name: 'In person' },
};

/**
 * Where the meeting happens: the platform's mark (a camera for one without a logo here, a pin for a place),
 * linked to the join link when there is one. Nothing when the place is not known. `labelled` writes the
 * name beside it.
 */
function LocationMark({ event, labelled }: { event: CalendarEvent; labelled: boolean }) {
  if (!event.location) return null;
  const { name: kind, brand } = LOCATIONS[event.location];
  // A place is named as the organizer wrote it.
  const name = event.location === 'in-person' && event.location_text ? event.location_text : kind;
  const Icon = event.location === 'in-person' ? MapPin : Video;
  const mark = brand ? (
    <BrandLogo brand={brand} size={28} />
  ) : (
    <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-card border border-hairline">
      <Icon size={15} strokeWidth={1.8} />
    </span>
  );
  return (
    <span data-location={event.location} title={name} className="flex min-w-0 max-w-[45%] shrink-0 items-center gap-2 text-xs text-fg-muted">
      <span className={cn('truncate', labelled ? 'max-sm:sr-only' : 'sr-only')}>{name}</span>
      {event.meeting_url ? (
        <a href={event.meeting_url} target="_blank" rel="noreferrer" aria-label={`Join: ${name}`} className="shrink-0 rounded-card outline-offset-2">
          {mark}
        </a>
      ) : (
        mark
      )}
    </span>
  );
}

function EventRow({ event, showDate = false }: { event: CalendarEvent; showDate?: boolean }) {
  return (
    <li className="flex items-start gap-3 border-b border-hairline py-3">
      <div className={cn('shrink-0 pt-0.5 text-xs tabular-nums text-fg-muted', showDate ? 'w-28' : 'w-[4.5rem]')}>
        {showDate && <p className="font-bold text-fg">{shortDay(new Date(event.starts_at))}</p>}
        <p className={cn(!showDate && 'font-bold text-fg')}>
          {time(event.starts_at)}
          {showDate && event.ends_at && ` – ${time(event.ends_at)}`}
        </p>
        {!showDate && event.ends_at && <p>{time(event.ends_at)}</p>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {/* A meeting that was recorded opens its notes. */}
          {event.meeting_id ? (
            <Link to={`/meetings/${event.meeting_id}`} className="underline-offset-4 hover:underline">
              {event.title}
            </Link>
          ) : (
            event.title
          )}
        </p>
        {event.participants.length > 0 && <p className="mt-0.5 truncate text-xs text-fg-muted">{event.participants.join(', ')}</p>}
        {showDate && event.project && <p className="mt-0.5 truncate text-2xs text-fg-muted">{event.project}</p>}
      </div>
      <LocationMark event={event} labelled={showDate} />
    </li>
  );
}

function TaskRow({ task, showDate = false }: { task: CalendarTask; showDate?: boolean }) {
  const setCompleted = useSetTaskCompleted();
  // With a due date: when it is due. Without one (the backend's meeting actions): the day of its meeting.
  const due = task.due_at && `Due ${showDate ? `${shortDay(new Date(task.due_at))}, ${time(task.due_at)}` : time(task.due_at)}`;
  const held = !task.due_at && showDate && task.meeting_at ? shortDay(new Date(task.meeting_at)) : null;
  return (
    <li className="border-b border-hairline">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
        <input type="checkbox" checked={task.completed} onChange={(e) => setCompleted.mutate({ id: task.id, completed: e.target.checked })} className="peer sr-only" />
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors duration-150 ease-standard peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
            task.completed ? 'border-fg bg-fg text-bg' : 'border-fg/40',
          )}
        >
          {task.completed && <Check size={12} strokeWidth={2.4} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-sm', task.completed && 'text-fg-muted line-through')}>{task.title}</span>
          <span className="mt-0.5 block truncate text-xs text-fg-muted">{[task.meeting && `From ${task.meeting}`, due, held].filter(Boolean).join(' · ')}</span>
        </span>
      </label>
    </li>
  );
}

type Days = Map<string, { events: CalendarEvent[]; tasks: CalendarTask[] }>;

/** Where a task sits in time: its due date, else the meeting it came from. */
const taskDate = (task: CalendarTask) => task.due_at ?? task.meeting_at ?? '';

/** Month or week grid with selectable days, and the selected day's agenda beside it. */
function CalendarTab({ byDay, today }: { byDay: Days; today: Date }) {
  const [view, setView] = useState<View>('month');
  const [selected, setSelected] = useState(() => dayKey(today));
  // The month (its first day) or week (its Monday) on screen.
  const [anchor, setAnchor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const selectedDate = fromKey(selected);
  const days = view === 'month' ? monthGrid(anchor) : Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
  const label =
    view === 'month'
      ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `${anchor.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(anchor, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const show = (next: View, date: Date) => {
    setView(next);
    setAnchor(next === 'month' ? new Date(date.getFullYear(), date.getMonth(), 1) : weekStart(date));
  };
  const shift = (step: number) => setAnchor((a) => (view === 'month' ? new Date(a.getFullYear(), a.getMonth() + step, 1) : addDays(a, step * 7)));
  const goToday = () => {
    setSelected(dayKey(today));
    show(view, today);
  };
  const agenda = byDay.get(selected) ?? { events: [], tasks: [] };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-6">
      <section aria-label={label}>
        <div className="mb-3 flex flex-wrap items-center gap-x-1 gap-y-2">
          <h2 aria-live="polite" className="min-w-0 flex-1 basis-40 truncate text-base font-bold">
            {label}
          </h2>
          <div role="group" aria-label="Calendar view" className="mr-1 flex rounded-full border border-border p-0.5">
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => show(v, selectedDate)}
                className={cn(
                  'h-8 rounded-full px-3 text-xs font-bold capitalize transition-colors duration-150 ease-standard',
                  view === v ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <IconButton label={`Previous ${view}`} size="md" icon={<ChevronLeft {...iconProps} />} onClick={() => shift(-1)} />
          <IconButton label={`Next ${view}`} size="md" icon={<ChevronRight {...iconProps} />} onClick={() => shift(1)} />
        </div>
        <div aria-hidden="true" className="grid grid-cols-7 border-b border-hairline pb-2 text-center text-2xs font-bold uppercase tracking-wide text-fg-muted">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date) => {
            const key = dayKey(date);
            const day = byDay.get(key);
            const inMonth = view === 'week' || date.getMonth() === anchor.getMonth();
            const isSelected = key === selected;
            const count = (day?.events.length ?? 0) + (day?.tasks.length ?? 0);
            // A week has room for every meeting; a month shows the first two.
            const limit = view === 'week' ? 6 : 2;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${longDay(date)}${count ? `, ${count} item${count === 1 ? '' : 's'}` : ''}`}
                onClick={() => {
                  setSelected(key);
                  if (!inMonth) setAnchor(new Date(date.getFullYear(), date.getMonth(), 1));
                }}
                className={cn(
                  'flex flex-col items-stretch gap-1 border-b border-hairline p-1 text-left outline-offset-[-2px] transition-colors duration-150 ease-standard sm:p-1.5',
                  view === 'week' ? 'min-h-16 sm:min-h-64' : 'min-h-12 sm:min-h-[5.25rem]',
                  isSelected ? 'bg-accent-wash' : 'hover:bg-fg/[0.035]',
                  !inMonth && 'text-fg-muted/60',
                )}
              >
                <span className={cn('flex size-6 items-center justify-center self-center rounded-full text-xs tabular-nums sm:self-start', key === dayKey(today) && 'bg-fg font-bold text-bg')}>
                  {date.getDate()}
                </span>
                {/* Desktop: the day's meetings by name. Mobile: dots (the agenda below has the detail). */}
                <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {day?.events.slice(0, limit).map((e) => (
                    <span key={e.id} className={cn('border-l-2 border-accent pl-1 text-[10.5px] leading-4 text-fg', view === 'week' ? 'line-clamp-2' : 'truncate')}>
                      {view === 'week' && <span className="block tabular-nums text-fg-muted">{time(e.starts_at)}</span>}
                      {e.title}
                    </span>
                  ))}
                  {day && (day.events.length > limit || day.tasks.length > 0) && (
                    <span className="truncate pl-1.5 text-[10.5px] leading-4 text-fg-muted">
                      {day.events.length > limit ? `+${count - limit} more` : `${day.tasks.length} task${day.tasks.length === 1 ? '' : 's'}`}
                    </span>
                  )}
                </span>
                <span className="flex h-1.5 justify-center gap-0.5 sm:hidden">
                  {day && day.events.length > 0 && <span className="size-1.5 rounded-full bg-accent" />}
                  {day && day.tasks.length > 0 && <span className="size-1.5 rounded-full bg-fg/50" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Agenda" className="min-w-0 lg:border-l lg:border-hairline lg:pl-6">
        <p className="eyebrow">{selected === dayKey(today) ? 'Today' : selectedDate.toLocaleDateString(undefined, { weekday: 'long' })}</p>
        <h2 className="mt-1 text-base font-bold">{selectedDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</h2>
        {agenda.events.length === 0 && agenda.tasks.length === 0 ? (
          <p className="py-10 text-sm text-fg-muted">Nothing scheduled for this day.</p>
        ) : (
          <>
            {agenda.events.length > 0 && (
              <>
                <h3 className="eyebrow mt-6 text-fg-muted">Meetings</h3>
                <ul aria-label="Meetings">
                  {agenda.events.map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </ul>
              </>
            )}
            {agenda.tasks.length > 0 && (
              <>
                <h3 className="eyebrow mt-6 text-fg-muted">Tasks</h3>
                <ul aria-label="Tasks">
                  {agenda.tasks.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** Meetings still to come, soonest first (the service's own "upcoming" list). */
function UpcomingTab({ events }: { events: CalendarEvent[] }) {
  const upcoming = useMemo(() => [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [events]);
  if (upcoming.length === 0) return <p className="py-16 text-center text-sm text-fg-muted">No upcoming meetings.</p>;
  return (
    <div className="mx-auto max-w-[46rem]">
      <ul aria-label="Upcoming meetings">
        {upcoming.map((e) => (
          <EventRow key={e.id} event={e} showDate />
        ))}
      </ul>
      <Link to="/meetings" className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-fg-muted underline-offset-4 hover:text-fg hover:underline">
        Browse recorded meeting notes <ChevronRight {...smallIconProps} />
      </Link>
    </div>
  );
}

/** Every action from the meetings: open ones first (soonest due), then the completed. */
function TasksTab({ tasks }: { tasks: CalendarTask[] }) {
  const sorted = useMemo(() => [...tasks].sort((a, b) => taskDate(a).localeCompare(taskDate(b))), [tasks]);
  const open = sorted.filter((t) => !t.completed);
  const done = sorted.filter((t) => t.completed);
  if (tasks.length === 0) return <p className="py-16 text-center text-sm text-fg-muted">No tasks or actions yet.</p>;
  return (
    <div className="mx-auto flex max-w-[46rem] flex-col gap-8">
      <section aria-label="Open">
        <h2 className="eyebrow">Open · {open.length}</h2>
        {open.length === 0 ? (
          <p className="py-6 text-sm text-fg-muted">Everything is done.</p>
        ) : (
          <ul aria-label="Open tasks">
            {open.map((t) => (
              <TaskRow key={t.id} task={t} showDate />
            ))}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <section aria-label="Completed">
          <h2 className="eyebrow">Completed · {done.length}</h2>
          <ul aria-label="Completed tasks">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} showDate />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** `/calendar`: the calendar, the upcoming meetings and the tasks that came out of them — three tabs, one page. */
export function CalendarView() {
  const events = useCalendarEvents();
  const upcoming = useCalendarUpcoming();
  const tasks = useCalendarTasks();
  const today = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<Tab>('Calendar');
  const tabsId = useId();

  const byDay = useMemo(() => {
    const map: Days = new Map();
    const at = (key: string) => map.get(key) ?? map.set(key, { events: [], tasks: [] }).get(key)!;
    for (const e of events.data ?? []) at(keyOf(e.starts_at)).events.push(e);
    for (const t of tasks.data ?? []) if (taskDate(t)) at(keyOf(taskDate(t))).tasks.push(t);
    for (const day of map.values()) {
      day.events.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      day.tasks.sort((a, b) => taskDate(a).localeCompare(taskDate(b)));
    }
    return map;
  }, [events.data, tasks.data]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]!;
    setTab(next);
    document.getElementById(`${tabsId}-${TABS.indexOf(next)}`)?.focus();
  };

  let body;
  const queries = [events, upcoming, tasks];
  if (queries.some((q) => q.isPending)) {
    body = (
      <div role="status" aria-label="Loading calendar" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Skeleton className="h-[26rem]" />
        <Skeleton className="h-64" />
      </div>
    );
  } else if (!events.data || !upcoming.data || !tasks.data) {
    body = (
      <ErrorState
        title="Couldn't load your calendar."
        description="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => queries.forEach((q) => q.isError && void q.refetch()) }}
        className="py-16"
      />
    );
  } else {
    const openTasks = tasks.data.filter((t) => !t.completed).length;
    body = (
      <>
        <div role="tablist" aria-label="Calendar sections" onKeyDown={onKeyDown} className="scrollbar-subtle mb-6 flex gap-1 overflow-x-auto border-b border-hairline">
          {TABS.map((t, i) => (
            <button
              key={t}
              id={`${tabsId}-${i}`}
              type="button"
              role="tab"
              aria-selected={tab === t}
              aria-controls={`${tabsId}-panel`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className={cn(
                '-mb-px flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-nav outline-offset-[-2px] transition-colors duration-150 ease-standard md:h-10',
                tab === t ? 'border-fg font-bold text-fg' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {t}
              {t === 'Tasks & Actions' && openTasks > 0 && <span className="text-2xs tabular-nums text-fg-muted">{openTasks}</span>}
            </button>
          ))}
        </div>
        <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${TABS.indexOf(tab)}`}>
          {tab === 'Calendar' && <CalendarTab byDay={byDay} today={today} />}
          {tab === 'Upcoming Meetings' && <UpcomingTab events={upcoming.data} />}
          {tab === 'Tasks & Actions' && <TasksTab tasks={tasks.data} />}
        </div>
      </>
    );
  }

  return (
    <PageFrame title="Calendar" subtitle="Meetings, and the tasks and actions that came out of them." wide actions={<NoteTakerSelect />}>
      {body}
    </PageFrame>
  );
}

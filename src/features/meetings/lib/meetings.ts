import type { MeetingParticipant, MeetingSummary } from '@/types/api';

/** Matches the title or any participant's name (case- and accent-insensitive). */
export function filterMeetings<T extends MeetingSummary>(meetings: readonly T[], query: string): T[] {
  const needle = fold(query.trim());
  if (!needle) return [...meetings];
  return meetings.filter((m) => fold(m.title).includes(needle) || m.participants.some((p) => fold(p.name).includes(needle)));
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "Today", "Yesterday", else the date ("Mon 21 Sep"; with the year when it isn't this year). */
export function dayLabel(iso: string, now: Date = new Date(), locale?: string): string {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  }).format(date);
}

/** Consecutive meetings of the same day (the list is newest first). */
export function groupByDay<T extends MeetingSummary>(meetings: readonly T[], now: Date = new Date()) {
  const groups: { label: string; meetings: T[] }[] = [];
  for (const meeting of meetings) {
    const label = dayLabel(meeting.started_at, now);
    const last = groups.at(-1);
    if (last?.label === label) last.meetings.push(meeting);
    else groups.push({ label, meetings: [meeting] });
  }
  return groups;
}

/** "25 min", "1 h", "1 h 35 min". */
export function formatMeetingDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatMeetingTime(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Full date for the detail page: "Tuesday 29 September 2026". */
export function formatMeetingDate(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date(iso));
}

/** "Hannah Lee, Priya Raman +3" — the first `shown` names, then a count. */
export function participantsLabel(participants: readonly MeetingParticipant[], shown = 2): string {
  const names = participants.slice(0, shown).map((p) => p.name);
  const rest = participants.length - names.length;
  return rest > 0 ? `${names.join(', ')} +${rest}` : names.join(', ');
}

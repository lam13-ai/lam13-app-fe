/** Formats a duration as m:ss (e.g. 75_400 → "1:15"). Negative/invalid values render as 0:00. */
export function formatDuration(ms: number): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Spoken form for screen readers (e.g. "1 minute 15 seconds"). */
export function describeDuration(ms: number): string {
  const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (seconds || !minutes) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** Intl formatters are costly to build and message rows re-render while streaming: reuse them. */
const formatters = new Map<string, Intl.DateTimeFormat>();
function dateFormat(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, format);
  }
  return format;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/**
 * Compact message time in the viewer's locale and time zone: "14:32" today, "Yesterday, 14:32",
 * "12 Sep, 14:32" this year, else "12 Sep 2025, 14:32". Invalid input renders as "".
 */
export function formatMessageTime(iso: string, now: Date = new Date(), locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = dateFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  if (sameDay(date, now)) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `Yesterday, ${time}`;
  const day = dateFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  }).format(date);
  return `${day}, ${time}`;
}

/** Full date and time for tooltips / screen readers (e.g. "Thursday 25 September 2026 at 14:32"). */
export function describeMessageTime(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(date);
}

import { describe, expect, it } from 'vitest';
import { describeMessageTime, formatMessageTime } from './format';

// Local-time dates so the assertions hold in any time zone.
const now = new Date(2026, 8, 25, 16, 0);
const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m, d, h, min).toISOString();

describe('formatMessageTime', () => {
  it('shows the time today, "Yesterday", the day this year, and the year otherwise', () => {
    expect(formatMessageTime(at(2026, 8, 25, 14, 32), now, 'en-GB')).toBe('14:32');
    expect(formatMessageTime(at(2026, 8, 24, 9, 5), now, 'en-GB')).toBe('Yesterday, 09:05');
    // Month abbreviations vary by ICU version ("Sep" / "Sept").
    expect(formatMessageTime(at(2026, 8, 12, 14, 32), now, 'en-GB')).toMatch(/^12 Sept?, 14:32$/);
    expect(formatMessageTime(at(2025, 11, 31, 23, 59), now, 'en-GB')).toBe('31 Dec 2025, 23:59');
  });

  it('crosses month and year boundaries for "Yesterday"', () => {
    expect(formatMessageTime(at(2025, 11, 31, 20, 0), new Date(2026, 0, 1, 8, 0), 'en-GB')).toBe('Yesterday, 20:00');
  });

  it('renders nothing for an invalid timestamp', () => {
    expect(formatMessageTime('not a date', now)).toBe('');
    expect(describeMessageTime('')).toBe('');
  });

  it('gives a full description for tooltips and screen readers', () => {
    const full = describeMessageTime(at(2026, 8, 25, 14, 32), 'en-GB');
    expect(full).toMatch(/Friday,? 25 September 2026/);
    expect(full).toContain('14:32');
  });
});

import { describe, expect, it } from 'vitest';
import { createMockMeetings } from '@/api/mock/meetings';
import type { MeetingSummary } from '@/types/api';
import { dayLabel, filterMeetings, formatMeetingDuration, groupByDay, participantsLabel } from './meetings';

const NOW = new Date(2026, 8, 29, 15, 0);
const at = (days: number, hour = 10) => new Date(2026, 8, 29 - days, hour).toISOString();
const meeting = (id: string, title: string, started_at: string, names: string[] = []): MeetingSummary => ({
  id,
  title,
  started_at,
  duration_seconds: 1800,
  participants: names.map((name, i) => ({ id: `${id}-${i}`, name })),
});

describe('meetings lib', () => {
  it('searches titles and participant names, ignoring case and accents', () => {
    const list = [meeting('a', 'Budget sync', at(0), ['Daniel Brandt']), meeting('b', 'KPI workshop', at(1), ['Tomás Alvarez'])];
    expect(filterMeetings(list, 'BUDGET').map((m) => m.id)).toEqual(['a']);
    expect(filterMeetings(list, 'tomas').map((m) => m.id)).toEqual(['b']);
    expect(filterMeetings(list, '  ')).toEqual(list);
    expect(filterMeetings(list, 'nothing')).toEqual([]);
  });

  it('groups newest-first meetings by day: Today, Yesterday, then the date', () => {
    const groups = groupByDay([meeting('a', 'A', at(0, 14)), meeting('b', 'B', at(0, 9)), meeting('c', 'C', at(1)), meeting('d', 'D', at(6))], NOW);
    expect(groups.map((g) => [g.label, g.meetings.map((m) => m.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      [dayLabel(at(6), NOW), ['d']],
    ]);
    expect(groups[2]!.label).not.toMatch(/Today|Yesterday/);
  });

  it('formats durations and participant lists compactly', () => {
    expect(formatMeetingDuration(25 * 60)).toBe('25 min');
    expect(formatMeetingDuration(60 * 60)).toBe('1 h');
    expect(formatMeetingDuration(95 * 60)).toBe('1 h 35 min');
    expect(formatMeetingDuration(10)).toBe('1 min');
    const people = ['Hannah Lee', 'Priya Raman', 'Omar Siddiqui', 'Lena Fischer'].map((name, i) => ({ id: String(i), name }));
    expect(participantsLabel(people)).toBe('Hannah Lee, Priya Raman +2');
    expect(participantsLabel(people.slice(0, 2))).toBe('Hannah Lee, Priya Raman');
  });
});

describe('mock MeetingsService', () => {
  it('lists summaries newest first (no sections), gets one meeting, 404s unknown ids, and toggles the connection', async () => {
    const api = createMockMeetings({ now: () => NOW.getTime() });
    const list = await api.list();
    expect(list.length).toBeGreaterThan(5);
    expect([...list].sort((a, b) => b.started_at.localeCompare(a.started_at))).toEqual(list);
    expect(Object.keys(list[0]!).sort()).toEqual(['duration_seconds', 'id', 'participants', 'started_at', 'title']);

    const full = await api.get(list[0]!.id);
    expect(full.summary).toBeTruthy();
    await expect(api.get('missing')).rejects.toMatchObject({ status: 404 });

    expect(await api.connection()).toEqual({ provider: 'granola', status: 'connected' });
    expect(await api.setConnected(false)).toEqual({ provider: 'granola', status: 'disconnected' });
    expect((await api.connection()).status).toBe('disconnected');
  });

  it('ticks an action item and keeps it ticked', async () => {
    const api = createMockMeetings({ now: () => NOW.getTime() });
    const meeting = await api.get('mtg_product_strategy');
    const item = meeting.action_items![0]!;
    const updated = await api.setActionItemCompleted(meeting.id, item.id, !item.completed);
    expect(updated.action_items![0]!.completed).toBe(!item.completed);
    expect((await api.get(meeting.id)).action_items![0]!.completed).toBe(!item.completed);
    await expect(api.setActionItemCompleted(meeting.id, 'missing', true)).rejects.toMatchObject({ status: 404 });
  });
});

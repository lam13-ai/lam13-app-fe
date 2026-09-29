import type { MeetingSourceConnection, MeetingSummary } from '@/types/api';
import { ApiError } from '../errors';
import type { MeetingsService } from '../services';
import { createMeetingSeed } from './meetingFixtures';
import { clone } from './utils';

/**
 * Local meetings behind `MeetingsService`. Used by BOTH adapters until the backend has meeting routes
 * (Granola via the Lam13 backend); swap this for HTTP calls then — the UI does not change. The Granola
 * connection is only a flag here: no OAuth, tokens or Granola calls.
 */
export function createMockMeetings({ now = Date.now, respond = () => Promise.resolve() } = {}): MeetingsService {
  const meetings = createMeetingSeed(now()).sort((a, b) => b.started_at.localeCompare(a.started_at));
  let connection: MeetingSourceConnection = { provider: 'granola', status: 'connected' };

  return {
    async list() {
      await respond();
      return meetings.map(({ id, title, started_at, duration_seconds, participants }): MeetingSummary =>
        clone({ id, title, started_at, duration_seconds, participants }),
      );
    },
    async get(id) {
      await respond();
      const meeting = meetings.find((m) => m.id === id);
      if (!meeting) throw new ApiError(404, 'not_found', 'This meeting does not exist.');
      return clone(meeting);
    },
    async connection() {
      await respond();
      return { ...connection };
    },
    async setConnected(connected) {
      await respond();
      connection = { provider: 'granola', status: connected ? 'connected' : 'disconnected' };
      return { ...connection };
    },
  };
}

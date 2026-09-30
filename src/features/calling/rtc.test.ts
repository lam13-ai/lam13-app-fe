import { describe, expect, it, vi } from 'vitest';
import { toMessages } from '@/api/http';
import { watchRtc } from './rtc';

import { setAccessTokenGetter } from '@/api/auth';

describe('RTC report events', () => {
  it('maps each report download to its original message', () => {
    const messages = toMessages({ sessionId: 'thread', title: 'Test', reportUrl: 'https://example.test/two.pdf', messages: [
      { id: 'one', role: 'assistant', content: 'First report', voice_action_id: 'a', report_url: 'https://example.test/one.pdf', status: 'completed' },
      { id: 'two', role: 'assistant', content: 'Second report', voice_action_id: 'b', report_url: 'https://example.test/two.pdf', status: 'completed' },
      { id: 'later', role: 'assistant', content: 'Later discussion', status: 'completed' },
    ] });
    expect(messages[0]?.artifacts?.[0]?.download?.url).toBe('https://example.test/one.pdf');
    expect(messages[1]?.artifacts?.[0]?.download?.url).toBe('https://example.test/two.pdf');
    expect(messages[2]?.artifacts).toBeUndefined();
  });

  it('sends an authenticated resume cursor and receives persisted snapshots', async () => {
    const payload = { status: { calls: [], actions: [] }, conversation: { sessionId: 'thread', title: 'Test', messages: [] } };
    const unregister = setAccessTokenGetter(async () => 'test-token');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(`id: 8\nevent: snapshot\ndata: ${JSON.stringify(payload)}\n\n`));
    try {
      const receive = vi.fn();
      await watchRtc('thread', '7', new AbortController().signal, receive);
      expect(fetch.mock.calls[0]?.[0]).toContain('/events?after=7');
      expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
      expect(receive).toHaveBeenCalledWith(payload, '8');
    } finally { fetch.mockRestore(); unregister(); }
  });
});

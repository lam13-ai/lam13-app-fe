import { readSseMessages } from '@/api/stream/readEventStream';
import { request, requestJson, type SessionDetailDto } from '@/api/http';

export interface PreparedCall {
  id: string;
  session_id: string;
  assistant_id: string;
  assistant_overrides: { variableValues: Record<string, string> };
}
export interface RecordedAction {
  id: string;
  title: string;
  request: string;
  status: string;
  missing: string[];
  error: string;
}
export interface RtcStatus {
  calls: { id: string; status: string; finalized: boolean; handoff_requested?: boolean; saved_messages: number; summary: string }[];
  actions: RecordedAction[];
}
export const prepareRtc = (sessionId: string) => requestJson<PreparedCall>('/rtc/sessions', {
  method: 'POST', body: { session_id: sessionId },
});
export const abandonRtc = (id: string) => requestJson(`/rtc/sessions/${encodeURIComponent(id)}/abandon`, { method: 'POST' });
export const registerRtc = (id: string, providerCallId: string) => requestJson(`/rtc/sessions/${encodeURIComponent(id)}/register`, {
  method: 'POST', body: { provider_call_id: providerCallId },
});
export const getRtcStatus = (sessionId: string) => requestJson<RtcStatus>(`/rtc/conversations/${encodeURIComponent(sessionId)}`);
export const manageRtcAction = (id: string, operation: 'start' | 'cancel') => requestJson<{ queued?: boolean; missing?: string[] }>(
  `/rtc/actions/${encodeURIComponent(id)}/${operation}`, { method: 'POST' },
);


export async function watchRtc(sessionId: string, after: string, signal: AbortSignal,
  receive: (data: { status: RtcStatus; conversation: SessionDetailDto }, cursor: string) => void) {
  const response = await request(`/rtc/conversations/${encodeURIComponent(sessionId)}/events?after=${encodeURIComponent(after)}`, { signal });
  if (!response.body) throw new Error('Missing RTC event stream');
  for await (const event of readSseMessages(response.body, signal)) {
    if (event.event === 'snapshot') receive(JSON.parse(event.data), event.id ?? '');
  }
}

export const noteHandoffTermination = (id: string) => requestJson(
  `/rtc/sessions/${encodeURIComponent(id)}/termination-attempt`, { method: 'POST' },
);

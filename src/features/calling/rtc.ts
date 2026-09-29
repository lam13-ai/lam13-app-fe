import { requestJson } from '@/api/http';

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
  calls: { id: string; status: string; finalized: boolean; saved_messages: number; summary: string }[];
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

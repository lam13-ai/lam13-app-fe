import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';

/** The user's meetings, newest first. Only fetched once the meeting source is connected. */
export function useMeetings({ enabled = true } = {}) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.meetings.list(), queryFn: () => api.meetings.list(), enabled });
}

export function useMeeting(id: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.meetings.detail(id), queryFn: () => api.meetings.get(id) });
}

/** Granola's connection (UI-only for now; see MeetingsService). */
export function useMeetingSource() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.meetings.connection(), queryFn: () => api.meetings.connection() });
}

export function useSetMeetingSourceConnected() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connected: boolean) => api.meetings.setConnected(connected),
    onSuccess: (connection) => {
      queryClient.setQueryData(queryKeys.meetings.connection(), connection);
      void queryClient.invalidateQueries({ queryKey: queryKeys.meetings.list() });
    },
  });
}

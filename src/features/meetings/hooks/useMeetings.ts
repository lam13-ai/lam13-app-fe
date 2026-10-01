import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';
import type { Meeting, MeetingSourceConnection } from '@/types/api';

/** The user's meetings, newest first. Only fetched once the meeting source is connected. */
export function useMeetings({ enabled = true } = {}) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.meetings.list(), queryFn: () => api.meetings.list(), enabled });
}

export function useMeeting(id: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.meetings.detail(id), queryFn: () => api.meetings.get(id) });
}

/** Ticks an action item: shown at once, saved on the backend, rolled back if saving fails. */
export function useSetActionItemCompleted(meetingId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.meetings.detail(meetingId);
  return useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      api.meetings.setActionItemCompleted(meetingId, itemId, completed),
    onMutate: async ({ itemId, completed }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Meeting>(key);
      if (previous) {
        queryClient.setQueryData<Meeting>(key, {
          ...previous,
          action_items: previous.action_items?.map((a) => (a.id === itemId ? { ...a, completed } : a)),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (meeting) => queryClient.setQueryData(key, meeting),
  });
}

/** Granola's connection (see MeetingsService). */
export function useMeetingSource() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.meetings.connection(), queryFn: () => api.meetings.connection() });
}

const storeConnection = (queryClient: QueryClient) => (connection: MeetingSourceConnection) => {
  queryClient.setQueryData(queryKeys.meetings.connection(), connection);
  void queryClient.invalidateQueries({ queryKey: queryKeys.meetings.list() });
};

export function useSetMeetingSourceConnected() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connected: boolean) => api.meetings.setConnected(connected),
    onSuccess: storeConnection(queryClient),
  });
}

/** The /integrations/granola/callback page finishing Granola's sign-in. */
export function useFinishGranolaSignIn() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, state }: { code: string; state: string }) => api.meetings.finishGranolaSignIn(code, state),
    onSuccess: storeConnection(queryClient),
  });
}

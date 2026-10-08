import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';
import type { CalendarTask } from '@/types/api';

export function useCalendarEvents() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.calendar.events(), queryFn: () => api.calendar.events() });
}

export function useCalendarUpcoming() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.calendar.upcoming(), queryFn: () => api.calendar.upcoming() });
}

export function useCalendarTasks() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.calendar.tasks(), queryFn: () => api.calendar.tasks() });
}

/** Ticks a task: shown at once, saved through the service, rolled back if saving fails. */
export function useSetTaskCompleted() {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.calendar.tasks();
  const patch = (id: string, completed: boolean) =>
    queryClient.setQueryData<CalendarTask[]>(key, (tasks) => tasks?.map((t) => (t.id === id ? { ...t, completed } : t)));
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => api.calendar.setTaskCompleted(id, completed),
    onMutate: ({ id, completed }) => patch(id, completed),
    onError: (_error, { id, completed }) => patch(id, !completed),
  });
}

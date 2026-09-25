import { useQuery } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';

/** GET /models — the composer hides its chips until (and unless) there is something to choose. */
export function useModels() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.models(),
    queryFn: () => api.models.list(),
    staleTime: Infinity,
    select: (data) => data.items,
  });
}

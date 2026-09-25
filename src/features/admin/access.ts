import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/api';

/**
 * Whether the signed-in user may use the admin panel (`GET /admin/verify`: the email must be in the
 * backend's ADMIN_PANEL_EMAILS). The backend enforces this on every /admin route; this only hides UI.
 */
export function useIsAdmin() {
  return useQuery({
    queryKey: ['admin', 'verify'],
    queryFn: () => requestJson('/admin/verify'),
    staleTime: Infinity,
    retry: false,
    select: () => true,
  });
}

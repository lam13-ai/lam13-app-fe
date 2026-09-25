import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';
import type { Page, Profile, ProfileInput, ProfileUpdateSuggestion } from '@/types/api';
import { applyChanges } from '../lib/contacts';

// ponytail: one page of up to 100 contacts, searched client-side; server search + paging if lists grow.
const LIST_LIMIT = 100;

type ProfileList = Page<Profile>;
type SuggestionList = { items: ProfileUpdateSuggestion[] };

/** GET /profiles */
export function useProfiles() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.profiles.list(),
    queryFn: () => api.profiles.list({ limit: LIST_LIMIT }),
    select: (page) => page.items,
  });
}

/** Every pending suggestion, for card badges and the detail view. */
export function usePendingSuggestions() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.profileSuggestions.pending(),
    queryFn: () => api.profileSuggestions.list({ status: 'pending' }),
    select: (list) => list.items,
  });
}

const setProfiles = (queryClient: QueryClient, update: (items: Profile[]) => Profile[]) =>
  queryClient.setQueryData<ProfileList>(queryKeys.profiles.list(), (d) => d && { ...d, items: update(d.items) });

const setPending = (queryClient: QueryClient, update: (items: ProfileUpdateSuggestion[]) => ProfileUpdateSuggestion[]) =>
  queryClient.setQueryData<SuggestionList>(queryKeys.profileSuggestions.pending(), (d) => d && { items: update(d.items) });

const replaceProfile = (profile: Profile) => (items: Profile[]) => items.map((p) => (p.id === profile.id ? profile : p));

/** Stops in-flight reads and snapshots both caches, so an optimistic change can be rolled back. */
async function snapshot(queryClient: QueryClient) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: queryKeys.profiles.all }),
    queryClient.cancelQueries({ queryKey: queryKeys.profileSuggestions.pending() }),
  ]);
  return {
    profiles: queryClient.getQueryData<ProfileList>(queryKeys.profiles.list()),
    pending: queryClient.getQueryData<SuggestionList>(queryKeys.profileSuggestions.pending()),
  };
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function restore(queryClient: QueryClient, snap: Snapshot | undefined) {
  if (!snap) return;
  queryClient.setQueryData(queryKeys.profiles.list(), snap.profiles);
  queryClient.setQueryData(queryKeys.profileSuggestions.pending(), snap.pending);
}

/** POST /profiles — waits for the server (it assigns the id), then adds the contact. */
export function useCreateProfile() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileInput) => api.profiles.create(body),
    onSuccess: (profile) => setProfiles(queryClient, (items) => [...items, profile]),
  });
}

/** PATCH /profiles/{id} — the user's own edit, optimistic with rollback. */
export function useUpdateProfile() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProfileInput }) => api.profiles.update(id, body),
    onMutate: async ({ id, body }) => {
      const snap = await snapshot(queryClient);
      setProfiles(queryClient, (items) => items.map((p) => (p.id === id ? { ...p, ...body } : p)));
      return snap;
    },
    onError: (_error, _vars, snap) => restore(queryClient, snap),
    onSuccess: (profile) => setProfiles(queryClient, replaceProfile(profile)),
  });
}

/** DELETE /profiles/{id} — removes the contact and its suggestions, optimistic with rollback. */
export function useDeleteProfile() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.profiles.delete(id),
    onMutate: async (id) => {
      const snap = await snapshot(queryClient);
      setProfiles(queryClient, (items) => items.filter((p) => p.id !== id));
      setPending(queryClient, (items) => items.filter((s) => s.profile_id !== id));
      return snap;
    },
    onError: (_error, _id, snap) => restore(queryClient, snap),
  });
}

/**
 * POST /profile-suggestions/{id}/approve — the only path by which a suggestion changes a profile.
 * Optimistic (the change shows at once), rolled back if the server refuses.
 */
export function useApproveSuggestion() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggestion: ProfileUpdateSuggestion) => api.profileSuggestions.approve(suggestion.id),
    onMutate: async (suggestion) => {
      const snap = await snapshot(queryClient);
      setPending(queryClient, (items) => items.filter((s) => s.id !== suggestion.id));
      setProfiles(queryClient, (items) =>
        items.map((p) => (p.id === suggestion.profile_id ? applyChanges(p, suggestion.changes) : p)),
      );
      return snap;
    },
    onError: (_error, _suggestion, snap) => restore(queryClient, snap),
    onSuccess: ({ profile }) => setProfiles(queryClient, replaceProfile(profile)),
  });
}

/** POST /profile-suggestions/{id}/reject — drops the suggestion; the profile is never touched. */
export function useRejectSuggestion() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggestion: ProfileUpdateSuggestion) => api.profileSuggestions.reject(suggestion.id),
    onMutate: async (suggestion) => {
      const snap = await snapshot(queryClient);
      setPending(queryClient, (items) => items.filter((s) => s.id !== suggestion.id));
      return snap;
    },
    onError: (_error, _suggestion, snap) => restore(queryClient, snap),
  });
}

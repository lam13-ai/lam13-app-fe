import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';
import type { Page, Profile, ProfileInput, ProfileUpdateSuggestion } from '@/types/api';
import { applyChanges, currentSuggestions } from '../lib/contacts';
import { nextDemoSuggestion } from '../lib/demoSuggestions';

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

/**
 * The suggestions to show: the newest per group (one new-contact suggestion; one per contact), only while
 * pending. Reads every status so a decided newest one keeps its older revisions hidden (currentSuggestions).
 */
export function usePendingSuggestions() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.profileSuggestions.list(),
    queryFn: () => api.profileSuggestions.list(),
    select: (list) => currentSuggestions(list.items),
  });
}

const setProfiles = (queryClient: QueryClient, update: (items: Profile[]) => Profile[]) =>
  queryClient.setQueryData<ProfileList>(queryKeys.profiles.list(), (d) => d && { ...d, items: update(d.items) });

const setSuggestions = (queryClient: QueryClient, update: (items: ProfileUpdateSuggestion[]) => ProfileUpdateSuggestion[]) =>
  queryClient.setQueryData<SuggestionList>(queryKeys.profileSuggestions.list(), (d) => d && { items: update(d.items) });

/** Marks a suggestion decided in the cache (kept, not removed: it stays the newest of its group). */
const decide = (id: string, next: ProfileUpdateSuggestion | ProfileUpdateSuggestion['status']) => (items: ProfileUpdateSuggestion[]) =>
  items.map((s) => (s.id !== id ? s : typeof next === 'string' ? { ...s, status: next } : { ...s, ...next }));

const replaceProfile = (profile: Profile) => (items: Profile[]) => items.map((p) => (p.id === profile.id ? profile : p));

/** Stops in-flight reads and snapshots both caches, so an optimistic change can be rolled back. */
async function snapshot(queryClient: QueryClient) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: queryKeys.profiles.all }),
    queryClient.cancelQueries({ queryKey: queryKeys.profileSuggestions.list() }),
  ]);
  return {
    profiles: queryClient.getQueryData<ProfileList>(queryKeys.profiles.list()),
    suggestions: queryClient.getQueryData<SuggestionList>(queryKeys.profileSuggestions.list()),
  };
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function restore(queryClient: QueryClient, snap: Snapshot | undefined) {
  if (!snap) return;
  queryClient.setQueryData(queryKeys.profiles.list(), snap.profiles);
  queryClient.setQueryData(queryKeys.profileSuggestions.list(), snap.suggestions);
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
      setSuggestions(queryClient, (items) => items.filter((s) => s.profile_id !== id));
      return snap;
    },
    onError: (_error, _id, snap) => restore(queryClient, snap),
  });
}

/**
 * POST /profile-suggestions/{id}/approve — the only path by which a suggestion changes a profile.
 * Optimistic (the change shows at once), rolled back if the server refuses. A new-contact (`create`)
 * suggestion has no profile to patch: the contact the server creates is added to the list.
 */
export function useApproveSuggestion() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggestion: ProfileUpdateSuggestion) => api.profileSuggestions.approve(suggestion.id),
    onMutate: async (suggestion) => {
      const snap = await snapshot(queryClient);
      setSuggestions(queryClient, decide(suggestion.id, 'approved'));
      setProfiles(queryClient, (items) =>
        items.map((p) => (p.id === suggestion.profile_id ? applyChanges(p, suggestion.changes) : p)),
      );
      return snap;
    },
    onError: (_error, _suggestion, snap) => restore(queryClient, snap),
    onSuccess: ({ suggestion: saved, profile }, suggestion) => {
      setSuggestions(queryClient, decide(suggestion.id, saved));
      setProfiles(queryClient, (items) =>
        suggestion.kind === 'create' && !items.some((p) => p.id === profile.id) ? [...items, profile] : replaceProfile(profile)(items),
      );
    },
  });
}

/**
 * TODO(temporary): demo control for POST /contacts/test-adding-suggestions. Remove when AI/Granola
 * suggestion generation is integrated. Creates a new-contact suggestion for the demo person after the one
 * currently shown (read from the fetched suggestions), then re-reads the list.
 */
export function useAddTestSuggestion() {
  const api = useApi();
  const queryClient = useQueryClient();
  const addTest = api.profileSuggestions.addTest?.bind(api.profileSuggestions);
  const mutation = useMutation({
    mutationFn: () => {
      const all = queryClient.getQueryData<SuggestionList>(queryKeys.profileSuggestions.list())?.items ?? [];
      const shown = currentSuggestions(all).find((s) => s.kind === 'create');
      return addTest!(nextDemoSuggestion(shown?.changes.find((c) => c.field === 'full_name')?.to ?? undefined));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profileSuggestions.list() }),
  });
  return { ...mutation, available: Boolean(addTest) };
}

/** POST /profile-suggestions/{id}/reject — drops the suggestion; the profile is never touched. */
export function useRejectSuggestion() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggestion: ProfileUpdateSuggestion) => api.profileSuggestions.reject(suggestion.id),
    onMutate: async (suggestion) => {
      const snap = await snapshot(queryClient);
      setSuggestions(queryClient, decide(suggestion.id, 'rejected'));
      return snap;
    },
    onError: (_error, _suggestion, snap) => restore(queryClient, snap),
    onSuccess: (saved, suggestion) => setSuggestions(queryClient, decide(suggestion.id, saved)),
  });
}

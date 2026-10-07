import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';

export function useProjects() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.projects.list(), queryFn: () => api.projects.list() });
}

export function useProject(id: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.projects.detail(id), queryFn: () => api.projects.get(id) });
}

export function useSaveInstructions(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (instructions: string) => api.projects.saveInstructions(id, instructions),
    onSuccess: (project) => queryClient.setQueryData(queryKeys.projects.detail(id), project),
  });
}

/** Puts a conversation in a project: the project (and the list's chat count) show it at once. */
export function useLinkChat() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, chat }: { projectId: string; chat: { id: string; title: string } }) => api.projects.linkChat(projectId, chat),
    onSuccess: (project) => {
      queryClient.setQueryData(queryKeys.projects.detail(project.id), project);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
    },
  });
}

/** Adds a member to the project's (demo) member list. */
export function useAddMember(projectId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api.projects.addMember(projectId, { email, role: 'member' }),
    onSuccess: (project) => queryClient.setQueryData(queryKeys.projects.detail(projectId), project),
  });
}

/** Removes a member from the project's (demo) member list. */
export function useRemoveMember(projectId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.projects.removeMember(projectId, memberId),
    onSuccess: (project) => queryClient.setQueryData(queryKeys.projects.detail(projectId), project),
  });
}

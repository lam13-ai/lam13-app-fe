import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useApi, type ProjectsService } from '@/api';
import type { Project } from '@/types/api';

export function useProjects() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.projects.list(), queryFn: () => api.projects.list() });
}

export function useProject(id: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.projects.detail(id), queryFn: () => api.projects.get(id) });
}

/** The user's own contacts (My Contacts), for linking one to a project. */
export function useOwnContacts(enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.profiles.list(), queryFn: () => api.profiles.list({ limit: 200 }), select: (page) => page.items, enabled });
}

/**
 * Any change to one project (a member, a contact, a folder, a file, a chat…): every `ProjectsService` change
 * resolves with the project as it is afterwards, which becomes the page's data. Usage:
 * `action.mutate((projects) => projects.createFolder(id, name))`.
 */
export function useProjectAction(projectId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: (projects: ProjectsService) => Promise<Project>) => change(api.projects),
    onSuccess: (project) => {
      queryClient.setQueryData(queryKeys.projects.detail(projectId), project);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
    },
  });
}

export function useCreateProject() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; summary?: string }) => api.projects.create(body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() }),
  });
}

export function useDeleteProject() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.remove(id),
    onSuccess: (_void, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.projects.detail(id), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
    },
  });
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

/** Adds a member to the project by email. */
export function useAddMember(projectId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api.projects.addMember(projectId, { email, role: 'member' }),
    onSuccess: (project) => queryClient.setQueryData(queryKeys.projects.detail(projectId), project),
  });
}

/** Removes a member from the project. */
export function useRemoveMember(projectId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.projects.removeMember(projectId, memberId),
    onSuccess: (project) => queryClient.setQueryData(queryKeys.projects.detail(projectId), project),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';
import type { IntegrationConnection, IntegrationProvider } from '@/types/api';

/** What each provider is called on the page. */
export const PROVIDER_NAMES: Record<IntegrationProvider, string> = {
  gmail: 'Gmail',
  google_calendar: 'Google Calendar',
  google_drive: 'Google Drive',
  google_meet: 'Google Meet',
  outlook: 'Outlook',
  microsoft_calendar: 'Outlook Calendar',
  onedrive: 'OneDrive',
  sharepoint: 'SharePoint',
  teams: 'Microsoft Teams',
  zoom: 'Zoom',
  webex: 'Webex',
};

/** Every provider with the user's real connection state (one request, shared by every row that shows one). */
export function useIntegrations() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.integrations.list(), queryFn: () => api.integrations.list() });
}

/** Starts the provider's sign-in: over HTTP the browser leaves for it, and comes back to the callback page. */
export function useConnectProvider() {
  const api = useApi();
  return useMutation({ mutationFn: (provider: IntegrationProvider) => api.integrations.connect(provider) });
}

const store = (queryClient: ReturnType<typeof useQueryClient>) => (connection: IntegrationConnection) => {
  queryClient.setQueryData<IntegrationConnection[]>(queryKeys.integrations.list(), (list) =>
    list?.map((c) => (c.provider === connection.provider ? connection : c)),
  );
};

export function useDisconnectProvider() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (provider: IntegrationProvider) => api.integrations.disconnect(provider), onSuccess: store(queryClient) });
}

/** The /integrations/{provider}/callback page finishing the provider's sign-in. */
export function useFinishSignIn() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, code, state }: { provider: IntegrationProvider; code: string; state: string }) => api.integrations.finishSignIn(provider, code, state),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.list() }),
  });
}

/** Adds the connected account's contacts to My Contacts; the contact list reloads with them. */
export function useImportContacts() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: 'gmail' | 'outlook') => api.integrations.importContacts(provider),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all }),
    // A refused import usually means the account must be connected again: show its real state.
    onError: () => void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.list() }),
  });
}

/** The saved custom MCP server, and saving / removing it. */
export function useMcpServer() {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.integrations.mcpServer();
  return {
    server: useQuery({ queryKey: key, queryFn: () => api.integrations.mcpServer() }),
    save: useMutation({
      mutationFn: (body: { name: string; url: string; api_key?: string }) => api.integrations.saveMcpServer(body),
      onSuccess: (server) => queryClient.setQueryData(key, server),
    }),
    remove: useMutation({ mutationFn: () => api.integrations.removeMcpServer(), onSuccess: () => queryClient.setQueryData(key, null) }),
  };
}

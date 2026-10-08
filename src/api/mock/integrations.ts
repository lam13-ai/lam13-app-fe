import type { IntegrationConnection, IntegrationProvider, McpServer } from '@/types/api';
import { ApiError } from '../errors';
import type { IntegrationsService } from '../services';

const PROVIDERS: IntegrationProvider[] = [
  'gmail',
  'google_calendar',
  'google_drive',
  'google_meet',
  'outlook',
  'microsoft_calendar',
  'onedrive',
  'sharepoint',
  'teams',
  'zoom',
  'webex',
];

/**
 * The sample backend's account connections: like a server without any provider credentials. Every provider
 * is disconnected and not configured, and connecting one is refused exactly as the backend refuses it —
 * nothing here ever pretends an account was linked. The custom MCP server is kept in memory.
 */
export function createMockIntegrations({ respond = () => Promise.resolve() }: { respond?: () => Promise<void> } = {}): IntegrationsService {
  let server: (McpServer & { api_key: string }) | null = null;
  const view = (provider: IntegrationProvider): IntegrationConnection => ({ provider, status: 'disconnected', configured: false, account: null, last_synced_at: null });
  const notSetUp = () => new ApiError(503, 'unavailable', 'This integration is not set up on the server yet.');
  const saved = (): McpServer | null => (server ? { name: server.name, url: server.url, has_api_key: server.has_api_key } : null);
  return {
    async list() {
      await respond();
      return PROVIDERS.map(view);
    },
    async connect() {
      await respond();
      throw notSetUp();
    },
    async finishSignIn() {
      await respond();
      throw notSetUp();
    },
    async disconnect(provider) {
      await respond();
      return view(provider);
    },
    async importContacts() {
      await respond();
      throw new ApiError(409, 'conflict', 'This account needs to be connected again.');
    },
    async mcpServer() {
      await respond();
      return saved();
    },
    async saveMcpServer({ name, url, api_key }) {
      await respond();
      const key = api_key ?? server?.api_key ?? '';
      server = { name, url, api_key: key, has_api_key: key !== '' };
      return saved()!;
    },
    async removeMcpServer() {
      await respond();
      server = null;
    },
  };
}

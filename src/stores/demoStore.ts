import { create } from 'zustand';

export type NoteTaker = 'granola' | 'otter' | 'fireflies' | 'custom';

export const MAIL_PROVIDERS = ['gmail', 'outlook'] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];
/** A mail account "connected" for the contacts-import demo: the address the user typed, and whether the demo import ran. */
export interface MailConnection {
  email: string;
  imported: boolean;
}

/** A custom MCP server / note taker the user described. The API key is never kept: only whether one was given. */
export interface CustomServer {
  name: string;
  url: string;
  hasKey: boolean;
}

/**
 * Frontend-only demo state (session memory, never persisted, nothing sent anywhere): which sample
 * integrations show as connected, the custom server, and the calendar's note taker.
 * TODO(backend): replace with real connection state when these integrations exist.
 */
interface DemoState {
  connected: Record<string, boolean>;
  customServer: CustomServer | null;
  noteTaker: NoteTaker;
  /** The calendar's custom note taker: connected only once the user has given its webhook URL. */
  customNoteTaker: { url: string } | null;
  /** Contacts import (demo): each provider is connected independently, or null. */
  mail: Record<MailProvider, MailConnection | null>;
  setConnected: (id: string, connected: boolean) => void;
  setCustomServer: (server: CustomServer | null) => void;
  setNoteTaker: (noteTaker: NoteTaker) => void;
  setCustomNoteTaker: (custom: { url: string } | null) => void;
  connectMail: (provider: MailProvider, email: string) => void;
  disconnectMail: (provider: MailProvider) => void;
  markMailImported: (provider: MailProvider) => void;
}

export const useDemoStore = create<DemoState>()((set) => ({
  connected: {},
  customServer: null,
  noteTaker: 'granola',
  customNoteTaker: null,
  mail: { gmail: null, outlook: null },
  setConnected: (id, connected) => set((s) => ({ connected: { ...s.connected, [id]: connected } })),
  setCustomServer: (customServer) => set({ customServer }),
  setNoteTaker: (noteTaker) => set({ noteTaker }),
  // Connecting makes it the calendar's note taker; disconnecting falls back to the default one.
  setCustomNoteTaker: (customNoteTaker) => set({ customNoteTaker, noteTaker: customNoteTaker ? 'custom' : 'granola' }),
  connectMail: (provider, email) => set((s) => ({ mail: { ...s.mail, [provider]: { email, imported: false } } })),
  // Disconnecting also drops that provider's demo contacts (they hang off `imported`).
  disconnectMail: (provider) => set((s) => ({ mail: { ...s.mail, [provider]: null } })),
  markMailImported: (provider) => set((s) => (s.mail[provider] ? { mail: { ...s.mail, [provider]: { ...s.mail[provider], imported: true } } } : s)),
}));

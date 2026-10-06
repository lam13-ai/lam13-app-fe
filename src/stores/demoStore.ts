import { create } from 'zustand';

export type NoteTaker = 'granola' | 'otter' | 'fireflies' | 'custom';

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
  setConnected: (id: string, connected: boolean) => void;
  setCustomServer: (server: CustomServer | null) => void;
  setNoteTaker: (noteTaker: NoteTaker) => void;
}

export const useDemoStore = create<DemoState>()((set) => ({
  connected: {},
  customServer: null,
  noteTaker: 'granola',
  setConnected: (id, connected) => set((s) => ({ connected: { ...s.connected, [id]: connected } })),
  setCustomServer: (customServer) => set({ customServer }),
  setNoteTaker: (noteTaker) => set({ noteTaker }),
}));

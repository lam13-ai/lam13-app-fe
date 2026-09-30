import { create } from 'zustand';
export const useRtcStreamStore = create<{ sessions: Record<string, boolean>; set: (id: string, value: boolean) => void }>((set) => ({
  sessions: {},
  set: (id, value) => set((state) => ({ sessions: { ...state.sessions, [id]: value } })),
}));

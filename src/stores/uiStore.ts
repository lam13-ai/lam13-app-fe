import { create } from 'zustand';
import type { Effort } from '@/types/api';

interface UiState {
  /** Mobile off-canvas sidebar. */
  sidebarOpen: boolean;
  /** Desktop sidebar collapsed to the icon rail. */
  sidebarCollapsed: boolean;
  model: string;
  effort: Effort;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setModel: (model: string) => void;
  setEffort: (effort: Effort) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: false,
  sidebarCollapsed: false,
  model: 'lam13',
  effort: 'medium',
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setModel: (model) => set({ model }),
  setEffort: (effort) => set({ effort }),
}));

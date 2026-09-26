import { create } from 'zustand';
import type { Effort } from '@/types/api';

interface UiState {
  /** Mobile off-canvas sidebar. */
  sidebarOpen: boolean;
  /** Desktop sidebar collapsed to the icon rail. */
  sidebarCollapsed: boolean;
  model: string;
  effort: Effort;
  /**
   * Desktop width of the contact sheet (px), kept for the session; never persisted. `Infinity` while
   * expanded: the drawer clamps it to its maximum (960px / 75% of the window) on every render.
   */
  contactSheetWidth: number;
  /** The width to return to from Expand; null when not expanded. */
  contactSheetRestoreWidth: number | null;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setModel: (model: string) => void;
  setEffort: (effort: Effort) => void;
  /** A manual resize: it also leaves the expanded state (the new width is what Restore would return to). */
  setContactSheetWidth: (width: number) => void;
  /** Expand to the maximum width, or restore the exact width from before expanding. */
  toggleContactSheetExpanded: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  sidebarOpen: false,
  sidebarCollapsed: false,
  model: 'lam13',
  effort: 'medium',
  contactSheetWidth: 480,
  contactSheetRestoreWidth: null,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setModel: (model) => set({ model }),
  setEffort: (effort) => set({ effort }),
  setContactSheetWidth: (contactSheetWidth) => set({ contactSheetWidth, contactSheetRestoreWidth: null }),
  toggleContactSheetExpanded: () =>
    set((s) =>
      s.contactSheetRestoreWidth === null
        ? { contactSheetRestoreWidth: s.contactSheetWidth, contactSheetWidth: Number.POSITIVE_INFINITY }
        : { contactSheetWidth: s.contactSheetRestoreWidth, contactSheetRestoreWidth: null },
    ),
}));

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ComposerState {
  /** Unsent draft text keyed by conversation id ('new' for a fresh chat). */
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
  clearDraft: (key: string) => void;
}

export const useComposerStore = create<ComposerState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (key, text) => set((s) => ({ drafts: { ...s.drafts, [key]: text } })),
      clearDraft: (key) =>
        set((s) => {
          const drafts = { ...s.drafts };
          delete drafts[key];
          return { drafts };
        }),
    }),
    { name: 'lam13:composer-drafts', storage: createJSONStorage(() => sessionStorage) },
  ),
);

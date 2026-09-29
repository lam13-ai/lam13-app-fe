import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** A meeting added to the next message as context (shown as a chip in the composer). */
export interface MeetingContext {
  id: string;
  title: string;
}

interface ComposerState {
  /** Unsent draft text keyed by conversation id ('new' for a fresh chat). */
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
  clearDraft: (key: string) => void;
  /** Meeting context for the next message, keyed like `drafts`. */
  meetings: Record<string, MeetingContext>;
  setMeeting: (key: string, meeting: MeetingContext) => void;
  clearMeeting: (key: string) => void;
}

const without = <T>(record: Record<string, T>, key: string) => {
  const next = { ...record };
  delete next[key];
  return next;
};

export const useComposerStore = create<ComposerState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (key, text) => set((s) => ({ drafts: { ...s.drafts, [key]: text } })),
      clearDraft: (key) => set((s) => ({ drafts: without(s.drafts, key) })),
      meetings: {},
      setMeeting: (key, meeting) => set((s) => ({ meetings: { ...s.meetings, [key]: meeting } })),
      clearMeeting: (key) => set((s) => ({ meetings: without(s.meetings, key) })),
    }),
    { name: 'lam13:composer-drafts', storage: createJSONStorage(() => sessionStorage) },
  ),
);

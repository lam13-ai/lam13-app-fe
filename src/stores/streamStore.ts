import { create } from 'zustand';
import type { ErrorInfo } from '@/types/api';

/** sending → (transcribing) → thinking → preparing → generating → answering; `solving` when a server reports it. */
export type StreamPhase = 'sending' | 'transcribing' | 'thinking' | 'preparing' | 'generating' | 'solving' | 'answering';

export interface ActiveStream {
  phase: StreamPhase;
  controller: AbortController;
  /** Stable key of the assistant message being generated. */
  assistantKey: string;
}

interface StreamState {
  /** In-flight streams by conversation key (conversation id, or 'new'). */
  active: Record<string, ActiveStream>;
  /** Failure details by message key (failed sends and interrupted/errored answers). */
  failures: Record<string, ErrorInfo>;
  /** Set when a lazily-created conversation gets its id, so the new-chat view can navigate. */
  created: { id: string; origin: string } | null;

  begin: (key: string, stream: ActiveStream) => void;
  setPhase: (key: string, phase: StreamPhase) => void;
  rekey: (from: string, to: string) => void;
  end: (key: string) => void;
  setFailure: (messageKey: string, info: ErrorInfo | null) => void;
  setCreated: (created: { id: string; origin: string } | null) => void;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export const initialStreamState = { active: {}, failures: {}, created: null };

/** Ephemeral streaming state. Message content itself lives in the TanStack Query cache. */
export const useStreamStore = create<StreamState>()((set) => ({
  ...initialStreamState,
  begin: (key, stream) => set((s) => ({ active: { ...s.active, [key]: stream } })),
  setPhase: (key, phase) =>
    set((s) => {
      const current = s.active[key];
      if (!current || current.phase === phase) return s;
      return { active: { ...s.active, [key]: { ...current, phase } } };
    }),
  rekey: (from, to) =>
    set((s) => {
      const current = s.active[from];
      if (!current) return s;
      return { active: { ...without(s.active, from), [to]: current } };
    }),
  end: (key) => set((s) => ({ active: without(s.active, key) })),
  setFailure: (messageKey, info) =>
    set((s) => ({ failures: info ? { ...s.failures, [messageKey]: info } : without(s.failures, messageKey) })),
  setCreated: (created) => set({ created }),
}));

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { PresentationResult } from '@/api';
import { createId } from '@/lib/id';
import { displayFileName, GENERIC_ERROR, type GenerationState } from './generation';

/**
 * Image → PPT runs started from the chat composer, per conversation.
 *
 * The run logic is the Kothar frontend's `ImageUploader` (one AbortController per run, retry with the same
 * images, a late answer from an aborted run is ignored); here it lives in a store instead of a page, so a run
 * keeps going — and its result stays — while the user moves between conversations.
 *
 * The chat backend knows nothing about these runs: a finished deck is remembered in this browser only
 * (localStorage), under its conversation's id. A run still in progress is not resumed after a reload.
 */

type RunState = Exclude<GenerationState, { status: 'idle' }>;

export interface PresentationRun {
  id: string;
  /** What the user typed with the images. Shown with them; the generation service takes images only. */
  text: string;
  /** `url` is a local preview for this page load; null for a run restored from storage. */
  images: { name: string; url: string | null }[];
  generation: RunState;
  /** Under a saved conversation's id (kept across reloads once finished), not an unsaved new chat's key. */
  saved: boolean;
}

type Generate = (files: File[], options?: { signal?: AbortSignal }) => Promise<PresentationResult>;

interface RunsState {
  /** Runs by conversation key, oldest first. */
  runs: Record<string, PresentationRun[]>;
}

export const usePresentationRunsStore = create<RunsState>()(
  persist((): RunsState => ({ runs: {} }), {
    name: 'lam13:presentation-runs',
    storage: createJSONStorage(() => localStorage),
    // Only finished decks of saved conversations, and no local preview URLs (they die with the page).
    partialize: (state) => ({
      runs: Object.fromEntries(
        Object.entries(state.runs)
          .map(([key, runs]) => [key, runs.filter((r) => r.saved && r.generation.status === 'success').map((r) => ({ ...r, images: r.images.map((i) => ({ name: i.name, url: null })) }))] as const)
          .filter(([, runs]) => runs.length > 0),
      ),
    }),
  }),
);

/** What only this page load has: the files (for a retry) and the controller of a run in flight. */
const live = new Map<string, { files: File[]; controller: AbortController | null }>();

const setRuns = (key: string, change: (runs: PresentationRun[]) => PresentationRun[]) =>
  usePresentationRunsStore.setState((s) => {
    const next = change(s.runs[key] ?? []);
    const runs = { ...s.runs };
    if (next.length) runs[key] = next;
    else delete runs[key];
    return { runs };
  });

const patch = (key: string, id: string, generation: RunState) => setRuns(key, (runs) => runs.map((r) => (r.id === id ? { ...r, generation } : r)));

/** The key a run is filed under now (it moves when an unsaved chat becomes a conversation). */
const keyOf = (id: string) => Object.entries(usePresentationRunsStore.getState().runs).find(([, runs]) => runs.some((r) => r.id === id))?.[0];

function execute(id: string, generate: Generate) {
  const entry = live.get(id);
  const key = keyOf(id);
  if (!entry || !key) return;
  const controller = new AbortController();
  entry.controller = controller;
  const startedAt = Date.now();
  patch(key, id, { status: 'processing', startedAt });

  const settle = (next: RunState) => {
    if (controller.signal.aborted) return; // cancelled: a late answer cannot settle anything
    entry.controller = null;
    const current = keyOf(id);
    if (current) patch(current, id, next);
  };
  generate(entry.files, { signal: controller.signal })
    // the backend's name wins; otherwise the deck is labelled for display
    .then((result) => settle({ status: 'success', startedAt, result: { ...result, fileName: displayFileName(result.fileName) } }))
    // every failure category reaches the user as the same calm message
    .catch(() => settle({ status: 'error', startedAt, message: GENERIC_ERROR }));
}

/** Starts one run for these (already validated) images. Returns nothing: the store is what the page reads. */
export function startRun(key: string, files: File[], text: string, generate: Generate, saved: boolean): void {
  const id = createId();
  live.set(id, { files, controller: null });
  const images = files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
  setRuns(key, (runs) => [...runs, { id, text, images, generation: { status: 'processing', startedAt: Date.now() }, saved }]);
  execute(id, generate);
}

/** "Try again": the same images, in place. Only while this page load still holds them. */
export function retryRun(id: string, generate: Generate): void {
  if (live.get(id)?.controller) return; // already running
  execute(id, generate);
}

export const canRetry = (id: string) => live.has(id);

/**
 * Stops a run in progress and takes it out of the conversation. Returns its images and text so the composer
 * can have them back (as the original keeps the selection when a run is cancelled).
 */
export function cancelRun(id: string): { files: File[]; text: string } | null {
  const entry = live.get(id);
  const key = keyOf(id);
  const run = key ? usePresentationRunsStore.getState().runs[key]?.find((r) => r.id === id) : undefined;
  if (!entry || !key || !run) return null;
  entry.controller?.abort();
  live.delete(id);
  run.images.forEach((i) => i.url && URL.revokeObjectURL(i.url));
  setRuns(key, (runs) => runs.filter((r) => r.id !== id));
  return { files: entry.files, text: run.text };
}

/** An unsaved chat became a conversation: its runs follow it to the conversation's id (and are kept from then on). */
export function moveRuns(from: string, to: string): void {
  const moving = usePresentationRunsStore.getState().runs[from];
  if (!moving?.length || from === to) return;
  usePresentationRunsStore.setState((s) => {
    const runs = { ...s.runs, [to]: [...(s.runs[to] ?? []), ...moving.map((r) => ({ ...r, saved: true }))] };
    delete runs[from];
    return { runs };
  });
}

const NONE: PresentationRun[] = [];
/** The runs of one conversation, oldest first. */
export const usePresentationRuns = (key: string) => usePresentationRunsStore((s) => s.runs[key] ?? NONE);

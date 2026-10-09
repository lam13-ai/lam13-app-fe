import type { PresentationResult } from '@/api';

/**
 * Generation state and the elapsed-time status timeline (ported from the Kothar frontend's `generation.ts`
 * and the two display helpers of its `history.ts`). Backend communication lives in `src/api/presentation.ts` —
 * nothing here knows how a presentation is produced.
 */

export type GenerationState =
  | { status: 'idle' }
  | { status: 'processing'; startedAt: number }
  | { status: 'success'; startedAt: number; result: PresentationResult }
  | { status: 'error'; startedAt: number; message: string };

/** The only failure text a user ever sees — exceptions never reach the UI. */
export const GENERIC_ERROR = "We couldn't finish your presentation this time.";

/**
 * Status copy revealed by elapsed time only — never by assumed backend progress. A real response that
 * arrives early simply ends the run mid-sequence.
 */
export const STATUS_STEPS: { after: number; text: string }[] = [
  { after: 0, text: "We've received your images and started preparing the presentation." },
  { after: 12_000, text: "We're reviewing the submitted visuals and identifying the key themes." },
  { after: 27_000, text: "We're organizing the source material into a clear presentation structure." },
  { after: 43_000, text: "We're shaping the storyline and deciding how the content should flow." },
  { after: 60_000, text: "We're building the slide sequence and grouping related insights." },
  { after: 78_000, text: "We're refining the presentation hierarchy and key messages." },
  { after: 98_000, text: "We're arranging the visual content across the deck." },
  { after: 120_000, text: "We're polishing slide layouts and improving consistency." },
  { after: 143_000, text: "We're reviewing spacing, alignment, and presentation flow." },
  { after: 168_000, text: "We're applying final presentation refinements." },
  { after: 195_000, text: "We're preparing the PowerPoint file." },
  { after: 225_000, text: "We're finalizing your presentation." },
  // one calm line for a run that outlasts the sequence — never repeated
  { after: 255_000, text: "Still working on your presentation — we're completing the final processing." },
];

/** Every message due at `elapsed` ms, oldest first. */
export const statusesAt = (elapsed: number) => STATUS_STEPS.filter((s) => elapsed >= s.after).map((s) => s.text);

export const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Display name for a deck. The backend's filename wins; otherwise this is a label (and download hint) only —
 * the URL itself is never touched.
 */
export function displayFileName(fileName: string | undefined, when = new Date()): string {
  if (fileName && fileName.trim()) return fileName;
  const date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  return `Strategic-Presentation-${date}-${pad(when.getHours())}${pad(when.getMinutes())}.pptx`;
}

/** "Today, 18:42" / "Yesterday, 16:20" / "3 Sep 2026, 16:20". */
export function formatWhen(timestamp: number, now = new Date()): string {
  const then = new Date(timestamp);
  const time = `${pad(then.getHours())}:${pad(then.getMinutes())}`;
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(then, now)) return `Today, ${time}`;
  if (sameDay(then, yesterday)) return `Yesterday, ${time}`;
  return `${then.getDate()} ${then.toLocaleString('en', { month: 'short' })} ${then.getFullYear()}, ${time}`;
}

/**
 * MOCK ONLY — stands in for a real speech-to-text provider. There is no audio analysis:
 * a transcript is picked deterministically from the recording length so local development
 * shows a realistic voice → transcript → answer flow.
 */
const SAMPLE_TRANSCRIPTS = [
  'Draft KPIs for our digital services programme.',
  'Stress-test the delivery risks in our national AI strategy.',
  'Outline a board-ready slide narrative for the health reform.',
  'What should the first 24 months of public sector AI adoption look like?',
  'Summarise the main risks in our five-year growth plan.',
];

export function mockTranscribe(durationMs: number, sequence: number): string {
  const index = (Math.floor(durationMs / 1000) + sequence) % SAMPLE_TRANSCRIPTS.length;
  return SAMPLE_TRANSCRIPTS[index] ?? SAMPLE_TRANSCRIPTS[0]!;
}

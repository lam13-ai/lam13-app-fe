/**
 * Preferred recording formats, best first: Opus in WebM (Chromium, Firefox), AAC in MP4 (Safari),
 * Opus in Ogg (older Firefox). All are accepted by the audio upload endpoint.
 */
export const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

/**
 * First supported candidate, or '' to let the browser pick its default.
 * `isTypeSupported` is injected so the choice is testable without a browser.
 */
export function pickAudioMimeType(isTypeSupported: ((type: string) => boolean) | undefined): string {
  if (!isTypeSupported) return '';
  return AUDIO_MIME_CANDIDATES.find((type) => {
    try {
      return isTypeSupported(type);
    } catch {
      return false;
    }
  }) ?? '';
}

/** Container type without codec parameters ("audio/webm;codecs=opus" → "audio/webm"). */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim() || 'audio/webm';
}

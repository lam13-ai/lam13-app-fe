/**
 * Turns a paste event into ordinary `File`s so pasted screenshots enter the exact pipeline a picked or
 * dropped file does (ported unchanged from the Kothar frontend's `clipboard.ts`). Nothing is validated here —
 * format, duplicate and five-image rules stay in `validateSelection`, so an unsupported pasted image is
 * rejected with the same notice as any other.
 */

type ClipboardItemLike = { kind: string; type: string; getAsFile(): File | null };
type ClipboardDataLike = {
  items?: ArrayLike<ClipboardItemLike> | null;
  files?: ArrayLike<File> | null;
};
export type PasteEventLike = { clipboardData: ClipboardDataLike | null };

/** A paste is only ever handled once, however many listeners see it. */
const handled = new WeakSet<object>();

/** `image/jpg` is non-standard but seen in the wild; it is still JPEG. */
const normaliseType = (type: string) => (type === 'image/jpg' ? 'image/jpeg' : type);

const extensionFor = (type: string) => {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  // keep the real subtype so a rejection names what was pasted (e.g. .gif)
  return type.split('/')[1]?.split('+')[0] || 'img';
};

/**
 * Returns the image files carried by a paste, named `pasted-image.png`, `pasted-image-2.png`, … via
 * `nextIndex`. Text-only pastes yield nothing, so the caller can leave them to the browser untouched.
 */
export function imagesFromPaste(event: PasteEventLike, nextIndex: () => number, now = Date.now()): File[] {
  if (handled.has(event)) return [];
  handled.add(event);

  const data = event.clipboardData;
  if (!data) return [];

  const blobs: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) blobs.push(file);
  }
  // some browsers expose pasted files only through `files`
  if (!blobs.length) {
    for (const file of Array.from(data.files ?? [])) {
      if (file.type.startsWith('image/')) blobs.push(file);
    }
  }

  return blobs.map((blob) => {
    const type = normaliseType(blob.type);
    const index = nextIndex();
    const name = `pasted-image${index > 1 ? `-${index}` : ''}.${extensionFor(type)}`;
    return new File([blob], name, { type, lastModified: now });
  });
}

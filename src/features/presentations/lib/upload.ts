/**
 * Single source of truth for the Image → PPT upload contract (ported from the Kothar frontend's `upload.ts`;
 * only the limit differs). When the service changes its formats or limits, change them here only.
 */
/** The generation service takes at most three images per deck ("at most 3 images per deck" is its own refusal). */
export const MAX_IMAGES = 3;
export const ACCEPTED_MIME = ['image/jpeg', 'image/png'];
export const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
/** Value for <input type="file" accept="…"> */
export const ACCEPT_ATTR = [...ACCEPTED_MIME, ...ACCEPTED_EXTENSIONS].join(',');
/** Human-facing format list — never show MIME strings in the UI. */
export const FORMAT_LABEL = 'JPG, JPEG or PNG';

export type Notice = { tone: 'danger' | 'warning'; text: string };

export type FileLike = Pick<File, 'name' | 'size' | 'lastModified' | 'type'>;

/** Cheap duplicate identity — no hashing. */
export const fileKey = (f: FileLike) => `${f.name}:${f.size}:${f.lastModified}`;

const isSupported = (f: FileLike) => {
  if (ACCEPTED_MIME.includes(f.type)) return true;
  // Some browsers/OSes report an empty type; fall back to the extension.
  return !f.type && ACCEPTED_EXTENSIONS.some((e) => f.name.toLowerCase().endsWith(e));
};

const nameList = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', '));

/**
 * Decides which incoming files join the selection. Existing valid files are never dropped — anything that
 * cannot be accepted is reported instead. Nothing is converted: an unsupported file is simply not taken.
 */
export function validateSelection<T extends FileLike>(existing: T[], incoming: T[]) {
  const seen = new Set(existing.map(fileKey));
  const accepted: T[] = [];
  const unsupported: string[] = [];
  let duplicates = 0;
  let overflow = 0;

  for (const file of incoming) {
    if (!isSupported(file)) {
      unsupported.push(file.name);
      continue;
    }
    const key = fileKey(file);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    if (existing.length + accepted.length >= MAX_IMAGES) {
      overflow++;
      continue;
    }
    seen.add(key);
    accepted.push(file);
  }

  const notices: Notice[] = [];
  if (unsupported.length)
    notices.push({
      tone: 'danger',
      text: `Unsupported file type. Please upload JPG, JPEG, or PNG images only. Skipped ${nameList(unsupported)}.`,
    });
  if (duplicates) notices.push({ tone: 'warning', text: duplicates === 1 ? 'That image is already selected.' : 'Those images are already selected.' });
  if (overflow) notices.push({ tone: 'warning', text: `You can upload a maximum of ${MAX_IMAGES} images at a time.` });

  return { accepted, notices };
}

import { ATTACHMENT_LIMITS } from '@/api';

export interface RejectedFile {
  name: string;
  reason: string;
}

/**
 * Client-side check of picked files against ATTACHMENT_LIMITS, for fast feedback only; the server
 * is the validation boundary. Files beyond the remaining slots are rejected, keeping selection order.
 */
export function validateImageFiles(files: readonly File[], alreadyAttached = 0): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  const mimeTypes: readonly string[] = ATTACHMENT_LIMITS.mimeTypes;
  for (const file of files) {
    if (!mimeTypes.includes(file.type)) {
      rejected.push({ name: file.name, reason: 'Only PDF, PNG, JPEG, WebP and GIF files can be attached.' });
    } else if (file.size > ATTACHMENT_LIMITS.maxBytes) {
      rejected.push({ name: file.name, reason: `Files can be up to ${ATTACHMENT_LIMITS.maxBytes / (1024 * 1024)} MB.` });
    } else if (alreadyAttached + accepted.length >= ATTACHMENT_LIMITS.maxFiles) {
      rejected.push({ name: file.name, reason: `You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files.` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

const PASTED_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

/**
 * The files on a paste — a screenshot, a copied image, files copied in Explorer / Finder — or none for
 * plain text (and in browsers that don't expose clipboard files). Files are used as they are; one without
 * a name gets `pasted-image.<ext>` / `pasted-file.<ext>` with its type, size and bytes unchanged.
 */
export function clipboardFiles(data: Pick<DataTransfer, 'files' | 'items'> | null): File[] {
  if (!data) return [];
  const files = data.files?.length
    ? Array.from(data.files)
    : Array.from(data.items ?? []).flatMap((item) => {
        const file = item.kind === 'file' ? item.getAsFile() : null;
        return file ? [file] : [];
      });
  return files.map((file) => {
    if (file.name) return file;
    const base = file.type.startsWith('image/') ? 'pasted-image' : 'pasted-file';
    const ext = PASTED_EXTENSIONS[file.type] ?? (file.type.split('/')[1] || 'bin');
    return new File([file], `${base}.${ext}`, { type: file.type, lastModified: file.lastModified });
  });
}

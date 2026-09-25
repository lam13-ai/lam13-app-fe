import { ATTACHMENT_LIMITS } from '@/api';

export interface RejectedFile {
  name: string;
  reason: string;
}

/**
 * Client-side check of picked images against ATTACHMENT_LIMITS, for fast feedback only; the server
 * is the validation boundary. Files beyond the remaining slots are rejected, keeping selection order.
 */
export function validateImageFiles(files: readonly File[], alreadyAttached = 0): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  const mimeTypes: readonly string[] = ATTACHMENT_LIMITS.mimeTypes;
  for (const file of files) {
    if (!mimeTypes.includes(file.type)) {
      rejected.push({ name: file.name, reason: 'Only PNG, JPEG, WebP and GIF images can be attached.' });
    } else if (file.size > ATTACHMENT_LIMITS.maxBytes) {
      rejected.push({ name: file.name, reason: `Images can be up to ${ATTACHMENT_LIMITS.maxBytes / (1024 * 1024)} MB.` });
    } else if (alreadyAttached + accepted.length >= ATTACHMENT_LIMITS.maxFiles) {
      rejected.push({ name: file.name, reason: `You can attach up to ${ATTACHMENT_LIMITS.maxFiles} images.` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

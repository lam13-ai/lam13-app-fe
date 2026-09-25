/**
 * Attachment limits, shared by client-side validation and the mock. Types match the backend's
 * `/chat/upload` (PDF + images); the backend enforces its own limits — the client checks only for fast feedback.
 */
export const ATTACHMENT_LIMITS = {
  maxFiles: 6,
  maxBytes: 25 * 1024 * 1024,
  mimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'],
} as const;

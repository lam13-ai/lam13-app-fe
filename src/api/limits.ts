/**
 * Image attachment limits (api-contract.md §4.7), shared by client-side validation and the mock.
 * The real backend enforces its own limits; the client checks only for fast feedback. [CONFIRM]
 */
export const ATTACHMENT_LIMITS = {
  maxFiles: 6,
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
} as const;

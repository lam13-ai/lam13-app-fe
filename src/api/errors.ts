import type { ApiErrorBody, ErrorInfo } from '@/types/api';

/** Typed error for any non-2xx API response (api-contract.md §2). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { details?: Record<string, unknown>; requestId?: string } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = extra.details;
    this.requestId = extra.requestId;
  }

  static fromBody(status: number, body: ApiErrorBody): ApiError {
    const { code, message, details, request_id } = body.error;
    return new ApiError(status, code, message, { details, requestId: request_id });
  }

  /** Network failures (status 0), rate limits and server errors are worth retrying. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

export function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/** Normalises anything thrown by the API layer into a displayable summary. */
export function toErrorInfo(error: unknown): ErrorInfo {
  if (isApiError(error)) return { code: error.code, message: error.message, retryable: error.retryable };
  return {
    code: 'network_error',
    message: 'Connection lost. Check your network and try again.',
    retryable: true,
  };
}

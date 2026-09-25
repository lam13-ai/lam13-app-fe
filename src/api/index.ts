import { createMockAdapter } from './mock/mockAdapter';
import type { ApiAdapter } from './services';

export { ApiProvider, useApi } from './context';
export { authorizationHeaders, getAccessToken, setAccessTokenGetter, type AccessTokenGetter } from './auth';
export { ApiError, abortError, isAbortError, isApiError, isNotFound, toErrorInfo } from './errors';
export { queryKeys } from './queryKeys';
export { ATTACHMENT_LIMITS } from './limits';
export type {
  ApiAdapter,
  ArtifactsService,
  AttachmentsService,
  AttachmentUploadInput,
  AudioService,
  AudioUploadInput,
  ConversationsService,
  ListParams,
  MessageListParams,
  MessagesService,
  ModelsService,
  SendMessageBody,
  StreamOptions,
} from './services';
export { readEventStream, type EventStream, type StreamEvent, type StreamEventName } from './stream';
export { createMockAdapter, INSTANT_TIMING, REALISTIC_TIMING, type MockAdapterOptions, type MockTiming } from './mock/mockAdapter';

/**
 * The adapter the app runs against. Phase 2 has no backend, so this is the in-memory mock.
 * FastAPI integration swaps in an HTTP adapter here (same `ApiAdapter` interface).
 */
export function createDefaultAdapter(): ApiAdapter {
  return createMockAdapter();
}

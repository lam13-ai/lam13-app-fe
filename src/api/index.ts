import { env } from '@/lib/env';
import { createHttpAdapter } from './http';
import { createMockAdapter } from './mock/mockAdapter';
import type { ApiAdapter } from './services';

export { ApiProvider, useApi } from './context';
export { authorizationHeaders, getAccessToken, setAccessTokenGetter, type AccessTokenGetter } from './auth';
export { ApiError, abortError, isAbortError, isApiError, isNotFound, toErrorInfo } from './errors';
export { queryKeys } from './queryKeys';
export { ATTACHMENT_LIMITS } from './limits';
export type {
  ApiAdapter,
  ApiCapabilities,
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
  ProfilesService,
  ProfileSuggestionListParams,
  ProfileSuggestionsService,
  SendMessageBody,
  StreamOptions,
  TranscriptionInput,
} from './services';
export { createHttpAdapter, request, requestJson, type RequestOptions } from './http';
export { readEventStream, type EventStream, type StreamEvent, type StreamEventName } from './stream';
export { createMockAdapter, INSTANT_TIMING, REALISTIC_TIMING, type MockAdapterOptions, type MockTiming } from './mock/mockAdapter';

/**
 * The adapter the app runs against: the LAM13 FastAPI backend, or the in-memory mock with
 * `VITE_API_MODE=mock` (no backend needed). Tests pass their own adapter.
 */
export function createDefaultAdapter(): ApiAdapter {
  return env.apiMode === 'mock' ? createMockAdapter() : createHttpAdapter();
}

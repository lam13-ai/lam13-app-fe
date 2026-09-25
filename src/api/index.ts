import { createHttpAdapter } from './http';
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
export { createHttpAdapter, request, requestJson, type RequestOptions } from './http';
export { readEventStream, type EventStream, type StreamEvent, type StreamEventName } from './stream';
export { createMockAdapter, INSTANT_TIMING, REALISTIC_TIMING, type MockAdapterOptions, type MockTiming } from './mock/mockAdapter';

/** The adapter the app runs against: the LAM13 FastAPI backend. Tests pass the mock instead. */
export function createDefaultAdapter(): ApiAdapter {
  return createHttpAdapter();
}

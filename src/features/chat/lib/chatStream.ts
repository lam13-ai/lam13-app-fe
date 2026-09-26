import type { QueryClient } from '@tanstack/react-query';
import { ApiError, isAbortError, isApiError, queryKeys, toErrorInfo, type ApiAdapter, type EventStream } from '@/api';
import { patchConversation, upsertConversation } from '@/features/conversations';
import { createId } from '@/lib/id';
import { useStreamStore } from '@/stores/streamStore';
import { useUiStore } from '@/stores/uiStore';
import type { AttachmentRef, AudioRef } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { applyStreamEvent, isTerminal, type StreamDraft } from './applyStreamEvent';
import { createFrameBatcher } from './frameBatcher';
import {
  appendMessages,
  isLocalId,
  isNewChatKey,
  messageKey,
  newChatKey,
  removeMessages,
  upsertMessage,
  withConversationId,
  type MessagesData,
} from './messageCache';

/** After a dropped stream: how often / how long to re-read the conversation for the server's answer. */
const RECONCILE_INTERVAL_MS = 3_000;
const RECONCILE_ATTEMPTS = 40;

interface Deps {
  api: ApiAdapter;
  queryClient: QueryClient;
}

/** What the user sends: typed text (optionally with already-uploaded images), or an uploaded voice note. */
export type MessageInput =
  | { kind: 'text'; content: string; attachments?: AttachmentRef[] }
  | { kind: 'voice'; audio: AudioRef };

/** A local recording ready to upload (structurally matches the voice feature's Recording). */
export interface VoiceUpload {
  blob: Blob;
  durationMs: number;
  peaks: number[];
}

export interface SendOptions {
  /** Reuse a client_message_id when resending a failed message. */
  clientMessageId?: string;
  /** Identifies the new-chat view that started a lazily created conversation. */
  origin?: string;
}

/**
 * Stream lifecycle for one exchange:
 * optimistic user message → assistant draft → typed events (answer text buffered in the draft; other updates
 * rAF-batched into the cache) → done (the whole answer at once) / error / cancelled (what arrived so far).
 * Runs outside React so a stream survives route changes (e.g. `/` → `/c/:id` after lazy creation).
 */
export function createChatActions({ api, queryClient }: Deps) {
  const store = () => useStreamStore.getState();

  const updateMessages = (key: string, fn: (data: MessagesData | undefined) => MessagesData | undefined) =>
    queryClient.setQueryData<MessagesData>(queryKeys.messages(key), fn);

  async function run(params: {
    key: string;
    draft: StreamDraft;
    origin?: string;
    open: (signal: AbortSignal) => Promise<EventStream>;
  }) {
    const controller = new AbortController();
    const assistantKey = messageKey(params.draft.assistant);
    let key = params.key;
    let draft = params.draft;
    let opened = false;
    /** The answer is complete: the conversation is free again; later events are trailing updates. */
    let released = false;
    // Only this run's entry: after an early release a newer stream may own the key.
    const release = () => {
      if (store().active[key]?.controller === controller) store().end(key);
      released = true;
    };

    store().begin(key, { phase: 'sending', controller, assistantKey });
    store().setFailure(assistantKey, null);

    const writeAssistant = () => updateMessages(key, (d) => upsertMessage(d, assistantKey, draft.assistant));
    const batcher = createFrameBatcher(writeAssistant);
    /**
     * Lost the stream after the server accepted the message: the server may still be generating (the
     * FastAPI backend keeps going without a reader). Re-read the conversation until the saved answer has
     * caught up with what was shown (it is saved in chunks), then show the server's copy; a still-generating
     * answer is then polled to completion by useMessages. The partial answer is never replaced by less.
     */
    const reconcile = () => {
      if (!opened || isLocalId(draft.assistant.id)) return;
      const shown = draft.assistant;
      void (async () => {
        for (let attempt = 0; attempt < RECONCILE_ATTEMPTS; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 0 : RECONCILE_INTERVAL_MS));
          const page = await api.messages.list(key).catch(() => null);
          const saved = page?.items.find((m) => m.id === shown.id);
          if (!page) continue;
          if (!saved) return;
          const finished = saved.status !== 'streaming';
          if (finished || saved.content.length >= shown.content.length) {
            updateMessages(key, (d) => upsertMessage(d, assistantKey, { ...saved, local_key: shown.local_key }));
            if (saved.status !== 'error') store().setFailure(assistantKey, null);
            return;
          }
        }
      })();
    };
    const fail = (info: ReturnType<typeof toErrorInfo>) => {
      draft = { ...draft, status: 'error', error: info, assistant: { ...draft.assistant, status: 'error' } };
      writeAssistant();
      store().setFailure(assistantKey, info);
    };

    try {
      const events = await params.open(controller.signal);
      for await (const event of events) {
        if (released) {
          // A backend may keep the response open after the answer is final (e.g. post-processing):
          // it can still send the conversation title, append to the finished answer, or attach files.
          if (event.event === 'conversation.updated') {
            patchConversation(queryClient, event.data.id, { title: event.data.title });
          } else if (event.event === 'delta' || event.event === 'artifact') {
            draft = { ...applyStreamEvent(draft, event), status: draft.status };
            writeAssistant();
          }
          continue;
        }
        draft = applyStreamEvent(draft, event);

        switch (event.event) {
          case 'conversation.created': {
            const id = event.data.id;
            const data = queryClient.getQueryData<MessagesData>(queryKeys.messages(key));
            // Move the exchange to the conversation: nothing may stay behind under the new-chat key (a
            // later new chat must start empty). The view follows `created` to the new key at once.
            if (data) queryClient.setQueryData(queryKeys.messages(id), withConversationId(data, id));
            queryClient.removeQueries({ queryKey: queryKeys.messages(key), exact: true });
            upsertConversation(queryClient, event.data);
            store().rekey(key, id);
            key = id;
            if (params.origin) store().setCreated({ id, origin: params.origin });
            break;
          }
          case 'message.created': {
            opened = true;
            // The server accepted the message and is setting up the answer.
            if (draft.status === 'sending' || draft.status === 'thinking') store().setPhase(key, 'preparing');
            const user = draft.user;
            if (user) updateMessages(key, (d) => upsertMessage(d, messageKey(user), user));
            batcher.cancel();
            writeAssistant();
            break;
          }
          case 'status': {
            const transcribing = /^transcrib/i.test(event.data.label ?? '');
            const current = store().active[key]?.phase;
            // Never backwards: once generating/answering (or preparing), a late `thinking` changes nothing.
            const phase =
              draft.status === 'answering' || draft.status === 'generating'
                ? draft.status
                : transcribing
                  ? 'transcribing'
                  : event.data.state === 'solving'
                    ? 'solving'
                    : current === 'preparing' || current === 'solving'
                      ? current
                      : 'thinking';
            store().setPhase(key, phase);
            break;
          }
          case 'artifact':
            batcher.schedule();
            break;
          case 'transcript': {
            const user = draft.user;
            if (user) updateMessages(key, (d) => upsertMessage(d, messageKey(user), user));
            break;
          }
          case 'delta':
            // Buffered: the text accumulates in `draft` only. The answer is written (and shown) whole at
            // `done`; Stop or a failure writes what arrived so far.
            store().setPhase(key, 'answering');
            break;
          case 'conversation.updated':
            patchConversation(queryClient, event.data.id, { title: event.data.title });
            break;
          case 'done':
            batcher.cancel();
            writeAssistant();
            patchConversation(
              queryClient,
              key,
              { updated_at: new Date().toISOString(), last_message_preview: draft.assistant.content.slice(0, 80) },
              { toTop: true },
            );
            release();
            break;
          case 'error':
            batcher.cancel();
            fail(event.data);
            break;
        }
      }

      if (!isTerminal(draft.status)) {
        batcher.cancel();
        fail({ code: 'stream_interrupted', message: 'The response ended unexpectedly.', retryable: true });
        reconcile();
      }
    } catch (error) {
      batcher.cancel();
      if (released) {
        // The answer was already complete; losing the trailing updates doesn't change it.
      } else if (isAbortError(error)) {
        // Stop: keep whatever was generated.
        draft = { ...draft, status: 'cancelled', assistant: { ...draft.assistant, status: 'cancelled' } };
        writeAssistant();
        if (opened && !isLocalId(draft.assistant.id)) {
          void api.messages.cancel(key, draft.assistant.id).catch(() => {});
        }
      } else if (!opened && draft.user && isApiError(error) && error.status === 409) {
        // Duplicate client_message_id: the server already has this message — show its copy.
        updateMessages(key, (d) => removeMessages(d, [messageKey(draft.user!), assistantKey]));
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages(key) });
      } else if (!opened && draft.user) {
        // Rejected before the stream opened: the user message was never accepted.
        const user = draft.user;
        const userKey = messageKey(user);
        updateMessages(key, (d) =>
          upsertMessage(removeMessages(d, [assistantKey]), userKey, { ...user, status: 'error' }),
        );
        store().setFailure(userKey, toErrorInfo(error));
      } else {
        // Connection dropped mid-stream (or a regenerate request failed): keep the partial answer.
        fail(toErrorInfo(error));
        reconcile();
      }
    } finally {
      release();
    }
  }

  /** Optimistic user message → stream the answer (text, or an already-uploaded voice note). */
  function sendMessage(conversationId: string | undefined, input: MessageInput, options: SendOptions = {}) {
    const key = conversationId ?? newChatKey(options.origin);
    const content = input.kind === 'text' ? input.content.trim() : '';
    if ((input.kind === 'text' && !content) || store().active[key]) return Promise.resolve();

    const clientId = options.clientMessageId ?? createId();
    const { model, effort } = useUiStore.getState();
    const createdAt = new Date().toISOString();
    const base = { conversation_id: key, call: null, created_at: createdAt };
    const user: MessageView = {
      ...base,
      id: `local:${clientId}`,
      client_message_id: clientId,
      role: 'user',
      kind: input.kind,
      audio: input.kind === 'voice' ? input.audio : null,
      // Voice: filled by the `transcript` event.
      content,
      ...(input.kind === 'text' && input.attachments?.length && { attachments: input.attachments }),
      status: 'complete',
    };
    const assistantId = `local:a:${clientId}`;
    const assistant: MessageView = {
      ...base,
      kind: 'text',
      audio: null,
      id: assistantId,
      local_key: assistantId,
      client_message_id: null,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model,
      effort,
    };

    store().setFailure(clientId, null);
    updateMessages(key, (d) => appendMessages(d, [user, assistant]));

    return run({
      key,
      origin: options.origin,
      draft: { conversationId: conversationId ?? null, user, assistant, status: 'sending', error: null, title: null },
      open: (signal) =>
        api.messages.send(
          conversationId ?? null,
          input.kind === 'voice'
            ? { client_message_id: clientId, kind: 'voice', audio_id: input.audio.id, model, effort }
            : {
                client_message_id: clientId,
                kind: 'text',
                content,
                model,
                effort,
                ...(input.attachments?.length && { attachment_ids: input.attachments.map((a) => a.id) }),
              },
          { signal },
        ),
    });
  }

  /** `attachments`: images already uploaded via `api.attachments.upload`. */
  function send(
    conversationId: string | undefined,
    text: string,
    { attachments, ...options }: SendOptions & { attachments?: AttachmentRef[] } = {},
  ) {
    return sendMessage(conversationId, { kind: 'text', content: text, attachments }, options);
  }

  /**
   * Voice note: upload (cancellable via `signal`) → voice message → transcript → streamed answer.
   * Resolves once the upload succeeds and the message is handed to the stream; the answer keeps
   * streaming independently (Stop works as for text). Upload errors reject so the composer can retry.
   */
  async function sendVoice(
    conversationId: string | undefined,
    recording: VoiceUpload,
    options: SendOptions & { signal?: AbortSignal } = {},
  ) {
    const key = conversationId ?? newChatKey(options.origin);
    if (store().active[key]) throw new ApiError(409, 'busy', 'Wait for the current response to finish.');
    const audio = await api.audio.upload(
      {
        file: recording.blob,
        duration_ms: recording.durationMs,
        conversation_id: conversationId ?? null,
        peaks: recording.peaks,
      },
      { signal: options.signal },
    );
    void sendMessage(conversationId, { kind: 'voice', audio }, options);
  }

  /**
   * Retry a failed or stopped message.
   * - Never-accepted user message, or an answer that never reached the server → resend the prompt.
   * - Server-side answer (errored / cancelled / partial) → regenerate it in place.
   */
  function retry(conversationKey: string, message: MessageView, history: MessageView[], options: SendOptions = {}) {
    if (store().active[conversationKey]) return Promise.resolve();
    const conversationId = isNewChatKey(conversationKey) ? undefined : conversationKey;
    const index = history.findIndex((m) => messageKey(m) === messageKey(message));

    const resend = (user: MessageView, extraKeys: string[] = []) => {
      const keys = [messageKey(user), ...extraKeys];
      keys.forEach((k) => store().setFailure(k, null));
      updateMessages(conversationKey, (d) => removeMessages(d, keys));
      const input: MessageInput =
        user.kind === 'voice' && user.audio
          ? { kind: 'voice', audio: user.audio }
          : { kind: 'text', content: user.content, attachments: user.attachments };
      return sendMessage(conversationId, input, { ...options, clientMessageId: user.client_message_id ?? undefined });
    };

    if (message.role === 'user') return resend(message);

    const user = history[index - 1];
    if (isLocalId(message.id)) {
      return user?.role === 'user' ? resend(user, [messageKey(message)]) : Promise.resolve();
    }
    // No in-place regenerate on this backend: ask again as a new turn. The server kept the first one,
    // so it gets a fresh client id (a backend may use it as the message id).
    if (!api.capabilities.regenerate) {
      return user?.role === 'user' ? resend({ ...user, client_message_id: createId() }, [messageKey(message)]) : Promise.resolve();
    }
    if (!conversationId) return Promise.resolve();

    const assistant: MessageView = { ...message, content: '', status: 'streaming' };
    updateMessages(conversationKey, (d) => upsertMessage(d, messageKey(message), assistant));
    return run({
      key: conversationKey,
      draft: { conversationId, user: null, assistant, status: 'sending', error: null, title: null },
      open: (signal) => api.messages.regenerate(conversationId, message.id, { signal }),
    });
  }

  function stop(conversationKey: string) {
    store().active[conversationKey]?.controller.abort();
  }

  return { send, sendVoice, retry, stop };
}

export type ChatActions = ReturnType<typeof createChatActions>;

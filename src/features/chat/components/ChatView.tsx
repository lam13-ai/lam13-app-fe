import { CalendarDays, FileText, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiError, ATTACHMENT_LIMITS, toErrorInfo, useApi } from '@/api';
import { ErrorState } from '@/components/ErrorState';
import { Spinner, VisuallyHidden, smallIconProps, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { createId } from '@/lib/id';
import { useComposerStore, type MeetingContext } from '@/stores/composerStore';
import { useStreamStore, type StreamPhase } from '@/stores/streamStore';
import { useUiStore } from '@/stores/uiStore';
import type { Recording } from '@/features/voice';
import type { Conversation } from '@/types/api';
import type { AgentStatus } from '@/types/chat';
import { AGENT_NAME, AGENT_TAGLINE } from '../constants';
import { useChatActions } from '../hooks/useChatActions';
import { useImageAttachments } from '../hooks/useImageAttachments';
import { useMessages } from '../hooks/useMessages';
import { NEW_CONVERSATION_KEY, newChatKey } from '../lib/messageCache';
import { ChatHeader } from './ChatHeader';
import { Composer } from './composer/Composer';
import { EmptyState } from './EmptyState';
import { MessageLog } from './MessageLog';
import { MessagesSkeleton } from './MessagesSkeleton';

/** What the answer's status box starts from (real stream events); it rotates on between them. */
const ACTIVITY_LABELS: Record<StreamPhase, string> = {
  sending: 'Thinking…',
  thinking: 'Thinking…',
  preparing: 'Thinking…', // start
  transcribing: 'Transcribing…',
  solving: 'Solving…',
  finishing: 'Finishing up…', // response_completed: the text is final, post-processing runs
  generating: 'Generating response…', // response_started
  answering: 'Putting the answer together…', // tokens arriving
};

export interface ChatViewProps {
  /** Undefined for a new, unsaved chat (`/`). */
  conversationId?: string;
  /** Undefined while loading, or for a new chat. */
  conversation?: Conversation;
  /** The route's React key for this view; handed to the created conversation's URL to keep this instance. */
  viewKey?: string;
  /** A chat that lives inside something else (a project): its URLs and what its header shows. Everything else is the same chat. */
  scope?: ChatScope;
}

export interface ChatScope {
  /** The URL of a conversation in this scope (default `/c/:id`). */
  path: (conversationId: string) => string;
  /** Header title before the conversation exists. */
  newTitle: string;
  /** Under the header title (e.g. the project's name). */
  context: ReactNode;
  /** Header controls (e.g. Project details). */
  actions?: ReactNode;
}

/**
 * Chat workspace: header + log + composer. Desktop renders the reference's bordered 12px card;
 * mobile is full-bleed. Mount with a `key` per route so view state resets per conversation.
 */
export function ChatView({ conversationId, conversation, viewKey, scope }: ChatViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // Arrived via New Chat: the empty state plays its entrance transition.
  const enteringNewChat = !conversationId && (location.state as { newChat?: boolean } | null)?.newChat === true;
  const toast = useToast();
  const actions = useChatActions();
  const api = useApi();
  const { capabilities } = api;
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const files = useImageAttachments();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const created = useStreamStore((s) => s.created);
  // Identifies this new-chat view so only it follows a lazily created conversation.
  const [origin] = useState(createId);
  // The stream and its messages move to the created conversation's id at once; follow them there
  // while the URL catches up, so the view never briefly reads the abandoned 'new' state.
  const effectiveId = conversationId ?? (created?.origin === origin ? created.id : undefined);
  // An unsaved chat has its own key per view: another new chat's messages or stream can never show here.
  const key = effectiveId ?? newChatKey(origin);
  // Unsent composer text keeps its shared new-chat slot (unchanged behaviour).
  const draftKey = effectiveId ?? NEW_CONVERSATION_KEY;

  // A meeting added as context for the next message (a chip in the composer), kept with the draft.
  const meeting = useComposerStore((s) => s.meetings[draftKey]);
  // "Ask Lam13 about this meeting" opens a new chat with the meeting in the router state. Applied once,
  // then dropped from the history entry so Back / reload can't bring back a context the user removed.
  const askedMeeting = conversationId ? undefined : (location.state as { meetingContext?: MeetingContext } | null)?.meetingContext;
  useEffect(() => {
    if (!askedMeeting) return;
    useComposerStore.getState().setMeeting(NEW_CONVERSATION_KEY, askedMeeting);
    navigate(location.pathname, { replace: true, state: { newChat: true } });
  }, [askedMeeting, location.pathname, navigate]);

  const scopePath = scope?.path;
  const history = useMessages(key, effectiveId);
  const active = useStreamStore((s) => s.active[key]);
  const failures = useStreamStore((s) => s.failures);

  // Lazy creation: the first send from `/` creates the conversation — move to its URL.
  // The hand-off is cleared only once the URL has caught up.
  useEffect(() => {
    if (created?.origin !== origin) return;
    if (conversationId) useStreamStore.getState().setCreated(null);
    else navigate(scopePath ? scopePath(created.id) : `/c/${created.id}`, { replace: true, state: { viewKey } });
  }, [created, origin, conversationId, navigate, viewKey, scopePath]);

  const status: AgentStatus = !active
    ? 'online'
    : active.phase === 'answering' || active.phase === 'transcribing' || active.phase === 'solving' || active.phase === 'finishing'
      ? active.phase
      : 'thinking';
  const activity = active && ACTIVITY_LABELS[active.phase];
  const title = conversationId ? conversation?.title : (scope?.newTitle ?? AGENT_NAME);
  const send = (text: string) => {
    // The meeting context goes with this message, then the chip clears (restored if the send fails first).
    const meetingIds = meeting ? [meeting.id] : undefined;
    if (meeting) useComposerStore.getState().clearMeeting(draftKey);
    if (files.drafts.length === 0) {
      void actions.send(conversationId, text, { origin, meetingIds });
      return;
    }
    // Upload first (the backend needs document ids), then send; a failed upload restores the text.
    void (async () => {
      try {
        const attachments = await files.upload(conversationId ?? null);
        files.clear();
        await actions.send(conversationId, text, { origin, attachments, meetingIds });
      } catch (error) {
        useComposerStore.getState().setDraft(draftKey, text);
        if (meeting) useComposerStore.getState().setMeeting(draftKey, meeting);
        toast.show(toErrorInfo(error).message);
      }
    })();
  };
  /** Picked or pasted files: one validation path, rejections reported the same way. */
  const addFiles = (picked: File[]) => files.add(picked).forEach((r) => toast.show(`${r.name}: ${r.reason}`));
  const loadingHistory = Boolean(conversationId) && history.isPending;

  const transcribe = (recording: Recording, signal: AbortSignal) =>
    api.audio.transcribe({ file: recording.blob, duration_ms: recording.durationMs, conversation_id: conversationId ?? null }, { signal }).then((r) => r.text);
  /**
   * Backends without voice messages (the FastAPI one) send a recording as text. A failure throws, so the
   * recorder keeps the recording and offers Retry (it owns busy / error / retry) — nothing is sent.
   */
  const transcribeText = async (recording: Recording, signal: AbortSignal) => {
    const text = (await transcribe(recording, signal)).trim();
    if (!text) throw new ApiError(422, 'no_speech', 'No speech was detected. Try recording again.');
    return text;
  };
  /** Stop: the transcript goes into the message box for editing; the user sends it. */
  const transcribeIntoDraft = async (recording: Recording, signal: AbortSignal) => {
    const text = await transcribeText(recording, signal);
    const { drafts, setDraft } = useComposerStore.getState();
    const current = drafts[draftKey]?.trim();
    setDraft(draftKey, current ? `${current} ${text}` : text);
  };
  /** Send: the transcript is sent as the message straight away — exactly once, never empty. */
  const transcribeAndSend = async (recording: Recording, signal: AbortSignal) => {
    const text = await transcribeText(recording, signal);
    if (useStreamStore.getState().active[key]) {
      throw new ApiError(409, 'busy', 'Lam13 is still answering. Try again when it has finished.');
    }
    send(text);
  };

  let body;
  if (loadingHistory) {
    body = <MessagesSkeleton />;
  } else if (history.isError && history.messages.length === 0) {
    body = (
      <ErrorState
        className="min-h-0 flex-1"
        eyebrow="Error"
        title="Couldn't load messages."
        description="Something went wrong while loading this conversation."
        action={{ label: 'Try again', onClick: () => void history.refetch() }}
      />
    );
  } else if (history.messages.length === 0) {
    body = <EmptyState onSuggestion={send} entering={enteringNewChat} />;
  } else {
    body = (
      <MessageLog
        messages={history.messages}
        failures={failures}
        older={{
          hasOlder: Boolean(history.hasNextPage),
          loading: history.isFetchingNextPage,
          error: history.isFetchNextPageError,
          load: () => void history.fetchNextPage(),
        }}
        onRetry={active ? undefined : (message) => void actions.retry(key, message, history.messages, { origin })}
        streaming={Boolean(active)}
        activity={activity}
        working={active?.phase === 'solving'}
      />
    );
  }

  return (
    <section
      aria-label="Chat"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-bg md:rounded-card md:border md:border-frame md:shadow-card"
    >
      <ChatHeader
        title={title}
        subtitle={conversationId ? AGENT_NAME : AGENT_TAGLINE}
        context={scope?.context}
        actions={scope?.actions}
        status={status}
        onOpenSidebar={() => setSidebarOpen(true)}
      />

      {body}

      <div className="shrink-0 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 md:px-5">
        <div className="mx-auto w-full max-w-[var(--chat-max-w)]">
          <Composer
            draftKey={draftKey}
            streaming={Boolean(active)}
            finishing={active?.phase === 'finishing'}
            disabled={loadingHistory || (history.isError && history.messages.length === 0)}
            onSend={send}
            onStop={() => actions.stop(key)}
            onSendVoice={
              !env.features.voiceNotes
                ? undefined
                : capabilities.voiceNotes
                  ? (recording, signal) => actions.sendVoice(conversationId, recording, { origin, signal })
                  : capabilities.transcription
                    ? transcribeAndSend
                    : undefined
            }
            onReviewVoice={env.features.voiceNotes && !capabilities.voiceNotes && capabilities.transcription ? transcribeIntoDraft : undefined}
            // The preview's automatic transcript only where the recording itself is sent (voice notes); when
            // transcribing IS the send, it would just transcribe twice.
            onTranscribeVoice={capabilities.voiceNotes && capabilities.transcription ? transcribe : undefined}
            onAttach={() => fileInputRef.current?.click()}
            onAddMeeting={(m) => useComposerStore.getState().setMeeting(draftKey, { id: m.id, title: m.title })}
            onPasteFiles={addFiles}
            attachments={
              (meeting || files.drafts.length > 0) && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                  {meeting && (
                    <p className="inline-flex max-w-72 items-center gap-1.5 border border-hairline-strong px-2 py-1 text-xs text-fg">
                      <CalendarDays {...smallIconProps} className="shrink-0" />
                      <VisuallyHidden>Meeting context: </VisuallyHidden>
                      <span className="truncate">{meeting.title}</span>
                      <button
                        type="button"
                        aria-label={`Remove meeting ${meeting.title}`}
                        onClick={() => useComposerStore.getState().clearMeeting(draftKey)}
                        className="text-fg-muted hover:text-fg"
                      >
                        <X {...smallIconProps} />
                      </button>
                    </p>
                  )}
                  {files.drafts.length > 0 && (
                <ul aria-label="Attached files" className="flex flex-wrap gap-1.5">
                  {files.drafts.map((d) => (
                    <li
                      key={d.id}
                      title={d.error}
                      className={cn(
                        'inline-flex max-w-60 items-center gap-1.5 border px-2 py-1 text-xs',
                        d.status === 'error' ? 'border-danger text-danger' : 'border-hairline-strong text-fg',
                      )}
                    >
                      {d.status === 'uploading' ? (
                        <Spinner size={14} state="active" label="Uploading" />
                      ) : (
                        <FileText {...smallIconProps} className="shrink-0" />
                      )}
                      <span className="truncate">{d.file.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${d.file.name}`}
                        onClick={() => files.remove(d.id)}
                        className="text-fg-muted hover:text-fg"
                      >
                        <X {...smallIconProps} />
                      </button>
                    </li>
                  ))}
                </ul>
                  )}
                </div>
              )
            }
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept={ATTACHMENT_LIMITS.mimeTypes.join(',')}
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </section>
  );
}

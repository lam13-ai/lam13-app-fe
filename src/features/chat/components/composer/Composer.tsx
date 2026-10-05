import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useVoiceRecorder, VoiceComposer, type SendRecording, type TranscribeRecording } from '@/features/voice';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { cn } from '@/lib/cn';
import { useComposerStore } from '@/stores/composerStore';
import type { MeetingSummary } from '@/types/api';
import { clipboardFiles } from '../../lib/attachments';
import { AddControl, ModelChips, useModelChips } from './ComposerToolbar';
import { SendButton, type SendButtonMode } from './SendButton';

const PLACEHOLDER = 'Ask Lam13 about strategy…';

export interface ComposerProps {
  /** Draft storage key (conversation id, or 'new'). */
  draftKey: string;
  /** A response is being generated: input disabled, button becomes Stop. */
  streaming: boolean;
  /** The answer's text is complete; the turn is still finishing (post-processing). */
  finishing?: boolean;
  /** Not ready to send (e.g. history still loading). */
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Send on a recording: sends the voice note (or its transcript as the message). Omit to hide voice recording. */
  onSendVoice?: SendRecording;
  /** Transcribes a recording for review before sending. Omit when the backend can't transcribe. */
  onTranscribeVoice?: TranscribeRecording;
  /** Stop on the recording: transcribes it into this box for editing (backends without voice notes). Omit to preview it. */
  onReviewVoice?: SendRecording;
  onAttach: () => void;
  /** Adds a meeting as context for the next message (the "+" menu's Meeting step). Omit to hide it. */
  onAddMeeting?: (meeting: MeetingSummary) => void;
  /** Files pasted into the message box (screenshots, copied images / files) — same path as `onAttach`'s picker. */
  onPasteFiles?: (files: File[]) => void;
  /** Files picked for the next message, shown above the input (keeps the composer open). */
  attachments?: ReactNode;
}

/**
 * Reference composer (§6). States: idle (48px pill) → expanded (textarea + toolbar)
 * → streaming (input disabled, Stop) → back to expanded, ready for the next message.
 * Voice: the mic swaps the controls for the recording → preview → sending panel in the same pill.
 */
export function Composer({
  draftKey,
  streaming,
  finishing,
  disabled,
  onSend,
  onStop,
  onSendVoice,
  onTranscribeVoice,
  onReviewVoice,
  onAttach,
  onAddMeeting,
  onPasteFiles,
  attachments,
}: ComposerProps) {
  const draft = useComposerStore((s) => s.drafts[draftKey] ?? '');
  const setDraft = useComposerStore((s) => s.setDraft);
  const clearDraft = useComposerStore((s) => s.clearDraft);

  const [open, setOpen] = useState(false);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const textareaId = useId();
  const recorder = useVoiceRecorder();
  // Model / effort chips, when the backend offers a choice: they get their own row under the text.
  const hasChips = useModelChips().show;
  const voiceActive = Boolean(onSendVoice) && recorder.state.status !== 'idle' && recorder.state.status !== 'sent';

  const expanded = open || draft.length > 0 || streaming || voiceActive || Boolean(attachments);
  const canSend = !streaming && !disabled && draft.trim().length > 0;
  const mode: SendButtonMode = streaming ? 'stop' : draft.trim() || !onSendVoice ? 'send' : 'voice';

  // Keyed on the textarea being shown: a transcript set while the voice panel is up must still size it
  // (and its scroll fades) once the textarea is back.
  const shownDraft = expanded && !voiceActive ? draft : '';
  useAutoResizeTextarea(textareaRef, shownDraft);

  // Focus the textarea when the user opens the composer.
  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  // Keep keyboard focus useful across a stream: → Stop while streaming, → textarea afterwards.
  const wasStreaming = useRef(streaming);
  useEffect(() => {
    if (wasStreaming.current === streaming) return;
    wasStreaming.current = streaming;
    const active = document.activeElement;
    const focusIsOurs = active === document.body || active === null || formRef.current?.contains(active);
    if (!focusIsOurs) return;
    if (streaming) buttonRef.current?.focus();
    else textareaRef.current?.focus();
  }, [streaming]);

  // Leaving voice mode (sent / deleted) returns focus to the text controls.
  const wasVoiceActive = useRef(voiceActive);
  useEffect(() => {
    if (wasVoiceActive.current === voiceActive) return;
    wasVoiceActive.current = voiceActive;
    if (voiceActive) return;
    const active = document.activeElement;
    if (active !== document.body && active !== null && !formRef.current?.contains(active)) return;
    (textareaRef.current ?? buttonRef.current)?.focus();
  }, [voiceActive]);

  // Collapse an empty composer when the user clicks elsewhere.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!formRef.current?.contains(e.target as Node) && !textareaRef.current?.value) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expanded]);

  const updateEdges = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const top = el.scrollTop > 0;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(updateEdges);
    return () => cancelAnimationFrame(frame);
  }, [shownDraft, updateEdges]);

  const submit = () => {
    if (!canSend) return;
    onSend(draft.trim());
    clearDraft(draftKey);
    setOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && !draft) {
      setOpen(false);
    }
  };

  // Keyboard users tabbing out of an empty composer collapse it too.
  const onBlur = (e: FocusEvent<HTMLFormElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !formRef.current?.contains(next) && !draft && !streaming) setOpen(false);
  };

  const sendButton = (
    <SendButton
      ref={buttonRef}
      mode={mode}
      disabled={disabled || (mode === 'send' && !canSend)}
      onSend={submit}
      onVoice={() => void recorder.start()}
      onStop={onStop}
    />
  );
  /** The composer's controls, always together on one line: add (files / context), then send / mic / stop. */
  const controls = (
    <>
      <AddControl onAttach={onAttach} onAddMeeting={onAddMeeting} />
      {sendButton}
    </>
  );

  return (
    <form
      ref={formRef}
      aria-busy={streaming}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onBlur={onBlur}
      className={cn(
        'relative mx-auto w-full transition-[max-width] duration-[400ms] ease-spring',
        expanded ? 'max-w-full' : 'max-w-[var(--composer-idle-w)]',
      )}
    >
      <div
        className={cn(
          'relative rounded-composer border border-border bg-composer shadow-xs',
          'transition-[border-color,box-shadow] duration-150 ease-standard',
          'hover:not-focus-within:border-fg/25 focus-within:border-composer-focus focus-within:ring-1 focus-within:ring-composer-ring',
        )}
      >
        {voiceActive && onSendVoice ? (
          <VoiceComposer recorder={recorder} onSend={onSendVoice} onReview={onReviewVoice} transcribe={onTranscribeVoice} />
        ) : expanded ? (
          <>
            {attachments}
            {/* One row for the text and its controls: the controls sit on the text's last line (centred
                on a single line), never on a row of their own. With chips, they share the chips' row. */}
            <div className="flex items-end">
              <div className="relative min-w-0 flex-1">
                <label htmlFor={textareaId} className="sr-only">
                  Message Lam13
                </label>
                <textarea
                  id={textareaId}
                  ref={textareaRef}
                  rows={1}
                  value={draft}
                  disabled={streaming}
                  placeholder={finishing ? 'Lam13 is finishing up…' : streaming ? 'Lam13 is responding…' : PLACEHOLDER}
                  enterKeyHint="send"
                  onChange={(e) => setDraft(draftKey, e.target.value)}
                  onKeyDown={onKeyDown}
                  onPaste={(e) => {
                    const files = clipboardFiles(e.clipboardData);
                    if (!onPasteFiles || files.length === 0) return; // text: the browser pastes it as usual
                    // Files only: nothing to paste as text. With text too, the textarea still takes just its
                    // plain text (never HTML) while the files are attached.
                    if (!e.clipboardData.types.includes('text/plain')) e.preventDefault();
                    onPasteFiles(files);
                  }}
                  onScroll={updateEdges}
                  className={cn(
                    'block max-h-[min(40dvh,240px)] w-full animate-enter-sm resize-none overflow-y-auto bg-transparent',
                    'text-base leading-[22px] text-fg outline-none sm:text-sm sm:leading-[22px]',
                    // A single line is 48px tall, like the idle pill and the voice bars.
                    hasChips ? 'px-4 pb-1 pt-3.5' : 'py-[13px] pl-4 pr-2',
                    // The shared thin scrollbar, shown only when the text overflows; its track starts below the
                    // pill's rounded corner so it runs along the straight edge.
                    'scrollbar-subtle [&::-webkit-scrollbar-track]:mt-3 [&::-webkit-scrollbar-track]:mb-1',
                    'placeholder:font-medium placeholder:text-fg-muted focus-visible:outline-none disabled:cursor-not-allowed',
                  )}
                />
                <div
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute inset-x-4 top-0 h-8 bg-linear-to-b from-composer via-composer/90 to-transparent transition-opacity duration-150',
                    edges.top ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <div
                  aria-hidden="true"
                  className={cn(
                    'pointer-events-none absolute inset-x-4 bottom-0 h-8 bg-linear-to-t from-composer via-composer/90 to-transparent transition-opacity duration-150',
                    edges.bottom ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </div>
              {!hasChips && <div className="flex h-12 shrink-0 items-center gap-1 pr-1.5">{controls}</div>}
            </div>
            {hasChips && (
              <div className="flex h-12 animate-reveal items-center gap-0.5 pl-3 pr-1.5">
                <ModelChips />
                <div className="ml-auto flex items-center gap-1">{controls}</div>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={disabled}
            className="block h-12 w-full animate-fade truncate pl-4 pr-12 text-left text-base font-medium text-fg-muted outline-none disabled:cursor-default sm:text-sm"
          >
            {PLACEHOLDER}
          </button>
        )}

        {/* Idle pill: only the send / mic button, centred in its 48px. */}
        {!voiceActive && !expanded && <div className="absolute bottom-1.5 right-1.5">{sendButton}</div>}
      </div>
    </form>
  );
}

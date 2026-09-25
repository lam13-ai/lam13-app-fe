import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useVoiceRecorder, VoiceComposer, type SendRecording } from '@/features/voice';
import { useAutoResizeTextarea } from '@/hooks/useAutoResizeTextarea';
import { cn } from '@/lib/cn';
import { useComposerStore } from '@/stores/composerStore';
import { ComposerToolbar } from './ComposerToolbar';
import { SendButton, type SendButtonMode } from './SendButton';

const PLACEHOLDER = 'Ask Lam13 about strategy…';

export interface ComposerProps {
  /** Draft storage key (conversation id, or 'new'). */
  draftKey: string;
  /** A response is being generated: input disabled, button becomes Stop. */
  streaming: boolean;
  /** Not ready to send (e.g. history still loading). */
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Uploads and sends a recorded voice note. Omit to hide voice recording. */
  onSendVoice?: SendRecording;
  onAttach: () => void;
  /** Files picked for the next message, shown above the input (keeps the composer open). */
  attachments?: ReactNode;
}

/**
 * Reference composer (§6). States: idle (48px pill) → expanded (textarea + toolbar)
 * → streaming (input disabled, Stop) → back to expanded, ready for the next message.
 * Voice: the mic swaps the controls for the recording → preview → sending panel in the same pill.
 */
export function Composer({ draftKey, streaming, disabled, onSend, onStop, onSendVoice, onAttach, attachments }: ComposerProps) {
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
  const voiceActive = Boolean(onSendVoice) && recorder.state.status !== 'idle' && recorder.state.status !== 'sent';

  const expanded = open || draft.length > 0 || streaming || voiceActive || Boolean(attachments);
  const canSend = !streaming && !disabled && draft.trim().length > 0;
  const mode: SendButtonMode = streaming ? 'stop' : draft.trim() || !onSendVoice ? 'send' : 'voice';

  useAutoResizeTextarea(textareaRef, expanded ? draft : '');

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

  const updateEdges = () => {
    const el = textareaRef.current;
    if (!el) return;
    const top = el.scrollTop > 0;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  };

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
          'relative rounded-composer border border-border bg-bg shadow-xs',
          'transition-[border-color,box-shadow] duration-150 ease-standard',
          'hover:not-focus-within:border-fg/25 focus-within:border-accent/45 focus-within:ring-1 focus-within:ring-accent/15',
        )}
      >
        {voiceActive && onSendVoice ? (
          <VoiceComposer recorder={recorder} onSend={onSendVoice} />
        ) : expanded ? (
          <>
            {attachments}
            <div className="relative">
              <label htmlFor={textareaId} className="sr-only">
                Message Lam13
              </label>
              <textarea
                id={textareaId}
                ref={textareaRef}
                rows={1}
                value={draft}
                disabled={streaming}
                placeholder={streaming ? 'Lam13 is responding…' : PLACEHOLDER}
                enterKeyHint="send"
                onChange={(e) => {
                  setDraft(draftKey, e.target.value);
                  requestAnimationFrame(updateEdges);
                }}
                onKeyDown={onKeyDown}
                onScroll={updateEdges}
                className={cn(
                  'block max-h-[min(40dvh,240px)] w-full animate-enter-sm resize-none overflow-y-auto bg-transparent',
                  'px-4 pb-1 pt-3.5 text-base leading-[22px] text-fg outline-none scrollbar-none sm:text-sm sm:leading-[22px]',
                  'placeholder:font-medium placeholder:text-fg-muted focus-visible:outline-none disabled:cursor-not-allowed',
                )}
              />
              <div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-x-4 top-0 h-8 bg-linear-to-b from-bg via-bg/90 to-transparent transition-opacity duration-150',
                  edges.top ? 'opacity-100' : 'opacity-0',
                )}
              />
              <div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-x-4 bottom-0 h-8 bg-linear-to-t from-bg via-bg/90 to-transparent transition-opacity duration-150',
                  edges.bottom ? 'opacity-100' : 'opacity-0',
                )}
              />
            </div>
            <ComposerToolbar onAttach={onAttach} />
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

        {!voiceActive && (
          <div className="absolute bottom-2 right-2">
            <SendButton
              ref={buttonRef}
              mode={mode}
              disabled={disabled || (mode === 'send' && !canSend)}
              onSend={submit}
              onVoice={() => void recorder.start()}
              onStop={onStop}
            />
          </div>
        )}
      </div>
    </form>
  );
}

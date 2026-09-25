import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { toErrorInfo } from '@/api';
import { Spinner, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Conversation } from '@/types/api';
import { useRenameConversation } from '../hooks/useConversations';

const MAX_TITLE = 120;

/**
 * Inline title editor in the sidebar row. Enter saves, Escape cancels, blur saves a valid change.
 * The list/header update optimistically; a failure rolls back and keeps the editor open.
 */
export function RenameField({
  conversation,
  onDone,
}: {
  conversation: Conversation;
  /** `restoreFocus`: the edit ended from the keyboard, so focus should return to the row. */
  onDone: (options?: { restoreFocus: boolean }) => void;
}) {
  const rename = useRenameConversation();
  const toast = useToast();
  const [value, setValue] = useState(conversation.title);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const pending = rename.isPending;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const save = ({ fromBlur = false } = {}) => {
    if (pending) return;
    // A blur means focus already moved elsewhere; only keyboard endings pull it back to the row.
    const done = () => onDone({ restoreFocus: !fromBlur });
    const title = value.trim();
    if (!title) {
      if (fromBlur) done();
      else setError("Title can't be empty.");
      return;
    }
    if (title === conversation.title) {
      done();
      return;
    }
    setError(null);
    rename.mutate(
      { id: conversation.id, title },
      {
        onSuccess: done,
        onError: (e) => {
          const message = toErrorInfo(e).message;
          setError(message);
          toast.show(`Couldn't rename the conversation. ${message}`, { tone: 'danger' });
          inputRef.current?.focus();
        },
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      // Don't let Escape also close the mobile drawer.
      e.nativeEvent.stopPropagation();
      onDone({ restoreFocus: true });
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex h-11 items-center gap-2 border bg-bg pl-3 pr-2 md:h-10',
          error ? 'border-danger' : 'border-accent/45 ring-1 ring-accent/15',
        )}
      >
        <input
          ref={inputRef}
          value={value}
          maxLength={MAX_TITLE}
          readOnly={pending}
          aria-label="Conversation title"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => save({ fromBlur: true })}
          className="min-w-0 flex-1 bg-transparent text-nav text-fg outline-none focus-visible:outline-none"
        />
        {pending && <Spinner size={16} state="active" label="Saving title" className="text-fg-muted" />}
      </div>
      {error && (
        <p id={errorId} role="alert" className="px-3 pt-1 text-2xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

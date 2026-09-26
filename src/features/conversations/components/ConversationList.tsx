import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { toErrorInfo } from '@/api';
import { Skeleton, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useComposerStore } from '@/stores/composerStore';
import { useStreamStore } from '@/stores/streamStore';
import type { Conversation } from '@/types/api';
import { useConversations, useDeleteConversation } from '../hooks/useConversations';
import { ConversationActions } from './ConversationActions';
import { RenameField } from './RenameField';

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 px-5 pt-4">
      {[72, 56, 64, 48, 60].map((w, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function TextAction({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 text-2xs font-bold text-fg underline-offset-4 hover:underline md:min-h-0"
    >
      {children}
    </button>
  );
}

function ConversationRow({
  conversation: c,
  editing,
  restoreFocus,
  onFocusRestored,
  onNavigate,
  onEdit,
  onEditDone,
  onDelete,
}: {
  conversation: Conversation;
  editing: boolean;
  /** Move keyboard focus to this row's link (after a rename, or a neighbour's deletion). */
  restoreFocus: boolean;
  onFocusRestored: () => void;
  onNavigate?: () => void;
  onEdit: () => void;
  onEditDone: (options?: { restoreFocus: boolean }) => void;
  onDelete: () => void;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!restoreFocus || editing) return;
    linkRef.current?.focus();
    onFocusRestored();
  }, [restoreFocus, editing, onFocusRestored]);

  if (editing) {
    return (
      <li>
        <RenameField conversation={c} onDone={onEditDone} />
      </li>
    );
  }

  // A new chat's optimistic row (the view is still on `/` until the server creates the conversation):
  // shown as the current chat, not yet a link — there is no conversation to open, rename or delete.
  if (c.id.startsWith('local:')) {
    return (
      <li>
        <span
          aria-current="page"
          title={c.title}
          className="flex h-11 items-center gap-2.5 bg-accent-wash pl-3 pr-2 text-nav text-fg md:h-9"
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 bg-accent" />
          <span className="min-w-0 flex-1 truncate font-bold">{c.title}</span>
        </span>
      </li>
    );
  }

  return (
    <li className="group/row relative">
      <NavLink
        ref={linkRef}
        to={`/c/${c.id}`}
        onClick={onNavigate}
        title={c.title}
        className={({ isActive }) =>
          cn(
            // Compact desktop rhythm: 36px rows, 4px apart (40px pitch); touch keeps 44px rows.
            'group relative flex h-11 items-center gap-2.5 pl-3 pr-10 text-nav transition-colors duration-150 ease-standard md:h-9',
            // Touch or narrow screens (drawer): the actions button is always shown and its space reserved.
            // Desktop with a mouse: only while the row is hovered/focused, so titles use the full width.
            'md:pointer-fine:pr-2 md:pointer-fine:group-hover/row:pr-10 md:pointer-fine:group-focus-within/row:pr-10',
            // Active: tinted row + product-blue marker; hover: a lighter tint.
            isActive ? 'bg-accent-wash text-fg' : 'text-fg-muted hover:bg-fg/[0.045] hover:text-fg',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 shrink-0 transition-all duration-150 ease-standard',
                isActive ? 'bg-accent' : 'bg-fg/30 opacity-0 group-hover:opacity-100',
              )}
            />
            <span className={cn('min-w-0 flex-1 truncate', isActive && 'font-bold')}>{c.title}</span>
          </>
        )}
      </NavLink>
      {/* Beside (not inside) the link, so opening the menu never navigates. */}
      <div className="absolute inset-y-0 right-1.5 flex items-center">
        <ConversationActions conversation={c} onRename={onEdit} onDelete={onDelete} />
      </div>
    </li>
  );
}

export function ConversationList({ onNavigate }: { onNavigate?: () => void }) {
  const { conversations, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useConversations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const clearFocusId = useCallback(() => setFocusId(null), []);
  const remove = useDeleteConversation();
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // One continuous history, most recently active first.
  const history = useMemo(
    () => [...conversations].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
    [conversations],
  );

  const deleteConversation = (conversation: Conversation) => {
    const { id } = conversation;
    // Keyboard focus was on this row's menu, which is about to disappear: hand it to a neighbour.
    const index = history.findIndex((c) => c.id === id);
    setFocusId((history[index + 1] ?? history[index - 1])?.id ?? null);
    // Never keep showing a conversation that is being deleted.
    if (pathname === `/c/${id}`) navigate('/', { replace: true });
    useStreamStore.getState().active[id]?.controller.abort();
    useComposerStore.getState().clearDraft(id);
    remove.mutate(id, {
      onError: (error) =>
        toast.show(`Couldn't delete “${conversation.title}”. ${toErrorInfo(error).message}`, { tone: 'danger' }),
    });
  };

  if (isPending) {
    return (
      <div role="status" aria-label="Loading conversations">
        <ListSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-1 px-5 pt-6">
        <p className="text-xs text-fg-muted">Couldn&apos;t load conversations.</p>
        <TextAction onClick={() => void refetch()}>Try again</TextAction>
      </div>
    );
  }

  if (history.length === 0) {
    return <p className="px-5 pt-6 text-xs text-fg-muted">No conversations yet.</p>;
  }

  return (
    <nav aria-label="Conversations" className="px-3 pb-4 pt-2">
      <ul className="flex flex-col gap-1">
        {history.map((c) => (
          <ConversationRow
            key={c.id}
            conversation={c}
            editing={editingId === c.id}
            restoreFocus={focusId === c.id}
            onFocusRestored={clearFocusId}
            onNavigate={onNavigate}
            onEdit={() => setEditingId(c.id)}
            onEditDone={(options) => {
              setEditingId(null);
              if (options?.restoreFocus) setFocusId(c.id);
            }}
            onDelete={() => deleteConversation(c)}
          />
        ))}
      </ul>
      {hasNextPage && (
        <div className="px-3 pt-3">
          {isFetchingNextPage ? (
            <Skeleton className="h-3.5 w-1/2" />
          ) : (
            <TextAction onClick={() => void fetchNextPage()}>Load more</TextAction>
          )}
        </div>
      )}
    </nav>
  );
}

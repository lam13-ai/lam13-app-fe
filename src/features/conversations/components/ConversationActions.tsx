import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, IconButton, Menu, MenuItem, Popover, iconProps, smallIconProps, usePopover } from '@/components/ui';
import type { Conversation } from '@/types/api';

/** Two-step panel content: the action menu, then the delete confirmation. */
function ActionsPanel({
  conversation,
  view,
  onRename,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  conversation: Conversation;
  view: 'menu' | 'confirm';
  onRename: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const popover = usePopover();
  const titleId = useId();
  const descriptionId = useId();

  if (view === 'confirm') {
    return (
      <div
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        // Keep Tab within the two choices while the confirmation is open (Escape still closes it).
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const buttons = Array.from(e.currentTarget.querySelectorAll('button'));
          const edge = e.shiftKey ? buttons[0] : buttons.at(-1);
          if (document.activeElement === edge) {
            e.preventDefault();
            (e.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
          }
        }}
        className="flex flex-col gap-3 p-2"
      >
        <p id={titleId} className="text-xs font-bold text-fg">
          Delete this conversation?
        </p>
        <p id={descriptionId} className="text-2xs leading-relaxed text-fg-muted">
          <span className="font-bold text-fg">{conversation.title}</span> will be removed permanently.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            // Focus lands on the safe choice.
            autoFocus
            onClick={() => {
              onCancelDelete();
              popover?.close();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              popover?.close();
              onConfirmDelete();
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Menu label={`Actions for ${conversation.title}`}>
      <MenuItem onSelect={onRename} leading={<Pencil {...smallIconProps} />}>
        Rename
      </MenuItem>
      <MenuItem onSelect={onAskDelete} leading={<Trash2 {...smallIconProps} />} tone="danger" keepOpen>
        Delete
      </MenuItem>
    </Menu>
  );
}

/**
 * Overflow menu for one conversation: Rename (inline, handled by the row) and Delete (confirmed in
 * the same popover). The trigger sits beside — not inside — the row link, so opening it never
 * navigates. On desktop with a mouse it appears on hover/focus; on touch devices and in the narrow drawer it is always shown.
 */
export function ConversationActions({
  conversation,
  onRename,
  onDelete,
}: {
  conversation: Conversation;
  onRename: () => void;
  /** Called after confirmation; the list owns the mutation (this row unmounts optimistically). */
  onDelete: () => void;
}) {
  const [view, setView] = useState<'menu' | 'confirm'>('menu');

  return (
    <Popover
      placement="bottom-end"
      className="w-60"
      onOpenChange={(open) => {
        if (!open) setView('menu');
      }}
      trigger={(props) => (
        <IconButton
          {...props}
          label={`Actions for ${conversation.title}`}
          size="sm"
          icon={<MoreHorizontal {...iconProps} />}
          className="md:pointer-fine:opacity-0 md:pointer-fine:group-hover/row:opacity-100 md:pointer-fine:group-focus-within/row:opacity-100 md:pointer-fine:aria-expanded:opacity-100"
        />
      )}
    >
      <ActionsPanel
        conversation={conversation}
        view={view}
        onRename={onRename}
        onAskDelete={() => setView('confirm')}
        onCancelDelete={() => setView('menu')}
        onConfirmDelete={onDelete}
      />
    </Popover>
  );
}

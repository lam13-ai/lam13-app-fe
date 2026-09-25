import type { KeyboardEvent, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { smallIconProps } from './icon';
import { usePopover } from './Popover';

export interface MenuProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/** role="menu" list with arrow-key / Home / End navigation. Place inside a Popover. */
export function Menu({ label, children, className }: MenuProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focus(index + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focus(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focus(0);
        break;
      case 'End':
        e.preventDefault();
        focus(items.length - 1);
        break;
    }
  };

  return (
    <div role="menu" aria-label={label} onKeyDown={onKeyDown} className={cn('flex flex-col gap-0.5', className)}>
      {children}
    </div>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  onSelect: () => void;
  /** When defined the item is a radio item (single-select). */
  checked?: boolean;
  leading?: ReactNode;
  /** `danger` for destructive actions. */
  tone?: 'default' | 'danger';
  /** Keep the popover open after selecting (e.g. to show a confirmation step). */
  keepOpen?: boolean;
}

export function MenuItem({ children, onSelect, checked, leading, tone = 'default', keepOpen = false }: MenuItemProps) {
  const popover = usePopover();
  const isRadio = checked !== undefined;

  return (
    <button
      type="button"
      role={isRadio ? 'menuitemradio' : 'menuitem'}
      aria-checked={isRadio ? checked : undefined}
      tabIndex={-1}
      onClick={() => {
        onSelect();
        if (!keepOpen) popover?.close();
      }}
      className={cn(
        'group flex h-11 w-full items-center justify-between gap-3 rounded-card px-2.5 text-left md:h-8',
        'text-xs font-bold outline-none transition-colors duration-150 ease-standard',
        tone === 'danger' ? 'text-danger' : 'text-fg/80',
        'hover:bg-muted focus-visible:bg-muted aria-checked:bg-muted aria-checked:text-fg active:scale-[0.98]',
      )}
    >
      <span className="flex items-center gap-2">
        {leading}
        {children}
      </span>
      {checked && <Check {...smallIconProps} className="text-fg" />}
    </button>
  );
}

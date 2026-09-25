import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  /** 'left': the mobile sidebar. 'right': a full-height sheet (full width on phones). */
  side?: 'left' | 'right';
}

const sides = {
  left: { panel: 'left-0 w-[min(86vw,300px)] bg-bg-subtle', closed: '-translate-x-full' },
  right: { panel: 'right-0 w-full bg-bg sm:w-[min(480px,100%)] sm:border-l sm:border-hairline', closed: 'translate-x-full' },
};

/** Off-canvas panel. Modal while open; inert while closed. */
export function Drawer({ open, onClose, label, children, side = 'left' }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Content may have focused its own first field (autoFocus); otherwise the panel takes focus.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Modal: Tab cycles within the panel instead of reaching the page behind it.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.tabIndex >= 0 && (el.checkVisibility?.({ visibilityProperty: true }) ?? true));
      const first = focusables[0];
      const last = focusables.at(-1);
      const active = document.activeElement;
      const outside = !panelRef.current.contains(active) || active === panelRef.current;
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  return (
    <div className={cn('fixed inset-0 z-50', !open && 'pointer-events-none')} inert={!open}>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-scrim transition-opacity duration-300 ease-standard',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex flex-col shadow-elevated outline-none',
          sides[side].panel,
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          'transition-transform duration-300 ease-standard',
          open ? 'translate-x-0' : sides[side].closed,
        )}
      >
        {children}
      </div>
    </div>
  );
}

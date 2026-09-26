import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';

/** A right sheet resizable from its left edge (desktop only). The caller owns the width. */
export interface DrawerResize {
  width: number;
  onWidthChange: (width: number) => void;
  min: number;
  max: number;
  /** Accessible name of the resize handle. */
  label: string;
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  /** 'left': the mobile sidebar. 'right': a full-height sheet (full width on phones). */
  side?: 'left' | 'right';
  /** Right side only, desktop widths only: drag or arrow-key resizing from the left edge. */
  resize?: DrawerResize;
}

/** A resized sheet never covers more than this share of the window. */
const MAX_VIEWPORT_SHARE = 0.75;
const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

function clampWidth(width: number, { min, max }: Pick<DrawerResize, 'min' | 'max'>, viewport = window.innerWidth): number {
  const upper = Math.max(min, Math.min(max, Math.floor(viewport * MAX_VIEWPORT_SHARE)));
  return Math.round(Math.min(Math.max(width, min), upper));
}

const subscribeToResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};

/**
 * The sheet's left edge: a vertical separator. Dragging it (pointer) or ← / → (Shift: larger steps),
 * Home / End set the width; the sheet stays anchored right, so width = window width − pointer x.
 */
function ResizeHandle({
  resize,
  dragging,
  setDragging,
}: {
  resize: DrawerResize;
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
}) {
  const width = clampWidth(resize.width, resize);

  // No accidental text selection (and a steady cursor) anywhere while dragging.
  useEffect(() => {
    if (!dragging) return;
    const { userSelect, cursor } = document.body.style;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.body.style.userSelect = userSelect;
      document.body.style.cursor = cursor;
    };
  }, [dragging]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging) resize.onWidthChange(clampWidth(window.innerWidth - e.clientX, resize));
  };
  const stop = () => setDragging(false);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const next =
      e.key === 'ArrowLeft' ? width + step
      : e.key === 'ArrowRight' ? width - step
      : e.key === 'Home' ? resize.min
      : e.key === 'End' ? Number.POSITIVE_INFINITY
      : null;
    if (next === null) return;
    e.preventDefault();
    resize.onWidthChange(clampWidth(next, resize));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={resize.label}
      aria-valuemin={resize.min}
      aria-valuemax={clampWidth(Number.POSITIVE_INFINITY, resize)}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={onKeyDown}
      className="group/resize absolute inset-y-0 left-0 z-10 w-3 -translate-x-1/2 cursor-col-resize touch-none outline-none"
    >
      {/* Invisible at rest (the sheet's own hairline border shows); a thin line on hover, focus and drag. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors duration-150 ease-standard',
          dragging ? 'bg-accent' : 'bg-transparent group-hover/resize:bg-fg/25 group-focus-visible/resize:bg-accent',
        )}
      />
    </div>
  );
}

const sides = {
  left: { panel: 'left-0 w-[min(86vw,300px)] bg-bg-subtle', closed: '-translate-x-full' },
  right: { panel: 'right-0 w-full bg-bg sm:w-[min(480px,100%)] sm:border-l sm:border-hairline', closed: 'translate-x-full' },
};

/** Off-canvas panel. Modal while open; inert while closed. */
export function Drawer({ open, onClose, label, children, side = 'left', resize }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // Phones keep the full-screen sheet; resizing is a desktop affordance.
  const resizable = side === 'right' && resize && isDesktop ? resize : null;
  // Width changes (e.g. Expand / Restore) animate, except while dragging, which must track the pointer.
  const [dragging, setDragging] = useState(false);
  // The width limit follows the window (e.g. an expanded sheet when the window narrows).
  const viewport = useSyncExternalStore(subscribeToResize, () => window.innerWidth, () => 0);

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
        style={resizable ? { width: clampWidth(resizable.width, resizable, viewport) } : undefined}
        className={cn(
          'absolute inset-y-0 flex flex-col shadow-elevated outline-none',
          sides[side].panel,
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          'transition-transform duration-300 ease-standard',
          resizable && !dragging && 'motion-safe:transition-[transform,translate,scale,rotate,width]',
          open ? 'translate-x-0' : sides[side].closed,
        )}
      >
        {resizable && <ResizeHandle resize={resizable} dragging={dragging} setDragging={setDragging} />}
        {children}
      </div>
    </div>
  );
}

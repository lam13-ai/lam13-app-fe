import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/cn';

type Placement = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';

export interface PopoverTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu' | 'dialog';
  'aria-controls': string;
}

export interface PopoverProps {
  trigger: (props: PopoverTriggerProps) => ReactNode;
  children: ReactNode;
  placement?: Placement;
  kind?: 'menu' | 'dialog';
  /**
   * 'trigger' positions the panel against the trigger; 'container' against the nearest
   * positioned ancestor (e.g. open above a whole composer instead of over its text).
   */
  anchor?: 'trigger' | 'container';
  /** Notified when the panel opens or closes (e.g. to reset a multi-step panel). */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const PopoverContext = createContext<{ close: () => void } | null>(null);

/** Lets content (e.g. a MenuItem) close its popover. */
export function usePopover() {
  return useContext(PopoverContext);
}

const placements: Record<Placement, string> = {
  'top-start': 'bottom-full left-0 mb-2.5 origin-bottom-left',
  'top-end': 'bottom-full right-0 mb-2.5 origin-bottom-right',
  'bottom-start': 'top-full left-0 mt-2.5 origin-top-left',
  'bottom-end': 'top-full right-0 mt-2.5 origin-top-right',
};

/**
 * Anchored floating panel (reference §6: rounded-2xl, card/95, blur, shadow-xl, spring).
 * Closes on outside pointer-down and Escape; returns focus to the trigger.
 */
export function Popover({
  trigger,
  children,
  placement = 'top-start',
  kind = 'menu',
  anchor = 'trigger',
  onOpenChange,
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  useEffect(() => {
    onOpenChangeRef.current?.(open);
  }, [open]);
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Escape closes only the innermost layer (e.g. not the mobile drawer around this popover).
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    // Capture phase: runs before outer layers' document listeners.
    document.addEventListener('keydown', onKeyDown, true);

    // Move focus into the panel: the checked item, else the first focusable.
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const target =
        panel?.querySelector<HTMLElement>('[aria-checked="true"]') ??
        panel?.querySelector<HTMLElement>('[role^="menuitem"], button, [href], [tabindex]');
      target?.focus();
    });

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      cancelAnimationFrame(frame);
    };
  }, [open, close]);

  const isTop = placement.startsWith('top');

  return (
    <PopoverContext.Provider value={{ close }}>
      <div ref={wrapperRef} className={cn('inline-flex', anchor === 'trigger' && 'relative')}>
        {trigger({
          ref: triggerRef,
          onClick: () => setOpen((o) => !o),
          'aria-expanded': open,
          'aria-haspopup': kind,
          'aria-controls': id,
        })}
        <div
          ref={panelRef}
          id={id}
          className={cn(
            'absolute z-50 min-w-44 rounded-popover border border-border bg-bg/95 p-1 shadow-popover backdrop-blur-md',
            'duration-300 ease-spring',
            placements[placement],
            open
              ? // Visibility must flip at once on open (not transition) or the rAF focus below lands on a
                // still-hidden panel and silently fails. Closing still fades out before hiding.
                'visible scale-100 translate-y-0 opacity-100 transition-[opacity,scale,translate]'
              : cn('pointer-events-none invisible scale-95 opacity-0 transition-all', isTop ? 'translate-y-3' : '-translate-y-3'),
            className,
          )}
        >
          {children}
        </div>
      </div>
    </PopoverContext.Provider>
  );
}

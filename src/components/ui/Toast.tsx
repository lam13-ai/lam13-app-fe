import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { createId } from '@/lib/id';
import { smallIconProps } from './icon';

type Tone = 'default' | 'danger';

interface ToastItem {
  id: string;
  message: string;
  tone: Tone;
}

interface ShowOptions {
  tone?: Tone;
  durationMs?: number;
}

interface ToastApi {
  show: (message: string, options?: ShowOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, { tone = 'default', durationMs = 4000 }: ShowOptions = {}) => {
      const id = createId();
      setToasts((all) => [...all.slice(-(MAX_VISIBLE - 1)), { id, message, tone }]);
      timers.current.set(id, setTimeout(() => dismiss(id), durationMs));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex max-w-sm animate-enter items-center gap-3 py-2.5 pl-4 pr-2 text-user text-bg shadow-elevated',
              t.tone === 'danger' ? 'bg-danger' : 'bg-fg',
            )}
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="hit-area relative inline-flex size-6 items-center justify-center text-bg/70 transition-colors hover:text-bg"
            >
              <X {...smallIconProps} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

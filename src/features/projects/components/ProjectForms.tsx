import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { toErrorInfo } from '@/api';
import { Button, Spinner, usePopover } from '@/components/ui';

export const FIELD =
  'h-11 w-full border border-border bg-bg px-3 text-base text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring focus-visible:outline-none sm:text-sm md:h-10';

/**
 * A one-field form inside a popover (a new folder, a new name…). `onSubmit` does the change; the popover
 * closes when it succeeds, and the backend's own message is shown when it does not (e.g. a name already taken).
 */
export function NameForm({
  title,
  label,
  initial = '',
  placeholder,
  submitLabel,
  hint,
  maxLength = 200,
  onSubmit,
}: {
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  hint?: ReactNode;
  maxLength?: number;
  onSubmit: (value: string) => Promise<unknown>;
}) {
  const popover = usePopover();
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const name = value.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name || pending) return;
    setPending(true);
    setError(null);
    onSubmit(name).then(
      () => popover?.close(),
      (cause: unknown) => {
        setError(toErrorInfo(cause).message);
        setPending(false);
      },
    );
  };
  return (
    <form noValidate onSubmit={submit} aria-labelledby={`${id}-title`} className="flex flex-col gap-3 p-2 text-left">
      <h2 id={`${id}-title`} className="text-sm font-bold">
        {title}
      </h2>
      <div>
        <label htmlFor={`${id}-name`} className="mb-1.5 block text-xs font-bold">
          {label}
        </label>
        <input
          id={`${id}-name`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={FIELD}
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-danger">
            {error}
          </p>
        ) : (
          hint && (
            <p id={`${id}-hint`} className="mt-1.5 text-2xs leading-relaxed text-fg-muted">
              {hint}
            </p>
          )
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!name || pending} leadingIcon={pending ? <Spinner size={14} state="active" /> : undefined}>
          {submitLabel}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => popover?.close()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A confirmation inside a popover, for something that cannot be undone. Closes when `onConfirm` succeeds. */
export function ConfirmPanel({
  title,
  children,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
}) {
  const popover = usePopover();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const confirm = () => {
    setPending(true);
    setError(null);
    onConfirm().then(
      () => popover?.close(),
      (cause: unknown) => {
        setError(toErrorInfo(cause).message);
        setPending(false);
      },
    );
  };
  return (
    <div role="alertdialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`} className="flex flex-col gap-3 p-2 text-left">
      <div>
        <p id={`${id}-title`} className="text-xs font-bold">
          {title}
        </p>
        <p id={`${id}-text`} className="mt-1 text-2xs leading-relaxed text-fg-muted">
          {children}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" autoFocus onClick={() => popover?.close()}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" disabled={pending} onClick={confirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

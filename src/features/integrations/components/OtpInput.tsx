import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export const CODE_LENGTH = 6;

/**
 * Six one-digit fields for a verification code: typing moves forward, Backspace moves back, arrows move,
 * pasting (or SMS autofill) a whole code fills every field. Non-digits are ignored. `value` is the digits
 * so far (up to six); Enter submits the surrounding form.
 */
export function OtpInput({
  value,
  onChange,
  invalid,
  disabled,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))]?.focus();

  /** Writes `digits` starting at field `at`, then focuses the next empty field. */
  const fill = (at: number, digits: string) => {
    const chars = value.padEnd(CODE_LENGTH, ' ').split('');
    for (let i = 0; i < digits.length && at + i < CODE_LENGTH; i++) chars[at + i] = digits[i]!;
    const next = chars.join('');
    // Keep only the leading run of digits: the code has no gaps.
    onChange((next.match(/^\d*/)?.[0] ?? '').slice(0, CODE_LENGTH));
    focus(at + digits.length);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[i]) onChange(value.slice(0, i));
      else if (i > 0) {
        onChange(value.slice(0, i - 1));
        focus(i - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focus(Math.min(i + 1, value.length));
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    e.preventDefault();
    if (digits) fill(digits.length >= CODE_LENGTH ? 0 : i, digits.slice(0, CODE_LENGTH));
  };

  return (
    <div role="group" aria-label="Verification code" aria-describedby={describedBy} className="flex gap-2">
      {Array.from({ length: CODE_LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ''}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            // Typed past the last digit: it goes to the first empty field, so the code never has gaps.
            if (digits) fill(Math.min(i, value.length), digits.length > 1 && !value[i] ? digits : digits.slice(-1));
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          autoFocus={i === 0}
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? CODE_LENGTH : 1}
          aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
          aria-invalid={invalid || undefined}
          className={cn(
            'h-12 w-full min-w-0 max-w-12 border bg-bg text-center text-lg font-bold tabular-nums text-fg outline-none transition-colors duration-150 ease-standard',
            'focus:ring-1 disabled:opacity-60',
            invalid ? 'border-danger focus:ring-danger/30' : 'border-border focus:border-composer-focus focus:ring-composer-ring',
          )}
        />
      ))}
    </div>
  );
}

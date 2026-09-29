import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { COUNTRIES, countryByCode } from '../lib/phone';

/**
 * Country code + national number as one control. The country is a native <select> (keyboard, screen
 * readers and the phone's own picker) shown compactly as "PK +92"; the number is a `tel` input.
 */
export function PhoneNumberField({
  id,
  countryCode,
  number,
  onCountryChange,
  onNumberChange,
  invalid,
  describedBy,
  disabled,
}: {
  id: string;
  countryCode: string;
  number: string;
  onCountryChange: (code: string) => void;
  onNumberChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}) {
  const country = countryByCode(countryCode);
  return (
    <div
      className={cn(
        'flex h-11 w-full border bg-bg transition-colors duration-150 ease-standard focus-within:ring-1 md:h-10',
        invalid ? 'border-danger focus-within:ring-danger/30' : 'border-border focus-within:border-composer-focus focus-within:ring-composer-ring',
        disabled && 'opacity-60',
      )}
    >
      <div className="relative flex shrink-0 items-center gap-1.5 border-r border-border pl-3 pr-2 text-sm tabular-nums focus-within:bg-muted">
        <span aria-hidden="true">
          <span className="text-fg-muted">{country.code}</span> +{country.dial}
        </span>
        <ChevronDown aria-hidden size={12} strokeWidth={1.75} className="text-fg-muted" />
        <select
          aria-label="Country code"
          value={country.code}
          disabled={disabled}
          onChange={(e) => onCountryChange(e.target.value)}
          className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-default"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} (+{c.dial})
            </option>
          ))}
        </select>
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        autoFocus
        value={number}
        disabled={disabled}
        onChange={(e) => onNumberChange(e.target.value)}
        placeholder="Phone number"
        maxLength={20}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="min-w-0 flex-1 bg-transparent px-3 text-base tabular-nums text-fg outline-none placeholder:text-fg-muted sm:text-sm"
      />
    </div>
  );
}

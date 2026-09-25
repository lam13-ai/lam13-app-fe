import { X } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ScrollArea } from '@/components/ScrollArea';
import { Button, IconButton, iconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ProfileField, ProfileInput } from '@/types/api';
import { EMPTY_FORM, FIELD_LABELS, toProfileInput, validateContact, type ContactFormValues } from '../lib/contacts';

const control = cn(
  'w-full border bg-bg px-3 text-base text-fg outline-none transition-colors duration-150 ease-standard sm:text-sm',
  'placeholder:text-fg-muted focus-visible:outline-none focus:ring-1',
);

interface FieldProps {
  field: ProfileField;
  values: ContactFormValues;
  errors: Partial<Record<ProfileField, string>>;
  onChange: (field: ProfileField, value: string) => void;
  optional?: boolean;
  hint?: string;
  multiline?: boolean;
  type?: 'text' | 'email' | 'tel' | 'url';
  maxLength: number;
  autoFocus?: boolean;
  autoComplete?: string;
}

function Field({ field, values, errors, onChange, optional, hint, multiline, type = 'text', maxLength, autoFocus, autoComplete = 'off' }: FieldProps) {
  const id = useId();
  const error = errors[field];
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const props = {
    id,
    name: field,
    value: values[field],
    maxLength,
    autoFocus,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
    'aria-required': !optional,
    onChange: (e: { target: { value: string } }) => onChange(field, e.target.value),
    className: cn(
      control,
      error ? 'border-danger ring-danger/30 focus:ring-danger/30' : 'border-border focus:border-composer-focus focus:ring-composer-ring',
      multiline ? 'min-h-40 resize-y py-2.5 leading-relaxed' : 'h-11 md:h-10',
    ),
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold">
        {FIELD_LABELS[field]}
        {optional && <span className="font-normal text-fg-muted"> (optional)</span>}
      </label>
      {multiline ? <textarea {...props} rows={7} /> : <input {...props} type={type} autoComplete={autoComplete} />}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-2xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-2xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="eyebrow mb-4">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Add / edit form: name, position and company required; description and contact details optional.
 * Values are trimmed and validated here (the server validates again).
 */
export function ContactForm({
  heading,
  initial = EMPTY_FORM,
  submitLabel,
  pending = false,
  onSubmit,
  onCancel,
  onClose,
}: {
  heading: string;
  initial?: ContactFormValues;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (body: ProfileInput) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const headingId = useId();

  const onChange = (field: ProfileField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors(({ [field]: _cleared, ...rest }) => rest);
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const found = validateContact(values);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      e.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    onSubmit(toProfileInput(values));
  };

  const fieldProps = { values, errors, onChange };

  return (
    <form noValidate aria-labelledby={headingId} onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-hairline pl-5 pr-3">
        <h2 id={headingId} className="min-w-0 flex-1 truncate text-base font-bold">
          {heading}
        </h2>
        <IconButton label="Close" size="md" icon={<X {...iconProps} />} onClick={onClose} />
      </div>

      <ScrollArea className="flex min-h-0 flex-1 flex-col gap-8 px-5 py-6">
        <Group title="Profile">
          <Field field="full_name" {...fieldProps} maxLength={120} autoFocus autoComplete="off" />
          <Field field="position" {...fieldProps} maxLength={120} />
          <Field field="company" {...fieldProps} maxLength={120} />
          <Field
            field="description"
            {...fieldProps}
            optional
            multiline
            maxLength={4000}
            hint="Plain text. What you know about this person and how they like to work."
          />
        </Group>
        <Group title="Contact details">
          <Field field="email" {...fieldProps} optional type="email" maxLength={254} />
          <Field field="phone" {...fieldProps} optional type="tel" maxLength={40} />
          <Field field="linkedin" {...fieldProps} optional type="url" maxLength={300} />
        </Group>
      </ScrollArea>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

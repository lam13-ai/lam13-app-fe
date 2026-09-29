import { ArrowLeft } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { isApiError } from '@/api';
import { Button, Skeleton, Spinner, iconProps } from '@/components/ui';
import type { WhatsAppVerification } from '@/types/api';
import { useWhatsApp } from '../hooks/useWhatsApp';
import { countryByCode, defaultCountryCode, formatPhone, toE164 } from '../lib/phone';
import { CODE_LENGTH, OtpInput } from './OtpInput';
import { PhoneNumberField } from './PhoneNumberField';
import { ConnectedDot, IntegrationRow } from './IntegrationRow';

const DESCRIPTION = 'Connect your WhatsApp number to receive messages and voice notes directly in Lam13.';

/** Whole seconds until `until` (ms), re-rendering while counting down. */
function useSecondsLeft(until: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

function PhoneStep({
  countryCode,
  number,
  onCountryChange,
  onNumberChange,
  onSent,
  onCancel,
}: {
  countryCode: string;
  number: string;
  onCountryChange: (code: string) => void;
  onNumberChange: (value: string) => void;
  onSent: (verification: WhatsAppVerification) => void;
  onCancel: () => void;
}) {
  const { request } = useWhatsApp();
  const id = useId();
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (request.isPending) return;
    const parsed = toE164(countryByCode(countryCode), number);
    if (!parsed.ok) {
      setFieldError(parsed.error);
      return;
    }
    setFieldError(null);
    setFormError(null);
    request.mutate(parsed.value, {
      onSuccess: onSent,
      onError: (error) => {
        if (isApiError(error) && error.code === 'invalid_phone') setFieldError(error.message);
        else setFormError("Couldn't send a verification code. Try again.");
      },
    });
  };

  const describedBy = fieldError ? `${id}-error` : `${id}-hint`;
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-xs font-bold">
          WhatsApp number
        </label>
        <PhoneNumberField
          id={id}
          countryCode={countryCode}
          number={number}
          onCountryChange={(code) => {
            onCountryChange(code);
            setFieldError(null);
          }}
          onNumberChange={(value) => {
            onNumberChange(value);
            setFieldError(null);
          }}
          invalid={Boolean(fieldError)}
          describedBy={describedBy}
          disabled={request.isPending}
        />
        {fieldError ? (
          <p id={`${id}-error`} className="text-2xs text-danger">
            {fieldError}
          </p>
        ) : (
          <p id={`${id}-hint`} className="text-2xs text-fg-muted">
            We&apos;ll send a 6-digit code to this number on WhatsApp.
          </p>
        )}
      </div>
      {formError && (
        <p role="alert" className="text-xs text-danger">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={request.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          aria-busy={request.isPending || undefined}
          leadingIcon={request.isPending ? <Spinner size={14} state="active" /> : undefined}
        >
          {request.isPending ? 'Sending code…' : 'Send verification code'}
        </Button>
      </div>
    </form>
  );
}

function VerifyStep({
  verification,
  onResent,
  onChangeNumber,
  onConnected,
}: {
  verification: WhatsAppVerification & { sentAt: number };
  onResent: (verification: WhatsAppVerification) => void;
  onChangeNumber: () => void;
  onConnected: () => void;
}) {
  const { verify, resend } = useWhatsApp();
  const errorId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Remounts the code fields (clearing and refocusing them) after a wrong code or a new code.
  const [attempt, setAttempt] = useState(0);
  const secondsLeft = useSecondsLeft(verification.sentAt + verification.resend_after_seconds * 1000);
  const busy = verify.isPending || verify.isSuccess;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length < CODE_LENGTH || busy) return;
    setError(null);
    verify.mutate(code, {
      onSuccess: onConnected,
      onError: (err) => {
        setError(
          isApiError(err) && ['invalid_code', 'code_expired', 'no_pending_verification'].includes(err.code)
            ? err.message
            : "Couldn't connect WhatsApp. Try again.",
        );
        if (isApiError(err) && err.code === 'invalid_code') {
          setCode('');
          setAttempt((n) => n + 1);
        }
      },
    });
  };

  const resendCode = () =>
    resend.mutate(undefined, {
      onSuccess: (next) => {
        setError(null);
        setCode('');
        setAttempt((n) => n + 1);
        onResent(next);
      },
      onError: () => setError("Couldn't send a new code. Try again."),
    });

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4" aria-labelledby={`${errorId}-title`}>
      <div className="flex flex-col gap-1">
        <h3 id={`${errorId}-title`} className="text-xs font-bold">
          Verify your WhatsApp number
        </h3>
        <p className="text-xs leading-relaxed text-fg-muted">
          We sent a 6-digit code to <span className="font-bold tabular-nums text-fg">{formatPhone(verification.phone_number)}</span> on
          WhatsApp.
        </p>
        {verification.notice && <p className="text-2xs text-fg-muted">{verification.notice}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <OtpInput
          key={attempt}
          value={code}
          onChange={(next) => {
            setCode(next);
            if (error) setError(null);
          }}
          invalid={Boolean(error)}
          disabled={busy}
          describedBy={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} role="alert" className="text-2xs text-danger">
            {error}
          </p>
        )}
      </div>

      <p className="text-2xs text-fg-muted">
        Didn&apos;t receive the code?{' '}
        {secondsLeft > 0 ? (
          <span className="tabular-nums">Resend code in {secondsLeft}s</span>
        ) : (
          <button
            type="button"
            onClick={resendCode}
            disabled={resend.isPending || busy}
            className="inline-flex min-h-11 items-center gap-1.5 font-bold text-fg underline-offset-4 hover:underline disabled:opacity-60 md:min-h-0"
          >
            {resend.isPending && <Spinner size={12} state="active" />}
            {resend.isPending ? 'Sending…' : 'Resend code'}
          </button>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" leadingIcon={<ArrowLeft {...iconProps} />} onClick={onChangeNumber} disabled={busy}>
          Change number
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={code.length < CODE_LENGTH || busy}
          aria-busy={busy || undefined}
          leadingIcon={busy ? <Spinner size={14} state="active" /> : undefined}
        >
          {busy ? 'Connecting WhatsApp…' : 'Verify'}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {busy ? 'Connecting WhatsApp…' : resend.isSuccess ? 'A new code was sent.' : ''}
      </p>
    </form>
  );
}

function Connected({ phoneNumber }: { phoneNumber: string }) {
  const { disconnect } = useWhatsApp();
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-bold tabular-nums">{formatPhone(phoneNumber)}</p>
        <p className="text-xs leading-relaxed text-fg-muted">Lam13 can now receive your WhatsApp messages and voice notes.</p>
      </div>
      {confirming ? (
        // Confirmed in place, like deleting a contact.
        <div role="alertdialog" aria-labelledby={titleId} aria-describedby={descriptionId} className="flex flex-col gap-3 border-t border-hairline pt-3">
          <div>
            <p id={titleId} className="text-xs font-bold">
              Disconnect WhatsApp?
            </p>
            <p id={descriptionId} className="text-2xs text-fg-muted">
              You will stop receiving WhatsApp messages and voice notes in Lam13.
            </p>
          </div>
          {disconnect.isError && (
            <p role="alert" className="text-xs text-danger">
              Couldn&apos;t disconnect WhatsApp. Try again.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" autoFocus disabled={disconnect.isPending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              aria-busy={disconnect.isPending || undefined}
              disabled={disconnect.isPending}
              leadingIcon={disconnect.isPending ? <Spinner size={14} state="active" /> : undefined}
              onClick={() => disconnect.mutate()}
            >
              {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              disconnect.reset();
              setConfirming(true);
            }}
          >
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}

type Step = { kind: 'intro' } | { kind: 'phone' } | { kind: 'verify'; verification: WhatsAppVerification & { sentAt: number } };

/**
 * WhatsApp on the Integrations page: connect a number (number → code → verify), see it, disconnect it.
 * Everything goes through `api.whatsapp` (a local mock until the backend integration exists).
 */
export function WhatsAppIntegration() {
  const { status } = useWhatsApp();
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  // Kept across steps: "Change number" and errors return to what was typed.
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [number, setNumber] = useState('');
  const connected = status.data?.status === 'connected' ? status.data.phone_number : null;
  const toVerify = (verification: WhatsAppVerification) => setStep({ kind: 'verify', verification: { ...verification, sentAt: Date.now() } });

  let action = null;
  let body = null;
  if (status.isPending) {
    action = <Skeleton className="h-9 w-36" />;
  } else if (status.isError) {
    body = (
      <p role="alert" className="flex flex-wrap items-center gap-x-2 text-xs text-danger">
        Couldn&apos;t load your WhatsApp connection.
        <button
          type="button"
          onClick={() => void status.refetch()}
          className="min-h-11 font-bold text-fg underline-offset-4 hover:underline md:min-h-0"
        >
          Try again
        </button>
      </p>
    );
  } else if (connected) {
    action = <ConnectedDot />;
    body = <Connected phoneNumber={connected} />;
  } else if (step.kind === 'intro') {
    action = (
      <Button variant="outline" size="sm" onClick={() => setStep({ kind: 'phone' })}>
        Connect WhatsApp
      </Button>
    );
  } else if (step.kind === 'phone') {
    body = (
      <PhoneStep
        countryCode={countryCode}
        number={number}
        onCountryChange={setCountryCode}
        onNumberChange={setNumber}
        onSent={toVerify}
        onCancel={() => setStep({ kind: 'intro' })}
      />
    );
  } else {
    body = (
      <VerifyStep
        verification={step.verification}
        onResent={toVerify}
        onChangeNumber={() => setStep({ kind: 'phone' })}
        // Connected: the flow starts over if the number is ever disconnected.
        onConnected={() => {
          setStep({ kind: 'intro' });
          setNumber('');
        }}
      />
    );
  }

  return (
    <IntegrationRow name="WhatsApp" description={DESCRIPTION} action={action}>
      {body}
    </IntegrationRow>
  );
}

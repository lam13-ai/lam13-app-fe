import type { WhatsAppConnection, WhatsAppVerification } from '@/types/api';
import { ApiError } from '../errors';
import type { WhatsAppService } from '../services';
import { sleep } from './utils';

/**
 * Local stand-in for WhatsApp verification, used by BOTH adapters until the backend integration exists.
 * It sends nothing: a fixed demo code verifies, `EXPIRED_DEMO_CODE` simulates an expired code, and any
 * other six digits are "incorrect". The demo code is only hinted in development builds — never in
 * production, where nobody could receive it. It has no Lam13 WhatsApp number, so `contact_link` is null
 * (no "Open WhatsApp"), and linking from WhatsApp is not simulated here (tests stub `status`).
 * Replace with the real service — the UI does not change.
 */
export const DEMO_CODE = '123456';
export const EXPIRED_DEMO_CODE = '000000';
export const RESEND_AFTER_SECONDS = 30;

const E164 = /^\+[1-9]\d{7,14}$/;

export function createMockWhatsApp({
  respond = () => sleep(700),
  resendAfterSeconds = RESEND_AFTER_SECONDS,
}: { respond?: () => Promise<void>; resendAfterSeconds?: number } = {}): WhatsAppService {
  const DISCONNECTED: WhatsAppConnection = { status: 'disconnected', phone_number: null, method: null, contact_link: null };
  let connection: WhatsAppConnection = { ...DISCONNECTED };
  let pending: string | null = null;

  const verification = (phone_number: string): WhatsAppVerification => ({
    phone_number,
    resend_after_seconds: resendAfterSeconds,
    notice: import.meta.env.DEV ? `Development preview: no WhatsApp message is sent. Use ${DEMO_CODE} to connect.` : null,
  });

  return {
    async status() {
      await respond();
      return { ...connection };
    },
    async requestVerification(phoneNumber) {
      await respond();
      if (!E164.test(phoneNumber)) throw new ApiError(422, 'invalid_phone', 'Enter a valid WhatsApp number.');
      pending = phoneNumber;
      return verification(phoneNumber);
    },
    async resendCode() {
      await respond();
      if (!pending) throw new ApiError(409, 'no_pending_verification', 'Request a verification code first.');
      return verification(pending);
    },
    async verifyCode(code) {
      await respond();
      if (!pending) throw new ApiError(409, 'no_pending_verification', 'Request a verification code first.');
      if (code === EXPIRED_DEMO_CODE) throw new ApiError(410, 'code_expired', 'Your verification code has expired. Request a new one.');
      if (code !== DEMO_CODE) throw new ApiError(422, 'invalid_code', 'That verification code is incorrect.');
      connection = { status: 'connected', phone_number: pending, method: 'lam13_to_whatsapp', contact_link: null };
      pending = null;
      return { ...connection };
    },
    async disconnect() {
      await respond();
      connection = { ...DISCONNECTED };
      pending = null;
      return { ...connection };
    },
  };
}

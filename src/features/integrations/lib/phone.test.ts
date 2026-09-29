import { describe, expect, it, vi } from 'vitest';
import { createMockWhatsApp, DEMO_CODE, EXPIRED_DEMO_CODE } from '@/api/mock/whatsapp';
import { countryByCode, defaultCountryCode, formatPhone, nationalDigits, toE164 } from './phone';

describe('phone numbers', () => {
  it('defaults to the browser locale’s country when offered, else the US', () => {
    expect(defaultCountryCode(['en-PK'])).toBe('PK');
    expect(defaultCountryCode(['ar-SA', 'en'])).toBe('SA');
    expect(defaultCountryCode(['fr'])).toBe('FR'); // language → likely region
    expect(defaultCountryCode(['xx-ZZ', 'not a locale'])).toBe('US');
    expect(defaultCountryCode([])).toBe('US');
  });

  it('normalises what people type and validates the national number length', () => {
    const pk = countryByCode('PK');
    expect(nationalDigits('0300 123-4567')).toBe('3001234567');
    expect(toE164(pk, '0300 123-4567')).toEqual({ ok: true, value: '+923001234567' });
    expect(toE164(pk, '(300) 1234567')).toEqual({ ok: true, value: '+923001234567' });
    expect(toE164(pk, '')).toEqual({ ok: false, error: 'Enter your WhatsApp number.' });
    expect(toE164(pk, '300 12')).toMatchObject({ ok: false, error: expect.stringContaining('Pakistan') });
    expect(toE164(pk, '300abc4567')).toEqual({ ok: false, error: 'Use digits only.' });
    expect(toE164(countryByCode('SA'), '050 123 4567')).toEqual({ ok: true, value: '+966501234567' });
  });

  it('formats E.164 for display', () => {
    expect(formatPhone('+923001234567')).toBe('+92 300 1234567');
    expect(formatPhone('+966501234567')).toBe('+966 501 234567');
    expect(formatPhone('+15551234567')).toBe('+1 555 1234567');
  });
});

describe('mock WhatsAppService', () => {
  const service = () => createMockWhatsApp({ respond: () => Promise.resolve(), resendAfterSeconds: 30 });

  it('requests, resends and verifies with the demo code; other codes are incorrect or expired', async () => {
    const api = service();
    expect(await api.status()).toMatchObject({ status: 'disconnected', phone_number: null });
    await expect(api.verifyCode(DEMO_CODE)).rejects.toMatchObject({ status: 409, code: 'no_pending_verification' });
    await expect(api.requestVerification('923001234567')).rejects.toMatchObject({ status: 422, code: 'invalid_phone' });

    expect(await api.requestVerification('+923001234567')).toMatchObject({ phone_number: '+923001234567', resend_after_seconds: 30 });
    expect((await api.resendCode()).phone_number).toBe('+923001234567');
    await expect(api.verifyCode('111111')).rejects.toMatchObject({ status: 422, message: 'That verification code is incorrect.' });
    await expect(api.verifyCode(EXPIRED_DEMO_CODE)).rejects.toMatchObject({ status: 410, code: 'code_expired' });
    expect(await api.verifyCode(DEMO_CODE)).toMatchObject({ status: 'connected', phone_number: '+923001234567' });
    expect((await api.status()).status).toBe('connected');

    expect(await api.disconnect()).toMatchObject({ status: 'disconnected', phone_number: null, method: null });
    await expect(api.resendCode()).rejects.toMatchObject({ status: 409 });
  });

  it('records the Lam13-started method, has no Lam13 WhatsApp link, and never hints the demo code in production', async () => {
    const api = service();
    expect((await api.status()).contact_link).toBeNull();
    expect((await api.requestVerification('+923001234567')).notice).toContain(DEMO_CODE); // development / tests
    expect((await api.verifyCode(DEMO_CODE)).method).toBe('lam13_to_whatsapp');

    vi.stubEnv('DEV', false);
    try {
      const prod = service();
      expect((await prod.requestVerification('+923001234567')).notice).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

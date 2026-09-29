/** Countries offered in the WhatsApp number field. `lengths`: valid national-number lengths (digits). */
export interface Country {
  code: string;
  name: string;
  dial: string;
  lengths: readonly number[];
}

// ponytail: a short list of the regions Lam13 works in; add countries (or a full dataset) as users need them.
export const COUNTRIES: readonly Country[] = [
  { code: 'AU', name: 'Australia', dial: '61', lengths: [9] },
  { code: 'BH', name: 'Bahrain', dial: '973', lengths: [8] },
  { code: 'CA', name: 'Canada', dial: '1', lengths: [10] },
  { code: 'EG', name: 'Egypt', dial: '20', lengths: [10] },
  { code: 'FR', name: 'France', dial: '33', lengths: [9] },
  { code: 'DE', name: 'Germany', dial: '49', lengths: [10, 11] },
  { code: 'IN', name: 'India', dial: '91', lengths: [10] },
  { code: 'JO', name: 'Jordan', dial: '962', lengths: [9] },
  { code: 'KW', name: 'Kuwait', dial: '965', lengths: [8] },
  { code: 'OM', name: 'Oman', dial: '968', lengths: [8] },
  { code: 'PK', name: 'Pakistan', dial: '92', lengths: [10] },
  { code: 'QA', name: 'Qatar', dial: '974', lengths: [8] },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', lengths: [9] },
  { code: 'SG', name: 'Singapore', dial: '65', lengths: [8] },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', lengths: [9] },
  { code: 'GB', name: 'United Kingdom', dial: '44', lengths: [10] },
  { code: 'US', name: 'United States', dial: '1', lengths: [10] },
];

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: string): Country {
  return byCode.get(code) ?? byCode.get('US')!;
}

/** The viewer's region from their browser locale ("en-PK" → PK), when it is offered; else the US. */
export function defaultCountryCode(locales: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): string {
  for (const locale of locales) {
    try {
      const region = new Intl.Locale(locale).maximize().region;
      if (region && byCode.has(region)) return region;
    } catch {
      // ignore malformed locales
    }
  }
  return 'US';
}

/** Digits of a national number as typed: spaces, dashes, brackets and a leading trunk 0 are dropped. */
export function nationalDigits(input: string): string {
  return input.replace(/\D/g, '').replace(/^0+/, '');
}

/** E.164 for a valid number, else an error message for the field. */
export function toE164(country: Country, input: string): { ok: true; value: string } | { ok: false; error: string } {
  const digits = nationalDigits(input);
  if (!digits) return { ok: false, error: 'Enter your WhatsApp number.' };
  if (/[^\d\s()+.-]/.test(input)) return { ok: false, error: 'Use digits only.' };
  if (!country.lengths.includes(digits.length)) {
    return { ok: false, error: `Enter a valid ${country.name} number (${country.lengths.join(' or ')} digits after +${country.dial}).` };
  }
  return { ok: true, value: `+${country.dial}${digits}` };
}

/** "+923001234567" → "+92 300 1234567" (country code, then the national number in two groups). */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  // Longest dial code first (e.g. +966 before +96…).
  const dial = [...new Set(COUNTRIES.map((c) => c.dial))]
    .sort((a, b) => b.length - a.length)
    .find((d) => digits.startsWith(d));
  if (!dial) return e164;
  const national = digits.slice(dial.length);
  return `+${dial} ${national.slice(0, 3)} ${national.slice(3)}`.trim();
}

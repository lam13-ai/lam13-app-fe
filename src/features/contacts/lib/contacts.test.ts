import { describe, expect, it } from 'vitest';
import type { Profile } from '@/types/api';
import { applyChanges, EMPTY_FORM, filterContacts, linkedinHref, toProfileInput, validateContact } from './contacts';

const profile = (full_name: string, extra: Partial<Profile> = {}): Profile => ({
  id: full_name,
  full_name,
  position: 'Engineer',
  company: 'Acme',
  description: '',
  email: null,
  phone: null,
  linkedin: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('contacts lib', () => {
  const list = [
    profile('Zoe', { company: 'Northwind', updated_at: '2026-03-01T00:00:00Z' }),
    profile('Adam', { position: 'CFO', email: 'adam@finch.example', updated_at: '2026-02-01T00:00:00Z' }),
    profile('Mia', { updated_at: '2026-04-01T00:00:00Z' }),
  ];
  const names = (ps: Profile[]) => ps.map((p) => p.full_name);

  it('searches name, company, position and email (case-insensitive) and sorts', () => {
    expect(names(filterContacts(list, '', 'all'))).toEqual(['Adam', 'Mia', 'Zoe']);
    expect(names(filterContacts(list, '', 'recent'))).toEqual(['Mia', 'Zoe', 'Adam']);
    expect(names(filterContacts(list, ' zo ', 'all'))).toEqual(['Zoe']);
    expect(names(filterContacts(list, 'NORTH', 'all'))).toEqual(['Zoe']);
    expect(names(filterContacts(list, 'cfo', 'all'))).toEqual(['Adam']);
    expect(names(filterContacts(list, 'finch.example', 'all'))).toEqual(['Adam']);
  });

  it('validates required fields and email, and builds a trimmed body with null optionals', () => {
    expect(Object.keys(validateContact(EMPTY_FORM))).toEqual(['full_name', 'position', 'company']);
    const filled = { ...EMPTY_FORM, full_name: ' Ada ', position: 'CTO', company: 'Acme', email: 'nope' };
    expect(validateContact(filled)).toEqual({ email: expect.stringContaining('valid email') });
    expect(toProfileInput({ ...filled, email: '  ' })).toEqual({
      full_name: 'Ada',
      position: 'CTO',
      company: 'Acme',
      description: '',
      email: null,
      phone: null,
      linkedin: null,
    });
  });

  it('applies only the suggested fields', () => {
    const p = profile('Ada', { email: 'old@acme.example' });
    expect(applyChanges(p, [{ field: 'email', to: null }, { field: 'position', to: 'CTO' }])).toEqual({ ...p, email: null, position: 'CTO' });
  });

  it('only ever links LinkedIn over http(s)', () => {
    expect(linkedinHref('linkedin.com/in/ada')).toBe('https://linkedin.com/in/ada');
    expect(linkedinHref('https://linkedin.com/in/ada')).toBe('https://linkedin.com/in/ada');
    expect(linkedinHref('javascript:alert(1)')).toBe('https://javascript:alert(1)');
  });
});

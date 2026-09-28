import { describe, expect, it } from 'vitest';
import type { Profile, ProfileUpdateSuggestion } from '@/types/api';
import { applyChanges, currentSuggestions, EMPTY_FORM, filterContacts, linkedinHref, toProfileInput, validateContact } from './contacts';

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

describe('currentSuggestions (only the newest suggestion per group, while pending)', () => {
  const s = (id: string, over: Partial<ProfileUpdateSuggestion>): ProfileUpdateSuggestion => ({
    id,
    kind: 'update',
    profile_id: 'daniel',
    source_type: 'meeting',
    source_id: 'm',
    source_title: null,
    created_at: '2026-09-28T10:00:00Z',
    status: 'pending',
    changes: [],
    ...over,
  });
  const ids = (list: ProfileUpdateSuggestion[]) => list.map((x) => x.id);

  it('new-contact suggestions: only the newest of all of them, by created_at — not by array order', () => {
    const omar = s('omar', { kind: 'create', profile_id: '', created_at: '2026-09-28T10:00:00Z' });
    const ali = s('ali', { kind: 'create', profile_id: '', created_at: '2026-09-28T10:05:00Z' });
    const usman = s('usman', { kind: 'create', profile_id: '', created_at: '2026-09-28T10:10:00Z' });
    expect(ids(currentSuggestions([omar, ali, usman]))).toEqual(['usman']);
    expect(ids(currentSuggestions([usman, omar, ali]))).toEqual(['usman']);
  });

  it('updates: the newest per contact, and every contact keeps its own', () => {
    const list = [
      s('daniel-1', { created_at: '2026-09-28T09:00:00Z' }),
      s('daniel-3', { created_at: '2026-09-28T11:00:00Z' }),
      s('daniel-2', { created_at: '2026-09-28T10:00:00Z' }),
      s('hannah-1', { profile_id: 'hannah', created_at: '2026-09-28T08:00:00Z' }),
      s('maya-1', { profile_id: 'maya', created_at: '2026-09-27T08:00:00Z' }),
      s('new-1', { kind: 'create', profile_id: '', created_at: '2026-09-28T07:00:00Z' }),
    ];
    expect(ids(currentSuggestions(list)).sort()).toEqual(['daniel-3', 'hannah-1', 'maya-1', 'new-1']);
  });

  it('a decided newest suggestion hides the older pending ones (nothing resurfaces)', () => {
    const list = [
      s('daniel-1', { created_at: '2026-09-28T09:00:00Z' }),
      s('daniel-2', { created_at: '2026-09-28T10:00:00Z', status: 'approved' }),
      s('new-old', { kind: 'create', profile_id: '', created_at: '2026-09-28T09:00:00Z' }),
      s('new-newest', { kind: 'create', profile_id: '', created_at: '2026-09-28T10:00:00Z', status: 'rejected' }),
    ];
    expect(currentSuggestions(list)).toEqual([]);
  });

  it('parses the server timestamps (offset-aware), and breaks exact ties by the larger (newer) id', () => {
    const utc = s('a', { created_at: '2026-09-28T10:30:00Z' });
    const plus5 = s('b', { created_at: '2026-09-28T15:00:00+05:00' }); // 10:00 UTC: older despite the larger clock
    expect(ids(currentSuggestions([plus5, utc]))).toEqual(['a']);
    const tie = [s('66f0000000000000000000a1', {}), s('66f0000000000000000000b2', {})];
    expect(ids(currentSuggestions(tie))).toEqual(['66f0000000000000000000b2']);
  });
});

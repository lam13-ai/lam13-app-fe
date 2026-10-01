import { describe, expect, it } from 'vitest';
import type { Profile, ProfileUpdateSuggestion } from '@/types/api';
import {
  applyChanges,
  currentSuggestions,
  EMPTY_FORM,
  filterContacts,
  lineDiff,
  linkedinHref,
  mergedSourcesText,
  sourceText,
  toProfileInput,
  validateContact,
} from './contacts';

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

  it('new-contact suggestions: every pending person shows, newest first (the server merges revisions of one person)', () => {
    const omar = s('omar', { kind: 'create', profile_id: '', created_at: '2026-09-28T10:00:00Z' });
    const ali = s('ali', { kind: 'create', profile_id: '', created_at: '2026-09-28T10:05:00Z' });
    const usman = s('usman', { kind: 'create', profile_id: '', created_at: '2026-09-28T10:10:00Z' });
    const merged = s('omar-old', { kind: 'create', profile_id: '', created_at: '2026-09-28T09:00:00Z', status: 'superseded' });
    expect(ids(currentSuggestions([omar, ali, usman, merged]))).toEqual(['usman', 'ali', 'omar']);
    expect(ids(currentSuggestions([usman, omar, ali]))).toEqual(['usman', 'ali', 'omar']);
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
      s('new-old', { kind: 'create', profile_id: '', created_at: '2026-09-28T09:00:00Z', status: 'superseded' }),
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

describe('currentSuggestions — update revisions for one contact', () => {
  const rev = (n: number, created_at: string, over: Partial<ProfileUpdateSuggestion> = {}): ProfileUpdateSuggestion => ({
    id: `rev-${n}`,
    kind: 'update',
    profile_id: 'daniel',
    source_type: 'meeting',
    source_id: 'm',
    source_title: `Revision test #${n} (demo)`,
    created_at,
    status: 'pending',
    changes: [{ field: 'position', to: `Demo position — revision ${n}` }],
    ...over,
  });
  const shown = (list: ProfileUpdateSuggestion[]) => currentSuggestions(list).map((s) => s.id);

  it('one revision is shown; with two or three, only the newest by created_at', () => {
    const r1 = rev(1, '2026-09-28T10:00:00Z');
    const r2 = rev(2, '2026-09-28T10:01:00Z');
    const r3 = rev(3, '2026-09-28T10:02:00Z');
    expect(shown([r1])).toEqual(['rev-1']);
    expect(shown([r1, r2])).toEqual(['rev-2']);
    expect(shown([r3, r1, r2])).toEqual(['rev-3']);
    // created_at decides, not the id: an older timestamp with a "larger" id still loses.
    expect(shown([rev(9, '2026-09-28T09:00:00Z'), r2])).toEqual(['rev-2']);
  });

  it('equal timestamps fall back to the larger (newer) id; a decided newest revision keeps older ones hidden', () => {
    const same = '2026-09-28T10:00:00Z';
    expect(shown([{ ...rev(1, same), id: '66f00000000000000000000a' }, { ...rev(2, same), id: '66f00000000000000000000b' }])).toEqual([
      '66f00000000000000000000b',
    ]);
    expect(shown([rev(1, '2026-09-28T10:00:00Z'), rev(2, '2026-09-28T10:01:00Z', { status: 'approved' })])).toEqual([]);
  });
});

describe('suggestion sources and profile changes', () => {
  const base = { source_type: 'meeting' as const, source_title: 'Steering committee' };

  it('labels the source by type, and lists merged sources once each', () => {
    expect(sourceText(base)).toBe('From meeting · Steering committee');
    expect(sourceText({ source_type: 'voice_call', source_title: null })).toBe('From voice call');
    const suggestion = {
      id: 'x', kind: 'update' as const, profile_id: 'p', source_id: '', created_at: '', status: 'pending' as const, changes: [],
      source_type: 'chat' as const, source_title: null,
      merged_sources: [{ type: 'meeting' as const, title: 'Steering committee' }, { type: 'voice_call' as const, title: null }, { type: 'meeting' as const, title: 'Steering committee' }],
    };
    expect(mergedSourcesText(suggestion)).toBe('Also includes: Steering committee · voice call');
    expect(mergedSourcesText({ ...suggestion, merged_sources: undefined })).toBe('');
  });

  it('diffs a rewritten profile line by line', () => {
    const before = 'Likes\n- One-pagers\n- Benchmarks';
    const after = 'Likes\n- One-pagers\nDislikes\n- Long decks';
    expect(lineDiff(before, after)).toEqual([
      { kind: 'same', text: 'Likes' },
      { kind: 'same', text: '- One-pagers' },
      { kind: 'added', text: 'Dislikes' },
      { kind: 'added', text: '- Long decks' },
      { kind: 'removed', text: '- Benchmarks' },
    ]);
    expect(lineDiff('', 'a')).toEqual([{ kind: 'added', text: 'a' }]);
  });
});

import { describe, expect, it } from 'vitest';
import type { ProfileInput } from '@/types/api';
import { createMockAdapter, INSTANT_TIMING } from './mockAdapter';

function setup() {
  let t = Date.parse('2026-09-25T12:00:00Z');
  const api = createMockAdapter({ timing: INSTANT_TIMING, now: () => t });
  return { api, tick: (ms = 60_000) => (t += ms), iso: () => new Date(t).toISOString() };
}

const input = (overrides: Partial<ProfileInput> = {}): ProfileInput => ({
  full_name: 'Ada Example',
  position: 'Engineer',
  company: 'Acme',
  description: '',
  email: null,
  phone: null,
  linkedin: null,
  ...overrides,
});

describe('mock adapter — profiles', () => {
  it('lists contacts A–Z and 404s unknown ids', async () => {
    const { api } = setup();
    const { items } = await api.profiles.list();
    expect(items.map((p) => p.full_name)).toEqual([
      'Daniel Brandt',
      'Hannah Lee',
      'Maya Okafor',
      'Priya Raman',
      'Saqlain Haider',
      'Tomás Alvarez',
    ]);
    await expect(api.profiles.get('missing')).rejects.toMatchObject({ status: 404, code: 'profile_not_found' });
  });

  it('creates with trimming, null optional fields and timestamps; validates required fields and email', async () => {
    const { api, iso } = setup();
    const created = await api.profiles.create(input({ full_name: '  Ada Example ', email: '  ', description: ' Notes ' }));
    expect(created).toMatchObject({ full_name: 'Ada Example', description: 'Notes', email: null, created_at: iso(), updated_at: iso() });
    expect(await api.profiles.get(created.id)).toEqual(created);

    await expect(api.profiles.create(input({ full_name: ' ', company: '' }))).rejects.toMatchObject({
      status: 422,
      details: { full_name: 'required', company: 'required' },
    });
    await expect(api.profiles.create(input({ email: 'not-an-email' }))).rejects.toMatchObject({ details: { email: 'invalid' } });
  });

  it('updates (setting updated_at) and deletes a contact together with its suggestions', async () => {
    const { api, tick, iso } = setup();
    tick();
    const updated = await api.profiles.update('priya-raman', { position: ' VP Data ', phone: '+1 555 0100' });
    expect(updated).toMatchObject({ position: 'VP Data', phone: '+1 555 0100', updated_at: iso() });
    await expect(api.profiles.update('priya-raman', { position: '' })).rejects.toMatchObject({ status: 422 });

    await api.profiles.delete('saqlain-haider');
    await expect(api.profiles.get('saqlain-haider')).rejects.toMatchObject({ status: 404 });
    expect((await api.profileSuggestions.list({ profile_id: 'saqlain-haider' })).items).toEqual([]);
  });
});

describe('mock adapter — profile suggestions', () => {
  it('lists pending suggestions, filterable by profile', async () => {
    const { api } = setup();
    expect((await api.profileSuggestions.list({ status: 'pending' })).items).toHaveLength(3);
    const saqlain = await api.profileSuggestions.list({ profile_id: 'saqlain-haider' });
    expect(saqlain.items.map((s) => s.changes.map((c) => c.field))).toEqual([['description'], ['position']]);
  });

  it('approve applies exactly the suggested changes, sets updated_at, and can only happen once', async () => {
    const { api, tick, iso } = setup();
    const before = await api.profiles.get('saqlain-haider');
    tick();
    const { profile, suggestion } = await api.profileSuggestions.approve('sug-saqlain-position');
    expect(suggestion.status).toBe('approved');
    expect(profile).toEqual({ ...before, position: 'Senior Product Manager', updated_at: iso() });
    expect(await api.profiles.get('saqlain-haider')).toEqual(profile);
    await expect(api.profileSuggestions.approve('sug-saqlain-position')).rejects.toMatchObject({
      status: 409,
      code: 'suggestion_not_pending',
    });
  });

  it('reject (and listing) never changes the canonical profile', async () => {
    const { api, tick } = setup();
    const before = await api.profiles.get('saqlain-haider');
    await api.profileSuggestions.list();
    tick();
    expect((await api.profileSuggestions.reject('sug-saqlain-description')).status).toBe('rejected');
    expect(await api.profiles.get('saqlain-haider')).toEqual(before);
    expect((await api.profileSuggestions.list({ status: 'pending', profile_id: 'saqlain-haider' })).items).toHaveLength(1);
    await expect(api.profileSuggestions.approve('sug-saqlain-description')).rejects.toMatchObject({ status: 409 });
  });

  it('can fail writes to exercise rollback', async () => {
    const api = createMockAdapter({ timing: INSTANT_TIMING, failProfileWrites: true });
    const before = await api.profiles.get('saqlain-haider');
    await expect(api.profileSuggestions.approve('sug-saqlain-position')).rejects.toMatchObject({ status: 503 });
    expect(await api.profiles.get('saqlain-haider')).toEqual(before);
  });
});

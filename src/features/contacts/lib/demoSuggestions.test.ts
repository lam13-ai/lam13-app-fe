import { describe, expect, it } from 'vitest';
import type { Profile, ProfileUpdateSuggestion } from '@/types/api';
import { demoRevisionContact, demoRevisionSuggestion, nextDemoRevision, nextDemoSuggestion } from './demoSuggestions';

// TODO(temporary): tests for the /contacts/test-adding-suggestions demo control.
const nameAfter = (shown: string | undefined) => nextDemoSuggestion(shown).fields.full_name;

describe('nextDemoSuggestion (temporary demo control)', () => {
  it('follows the suggestion on screen: none → Omar → Leila → Tomás → Omar', () => {
    expect(nameAfter(undefined)).toBe('Omar Siddiqui');
    expect(nameAfter('Omar Siddiqui')).toBe('Leila Haddad');
    expect(nameAfter('Leila Haddad')).toBe('Tomás Reyes');
    expect(nameAfter('Tomás Reyes')).toBe('Omar Siddiqui');
    expect(nameAfter('Someone New')).toBe('Omar Siddiqui'); // not a demo person
  });

  it('keeps no state between calls: the same input always gives the same person', () => {
    expect([nameAfter('Leila Haddad'), nameAfter('Leila Haddad'), nameAfter('Leila Haddad')]).toEqual([
      'Tomás Reyes',
      'Tomás Reyes',
      'Tomás Reyes',
    ]);
  });

  it('sends the backend CreateSuggestionRequest for a new contact', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    expect(nextDemoSuggestion(undefined, now)).toEqual({
      contact_id: null,
      fields: {
        full_name: 'Omar Siddiqui',
        position: 'Head of Procurement',
        company: 'Northgate Health Trust',
        description: 'Leads procurement and vendor selection for Northgate’s digital programmes.',
        email: 'omar.siddiqui@northgate.example',
        phone: '+1 202-555-0142',
        linkedin: 'linkedin.com/in/omar-siddiqui-demo',
      },
      // Distinct from the earlier Swagger example (“Vendor Shortlist Review”), so the new card is recognisable.
      reason: 'Joined the procurement planning call as the new vendor-selection lead.',
      source: { type: 'meeting', ref_id: `demo-${now.getTime()}`, title: 'Procurement Planning Call (demo)', occurred_at: now.toISOString() },
    });
  });
});

describe('update-revision demo (temporary)', () => {
  const profile = (id: string, full_name: string) => ({ id, full_name }) as Profile;
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

  it('finds Daniel Brandt by exact name in the loaded contacts; none or several → null', () => {
    expect(demoRevisionContact([profile('h', 'Hannah Lee'), profile('d', ' daniel brandt ')])?.id).toBe('d');
    expect(demoRevisionContact([profile('h', 'Hannah Lee'), profile('x', 'Daniel Brandtson')])).toBeNull();
    expect(demoRevisionContact([profile('d1', 'Daniel Brandt'), profile('d2', 'Daniel Brandt')])).toBeNull();
  });

  it('numbers revisions from the server data (any status), per contact: none → 1, after 1 and 2 → 3', () => {
    expect(nextDemoRevision([], 'daniel')).toBe(1);
    const list = [
      s('r1', { reason: 'Demo revision 1: …', status: 'rejected' }),
      s('r2', { reason: 'Demo revision 2: …' }),
      s('other', { reason: 'Demo revision 9: …', profile_id: 'hannah' }),
      s('create', { reason: 'Demo revision 7: …', kind: 'create', profile_id: '' }),
      s('real', { reason: 'Mentioned in the board meeting' }),
    ];
    expect(nextDemoRevision(list, 'daniel')).toBe(3);
  });

  it('sends an update suggestion for that contact id with a revision-numbered position', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    expect(demoRevisionSuggestion('c1', 2, now)).toEqual({
      contact_id: 'c1',
      fields: { position: 'Demo position — revision 2' },
      reason: 'Demo revision 2: testing that only the newest update suggestion is shown.',
      source: { type: 'meeting', ref_id: `demo-revision-2-${now.getTime()}`, title: 'Revision test #2 (demo)', occurred_at: now.toISOString() },
    });
  });
});

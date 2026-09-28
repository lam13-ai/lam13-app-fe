import { describe, expect, it } from 'vitest';
import { nextDemoSuggestion } from './demoSuggestions';

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

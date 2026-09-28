import type { TestSuggestionBody } from '@/api';
import type { Profile, ProfileUpdateSuggestion } from '@/types/api';

/*
 * TODO(temporary): demo control for /contacts/test-adding-suggestions. Remove when AI/Granola suggestion
 * generation is integrated. The endpoint stores exactly what it is sent, so the demo sends one of these
 * fictional people (`.example` addresses) as a new-contact suggestion from a made-up meeting. Each click
 * sends the person after the one currently shown (Omar → Leila → Tomás → Omar), so the card always changes.
 */
const SAMPLES: { fields: TestSuggestionBody['fields']; reason: string; meeting: string }[] = [
  {
    fields: {
      full_name: 'Omar Siddiqui',
      position: 'Head of Procurement',
      company: 'Northgate Health Trust',
      description: 'Leads procurement and vendor selection for Northgate’s digital programmes.',
      email: 'omar.siddiqui@northgate.example',
      phone: '+1 202-555-0142',
      linkedin: 'linkedin.com/in/omar-siddiqui-demo',
    },
    reason: 'Joined the procurement planning call as the new vendor-selection lead.',
    meeting: 'Procurement Planning Call (demo)',
  },
  {
    fields: {
      full_name: 'Leila Haddad',
      position: 'Director of Digital Services',
      company: 'Civic Futures Office',
      email: 'leila.haddad@civicfutures.example',
      linkedin: 'linkedin.com/in/leila-haddad-demo',
    },
    reason: 'Owns the citizen services roadmap discussed in the steering committee.',
    meeting: 'Digital Services Steering Committee',
  },
  {
    fields: {
      full_name: 'Tomás Reyes',
      position: 'Chief Data Officer',
      company: 'Meridian Ports Authority',
      phone: '+1 415-555-0187',
    },
    reason: 'Proposed as the data-sharing lead for the pilot.',
    meeting: 'Data Exchange Pilot Kickoff',
  },
];

/**
 * The sample after `shownName` (the new-contact suggestion on screen), as the endpoint's request body
 * (no `contact_id` → a new-contact suggestion). Nothing shown, or someone else → Omar. Derived from the
 * fetched suggestions rather than a counter, so it continues correctly after a reload.
 */
export function nextDemoSuggestion(shownName: string | undefined, now = new Date()): TestSuggestionBody {
  const shown = SAMPLES.findIndex((s) => s.fields.full_name === shownName);
  const sample = SAMPLES[(shown + 1) % SAMPLES.length]!;
  return {
    contact_id: null,
    fields: sample.fields,
    reason: sample.reason,
    source: { type: 'meeting', ref_id: `demo-${now.getTime()}`, title: sample.meeting, occurred_at: now.toISOString() },
  };
}

/*
 * TODO(temporary): demo control for UPDATE revisions via /contacts/test-adding-suggestions (with a
 * contact_id → kind "update"). Remove when AI/Granola suggestion generation is integrated. Each click
 * proposes a new position for ONE existing contact as the next numbered revision; it only creates a
 * suggestion — the contact itself changes only if someone approves one.
 */
export const DEMO_REVISION_CONTACT = 'Daniel Brandt';
const REVISION_REASON = /^Demo revision (\d+)\b/;

/** The one loaded contact named exactly DEMO_REVISION_CONTACT (ignoring case/spaces); null if none or several. */
export function demoRevisionContact(profiles: readonly Profile[]): Profile | null {
  const name = DEMO_REVISION_CONTACT.toLowerCase();
  const matches = profiles.filter((p) => p.full_name.trim().toLowerCase() === name);
  return matches.length === 1 ? matches[0]! : null;
}

/** The next revision number for `contactId`: one past the highest demo revision among its suggestions (any status). */
export function nextDemoRevision(suggestions: readonly ProfileUpdateSuggestion[], contactId: string): number {
  let highest = 0;
  for (const s of suggestions) {
    const n = s.kind !== 'create' && s.profile_id === contactId ? Number(REVISION_REASON.exec(s.reason ?? '')?.[1]) : NaN;
    if (n > highest) highest = n;
  }
  return highest + 1;
}

/** The backend CreateSuggestionRequest for revision `n` of `contactId` (a position that differs every time). */
export function demoRevisionSuggestion(contactId: string, n: number, now = new Date()): TestSuggestionBody {
  return {
    contact_id: contactId,
    fields: { position: `Demo position — revision ${n}` },
    reason: `Demo revision ${n}: testing that only the newest update suggestion is shown.`,
    source: { type: 'meeting', ref_id: `demo-revision-${n}-${now.getTime()}`, title: `Revision test #${n} (demo)`, occurred_at: now.toISOString() },
  };
}

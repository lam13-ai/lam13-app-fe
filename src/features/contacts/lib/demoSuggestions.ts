import type { TestSuggestionBody } from '@/api';

/*
 * TODO(temporary): demo control for /contacts/test-adding-suggestions. Remove when AI/Granola suggestion
 * generation is integrated. The endpoint stores exactly what it is sent, so the demo sends one of these
 * fictional people (`.example` addresses) as a new-contact suggestion from a made-up meeting.
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
    reason: 'New stakeholder introduced during the vendor shortlist review.',
    meeting: 'Vendor Shortlist Review',
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

let next = 0;

/** The next sample, as the endpoint's request body (no `contact_id` → a new-contact suggestion). */
export function nextDemoSuggestion(now = new Date()): TestSuggestionBody {
  const sample = SAMPLES[next++ % SAMPLES.length]!;
  return {
    contact_id: null,
    fields: sample.fields,
    reason: sample.reason,
    source: { type: 'meeting', ref_id: `demo-${now.getTime()}`, title: sample.meeting, occurred_at: now.toISOString() },
  };
}

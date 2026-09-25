import type { Profile, ProfileUpdateSuggestion } from '@/types/api';

/**
 * Demo contacts for the in-memory mock backend. Every person, company, email and number here is
 * fictional (`.example` domains, 555 numbers). Timestamps are relative to `now`.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type SeedProfile = Omit<Profile, 'created_at' | 'updated_at'> & { createdAgo: number; updatedAgo: number };
type SeedSuggestion = Omit<ProfileUpdateSuggestion, 'created_at' | 'status'> & { ago: number };

const PROFILES: SeedProfile[] = [
  {
    id: 'saqlain-haider',
    full_name: 'Saqlain Haider',
    position: 'Product Manager',
    company: 'Northwind Labs',
    description: 'Product-focused and works closely with engineering teams.',
    email: 'saqlain@northwind.example',
    phone: null,
    linkedin: 'https://www.linkedin.com/in/saqlain-haider-demo',
    createdAgo: 60 * DAY,
    updatedAgo: 2 * HOUR,
  },
  {
    id: 'maya-okafor',
    full_name: 'Maya Okafor',
    position: 'Director of Digital Services',
    company: 'Civic Technology Office',
    description:
      'Leads the national digital services programme and owns the citizen-facing roadmap.\n\nPrefers evidence over opinion: bring usage data and a clear ask. Reviews board papers the evening before.',
    email: null,
    phone: null,
    linkedin: null,
    createdAgo: 40 * DAY,
    updatedAgo: DAY,
  },
  {
    id: 'daniel-brandt',
    full_name: 'Daniel Brandt',
    position: 'Chief Financial Officer',
    company: 'Harbor & Finch Capital',
    description: 'Runs capital allocation and investor relations. Wants every proposal framed as a five-year cash view with downside cases.',
    email: 'd.brandt@harborfinch.example',
    phone: '+1 555 0142',
    linkedin: 'https://www.linkedin.com/in/daniel-brandt-demo',
    createdAgo: 90 * DAY,
    updatedAgo: 5 * DAY,
  },
  {
    id: 'priya-raman',
    full_name: 'Priya Raman',
    position: 'Head of Data Platforms',
    company: 'Meridian Health',
    description: '',
    email: 'priya.raman@meridianhealth.example',
    phone: null,
    linkedin: null,
    createdAgo: 21 * DAY,
    updatedAgo: 21 * DAY,
  },
  {
    id: 'tomas-alvarez',
    full_name: 'Tomás Alvarez',
    position: 'Partner',
    company: 'Alvarez Strategy Group',
    description:
      'Long-standing advisor on public-sector transformation. Strong on stakeholder mapping and sequencing reforms across ministries; less interested in technology detail.\n\nWe co-authored the water security KPI framework. He likes a one-page summary up front and the detail in an appendix, and usually replies within a day.',
    email: 'tomas@alvarezstrategy.example',
    phone: '+1 555 0187',
    linkedin: 'https://www.linkedin.com/in/tomas-alvarez-demo',
    createdAgo: 120 * DAY,
    updatedAgo: 45 * MINUTE,
  },
  {
    id: 'hannah-lee',
    full_name: 'Hannah Lee',
    position: 'Chief of Staff',
    company: 'Lam13',
    description: 'Coordinates the leadership agenda and quarterly planning.',
    email: 'hannah@lam13.example',
    phone: null,
    linkedin: null,
    createdAgo: 200 * DAY,
    updatedAgo: 62 * DAY,
  },
];

const SUGGESTIONS: SeedSuggestion[] = [
  {
    id: 'sug-saqlain-description',
    profile_id: 'saqlain-haider',
    source_type: 'meeting',
    source_id: 'meeting-roadmap-review',
    source_title: 'Q4 roadmap review',
    ago: 3 * HOUR,
    changes: [
      {
        field: 'description',
        to: 'Product-focused and structured; prefers concise, action-oriented communication. Works closely with engineering teams.',
      },
    ],
  },
  {
    id: 'sug-saqlain-position',
    profile_id: 'saqlain-haider',
    source_type: 'meeting',
    source_id: 'meeting-roadmap-review',
    source_title: 'Q4 roadmap review',
    ago: 3 * HOUR,
    changes: [{ field: 'position', to: 'Senior Product Manager' }],
  },
  {
    id: 'sug-maya-contact',
    profile_id: 'maya-okafor',
    source_type: 'meeting',
    source_id: 'meeting-digital-steerco',
    source_title: 'Digital services steering committee',
    ago: 26 * HOUR,
    changes: [
      { field: 'email', to: 'maya.okafor@civictech.example' },
      { field: 'phone', to: '+1 555 0119' },
    ],
  },
];

export function createProfileSeed(now: number): { profiles: Profile[]; suggestions: ProfileUpdateSuggestion[] } {
  const at = (ago: number) => new Date(now - ago).toISOString();
  return {
    profiles: PROFILES.map(({ createdAgo, updatedAgo, ...p }) => ({ ...p, created_at: at(createdAgo), updated_at: at(updatedAgo) })),
    suggestions: SUGGESTIONS.map(({ ago, ...s }) => ({ ...s, created_at: at(ago), status: 'pending' })),
  };
}

import type { Profile, ProfileInput, ProfileUpdateSuggestion } from '@/types/api';
import { ApiError } from '../errors';
import type { ListParams, ProfileSuggestionListParams, ProfilesService, ProfileSuggestionsService } from '../services';
import { createProfileSeed } from './profileFixtures';
import { clone } from './utils';

interface Deps {
  now: () => number;
  respond: () => Promise<void>;
  newId: (prefix: string) => string;
  /** Makes every profile/suggestion write fail with a 503 (to exercise rollback). */
  failWrites?: boolean;
}

const REQUIRED = ['full_name', 'position', 'company'] as const;
const OPTIONAL = ['email', 'phone', 'linkedin'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PAGE = 100;

/** Trims every provided field; empty optional fields become null. */
function normalise(body: Partial<ProfileInput>): Partial<ProfileInput> {
  const out: Partial<ProfileInput> = {};
  for (const [key, value] of Object.entries(body) as [keyof ProfileInput, string | null][]) {
    const trimmed = value?.trim() ?? '';
    (out as Record<string, string | null>)[key] = (OPTIONAL as readonly string[]).includes(key) && !trimmed ? null : trimmed;
  }
  return out;
}

function validate(profile: ProfileInput) {
  const details: Record<string, string> = {};
  for (const field of REQUIRED) if (!profile[field]) details[field] = 'required';
  if (profile.email && !EMAIL.test(profile.email)) details.email = 'invalid';
  if (Object.keys(details).length) throw new ApiError(422, 'validation_error', 'Check the highlighted fields.', { details });
}

/**
 * In-memory My Contacts backend. The product rule lives here too: suggestions never touch a profile
 * except through `approve`.
 */
export function createMockProfiles({ now, respond, newId, failWrites }: Deps): {
  profiles: ProfilesService;
  profileSuggestions: ProfileSuggestionsService;
} {
  const seed = createProfileSeed(now());
  let profiles: Profile[] = seed.profiles;
  const suggestions: ProfileUpdateSuggestion[] = seed.suggestions;
  const iso = () => new Date(now()).toISOString();

  function findProfile(id: string): Profile {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) throw new ApiError(404, 'profile_not_found', 'This contact does not exist.');
    return profile;
  }

  function findPending(id: string): ProfileUpdateSuggestion {
    const suggestion = suggestions.find((s) => s.id === id);
    if (!suggestion) throw new ApiError(404, 'suggestion_not_found', 'This suggestion does not exist.');
    if (suggestion.status !== 'pending') {
      throw new ApiError(409, 'suggestion_not_pending', 'This suggestion was already reviewed.');
    }
    return suggestion;
  }

  async function write() {
    await respond();
    if (failWrites) throw new ApiError(503, 'upstream_unavailable', 'Lam13 is temporarily unavailable. Please try again.');
  }

  return {
    profiles: {
      async list({ cursor, limit = DEFAULT_PAGE }: ListParams = {}) {
        await respond();
        const sorted = [...profiles].sort((a, b) => a.full_name.localeCompare(b.full_name));
        const start = cursor ? Number(cursor) : 0;
        const end = start + limit;
        return { items: clone(sorted.slice(start, end)), next_cursor: end < sorted.length ? String(end) : null };
      },

      async get(id) {
        await respond();
        return clone(findProfile(id));
      },

      async create(body) {
        await write();
        const fields = { description: '', email: null, phone: null, linkedin: null, ...normalise(body) } as ProfileInput;
        validate(fields);
        const profile: Profile = { id: newId('p'), ...fields, created_at: iso(), updated_at: iso() };
        profiles.push(profile);
        return clone(profile);
      },

      async update(id, body) {
        await write();
        const profile = findProfile(id);
        const next = { ...profile, ...normalise(body) };
        validate(next);
        Object.assign(profile, next, { updated_at: iso() });
        return clone(profile);
      },

      async delete(id) {
        await write();
        findProfile(id);
        profiles = profiles.filter((p) => p.id !== id);
        for (let i = suggestions.length - 1; i >= 0; i--) if (suggestions[i]!.profile_id === id) suggestions.splice(i, 1);
      },
    },

    profileSuggestions: {
      async list({ profile_id, status }: ProfileSuggestionListParams = {}) {
        await respond();
        const items = suggestions
          .filter((s) => (!profile_id || s.profile_id === profile_id) && (!status || s.status === status))
          .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
        return { items: clone(items) };
      },

      async approve(id) {
        await write();
        const suggestion = findPending(id);
        const profile = findProfile(suggestion.profile_id);
        for (const { field, to } of suggestion.changes) Object.assign(profile, { [field]: to });
        profile.updated_at = iso();
        suggestion.status = 'approved';
        return { suggestion: clone(suggestion), profile: clone(profile) };
      },

      async reject(id) {
        await write();
        const suggestion = findPending(id);
        suggestion.status = 'rejected';
        return clone(suggestion);
      },
    },
  };
}

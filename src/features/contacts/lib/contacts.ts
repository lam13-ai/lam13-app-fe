import type {
  Profile,
  ProfileField,
  ProfileFieldChange,
  ProfileInput,
  ProfileSuggestionSource,
  ProfileUpdateSuggestion,
} from '@/types/api';

export const FIELD_LABELS: Record<ProfileField, string> = {
  full_name: 'Full name',
  position: 'Position',
  company: 'Company',
  description: 'Description',
  email: 'Email',
  phone: 'Phone',
  linkedin: 'LinkedIn',
};

/** 'all': A–Z by name. 'recent': most recently updated first. */
export type ContactSort = 'all' | 'recent';

/** Case-insensitive match on name, company, position or email, then sorted for the view. */
export function filterContacts(profiles: Profile[], query: string, sort: ContactSort): Profile[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? profiles.filter((p) => [p.full_name, p.company, p.position, p.email ?? ''].some((v) => v.toLowerCase().includes(q)))
    : [...profiles];
  return sort === 'recent'
    ? matches.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    : matches.sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/** The profile as it would be after approving `changes` (used for the optimistic update). */
export function applyChanges(profile: Profile, changes: ProfileFieldChange[]): Profile {
  return { ...profile, ...Object.fromEntries(changes.map((c) => [c.field, c.to])) };
}

/** Form state: every field as a string. */
export type ContactFormValues = Record<ProfileField, string>;

export const EMPTY_FORM: ContactFormValues = {
  full_name: '',
  position: '',
  company: '',
  description: '',
  email: '',
  phone: '',
  linkedin: '',
};

export function toFormValues(profile: Profile): ContactFormValues {
  return {
    full_name: profile.full_name,
    position: profile.position,
    company: profile.company,
    description: profile.description,
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    linkedin: profile.linkedin ?? '',
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Name, position and company are required; email must look like one when given. */
export function validateContact(values: ContactFormValues): Partial<Record<ProfileField, string>> {
  const errors: Partial<Record<ProfileField, string>> = {};
  if (!values.full_name.trim()) errors.full_name = 'Enter a full name.';
  if (!values.position.trim()) errors.position = 'Enter a position.';
  if (!values.company.trim()) errors.company = 'Enter a company.';
  const email = values.email.trim();
  if (email && !EMAIL.test(email)) errors.email = 'Enter a valid email address, like name@company.com.';
  return errors;
}

/** Trimmed request body; empty optional fields are sent as null. */
export function toProfileInput(values: ContactFormValues): ProfileInput {
  const optional = (v: string) => v.trim() || null;
  return {
    full_name: values.full_name.trim(),
    position: values.position.trim(),
    company: values.company.trim(),
    description: values.description.trim(),
    email: optional(values.email),
    phone: optional(values.phone),
    linkedin: optional(values.linkedin),
  };
}

/** Link target for a stored LinkedIn value; bare "linkedin.com/in/…" gets https (never another scheme). */
export function linkedinHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * One group per existing contact. Each new-contact suggestion is its own group: the server keeps one
 * pending suggestion per person (newer ones merge and supersede the older).
 */
const suggestionGroup = (s: ProfileUpdateSuggestion) => (s.kind === 'create' ? `create:${s.id}` : `profile:${s.profile_id}`);

/** Newer first by `created_at` (the server timestamp); a timestamp that doesn't parse counts as oldest, id breaks ties. */
function compareNewest(a: ProfileUpdateSuggestion, b: ProfileUpdateSuggestion): number {
  const time = (s: ProfileUpdateSuggestion) => {
    const t = Date.parse(s.created_at);
    return Number.isNaN(t) ? -Infinity : t;
  };
  return time(b) - time(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/**
 * The suggestions to show: per group, the NEWEST suggestion of any status — and only while it is still
 * pending. Older revisions are never shown, and deciding the newest doesn't surface an older one (the
 * decided one stays newest). Order of the input doesn't matter.
 */
export function currentSuggestions(all: readonly ProfileUpdateSuggestion[]): ProfileUpdateSuggestion[] {
  const newest = new Map<string, ProfileUpdateSuggestion>();
  for (const s of all) {
    const group = suggestionGroup(s);
    const current = newest.get(group);
    if (!current || compareNewest(s, current) < 0) newest.set(group, s);
  }
  return [...newest.values()].filter((s) => s.status === 'pending').sort(compareNewest);
}

const SOURCE_LABELS: Record<ProfileSuggestionSource, string> = { meeting: 'meeting', chat: 'chat', voice_call: 'voice call' };

/** "From meeting · Steering committee", "From chat". */
export function sourceText(s: Pick<ProfileUpdateSuggestion, 'source_type' | 'source_title'>): string {
  return `From ${SOURCE_LABELS[s.source_type]}${s.source_title ? ` · ${s.source_title}` : ''}`;
}

/** "Also includes: Steering committee · voice call" for a suggestion that merged earlier ones; '' otherwise. */
export function mergedSourcesText(s: ProfileUpdateSuggestion): string {
  const names = [...new Set((s.merged_sources ?? []).map((m) => m.title || SOURCE_LABELS[m.type]))];
  return names.length ? `Also includes: ${names.join(' · ')}` : '';
}

export interface DiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/** Line-by-line diff (longest common subsequence), to read a rewritten profile as added and removed lines. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before ? before.split('\n') : [];
  const b = after ? after.split('\n') : [];
  // common[i][j] = common lines of a[i..] and b[j..]; a profile is a few dozen lines, so O(n·m) is fine
  const common = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const at = (i: number, j: number) => common[i]![j]!;
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) common[i]![j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i++]! });
      j++;
    } else if (j < b.length && (i === a.length || at(i, j + 1) >= at(i + 1, j))) {
      lines.push({ kind: 'added', text: b[j++]! });
    } else {
      lines.push({ kind: 'removed', text: a[i++]! });
    }
  }
  return lines;
}

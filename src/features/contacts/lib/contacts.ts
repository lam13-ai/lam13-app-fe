import type { Profile, ProfileField, ProfileFieldChange, ProfileInput } from '@/types/api';

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

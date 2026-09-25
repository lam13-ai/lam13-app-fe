import type { AuthUser } from './types';

/** Provider-agnostic profile input (Kinde's UserProfile fits this shape). */
export interface ProfileLike {
  id: string;
  givenName?: string | null;
  familyName?: string | null;
  email?: string | null;
  picture?: string | null;
}

export function toAuthUser(profile: ProfileLike): AuthUser {
  const fullName = [profile.givenName, profile.familyName].filter(Boolean).join(' ').trim();
  const email = profile.email?.trim() || null;
  return {
    id: profile.id,
    name: fullName || email?.split('@')[0] || 'Account',
    email,
    // Only render remote avatars over https.
    avatarUrl: profile.picture && /^https:\/\//i.test(profile.picture) ? profile.picture : null,
  };
}

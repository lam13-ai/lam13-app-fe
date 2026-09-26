import { Briefcase, Building2, FileText, Mail, Phone, UserRound } from 'lucide-react';
import { smallIconProps } from '@/components/ui';
import type { ProfileField } from '@/types/api';

/** LinkedIn's "in" mark (lucide dropped brand icons); sized and hidden like the lucide icons. */
function LinkedInMark() {
  return (
    <svg viewBox="0 0 24 24" width={smallIconProps.size} height={smallIconProps.size} fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

const icons = { full_name: UserRound, position: Briefcase, company: Building2, description: FileText, email: Mail, phone: Phone };

/** The small semantic icon shown beside a profile field's label or value. */
export function FieldIcon({ field }: { field: ProfileField }) {
  if (field === 'linkedin') return <LinkedInMark />;
  const Icon = icons[field];
  return <Icon {...smallIconProps} />;
}

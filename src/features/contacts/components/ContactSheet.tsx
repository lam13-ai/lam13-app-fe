import { useState } from 'react';
import { toErrorInfo } from '@/api';
import { Drawer, useToast } from '@/components/ui';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { useUiStore } from '@/stores/uiStore';
import type { Profile, ProfileUpdateSuggestion } from '@/types/api';
import {
  useApproveSuggestion,
  useCreateProfile,
  useDeleteProfile,
  useRejectSuggestion,
  useUpdateProfile,
} from '../hooks/useContacts';
import { toFormValues } from '../lib/contacts';
import { ContactDetail } from './ContactDetail';
import { ContactForm } from './ContactForm';

/** Desktop sheet width bounds (px); the drawer also caps it at 75% of the window. */
const SHEET_MIN_WIDTH = 360;
const SHEET_MAX_WIDTH = 960;

export interface SheetState {
  open: boolean;
  mode: 'view' | 'edit' | 'create';
  profileId: string | null;
  /** Bumped on every open, so a reopened form starts fresh. */
  seq: number;
  /** Focus Edit when returning from the edit form. */
  focusEdit?: boolean;
}

/**
 * Right-hand sheet (full screen on phones) holding a contact's profile, its edit form, or the
 * add-contact form. Owns the mutations and their feedback.
 */
export function ContactSheet({
  state,
  profile,
  suggestions,
  onChange,
  onClose,
}: {
  state: SheetState;
  profile: Profile | undefined;
  suggestions: ProfileUpdateSuggestion[];
  onChange: (patch: Partial<SheetState>) => void;
  onClose: () => void;
}) {
  const create = useCreateProfile();
  const update = useUpdateProfile();
  const remove = useDeleteProfile();
  const approve = useApproveSuggestion();
  const reject = useRejectSuggestion();
  const toast = useToast();
  // Desktop width, kept for the session (UI preference only — no contact data).
  const width = useUiStore((s) => s.contactSheetWidth);
  const setWidth = useUiStore((s) => s.setContactSheetWidth);
  const expanded = useUiStore((s) => s.contactSheetRestoreWidth !== null);
  const toggleExpanded = useUiStore((s) => s.toggleContactSheetExpanded);
  // Expand / Restore is a desktop affordance, like resizing; phones keep the full-screen sheet.
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const failed = (what: string) => (error: unknown) =>
    toast.show(`Couldn't ${what}. ${toErrorInfo(error).message}`, { tone: 'danger' });

  // Keep showing a just-deleted contact while the sheet slides away.
  const [last, setLast] = useState(profile);
  if (profile && profile !== last) setLast(profile);
  const shown = profile ?? last;
  const backToProfile = () => onChange({ mode: 'view', focusEdit: true });

  let label = 'Add contact';
  let content = null;
  if (state.mode === 'create') {
    content = (
      <ContactForm
        key={`create-${state.seq}`}
        heading="Add contact"
        submitLabel="Save contact"
        pending={create.isPending}
        onSubmit={(body) =>
          create.mutate(body, {
            onSuccess: (created) => {
              toast.show(`${created.full_name} added.`);
              onClose();
            },
            onError: failed('add the contact'),
          })
        }
        onCancel={onClose}
        onClose={onClose}
      />
    );
  } else if (shown && state.mode === 'edit') {
    label = `Edit ${shown.full_name}`;
    content = (
      <ContactForm
        key={`edit-${shown.id}-${state.seq}`}
        heading="Edit contact"
        initial={toFormValues(shown)}
        submitLabel="Save changes"
        onSubmit={(body) => {
          update.mutate({ id: shown.id, body }, { onSuccess: () => toast.show('Changes saved.'), onError: failed('save your changes') });
          backToProfile();
        }}
        onCancel={backToProfile}
        onClose={onClose}
      />
    );
  } else if (shown) {
    label = shown.full_name;
    content = (
      <ContactDetail
        key={shown.id}
        profile={shown}
        suggestions={suggestions}
        focusEdit={state.focusEdit}
        expand={isDesktop ? { expanded, onToggle: toggleExpanded } : undefined}
        onEdit={() => onChange({ mode: 'edit' })}
        onClose={onClose}
        onDelete={() => {
          onClose();
          remove.mutate(shown.id, {
            onSuccess: () => toast.show(`${shown.full_name} deleted.`),
            onError: failed('delete the contact'),
          });
        }}
        onApprove={(s) =>
          approve.mutate(s, { onSuccess: () => toast.show('Profile updated.'), onError: failed('apply the update') })
        }
        onReject={(s) =>
          reject.mutate(s, {
            onSuccess: () => toast.show('Suggestion rejected. Profile unchanged.'),
            onError: failed('reject the suggestion'),
          })
        }
      />
    );
  }

  return (
    <Drawer
      side="right"
      open={state.open}
      onClose={onClose}
      label={label}
      resize={{ width, onWidthChange: setWidth, min: SHEET_MIN_WIDTH, max: SHEET_MAX_WIDTH, label: 'Resize contact panel' }}
    >
      {content}
    </Drawer>
  );
}

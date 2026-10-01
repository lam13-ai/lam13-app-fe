import { FlaskConical, History } from 'lucide-react';
import { toErrorInfo } from '@/api';
import { Button, Spinner, smallIconProps, useToast } from '@/components/ui';
import { useAddTestRevision, useAddTestSuggestion } from '../hooks/useContacts';

/**
 * TODO(temporary): demo control for /contacts/test-adding-suggestions. Remove when AI/Granola suggestion
 * generation is integrated. Secondary (ghost) on purpose; only shown where the backend offers the endpoint.
 */
function TestSuggestionButton() {
  const toast = useToast();
  const add = useAddTestSuggestion();
  if (!add.available) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={add.isPending}
      aria-busy={add.isPending || undefined}
      leadingIcon={add.isPending ? <Spinner size={14} state="active" /> : <FlaskConical {...smallIconProps} />}
      title="Demo: creates a new-contact suggestion (temporary)"
      onClick={() =>
        add.mutate(undefined, {
          onSuccess: (suggestion) => toast.show(suggestion ? 'Test suggestion created.' : 'Nothing new to suggest.'),
          onError: (error) => toast.show(`Couldn't create a test suggestion. ${toErrorInfo(error).message}`, { tone: 'danger' }),
        })
      }
    >
      {/* Icon-only on phones (like the sort button), so the page title keeps its room. */}
      <span className="max-sm:sr-only">{add.isPending ? 'Creating…' : 'Test suggestion'}</span>
    </Button>
  );
}

/**
 * TODO(temporary): demo control — creates the next numbered UPDATE revision for Daniel Brandt through
 * /contacts/test-adding-suggestions, to check that his drawer only ever shows the newest one. Remove when
 * AI/Granola suggestion generation is integrated. Creates suggestions only; never edits the contact.
 */
function TestRevisionButton() {
  const toast = useToast();
  const add = useAddTestRevision();
  if (!add.available) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={add.isPending}
      aria-busy={add.isPending || undefined}
      leadingIcon={add.isPending ? <Spinner size={14} state="active" /> : <History {...smallIconProps} />}
      title="Demo: suggests the next numbered position revision for Daniel Brandt (temporary)"
      onClick={() =>
        add.mutate(undefined, {
          onSuccess: ({ revision, contact, created }) =>
            toast.show(created ? `Revision ${revision} suggested for ${contact.full_name}.` : 'Nothing new to suggest.'),
          onError: (error) => toast.show(`Couldn't create a test revision. ${toErrorInfo(error).message}`, { tone: 'danger' }),
        })
      }
    >
      <span className="max-sm:sr-only">{add.isPending ? 'Creating…' : 'Test update revisions'}</span>
    </Button>
  );
}

/**
 * TODO(temporary): the two demo buttons in the My Contacts header. To remove them, comment this component's
 * line and its import in ContactsView (and delete testSuggestionControls.test.tsx); nothing else uses them.
 */
export function TestSuggestionControls() {
  return (
    <>
      <TestSuggestionButton />
      <TestRevisionButton />
    </>
  );
}

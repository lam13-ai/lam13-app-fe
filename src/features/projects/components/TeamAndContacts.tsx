import { MoreHorizontal, Plus, UserMinus, UserPlus, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { isApiError, toErrorInfo } from '@/api';
import { Button, IconButton, Menu, MenuItem, Popover, Spinner, iconProps, smallIconProps, usePopover, useToast } from '@/components/ui';
import { initials } from '@/lib/initials';
import type { Project, ProjectMember } from '@/types/api';
import { useAddMember, useOwnContacts, useProjectAction, useRemoveMember } from '../hooks/useProjects';

const FIELD =
  'h-11 w-full border border-border bg-bg px-3 text-base text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring focus-visible:outline-none sm:text-sm md:h-10';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * "Add people to this project": an email and a role. The person must already have a Lam13 account; they
 * get access to the project at once (no invitation email is sent). The backend's own reason is shown when
 * it refuses (no such account, already in the project).
 */
function AddMemberForm({ project }: { project: Project }) {
  const popover = usePopover();
  const toast = useToast();
  const add = useAddMember(project.id);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const id = useId();
  const value = email.trim();
  const error = !submitted
    ? null
    : !EMAIL.test(value)
      ? 'Enter a valid email address.'
      : add.isError
        ? isApiError(add.error) && add.error.status === 409
          ? 'This person is already a member of the project.'
          : isApiError(add.error) && add.error.status === 404
            ? toErrorInfo(add.error).message
            : "Couldn't add this member. Try again."
        : null;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!EMAIL.test(value)) return;
    add.mutate(value, {
      onSuccess: () => {
        toast.show(`${value.toLowerCase()} was added to this project.`);
        popover?.close();
      },
    });
  };
  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby={`${id}-title`} className="flex flex-col gap-3 p-2">
      <h2 id={`${id}-title`} className="text-sm font-bold">
        Add people to this project
      </h2>
      <div>
        <label htmlFor={`${id}-email`} className="mb-1.5 block text-xs font-bold">
          Email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            add.reset();
          }}
          placeholder="name@example.com"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : `${id}-help`}
          className={FIELD}
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-danger">
            {error}
          </p>
        ) : (
          <p id={`${id}-help`} className="mt-1.5 text-2xs leading-relaxed text-fg-muted">
            They need a Lam13 account with this email. They get access to this project at once.
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-role`} className="mb-1.5 block text-xs font-bold">
          Role
        </label>
        <select id={`${id}-role`} defaultValue="member" className={FIELD}>
          <option value="member">Member</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={add.isPending} leadingIcon={add.isPending ? <Spinner size={14} state="active" /> : undefined}>
          Add member
        </Button>
        <Button variant="ghost" size="sm" onClick={() => popover?.close()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** A member's "…" menu: Remove, confirmed in the same popover (naming who is being removed). */
function MemberActions({ project, member }: { project: Project; member: ProjectMember }) {
  const [view, setView] = useState<'menu' | 'confirm'>('menu');
  return (
    <Popover
      placement="bottom-end"
      className="w-64"
      onOpenChange={(open) => {
        if (!open) setView('menu');
      }}
      trigger={(props) => <IconButton {...props} label={`Actions for ${member.name}`} size="sm" icon={<MoreHorizontal {...iconProps} />} />}
    >
      {view === 'menu' ? (
        <Menu label={`Actions for ${member.name}`}>
          <MenuItem onSelect={() => setView('confirm')} leading={<UserMinus {...smallIconProps} />} tone="danger" keepOpen>
            Remove from project
          </MenuItem>
        </Menu>
      ) : (
        <ConfirmRemove project={project} member={member} />
      )}
    </Popover>
  );
}

function ConfirmRemove({ project, member }: { project: Project; member: ProjectMember }) {
  const popover = usePopover();
  const toast = useToast();
  const remove = useRemoveMember(project.id);
  const id = useId();
  return (
    <div role="alertdialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text`} className="flex flex-col gap-3 p-2">
      <div>
        <p id={`${id}-title`} className="text-xs font-bold">
          Remove {member.name}?
        </p>
        <p id={`${id}-text`} className="mt-1 text-2xs leading-relaxed text-fg-muted">
          {member.name} will no longer be a member of {project.name}.
        </p>
      </div>
      {remove.isError && (
        <p role="alert" className="text-xs text-danger">
          Couldn&apos;t remove this member. Try again.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" autoFocus onClick={() => popover?.close()}>
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(member.id, {
              onSuccess: () => {
                toast.show(`${member.name} was removed from this project.`);
                popover?.close();
              },
            })
          }
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

/** "Add contact": one of the user's own contacts (My Contacts) not yet in the project. Picking one links it. */
function AddContactPanel({ project }: { project: Project }) {
  const popover = usePopover();
  const toast = useToast();
  const own = useOwnContacts(true);
  const action = useProjectAction(project.id);
  const [query, setQuery] = useState('');
  const id = useId();
  const linked = new Set(project.contacts.map((c) => c.id));
  const q = query.trim().toLowerCase();
  const choices = (own.data ?? []).filter((c) => !linked.has(c.id) && (!q || `${c.full_name} ${c.company ?? ''}`.toLowerCase().includes(q)));
  const link = (contactId: string) =>
    action.mutate((projects) => projects.linkContact(project.id, contactId), {
      onSuccess: () => popover?.close(),
      onError: (error) => toast.show(toErrorInfo(error).message),
    });
  return (
    <div className="flex flex-col gap-2 p-2">
      <h2 id={`${id}-title`} className="text-sm font-bold">
        Add a contact
      </h2>
      <p className="text-2xs leading-relaxed text-fg-muted">From My Contacts. Everyone in the project will see their name, role and email.</p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your contacts"
        aria-label="Search your contacts"
        autoFocus
        className={FIELD}
      />
      {own.isPending ? (
        <p role="status" className="flex items-center gap-2 py-3 text-xs text-fg-muted">
          <Spinner size={14} state="active" /> Loading your contacts…
        </p>
      ) : own.isError ? (
        <p role="alert" className="py-3 text-xs text-danger">
          Couldn&apos;t load your contacts.
        </p>
      ) : choices.length === 0 ? (
        <p className="py-3 text-xs text-fg-muted">{own.data.length === 0 ? 'You have no contacts yet. Add them in My Contacts.' : 'No contact to add.'}</p>
      ) : (
        <ul aria-labelledby={`${id}-title`} className="scrollbar-subtle max-h-56 overflow-y-auto">
          {choices.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={action.isPending}
                onClick={() => link(c.id)}
                className="flex min-h-11 w-full flex-col justify-center rounded-card px-2 py-1.5 text-left outline-offset-[-2px] transition-colors hover:bg-fg/[0.05]"
              >
                <span className="truncate text-xs font-bold">{c.full_name}</span>
                <span className="truncate text-2xs text-fg-muted">{[c.position, c.company].filter(Boolean).join(', ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ROW = 'flex min-h-14 items-center gap-3 border-b border-hairline py-2.5';
const AVATAR = 'flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-2xs text-fg-muted';

/**
 * A project's people: its team (the owner first, then members) and the contacts linked to it. Managing the
 * team is the owner's; any member can link one of their own contacts.
 */
export function TeamAndContacts({ project }: { project: Project }) {
  const members = [...project.members].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'));
  const contacts = project.contacts;
  const isOwner = project.role !== 'member';
  const toast = useToast();
  const action = useProjectAction(project.id);
  const unlink = (contactId: string) =>
    action.mutate((projects) => projects.unlinkContact(project.id, contactId), { onError: (error) => toast.show(toErrorInfo(error).message) });
  return (
    <div className="flex max-w-[46rem] flex-col gap-10">
      <section aria-labelledby="project-team">
        {/* One row at every width: the button stays at the right edge, so its panel opens inside the screen. */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 id="project-team" className="text-sm font-bold">
              Team
            </h2>
            <p className="mt-1 text-sm text-fg-muted">People who are members of this project.</p>
          </div>
          {isOwner && (
            <Popover
              placement="bottom-end"
              kind="dialog"
              className="w-[min(20rem,calc(100vw-1.5rem))]"
              trigger={(props) => (
                <Button {...props} variant="outline" size="sm" leadingIcon={<UserPlus {...smallIconProps} />}>
                  Add member
                </Button>
              )}
            >
              <AddMemberForm project={project} />
            </Popover>
          )}
        </div>

        <ul aria-label="Team" className="border-t border-hairline">
          {members.map((member) => (
            <li key={member.id} className={ROW}>
              <span aria-hidden="true" className={AVATAR}>
                {initials(member.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{member.name}</p>
                {member.email && member.email !== member.name && <p className="truncate text-xs text-fg-muted">{member.email}</p>}
              </div>
              {member.role === 'owner' ? (
                <span className="shrink-0 rounded-full border border-hairline-strong px-2 py-0.5 text-2xs text-fg">Owner</span>
              ) : (
                <span className="shrink-0 text-xs text-fg-muted">Member</span>
              )}
              {/* The owner cannot be removed, so has no actions; the spacer keeps the roles in one column. */}
              {member.role === 'owner' || !isOwner ? <span aria-hidden="true" className="size-8 shrink-0" /> : <MemberActions project={project} member={member} />}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-2xs leading-relaxed text-fg-muted">
          {isOwner ? 'Members can read and add chats, files and contacts. Only you can rename or delete the project and manage its team.' : 'The project owner manages the team.'}
        </p>
      </section>

      <section aria-labelledby="project-contacts">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 id="project-contacts" className="text-sm font-bold">
              Contacts
            </h2>
            <p className="mt-1 text-sm text-fg-muted">Contacts associated with this project.</p>
          </div>
          <Popover
            placement="bottom-end"
            kind="dialog"
            className="w-[min(20rem,calc(100vw-1.5rem))]"
            trigger={(props) => (
              <Button {...props} variant="outline" size="sm" leadingIcon={<Plus {...smallIconProps} />}>
                Add contact
              </Button>
            )}
          >
            <AddContactPanel project={project} />
          </Popover>
        </div>
        {contacts.length === 0 ? (
          <p className="border-t border-hairline py-6 text-sm text-fg-muted">No contacts are linked to this project yet.</p>
        ) : (
          <ul aria-label="Project contacts" className="border-t border-hairline">
            {contacts.map((contact) => (
              <li key={contact.id} className={ROW}>
                <span aria-hidden="true" className={AVATAR}>
                  {initials(contact.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{contact.name}</p>
                  <p className="truncate text-xs text-fg-muted">{[contact.detail, contact.email].filter(Boolean).join(' · ')}</p>
                </div>
                {/* Whoever linked it, or the owner, may remove it: the backend says no otherwise, and that is shown. */}
                <IconButton label={`Remove ${contact.name} from this project`} size="sm" icon={<X {...iconProps} />} onClick={() => unlink(contact.id)} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-2xs leading-relaxed text-fg-muted">Linked from My Contacts. Removing one here does not delete the contact.</p>
      </section>
    </div>
  );
}

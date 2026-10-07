import { MoreHorizontal, UserMinus, UserPlus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { isApiError } from '@/api';
import { Button, IconButton, Menu, MenuItem, Popover, Spinner, iconProps, smallIconProps, usePopover, useToast } from '@/components/ui';
import { initials } from '@/lib/initials';
import type { Project, ProjectMember } from '@/types/api';
import { useAddMember, useRemoveMember } from '../hooks/useProjects';

const FIELD =
  'h-11 w-full border border-border bg-bg px-3 text-base text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring focus-visible:outline-none sm:text-sm md:h-10';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * "Add people to this project": an email and a role. A demo — the person joins the local member list;
 * no invitation is sent and no permission is granted anywhere.
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
          : "Couldn't add this member. Try again."
        : null;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!EMAIL.test(value)) return;
    add.mutate(value, {
      onSuccess: () => {
        toast.show(`${value.toLowerCase()} was added to this project. Demo: no invitation was sent.`);
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
            Demo: they are added to this list only. No invitation is sent.
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

const ROW = 'flex min-h-14 items-center gap-3 border-b border-hairline py-2.5';
const AVATAR = 'flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-2xs text-fg-muted';

/**
 * A project's people: its team (the owner first, then members) and the contacts associated with it.
 * Demo data; managing the team changes this list only.
 */
export function TeamAndContacts({ project }: { project: Project }) {
  const members = [...project.members].sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'));
  const contacts = project.sources.filter((s) => s.type === 'contact');
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
              {member.role === 'owner' ? <span aria-hidden="true" className="size-8 shrink-0" /> : <MemberActions project={project} member={member} />}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-2xs leading-relaxed text-fg-muted">
          Sample team. Changes here stay in this browser session: no invitations are sent and no permissions change.
        </p>
      </section>

      <section aria-labelledby="project-contacts">
        <h2 id="project-contacts" className="text-sm font-bold">
          Contacts
        </h2>
        <p className="mb-4 mt-1 text-sm text-fg-muted">Contacts associated with this project.</p>
        {contacts.length === 0 ? (
          <p className="border-t border-hairline py-6 text-sm text-fg-muted">No contacts are linked to this project yet.</p>
        ) : (
          <ul aria-label="Project contacts" className="border-t border-hairline">
            {contacts.map((contact) => (
              <li key={contact.id} className={ROW}>
                <span aria-hidden="true" className={AVATAR}>
                  {initials(contact.title)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{contact.title}</p>
                  <p className="truncate text-xs text-fg-muted">{contact.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-2xs leading-relaxed text-fg-muted">Sample contacts: they are not synced with My Contacts.</p>
      </section>
    </div>
  );
}

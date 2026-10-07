import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockProjects } from '@/api/mock/workspace';
import { renderApp } from './testUtils';

/** A project's Team and Contacts tab: the team (owner, demo add / remove — local state only) and the project's contacts. */

const find = { timeout: 8000 };
afterEach(() => vi.restoreAllMocks());

async function openMembers(projectId = 'water-security') {
  const app = renderApp(`/projects/${projectId}`);
  fireEvent.click(await screen.findByRole('tab', { name: /Team and Contacts/ }, find));
  return app;
}
/** The header's Add member button (its form, closed but mounted, has a submit button of the same name). */
const addMemberButton = () => screen.getAllByRole('button', { name: 'Add member' }).find((b) => b.hasAttribute('aria-haspopup'))!;
const list = () => screen.getByRole('list', { name: 'Team' });
const rows = () => within(list()).getAllByRole('listitem');
const names = () => rows().map((r) => r.querySelector('p')!.textContent);
const row = (name: string) => rows().find((r) => r.querySelector('p')!.textContent === name)!;

describe('Project members', () => {
  it('the tabs are Chats, Instructions, Archives and Team and Contacts — no Context, no Members', async () => {
    renderApp('/projects/water-security');
    await screen.findByRole('list', { name: 'Project chats' }, find);
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['Chats', 'Instructions', 'Archives', 'Team and Contacts']);
    expect(screen.queryByRole('tab', { name: /Context/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Members/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Chats/ }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Instructions' }));
    expect(screen.getByRole('textbox', { name: 'Project instructions' })).toBeTruthy();
    expect(screen.queryByText(/Context/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Archives/ }));
    expect(screen.getByRole('list', { name: 'Files' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Team and Contacts/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Team' })).toBeTruthy();
    expect(screen.getByText('People who are members of this project.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Contacts' })).toBeTruthy();
    expect(screen.getByText('Contacts associated with this project.')).toBeTruthy();
  });

  it('Contacts lists the people associated with the project, separately from the team; a project without any says so', async () => {
    await openMembers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const contacts = within(screen.getByRole('list', { name: 'Project contacts' })).getAllByRole('listitem');
    expect(contacts.map((c) => c.querySelector('p')!.textContent)).toEqual(['Omar Haddad', 'Lena Fischer']);
    expect(contacts[0]!.textContent).toContain('Programme Director, Water Authority');
    for (const contact of contacts) expect(within(contact).queryByRole('button')).toBeNull(); // shown, not managed
    expect(names()).not.toContain('Omar Haddad'); // a contact is not a team member
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a project with no contacts shows an empty Contacts section', async () => {
    await openMembers('digital-services');
    expect(screen.getByRole('heading', { level: 2, name: 'Contacts' })).toBeTruthy();
    expect(screen.getByText('No contacts are linked to this project yet.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Project contacts' })).toBeNull();
  });

  it('the demo persona is Joseph Boutros — in the team and as the owner of files in Archives', async () => {
    await openMembers();
    expect(within(row('Joseph Boutros')).getByText('Owner')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Aashir');
    fireEvent.click(screen.getByRole('tab', { name: /Archives/ }));
    expect(screen.getByRole('list', { name: 'Files' }).textContent).toContain('Joseph Boutros');
    expect(document.body.textContent).not.toContain('Aashir');
  });

  it('lists the members with their roles, the owner first, and the header says the project is shared', async () => {
    await openMembers();
    expect(names()).toEqual(['Joseph Boutros', 'Maya Okafor', 'Daniel Brandt', 'Priya Nair']);
    expect(rows().map((r) => (within(r).queryByText('Owner') ? 'Owner' : within(r).getByText('Member').textContent))).toEqual(['Owner', 'Member', 'Member', 'Member']);
    expect(screen.getByText('Shared project · 4 people')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Team and Contacts/ }).textContent).toBe('Team and Contacts4');
  });

  it('the members are the people who appear in the project’s Archives', async () => {
    await openMembers();
    const members = names();
    fireEvent.click(screen.getByRole('tab', { name: /Archives/ }));
    const uploaders = new Set(
      within(screen.getByRole('list', { name: 'Files' }))
        .getAllByRole('article')
        .map((a) => a.querySelector('.truncate')!.textContent!.split(' · ')[0]!),
    );
    expect([...uploaders].sort()).toEqual(['Daniel Brandt', 'Joseph Boutros', 'Maya Okafor']);
    for (const person of uploaders) expect(members).toContain(person);
  });

  it('the owner cannot be removed: no actions in the row, and the service refuses too', async () => {
    await openMembers();
    expect(within(row('Joseph Boutros')).queryByRole('button')).toBeNull();
    for (const name of ['Maya Okafor', 'Daniel Brandt', 'Priya Nair']) expect(within(row(name)).getByRole('button', { name: `Actions for ${name}` })).toBeTruthy();

    const projects = createMockProjects();
    await expect(projects.removeMember('water-security', 'm-joseph')).rejects.toMatchObject({ status: 403 });
    expect((await projects.get('water-security')).members.map((m) => m.role)).toContain('owner');
  });

  it('Add member validates the email, adds a demo member, confirms without claiming an invitation, and calls no backend', async () => {
    await openMembers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fireEvent.click(addMemberButton());
    const form = screen.getByRole('form', { name: 'Add people to this project' });
    const email = within(form).getByLabelText('Email') as HTMLInputElement;
    expect((within(form).getByLabelText('Role') as HTMLSelectElement).value).toBe('member');
    expect(within(form).getAllByRole('option').map((o) => o.textContent)).toEqual(['Member']);

    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add member' }));
    expect(within(form).getByRole('alert').textContent).toBe('Enter a valid email address.');
    expect(names()).toHaveLength(4);

    fireEvent.change(email, { target: { value: 'Lena.Fischer@example.com' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add member' }));
    await waitFor(() => expect(names()).toEqual(['Joseph Boutros', 'Maya Okafor', 'Daniel Brandt', 'Priya Nair', 'lena.fischer@example.com']));
    expect(within(row('lena.fischer@example.com')).getByText('Member')).toBeTruthy();
    expect(await screen.findByText('lena.fischer@example.com was added to this project. Demo: no invitation was sent.')).toBeTruthy();
    expect(screen.queryByText(/invitation (was )?sent to|invited/i)).toBeNull();
    expect(screen.getByText('Shared project · 5 people')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('adding someone who is already a member is refused', async () => {
    await openMembers();
    const add = async (value: string) => {
      fireEvent.click(addMemberButton());
      const form = screen.getByRole('form', { name: 'Add people to this project' });
      fireEvent.change(within(form).getByLabelText('Email'), { target: { value } });
      fireEvent.click(within(form).getByRole('button', { name: 'Add member' }));
      return form;
    };
    await add('sam@example.com');
    await waitFor(() => expect(names()).toHaveLength(5));
    const form = await add('SAM@example.com');
    expect((await within(form).findByRole('alert')).textContent).toBe('This person is already a member of the project.');
    expect(names()).toHaveLength(5);
  });

  it('Remove asks for confirmation naming the member; Cancel keeps them, Remove removes only them — with no backend call', async () => {
    await openMembers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const openConfirm = () => {
      fireEvent.click(within(row('Daniel Brandt')).getByRole('button', { name: 'Actions for Daniel Brandt' }));
      fireEvent.click(within(row('Daniel Brandt')).getByRole('menuitem', { name: 'Remove from project' }));
      return within(row('Daniel Brandt')).getByRole('alertdialog');
    };

    let confirm = openConfirm();
    expect(confirm.textContent).toContain('Remove Daniel Brandt?');
    expect(confirm.textContent).toContain('Daniel Brandt will no longer be a member of National Water Security Strategy.');
    expect(names()).toHaveLength(4); // nothing happens before confirming
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(names()).toContain('Daniel Brandt');

    confirm = openConfirm();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(names()).toEqual(['Joseph Boutros', 'Maya Okafor', 'Priya Nair']));
    expect(screen.getByText('Shared project · 3 people')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('each project has its own members', async () => {
    await openMembers('digital-services');
    expect(names()).toEqual(['Joseph Boutros', 'Priya Nair']);
    expect(screen.getByText('Shared project · 2 people')).toBeTruthy();
  });
});

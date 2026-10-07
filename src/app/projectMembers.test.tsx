import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockProjects } from '@/api/mock/workspace';
import { renderApp } from './testUtils';

/** A project's Members tab: who has access, the owner, and the demo add / remove flow (local state only). */

const find = { timeout: 8000 };
afterEach(() => vi.restoreAllMocks());

async function openMembers(projectId = 'water-security') {
  const app = renderApp(`/projects/${projectId}`);
  fireEvent.click(await screen.findByRole('tab', { name: /Members/ }, find));
  return app;
}
/** The header's Add member button (its form, closed but mounted, has a submit button of the same name). */
const addMemberButton = () => screen.getAllByRole('button', { name: 'Add member' }).find((b) => b.hasAttribute('aria-haspopup'))!;
const list = () => screen.getByRole('list', { name: 'Project members' });
const rows = () => within(list()).getAllByRole('listitem');
const names = () => rows().map((r) => r.querySelector('p')!.textContent);
const row = (name: string) => rows().find((r) => r.querySelector('p')!.textContent === name)!;

describe('Project members', () => {
  it('Members is the fifth project tab, and the existing tabs still work', async () => {
    renderApp('/projects/water-security');
    await screen.findByRole('list', { name: 'Project chats' }, find);
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['Chats', 'Instructions', 'Context', 'Archives', 'Members']);
    expect(screen.getByRole('tab', { name: /Chats/ }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Instructions' }));
    expect(screen.getByRole('textbox', { name: 'Project instructions' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Context/ }));
    expect(screen.getByRole('region', { name: 'Meeting notes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Archives/ }));
    expect(screen.getByRole('list', { name: 'Files' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Members/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Project members' })).toBeTruthy();
    expect(screen.getByText('People who have access to this project.')).toBeTruthy();
  });

  it('lists the members with their roles, the owner first, and the header says the project is shared', async () => {
    await openMembers();
    expect(names()).toEqual(['Aashir Aqeel', 'Maya Okafor', 'Daniel Brandt', 'Priya Nair']);
    expect(rows().map((r) => (within(r).queryByText('Owner') ? 'Owner' : within(r).getByText('Member').textContent))).toEqual(['Owner', 'Member', 'Member', 'Member']);
    expect(screen.getByText('Shared project · 4 members')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Members/ }).textContent).toBe('Members4');
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
    expect([...uploaders].sort()).toEqual(['Aashir Aqeel', 'Daniel Brandt', 'Maya Okafor']);
    for (const person of uploaders) expect(members).toContain(person);
  });

  it('the owner cannot be removed: no actions in the row, and the service refuses too', async () => {
    await openMembers();
    expect(within(row('Aashir Aqeel')).queryByRole('button')).toBeNull();
    for (const name of ['Maya Okafor', 'Daniel Brandt', 'Priya Nair']) expect(within(row(name)).getByRole('button', { name: `Actions for ${name}` })).toBeTruthy();

    const projects = createMockProjects();
    await expect(projects.removeMember('water-security', 'm-aashir')).rejects.toMatchObject({ status: 403 });
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
    await waitFor(() => expect(names()).toEqual(['Aashir Aqeel', 'Maya Okafor', 'Daniel Brandt', 'Priya Nair', 'lena.fischer@example.com']));
    expect(within(row('lena.fischer@example.com')).getByText('Member')).toBeTruthy();
    expect(await screen.findByText('lena.fischer@example.com was added to this project. Demo: no invitation was sent.')).toBeTruthy();
    expect(screen.queryByText(/invitation (was )?sent to|invited/i)).toBeNull();
    expect(screen.getByText('Shared project · 5 members')).toBeTruthy();
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
    await waitFor(() => expect(names()).toEqual(['Aashir Aqeel', 'Maya Okafor', 'Priya Nair']));
    expect(screen.getByText('Shared project · 3 members')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('each project has its own members', async () => {
    await openMembers('digital-services');
    expect(names()).toEqual(['Aashir Aqeel', 'Priya Nair']);
    expect(screen.getByText('Shared project · 2 members')).toBeTruthy();
  });
});

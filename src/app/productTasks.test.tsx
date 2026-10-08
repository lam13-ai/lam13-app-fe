import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api';
import { renderApp } from './testUtils';

/**
 * Creating a project with its instructions, files and people, and the project's Summary tab.
 */

const find = { timeout: 8000 };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const pdf = (name: string) => new File(['%PDF-1.4 test'], name, { type: 'application/pdf' });

async function openForm() {
  const app = renderApp('/projects');
  await screen.findByRole('list', { name: 'Projects' }, find);
  fireEvent.click(screen.getByRole('button', { name: 'New project' }));
  return { ...app, form: screen.getByRole('form', { name: 'New project' }) };
}

describe('New project', () => {
  it('asks for a name, and takes instructions, files and people', async () => {
    const { form } = await openForm();
    for (const label of ['Project name', /^Instructions/, /^Archives/, /^Teams & Contacts/]) expect(within(form).getByLabelText(label)).toBeTruthy();
    expect((within(form).getByRole('button', { name: 'Create project' }) as HTMLButtonElement).disabled).toBe(true); // no name yet
    expect((within(form).getByLabelText(/^Archives/) as HTMLInputElement).multiple).toBe(true);
  });

  it('opens as a wide dialog over the page; Escape, Cancel and a click on the dimmed page close it and return to the button', async () => {
    const { form } = await openForm();
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    expect(dialog.contains(form)).toBe(true);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.className).toMatch(/max-w-3xl/); // about 770px on a desktop, the full width (less a margin) on a phone
    expect(document.activeElement).toBe(within(form).getByLabelText('Project name'));

    const button = screen.getByRole('button', { name: 'New project' });
    const closes = [
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      () => fireEvent.click(within(screen.getByRole('dialog', { name: 'New project' })).getByRole('button', { name: 'Cancel' })),
      () => fireEvent.mouseDown(screen.getByRole('dialog', { name: 'New project' }).parentElement!),
    ];
    for (const close of closes) {
      if (!screen.queryByRole('dialog', { name: 'New project' })) fireEvent.click(button);
      fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Half typed' } });
      close();
      expect(screen.queryByRole('dialog', { name: 'New project' })).toBeNull();
      expect(document.activeElement).toBe(button);
    }
    fireEvent.click(button);
    expect((screen.getByLabelText('Project name') as HTMLInputElement).value).toBe(''); // each one starts empty
    fireEvent.mouseDown(screen.getByRole('dialog', { name: 'New project' })); // a click inside the form does not close it
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeTruthy();
  });

  it('creates the project with its instructions, uploads the files, adds the people, and opens it', async () => {
    const { api, router, form } = await openForm();
    const create = vi.spyOn(api.projects, 'create');
    const upload = vi.spyOn(api.projects, 'uploadFile');
    const addMember = vi.spyOn(api.projects, 'addMember');
    fireEvent.change(within(form).getByLabelText('Project name'), { target: { value: ' Port Strategy ' } });
    fireEvent.change(within(form).getByLabelText(/^Instructions/), { target: { value: 'Answer in British English.' } });
    fireEvent.change(within(form).getByLabelText(/^Archives/), { target: { files: [pdf('Baseline.pdf'), pdf('Roadmap.pdf')] } });
    expect(within(form).getByText('2 files will be added to Archives.')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/^Teams & Contacts/), { target: { value: 'lena@example.com, omar@example.com' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/projects\/.+/), find);
    expect(create).toHaveBeenCalledWith({ name: 'Port Strategy', instructions: 'Answer in British English.' });
    const id = router.state.location.pathname.split('/')[2]!;
    expect(upload.mock.calls.map(([project, file]) => [project, file.name])).toEqual([[id, 'Baseline.pdf'], [id, 'Roadmap.pdf']]);
    expect(addMember.mock.calls).toEqual([[id, { email: 'lena@example.com', role: 'member' }], [id, { email: 'omar@example.com', role: 'member' }]]);

    // The project page shows what was created: its files, its people and its instructions.
    expect(await screen.findByRole('heading', { level: 1, name: 'Port Strategy' }, find)).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Archives/ }).textContent).toBe('Archives2');
    expect(screen.getByRole('tab', { name: /Teams & Contacts/ }).textContent).toBe('Teams & Contacts3'); // the owner and two people
    fireEvent.click(screen.getByRole('tab', { name: 'Instructions' }));
    expect(await screen.findByDisplayValue('Answer in British English.')).toBeTruthy();
  });

  it('an invalid email stops it before anything is created', async () => {
    const { api, form } = await openForm();
    const create = vi.spyOn(api.projects, 'create');
    fireEvent.change(within(form).getByLabelText('Project name'), { target: { value: 'Port Strategy' } });
    fireEvent.change(within(form).getByLabelText(/^Teams & Contacts/), { target: { value: 'lena@example.com, not-an-email' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create project' }));
    expect(within(form).getByRole('alert').textContent).toBe('"not-an-email" is not a valid email address.');
    expect(create).not.toHaveBeenCalled();
  });

  it('a file or a person the backend refuses is named, and the project is still created and opened', async () => {
    const { api, router, form } = await openForm();
    vi.spyOn(api.projects, 'uploadFile').mockRejectedValue(new ApiError(503, 'unavailable', 'Project file storage is not set up on the server yet. Uploads will work once it is.'));
    vi.spyOn(api.projects, 'addMember').mockRejectedValue(new ApiError(404, 'not_found', 'No Lam13 account uses this email.'));
    fireEvent.change(within(form).getByLabelText('Project name'), { target: { value: 'Port Strategy' } });
    fireEvent.change(within(form).getByLabelText(/^Archives/), { target: { files: [pdf('Baseline.pdf')] } });
    fireEvent.change(within(form).getByLabelText(/^Teams & Contacts/), { target: { value: 'nobody@example.com' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create project' }));

    const message = await screen.findByText(/The project was created, but not everything was added\./, {}, find);
    expect(message.textContent).toContain('Baseline.pdf: Project file storage is not set up on the server yet.');
    expect(message.textContent).toContain('nobody@example.com: No Lam13 account uses this email.');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/projects\/.+/));
    expect(await screen.findByRole('heading', { level: 1, name: 'Port Strategy' }, find)).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Archives/ }).textContent).toBe('Archives0'); // nothing pretends to have been uploaded
  });

  it('a project the backend refuses to create shows its reason and keeps the form', async () => {
    const { api, router, form } = await openForm();
    vi.spyOn(api.projects, 'create').mockRejectedValue(new ApiError(409, 'conflict', 'You already have a project with this name.'));
    fireEvent.change(within(form).getByLabelText('Project name'), { target: { value: 'Port Strategy' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create project' }));
    expect((await within(form).findByRole('alert')).textContent).toBe('You already have a project with this name.');
    expect(router.state.location.pathname).toBe('/projects');
    expect((within(form).getByLabelText('Project name') as HTMLInputElement).value).toBe('Port Strategy');
  });
});

describe('Project: Summary', () => {
  it('is the last section and shows the summary as plain text, with nothing to edit', async () => {
    renderApp('/projects');
    fireEvent.click(await screen.findByRole('link', { name: /National Water Security Strategy/ }, find));
    const tabs = await screen.findAllByRole('tab', {}, find);
    expect(tabs.at(-1)!.textContent).toBe('Summary');
    fireEvent.click(tabs.at(-1)!);
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Baseline, KPI framework and delivery roadmap for the 2030 water security programme.').tagName).toBe('P');
    expect(within(panel).queryByRole('textbox')).toBeNull();
    expect(within(panel).queryByRole('button')).toBeNull();
  });

  it('a project without a summary says so', async () => {
    const { api } = renderApp('/projects');
    const created = await api.projects.create({ name: 'Empty one' });
    renderApp(`/projects/${created.id}`, { api });
    fireEvent.click((await screen.findAllByRole('tab', { name: 'Summary' }, find)).at(-1)!);
    expect(screen.getByText('This project has no summary yet.')).toBeTruthy();
  });
});

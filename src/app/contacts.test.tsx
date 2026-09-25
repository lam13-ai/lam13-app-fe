import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './testUtils';

/** The contact grid's card names, in order. */
async function cardNames() {
  const list = await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
  return within(list)
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent);
}

/** Opens a contact's sheet from its card and returns the sheet dialog. */
async function openContact(name: string) {
  await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
  const button = screen.getByRole('button', { name });
  button.focus(); // a real click focuses the button; jsdom's doesn't
  fireEvent.click(button);
  return screen.getByRole('dialog', { name });
}

const card = (name: string) => screen.getByRole('button', { name }).closest('article')!;
const change = (label: string, value: string) =>
  fireEvent.change(within(screen.getByRole('form')).getByLabelText(label, { exact: false }), { target: { value } });

describe('My Contacts', () => {
  it('is reachable from the sidebar, which marks it active', async () => {
    const { router } = renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Open sidebar' }, { timeout: 8000 }));
    const drawer = screen.getByRole('dialog', { name: 'Sidebar' });
    fireEvent.click(within(drawer).getByRole('link', { name: 'My Contacts' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'My Contacts' }, { timeout: 8000 })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/contacts');
    expect(within(drawer).getByRole('link', { name: 'My Contacts' }).getAttribute('aria-current')).toBe('page');
    // The conversation history is still there, unchanged.
    expect(within(drawer).getByRole('navigation', { name: 'Conversations' })).toBeTruthy();
  });

  it('lists contacts A–Z as cards with role, company, email, description preview, updated time and suggestions', async () => {
    renderApp('/contacts');
    expect(await cardNames()).toEqual(['Daniel Brandt', 'Hannah Lee', 'Maya Okafor', 'Priya Raman', 'Saqlain Haider', 'Tomás Alvarez']);

    const saqlain = within(card('Saqlain Haider'));
    expect(saqlain.getByText('Product Manager')).toBeTruthy();
    expect(saqlain.getByText('Northwind Labs')).toBeTruthy();
    expect(saqlain.getByText('saqlain@northwind.example')).toBeTruthy();
    expect(saqlain.getByText('Product-focused and works closely with engineering teams.').className).toContain('line-clamp-3');
    expect(saqlain.getByText('2h ago')).toBeTruthy();
    expect(saqlain.getByText('2 suggested updates')).toBeTruthy();

    // Optional fields are simply absent: no email for Maya, no About for Priya (empty description).
    expect(within(card('Maya Okafor')).queryByText(/@/)).toBeNull();
    expect(within(card('Priya Raman')).queryByText('About')).toBeNull();
    expect(within(card('Daniel Brandt')).queryByText(/suggested update/)).toBeNull();
  });

  it('searches by name, company, position and email, and sorts by recently updated', async () => {
    renderApp('/contacts');
    await cardNames();
    const search = screen.getByRole('searchbox', { name: 'Search contacts' });
    const searchFor = async (q: string) => {
      fireEvent.change(search, { target: { value: q } });
      return cardNames();
    };

    expect(await searchFor('maya')).toEqual(['Maya Okafor']);
    expect(await searchFor('MERIDIAN')).toEqual(['Priya Raman']);
    expect(await searchFor('chief')).toEqual(['Daniel Brandt', 'Hannah Lee']);
    expect(await searchFor('harborfinch.example')).toEqual(['Daniel Brandt']);

    fireEvent.change(search, { target: { value: 'nobody' } });
    expect(screen.getByText('No contacts match “nobody”.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await cardNames()).toHaveLength(6);

    fireEvent.click(screen.getByRole('button', { name: 'Sort: All contacts' }));
    await act(async () => fireEvent.click(screen.getByRole('menuitemradio', { name: 'Recently updated' })));
    expect((await cardNames()).slice(0, 3)).toEqual(['Tomás Alvarez', 'Saqlain Haider', 'Maya Okafor']);
  });

  it('shows an empty state with Add contact when there are no contacts', async () => {
    const { api, router } = renderApp('/');
    for (const p of (await api.profiles.list()).items) await api.profiles.delete(p.id);
    await act(() => router.navigate('/contacts'));

    expect(await screen.findByText('No contacts yet.', {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.getByText('Add people you work with and keep approved notes about them in one place.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(screen.getByRole('dialog', { name: 'Add contact' })).toBeTruthy();
  });

  it('adds a contact: validates required fields and email, trims, saves, and shows it in the grid', async () => {
    const { api } = renderApp('/contacts');
    await cardNames();
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    const sheet = screen.getByRole('dialog', { name: 'Add contact' });
    expect(document.activeElement).toBe(within(sheet).getByLabelText('Full name'));

    fireEvent.click(within(sheet).getByRole('button', { name: 'Save contact' }));
    expect(within(sheet).getByText('Enter a full name.')).toBeTruthy();
    expect(within(sheet).getByText('Enter a position.')).toBeTruthy();
    expect(within(sheet).getByText('Enter a company.')).toBeTruthy();
    expect(within(sheet).getByLabelText('Full name').getAttribute('aria-invalid')).toBe('true');
    // Description and contact details are optional.
    expect(within(sheet).queryByText(/Enter a description/)).toBeNull();

    change('Full name', '  Aashir Aqeel  ');
    change('Position', 'CEO');
    change('Company', 'Lam13');
    change('Description', '  Strategy-focused founder.  ');
    change('Email', 'aashir@');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save contact' }));
    expect(within(sheet).getByText(/Enter a valid email address/)).toBeTruthy();
    expect(document.activeElement).toBe(within(sheet).getByLabelText('Email', { exact: false }));

    change('Email', 'aashir@lam13.example');
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: 'Save contact' })));

    expect(await screen.findByText('Aashir Aqeel added.')).toBeTruthy();
    expect(await cardNames()).toContain('Aashir Aqeel');
    const saved = (await api.profiles.list()).items.find((p) => p.full_name === 'Aashir Aqeel')!;
    expect(saved).toMatchObject({ position: 'CEO', company: 'Lam13', description: 'Strategy-focused founder.', email: 'aashir@lam13.example', phone: null, linkedin: null });
    expect(saved.created_at).toBe(saved.updated_at);
  });

  it('opens an expanded profile with contact details, About and dates; hides empty fields; Escape closes', async () => {
    renderApp('/contacts');
    const daniel = await openContact('Daniel Brandt');
    expect(daniel.getAttribute('aria-modal')).toBe('true');
    expect(within(daniel).getByRole('link', { name: 'd.brandt@harborfinch.example' }).getAttribute('href')).toBe('mailto:d.brandt@harborfinch.example');
    expect(within(daniel).getByRole('link', { name: '+1 555 0142' }).getAttribute('href')).toBe('tel:+15550142');
    const linkedin = within(daniel).getByRole('link', { name: 'linkedin.com/in/daniel-brandt-demo' });
    expect(linkedin.getAttribute('rel')).toContain('noopener');
    expect(within(daniel).getByText(/five-year cash view/)).toBeTruthy();
    expect(within(daniel).getByText('Created')).toBeTruthy();
    expect(within(daniel).getByText('Last updated')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Daniel Brandt' })));

    const hannah = await openContact('Hannah Lee');
    expect(within(hannah).getByText('Email')).toBeTruthy();
    expect(within(hannah).queryByText('Phone')).toBeNull();
    expect(within(hannah).queryByText('LinkedIn')).toBeNull();
    fireEvent.click(within(hannah).getByRole('button', { name: 'Close' }));

    const maya = await openContact('Maya Okafor');
    expect(within(maya).queryByRole('heading', { name: 'Contact' })).toBeNull();
  });

  it('edits a profile (Cancel discards, Save updates the canonical profile)', async () => {
    const { api } = renderApp('/contacts');
    const before = await api.profiles.get('priya-raman');
    let sheet = await openContact('Priya Raman');

    fireEvent.click(within(sheet).getByRole('button', { name: 'Edit' }));
    sheet = screen.getByRole('dialog', { name: 'Edit Priya Raman' });
    expect((within(sheet).getByLabelText('Position') as HTMLInputElement).value).toBe('Head of Data Platforms');
    change('Position', 'Throwaway');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    sheet = screen.getByRole('dialog', { name: 'Priya Raman' });
    expect(within(sheet).getByText('Head of Data Platforms')).toBeTruthy();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Edit' }));
    change('Position', 'VP Data');
    change('Phone', '+1 555 0100');
    change('Email', '');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));

    sheet = screen.getByRole('dialog', { name: 'Priya Raman' });
    expect(await within(sheet).findByText('VP Data')).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: '+1 555 0100' })).toBeTruthy();
    expect(within(sheet).queryByText('Email')).toBeNull();
    expect(await screen.findByText('Changes saved.')).toBeTruthy();
    const after = await api.profiles.get('priya-raman');
    expect(after).toMatchObject({ position: 'VP Data', phone: '+1 555 0100', email: null });
    expect(Date.parse(after.updated_at)).toBeGreaterThan(Date.parse(before.updated_at));
  });

  it('deletes a contact after a separate confirmation', async () => {
    const { api } = renderApp('/contacts');
    const sheet = await openContact('Hannah Lee');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));
    const confirm = within(sheet).getByRole('alertdialog', { name: 'Delete Hannah Lee?' });
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }));

    await act(async () => fireEvent.click(within(confirm).getByRole('button', { name: 'Delete contact' })));
    expect(await screen.findByText('Hannah Lee deleted.')).toBeTruthy();
    expect(await cardNames()).not.toContain('Hannah Lee');
    await expect(api.profiles.get('hannah-lee')).rejects.toMatchObject({ status: 404 });
  });

  it('shows each pending suggestion as Current vs Suggested; Approve applies it, Reject leaves the profile unchanged', async () => {
    const { api } = renderApp('/contacts');
    const sheet = await openContact('Saqlain Haider');
    const review = within(sheet).getByRole('heading', { name: 'Review 2 suggested updates' });
    expect(within(sheet).getByText('Nothing changes until you approve.', { exact: false })).toBeTruthy();

    const position = within(sheet).getByRole('group', { name: 'Position: current and suggested' });
    expect(within(position).getByText('Current').nextSibling?.textContent).toBe('Product Manager');
    expect(within(position).getByText('Suggested').nextSibling?.textContent).toBe('Senior Product Manager');
    const description = within(sheet).getByRole('group', { name: 'Description: current and suggested' });
    expect(within(description).getByText('Current').nextSibling?.textContent).toBe('Product-focused and works closely with engineering teams.');
    expect(within(description).getByText('Suggested').nextSibling?.textContent).toMatch(/^Product-focused and structured; prefers concise/);
    expect(within(sheet).getAllByText('From meeting · Q4 roadmap review ·', { exact: false })).toHaveLength(2);

    // Approve: the position changes at once, in the sheet, the card and the backend.
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: 'Approve update to Position' })));
    expect(await screen.findByText('Profile updated.')).toBeTruthy();
    expect(document.activeElement).toBe(within(sheet).getByRole('heading', { level: 2, name: 'Saqlain Haider' }));
    expect(review.textContent).toBe('Review 1 suggested update');
    expect(within(card('Saqlain Haider')).getByText('Senior Product Manager')).toBeTruthy();
    expect(within(card('Saqlain Haider')).getByText('1 suggested update')).toBeTruthy();
    expect((await api.profiles.get('saqlain-haider')).position).toBe('Senior Product Manager');

    // Reject: the description stays exactly as it was.
    const before = await api.profiles.get('saqlain-haider');
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: 'Reject update to Description' })));
    expect(await screen.findByText('Suggestion rejected. Profile unchanged.')).toBeTruthy();
    expect(within(sheet).queryByText(/suggested update/)).toBeNull();
    expect(within(sheet).getByText('Product-focused and works closely with engineering teams.')).toBeTruthy();
    expect(await api.profiles.get('saqlain-haider')).toEqual(before);

    const decided = (await api.profileSuggestions.list({ profile_id: 'saqlain-haider' })).items;
    expect(decided.map((s) => [s.id, s.status])).toEqual([
      ['sug-saqlain-description', 'rejected'],
      ['sug-saqlain-position', 'approved'],
    ]);
    expect(within(card('Saqlain Haider')).queryByText(/suggested update/)).toBeNull();
  });

  it('reviews a multi-field suggestion as one change set, showing unset current values', async () => {
    const { api } = renderApp('/contacts');
    const sheet = await openContact('Maya Okafor');
    const email = within(sheet).getByRole('group', { name: 'Email: current and suggested' });
    expect(within(email).getByText('Not set')).toBeTruthy();
    expect(within(email).getByText('maya.okafor@civictech.example')).toBeTruthy();
    expect(within(sheet).getByRole('group', { name: 'Phone: current and suggested' })).toBeTruthy();

    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: 'Approve update to Email, Phone' })));
    expect(await within(sheet).findByRole('link', { name: 'maya.okafor@civictech.example' })).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: '+1 555 0119' })).toBeTruthy();
    expect(await api.profiles.get('maya-okafor')).toMatchObject({ email: 'maya.okafor@civictech.example', phone: '+1 555 0119' });
  });

  it('rolls back an approval the server refuses', async () => {
    const { api } = renderApp('/contacts', { mock: { failProfileWrites: true } });
    const before = await api.profiles.get('saqlain-haider');
    const sheet = await openContact('Saqlain Haider');

    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: 'Approve update to Position' })));
    expect(await screen.findByText(/Couldn't apply the update/)).toBeTruthy();
    expect(within(sheet).getByText('Review 2 suggested updates')).toBeTruthy();
    expect(within(card('Saqlain Haider')).getByText('Product Manager')).toBeTruthy();
    expect(await api.profiles.get('saqlain-haider')).toEqual(before);
  });

  it('meets accessibility basics: labelled controls, headings, 44px touch targets', async () => {
    renderApp('/contacts');
    await cardNames();
    // Each card is one button, named by the person and described by role/company.
    const button = screen.getByRole('button', { name: 'Daniel Brandt' });
    expect(button.closest('h2')).not.toBeNull();
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain('Harbor & Finch Capital');
    // Mobile targets: inputs/buttons are 44px (h-11) below the desktop breakpoint.
    expect(screen.getByRole('searchbox', { name: 'Search contacts' }).className).toContain('h-11');
    expect(screen.getByRole('button', { name: 'Add contact' }).className).toContain('h-11');

    const sheet = await openContact('Saqlain Haider');
    for (const name of ['Approve update to Position', 'Reject update to Position', 'Edit', 'Delete']) {
      expect(within(sheet).getByRole('button', { name }).className).toMatch(/h-11/);
    }
    expect(within(sheet).getByRole('button', { name: 'Close' }).className).toContain('hit-area');
  });
});

describe('My Contacts theming', () => {
  // Light / Dark / System all come from semantic tokens: no hard-coded colours in this feature.
  const sources = import.meta.glob('/src/features/contacts/**/*.tsx', { query: '?raw', import: 'default', eager: true });

  it('uses only theme tokens', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(4);
    for (const [file, source] of Object.entries(sources)) {
      expect({ file, colours: String(source).match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(?:bg|text|border)-(?:white|black|gray|slate|zinc|neutral|blue)\b/gi) }).toEqual({ file, colours: null });
    }
  });
});

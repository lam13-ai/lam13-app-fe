import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { createHttpAdapter } from '@/api';

/** Test helpers: a stubbed /contacts backend behind the real HTTP adapter (routers/contacts_route.py's contract). */

export const contact = (id: string, full_name: string, over: Record<string, unknown> = {}) => ({
  id,
  full_name,
  position: 'CFO',
  company: 'Harbor & Finch',
  description: null,
  email: null,
  phone: null,
  linkedin: null,
  current_version: 1,
  created_at: '2026-09-20T10:00:00',
  updated_at: '2026-09-27T09:30:00',
  ...over,
});
export const suggestionDto = (id: string, over: Record<string, unknown>) => ({
  id,
  contact_id: null,
  kind: 'create',
  status: 'pending',
  suggested: {} as Record<string, unknown>,
  applied: {},
  reason: '',
  source: { type: 'meeting', ref_id: 'm1', title: 'Vendor Shortlist Review', occurred_at: null },
  base_version: null,
  resolved_version: null,
  created_at: '2026-09-28T09:00:00',
  resolved_at: null,
  ...over,
});

export function backend({ testEndpoint }: { testEndpoint?: (body: unknown) => Response | Promise<Response> } = {}) {
  const contacts = [contact('c1', 'Daniel Brandt')];
  let suggestions = [
    suggestionDto('upd1', { kind: 'update', contact_id: 'c1', suggested: { position: 'Chief Financial Officer' }, source: { type: 'meeting', ref_id: 'm0', title: 'Board prep', occurred_at: null } }),
  ];
  const calls: { method: string; url: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url === '/chat/sessions') return Response.json([]);
    if (url === '/contacts' && method === 'GET') return Response.json(contacts);
    // Every status: the UI shows the newest suggestion per group, only while it is pending.
    if (url === '/contacts/suggestions') return Response.json(suggestions);
    if (url === '/contacts/test-adding-suggestions' && method === 'POST') {
      if (testEndpoint) return testEndpoint(body);
      // Like the server: stamped now (later than anything seeded).
      const created = suggestionDto(`new${suggestions.length}`, {
        // Like create_suggestion: a contact_id makes it an update for that contact.
        kind: body.contact_id ? 'update' : 'create',
        contact_id: body.contact_id ?? null,
        suggested: body.fields,
        reason: body.reason,
        source: body.source,
        created_at: `2026-09-28T12:00:${String(suggestions.length).padStart(2, '0')}`,
      });
      suggestions = [created, ...suggestions];
      return Response.json(created, { status: 201 });
    }
    const decided = /^\/contacts\/suggestions\/([^/]+)\/(approve|reject)$/.exec(url);
    if (decided && method === 'POST') {
      // Like a real server: answer after the UI has re-rendered (the optimistic removal happens first).
      await new Promise((resolve) => setTimeout(resolve, 30));
      const s = suggestions.find((x) => x.id === decided[1])!;
      s.status = decided[2] === 'approve' ? 'approved' : 'rejected';
      if (decided[2] === 'reject') return Response.json(s);
      if (s.kind === 'create') {
        const added = contact('c-new', String(s.suggested.full_name), { ...s.suggested });
        contacts.push(added);
        return Response.json({ suggestion: s, contact: added });
      }
      const target = contacts.find((c) => c.id === s.contact_id)!;
      Object.assign(target, s.suggested);
      return Response.json({ suggestion: s, contact: target });
    }
    return Response.json({ detail: 'Not Found' }, { status: 404 });
  });
  return {
    api: createHttpAdapter(),
    calls,
    add: (dto: ReturnType<typeof suggestionDto>) => (suggestions = [dto, ...suggestions]),
    addContact: (c: ReturnType<typeof contact>) => contacts.push(c),
    renameContact: (id: string, full_name: string) => Object.assign(contacts.find((c) => c.id === id)!, { full_name }),
  };
}

export const proposals = () => screen.queryByRole('list', { name: 'Suggested new contacts' });
export const findProposals = () => screen.findByRole('list', { name: 'Suggested new contacts' }, { timeout: 8000 });

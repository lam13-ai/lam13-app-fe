import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRequests } from './VoiceRequests';

const fixture = vi.hoisted(() => ({ status: 'idle', actions: [{ id: 'action', title: 'Governance review', request: 'Review governance', status: 'recorded', missing: [], error: '' }], refresh: vi.fn(), manage: vi.fn() }));
vi.mock('../CallingProvider', () => ({ useCall: () => ({ actions: fixture.actions, summaries: ['We discussed governance.'], state: { status: fixture.status }, refreshActions: fixture.refresh }) }));
vi.mock('../rtc', () => ({ manageRtcAction: fixture.manage }));
beforeEach(() => { fixture.status = 'idle'; fixture.manage.mockReset(); fixture.refresh.mockClear(); });

describe('recorded voice requests', () => {
  it('starts work only after an explicit button click', async () => {
    fixture.manage.mockResolvedValue({ queued: true });
    render(<VoiceRequests />);
    expect(fixture.manage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Start in chat'));
    await waitFor(() => expect(fixture.manage).toHaveBeenCalledWith('action', 'start'));
    await waitFor(() => expect(fixture.refresh).toHaveBeenCalled());
  });
  it('shows missing-context failures rather than claiming the request started', async () => {
    fixture.manage.mockResolvedValue({ queued: false, missing: ['country'] });
    render(<VoiceRequests />);
    fireEvent.click(screen.getByText('Start in chat'));
    expect((await screen.findByRole('alert')).textContent).toContain('needs more context');
  });
  it('does not offer messaging execution controls during an active call', () => {
    fixture.status = 'active';
    render(<VoiceRequests />);
    expect(screen.queryByText('Start in chat')).toBeNull();
    expect(screen.getByText('We discussed governance.')).toBeTruthy();
    expect(fixture.manage).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ChatModule from '@/features/chat';
import { RouteError } from './routes/RouteError';
import { renderApp } from './testUtils';

const crash = vi.hoisted(() => ({ on: false }));
vi.mock('@/features/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof ChatModule>();
  return {
    ...actual,
    ChatView: (props: Parameters<typeof actual.ChatView>[0]) => {
      if (crash.on) throw new Error('secret internal detail');
      return actual.ChatView(props);
    },
  };
});

afterEach(() => {
  crash.on = false;
  vi.restoreAllMocks();
});

describe('error boundaries', () => {
  it('a crashed chat view shows a recoverable error inside the workspace, without the error details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    crash.on = true;
    renderApp('/c/water-security-kpis');

    expect(await screen.findByRole('heading', { name: 'Something went wrong.' }, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
    // The shell survives: the conversation list is still usable.
    expect(await screen.findByRole('navigation', { name: 'Conversations', hidden: true })).toBeTruthy();

    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('the standalone boundary catches failures outside the workspace shell', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('token=abc');
    };
    const router = createMemoryRouter([{ errorElement: <RouteError standalone />, children: [{ path: '/', Component: Boom }] }]);
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.queryByText(/token=abc/)).toBeNull();
  });
});

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiAdapter } from '@/api';
import { DEMO_CODE, EXPIRED_DEMO_CODE } from '@/api/mock/whatsapp';
import { renderApp } from './testUtils';

/**
 * Integrations page and the WhatsApp connection flow (frontend-only: `api.whatsapp` is a local mock that
 * sends nothing; DEMO_CODE verifies).
 */

const whatsapp = () => screen.getByRole('region', { name: 'WhatsApp' });
const digits = () => within(whatsapp()).getAllByRole('textbox', { name: /Digit \d of 6/ });
const verifyButton = () => within(whatsapp()).getByRole('button', { name: /^(Verify|Connecting WhatsApp…)$/ }) as HTMLButtonElement;

async function open() {
  const app = renderApp('/integrations');
  await within(await screen.findByRole('region', { name: 'WhatsApp' }, { timeout: 8000 })).findByRole('button', {
    name: 'Connect WhatsApp',
  });
  return app;
}

/** Connect → Pakistan → number → Send verification code. */
async function toVerification(number = '0300 1234567') {
  fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Connect WhatsApp' }));
  fireEvent.change(within(whatsapp()).getByRole('combobox', { name: 'Country code' }), { target: { value: 'PK' } });
  fireEvent.change(within(whatsapp()).getByLabelText('WhatsApp number'), { target: { value: number } });
  await act(async () => fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Continue' })));
  await within(whatsapp()).findByRole('heading', { name: 'Verify your WhatsApp number' });
}

const type = (code: string) => code.split('').forEach((d, i) => fireEvent.change(digits()[i]!, { target: { value: d } }));
const value = () => digits().map((d) => (d as HTMLInputElement).value).join('');

describe('Integrations page', () => {
  it('is in the sidebar and lists Granola and a disconnected WhatsApp', async () => {
    const { router } = renderApp('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Integrations' }, { timeout: 8000 }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Integrations' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/integrations');
    expect(screen.getByRole('region', { name: 'Granola' })).toBeTruthy();
    await within(whatsapp()).findByRole('button', { name: 'Connect WhatsApp' });
    expect(within(whatsapp()).getByText(/receive messages and voice notes directly in Lam13/)).toBeTruthy();
  });
});

describe('WhatsApp connection', () => {
  it('validates the number, then shows it on the verification step', async () => {
    await open();
    fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Connect WhatsApp' }));
    fireEvent.change(within(whatsapp()).getByRole('combobox', { name: 'Country code' }), { target: { value: 'PK' } });
    const input = within(whatsapp()).getByLabelText('WhatsApp number');
    fireEvent.change(input, { target: { value: '300 12' } });
    fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Continue' }));
    expect(within(whatsapp()).getByText(/Enter a valid Pakistan number/)).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: '0300 123 4567' } });
    await act(async () => fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Continue' })));
    await within(whatsapp()).findByRole('heading', { name: 'Verify your WhatsApp number' });
    expect(within(whatsapp()).getByText('+92 300 1234567')).toBeTruthy();
    expect(within(whatsapp()).getByText(/Development preview: no WhatsApp message is sent/)).toBeTruthy(); // development builds only
  });

  it('code input: six digits, paste fills all, non-digits ignored, Verify disabled until complete', async () => {
    await open();
    await toVerification();
    expect(digits()).toHaveLength(6);
    expect(document.activeElement).toBe(digits()[0]);
    expect(verifyButton().disabled).toBe(true);
    fireEvent.change(digits()[0]!, { target: { value: 'a' } });
    expect(value()).toBe('');
    type('12345');
    expect(value()).toBe('12345');
    expect(verifyButton().disabled).toBe(true);
    fireEvent.keyDown(digits()[4]!, { key: 'Backspace' });
    expect(value()).toBe('1234');

    fireEvent.paste(digits()[0]!, { clipboardData: { getData: () => ' 98-76 54 ' } });
    expect(value()).toBe('987654');
    expect(verifyButton().disabled).toBe(false);
  });

  it('the demo code connects (via "Connecting WhatsApp…") and shows the number; disconnect is confirmed', async () => {
    const { api } = await open();
    let release!: () => void;
    const verify = api.whatsapp.verifyCode.bind(api.whatsapp);
    vi.spyOn(api.whatsapp, 'verifyCode').mockImplementation(async (code) => {
      await new Promise<void>((r) => (release = r));
      return verify(code);
    });
    await toVerification();
    type(DEMO_CODE);
    await act(async () => fireEvent.click(verifyButton()));
    expect(verifyButton().textContent).toContain('Connecting WhatsApp…');
    expect(verifyButton().disabled).toBe(true);
    await act(async () => release());

    expect(await within(whatsapp()).findByText('Connected')).toBeTruthy();
    expect(within(whatsapp()).getByText('+92 300 1234567')).toBeTruthy();
    expect(within(whatsapp()).getByText(/Lam13 can now receive your WhatsApp messages and voice notes/)).toBeTruthy();

    fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Disconnect' }));
    const confirm = within(whatsapp()).getByRole('alertdialog', { name: 'Disconnect WhatsApp?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(within(whatsapp()).getByText('Connected')).toBeTruthy();

    fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Disconnect' }));
    await act(async () =>
      fireEvent.click(within(within(whatsapp()).getByRole('alertdialog')).getByRole('button', { name: 'Disconnect' })),
    );
    expect(await within(whatsapp()).findByRole('button', { name: 'Connect WhatsApp' })).toBeTruthy();
  });

  it('shows incorrect and expired codes, keeping the step', async () => {
    await open();
    await toVerification();
    type('111111');
    await act(async () => fireEvent.click(verifyButton()));
    expect(await within(whatsapp()).findByText('That verification code is incorrect.')).toBeTruthy();
    expect(value()).toBe(''); // cleared for another try
    type(EXPIRED_DEMO_CODE);
    await act(async () => fireEvent.click(verifyButton()));
    expect(await within(whatsapp()).findByText('Your verification code has expired. Request a new one.')).toBeTruthy();
    expect(within(whatsapp()).getByText('+92 300 1234567')).toBeTruthy();
  });

  it('resend waits for the cooldown, keeps the number and restarts the countdown', async () => {
    const { api } = await open();
    const shorten = (fn: ApiAdapter['whatsapp']['requestVerification']) =>
      vi.fn(async (...args: Parameters<typeof fn>) => ({ ...(await fn(...args)), resend_after_seconds: 1 }));
    api.whatsapp.requestVerification = shorten(api.whatsapp.requestVerification.bind(api.whatsapp));
    const resend = vi.spyOn(api.whatsapp, 'resendCode');
    await toVerification();
    expect(within(whatsapp()).getByText(/Resend code in \ds/)).toBeTruthy();
    const button = await within(whatsapp()).findByRole('button', { name: 'Resend code' }, { timeout: 3000 });
    await act(async () => fireEvent.click(button));
    await waitFor(() => expect(resend).toHaveBeenCalledOnce());
    expect(await within(whatsapp()).findByText(/Resend code in \d+s/)).toBeTruthy(); // 30s again (the mock's cooldown)
    expect(within(whatsapp()).getByText('+92 300 1234567')).toBeTruthy();
  });

  it('"Change number" returns to the number step with what was typed', async () => {
    await open();
    await toVerification('300 7654321');
    fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Change number' }));
    expect((within(whatsapp()).getByLabelText('WhatsApp number') as HTMLInputElement).value).toBe('300 7654321');
    expect((within(whatsapp()).getByRole('combobox', { name: 'Country code' }) as HTMLSelectElement).value).toBe('PK');
  });

  it('service failures are shown where they happen, without losing input', async () => {
    const { api } = await open();
    const request = vi.spyOn(api.whatsapp, 'requestVerification').mockRejectedValueOnce(new ApiError(0, 'network_error', 'offline'));
    fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Connect WhatsApp' }));
    fireEvent.change(within(whatsapp()).getByRole('combobox', { name: 'Country code' }), { target: { value: 'PK' } });
    fireEvent.change(within(whatsapp()).getByLabelText('WhatsApp number'), { target: { value: '3001234567' } });
    await act(async () => fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Continue' })));
    expect(await within(whatsapp()).findByText("Couldn't send a verification code. Try again.")).toBeTruthy();
    expect((within(whatsapp()).getByLabelText('WhatsApp number') as HTMLInputElement).value).toBe('3001234567');

    request.mockRestore();
    await act(async () => fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Continue' })));
    await within(whatsapp()).findByRole('heading', { name: 'Verify your WhatsApp number' });
    vi.spyOn(api.whatsapp, 'verifyCode').mockRejectedValueOnce(new ApiError(503, 'unavailable', 'down'));
    type(DEMO_CODE);
    await act(async () => fireEvent.click(verifyButton()));
    expect(await within(whatsapp()).findByText("Couldn't connect WhatsApp. Try again.")).toBeTruthy();
    expect(value()).toBe(DEMO_CODE); // kept: the code wasn't wrong

    await act(async () => fireEvent.click(verifyButton()));
    await within(whatsapp()).findByText('Connected');
    vi.spyOn(api.whatsapp, 'disconnect').mockRejectedValueOnce(new ApiError(503, 'unavailable', 'down'));
    fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Disconnect' }));
    await act(async () =>
      fireEvent.click(within(within(whatsapp()).getByRole('alertdialog')).getByRole('button', { name: 'Disconnect' })),
    );
    expect(await within(whatsapp()).findByText("Couldn't disconnect WhatsApp. Try again.")).toBeTruthy();
    expect(within(whatsapp()).getByText('Connected')).toBeTruthy();
  });

  it('a failed status load offers a retry', async () => {
    const app = renderApp('/integrations');
    const status = vi.spyOn(app.api.whatsapp, 'status').mockRejectedValue(new ApiError(400, 'bad_request', 'nope'));
    expect(await screen.findByText("Couldn't load your WhatsApp connection.", {}, { timeout: 8000 })).toBeTruthy();
    status.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await within(whatsapp()).findByRole('button', { name: 'Connect WhatsApp' });
  });
});

describe('WhatsApp: two ways to make the same link', () => {
  it('the verification step says the code arrives on WhatsApp (not email)', async () => {
    await open();
    await toVerification();
    const text = whatsapp().textContent ?? '';
    expect(text).toContain('Check WhatsApp for the code.');
    expect(text).toMatch(/should have arrived on WhatsApp at \+92 300 1234567/);
    expect(text.toLowerCase()).not.toContain('email');
  });

  it('while disconnected, explains starting from WhatsApp — no fake WhatsApp conversation, no link until one is configured', async () => {
    await open();
    expect(within(whatsapp()).getByText('Prefer to start from WhatsApp?')).toBeTruthy();
    expect(within(whatsapp()).getByText(/message the Lam13 WhatsApp number and follow the verification steps there/)).toBeTruthy();
    expect(within(whatsapp()).queryByRole('button', { name: /Open WhatsApp/ })).toBeNull(); // the mock has no Lam13 number
    expect(within(whatsapp()).queryByRole('log')).toBeNull();
    expect(within(whatsapp()).queryByRole('textbox')).toBeNull();
  });

  it('offers "Open WhatsApp" only for a real WhatsApp link from the service', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    const app = renderApp('/integrations');
    const status = vi.spyOn(app.api.whatsapp, 'status');
    status.mockResolvedValue({ status: 'disconnected', phone_number: null, contact_link: 'https://wa.me/15550000000' });
    const button = await within(await screen.findByRole('region', { name: 'WhatsApp' }, { timeout: 8000 })).findByRole('button', {
      name: /Open WhatsApp/,
    });
    fireEvent.click(button);
    expect(opened).toHaveBeenCalledWith('https://wa.me/15550000000', '_blank', 'noopener,noreferrer');
    cleanup();

    const other = renderApp('/integrations');
    vi.spyOn(other.api.whatsapp, 'status').mockResolvedValue({
      status: 'disconnected',
      phone_number: null,
      contact_link: 'https://example.com/not-whatsapp',
    });
    await within(await screen.findByRole('region', { name: 'WhatsApp' }, { timeout: 8000 })).findByText('Prefer to start from WhatsApp?');
    expect(within(whatsapp()).queryByRole('button', { name: /Open WhatsApp/ })).toBeNull();
  });

  it('a link made from WhatsApp shows as the same connection, and disconnects the same way', async () => {
    const app = renderApp('/integrations');
    vi.spyOn(app.api.whatsapp, 'status').mockResolvedValueOnce({
      status: 'connected',
      phone_number: '+966501234567',
      method: 'whatsapp_to_lam13',
    });
    expect(await within(await screen.findByRole('region', { name: 'WhatsApp' }, { timeout: 8000 })).findByText('Connected')).toBeTruthy();
    expect(within(whatsapp()).getByText('+966 501 234567')).toBeTruthy();
    expect(within(whatsapp()).getByText('Connected via WhatsApp')).toBeTruthy();
    expect(within(whatsapp()).queryByText('Prefer to start from WhatsApp?')).toBeNull();

    fireEvent.click(within(whatsapp()).getByRole('button', { name: 'Disconnect' }));
    await act(async () =>
      fireEvent.click(within(within(whatsapp()).getByRole('alertdialog')).getByRole('button', { name: 'Disconnect' })),
    );
    expect(await within(whatsapp()).findByRole('button', { name: 'Connect WhatsApp' })).toBeTruthy();
    expect(within(whatsapp()).getByText('Prefer to start from WhatsApp?')).toBeTruthy();
  });

  it('Granola stays listed and unchanged beside WhatsApp', async () => {
    await open();
    const granola = screen.getByRole('region', { name: 'Granola' });
    expect(await within(granola).findByRole('button', { name: /Granola connected/ })).toBeTruthy();
  });
});

// FirstRun.tsx + Card.tsx: the link's choice (shared.js standaloneChoice). The built-in server is never named; another
// listed server is named in a warn band in every state, with "Use the built-in server" (the same file without the
// parameter, a new load); a refused parameter says so once and never shows the value it asked for. The server asked
// and named is always the choice's origin.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type { HubConfigRead, StandaloneChoice } from '@core/origin';
import { HUB_FILE_BUILD } from './build';

const m = vi.hoisted(() => ({
  read: vi.fn<(origin: string) => Promise<HubConfigRead>>(),
  set: vi.fn(() => 'set'),
  replace: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('@core/origin', async (orig) => ({ ...(await orig<typeof Origin>()), readHubConfig: m.read, setStandaloneApi: m.set }));
vi.mock('./device', () => ({ startDeviceSignIn: () => ({ stop: m.stop }) }));

const { FirstRun } = await import('./FirstRun');

const ok: HubConfigRead = { ok: true, realmApiDomain: 'api.hoody.test', proxyDomain: 'computers.hoody.test', fileMin: HUB_FILE_BUILD };
const HREF = 'https://files.example.test/hoody-hub.html?x=1&hoody=dev#/';
const BAND = /^Not the built-in Hoody\. This page signs you in to /;

beforeEach(() => {
  m.read.mockReset();
  m.read.mockResolvedValue(ok);
  m.set.mockClear();
  m.replace.mockReset();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, href: HREF, replace: m.replace, reload: vi.fn() } });
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
});
afterEach(cleanup);

const show = async (choice: StandaloneChoice) => {
  render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice }} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('the link\'s choice on the sign-in card', () => {
  it('the built-in server: no band, no host, no footer; that origin asked and named', async () => {
    await show({ origin: 'https://api.hoody.test', asked: 'default' });
    expect(screen.queryByText(BAND)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Use the built-in server$/ })).toBeNull();
    expect(screen.queryByText(/api\.hoody\.test/)).toBeNull();
    expect(screen.queryByText(/Hoody Hub · Build/)).toBeNull();
    expect(m.read).toHaveBeenCalledWith('https://api.hoody.test');
    expect(m.set).toHaveBeenCalledWith({ origin: 'https://api.hoody.test', realmApiDomain: 'api.hoody.test', proxyDomain: 'computers.hoody.test' });
  });

  it('the alternative: named in a warn band; "Use the built-in server" loads the same file without the parameter', async () => {
    await show({ origin: 'https://other.hoody.test', asked: 'alt' });
    expect(screen.getByText('Not the built-in Hoody. This page signs you in to other.hoody.test.')).toBeInTheDocument();
    expect(m.read).toHaveBeenCalledWith('https://other.hoody.test');
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ origin: 'https://other.hoody.test' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Use the built-in server$/ })); });
    expect(m.replace).toHaveBeenCalledWith('https://files.example.test/hoody-hub.html?x=1#/');
  });

  it('this machine: named with its port', async () => {
    await show({ origin: 'http://localhost:3000', asked: 'local' });
    expect(screen.getByText('Not the built-in Hoody. This page signs you in to localhost:3000.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Use the built-in server$/ })).toBeInTheDocument();
    expect(m.read).toHaveBeenCalledWith('http://localhost:3000');
  });

  it('the band shows in every state: also while connecting and when Hoody cannot be reached', async () => {
    m.read.mockReturnValue(new Promise(() => {}));
    render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: 'https://other.hoody.test', asked: 'alt' } }} />);
    expect(screen.getByText(BAND)).toBeInTheDocument();
    cleanup();
    m.read.mockResolvedValue({ ok: false, why: 'refused' });
    await show({ origin: 'https://other.hoody.test', asked: 'alt' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Hoody can't open this Hub right now");
    expect(screen.getByText(BAND)).toBeInTheDocument();
    cleanup();
    render(<FirstRun start={{ kind: 'first-run', step: 'blocked', why: 'signed_in', choice: { origin: 'https://other.hoody.test', asked: 'alt' } }} />);
    expect(screen.getByText(BAND)).toBeInTheDocument();
  });

  it('a refused parameter: the built-in server is used, the card says so, and the asked value is never shown', async () => {
    await show({ origin: 'https://api.hoody.test', asked: 'refused' });
    expect(screen.getByText('This link asked for a server this page does not use. It signs you in to hoody.test.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Use the built-in server$/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/hoody=dev|files\.example\.test/);
    expect(m.read).toHaveBeenCalledWith('https://api.hoody.test');
  });

  it('focus: another server or a refused link focuses the card title first, described by the band; the built-in one focuses the email field', async () => {
    for (const [choice, band] of [
      [{ origin: 'https://other.hoody.test', asked: 'alt' }, 'Not the built-in Hoody. This page signs you in to other.hoody.test.'],
      [{ origin: 'https://api.hoody.test', asked: 'refused' }, 'This link asked for a server this page does not use. It signs you in to hoody.test.'],
    ] as const) {
      await show(choice);
      await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(document.activeElement).toBe(h1);
      const note = document.getElementById(h1.getAttribute('aria-describedby') ?? '');
      expect(note?.textContent).toContain(band);
      cleanup();
    }
    await show({ origin: 'https://api.hoody.test', asked: 'default' });
    await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute('aria-describedby');
    expect(document.activeElement).toBe(screen.getByLabelText(/^Email or user name/));
  });

  it('the brand: Hoody\'s mark and "Hoody Hub" head the card, hidden from assistive tech; the title is the one h1', async () => {
    await show({ origin: 'https://api.hoody.test', asked: 'default' });
    const main = screen.getByRole('main');
    const brand = main.querySelector('p[aria-hidden="true"]');
    // The kit BrandMark at its auth-card size; one line of text with a real space.
    expect(brand?.querySelector('[data-brand-mark="lg"]')).not.toBeNull();
    expect(brand?.textContent).toBe('Hoody Hub');
    expect(brand?.querySelector('svg')).not.toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

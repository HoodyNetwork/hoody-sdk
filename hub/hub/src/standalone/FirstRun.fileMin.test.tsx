// FirstRun.tsx: Hoody's config read (GET /api/v1/hub/config) before any sign-in way. Until it answered: "Connecting to
// Hoody…". Every failed read (no answer, a refusal such as a 404, a wrong body, a timeout) offers no sign-in way and one
// "Try again"; there is no fail-open, whatever record is stored. No answer is "Can't reach Hoody"; an answer that is not
// the config is Hoody's side and says so, never "check your connection". A file below `hub_file_min` shows the
// out-of-date state with the download on the same Hoody, and no sign-in.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type { HubConfigRead } from '@core/origin';
import { HUB_FILE_BUILD } from './build';

const ORIGIN = 'https://api.hoody.test';

const m = vi.hoisted(() => ({
  read: vi.fn<(origin: string) => Promise<HubConfigRead>>(),
  set: vi.fn(() => 'set'),
  device: vi.fn(() => ({ stop: () => {} })),
}));
// shared.js is not loaded here: its origin check is stood in by an identity (the real one has its own tests).
vi.mock('@core/origin', async (orig) => ({ ...(await orig<typeof Origin>()), checkApiOrigin: (v: string) => v, readHubConfig: m.read, setStandaloneApi: m.set }));
vi.mock('./device', () => ({ startDeviceSignIn: m.device }));

const { FirstRun } = await import('./FirstRun');

const ok = (fileMin: number | null): HubConfigRead => ({ ok: true, realmApiDomain: 'api.hoody.test', proxyDomain: 'computers.hoody.test', fileMin });
const inputs = () => document.querySelectorAll('input, textarea').length;
const buttons = () => screen.queryAllByRole('button');

beforeEach(() => {
  m.read.mockReset();
  m.set.mockReset();
  m.set.mockReturnValue('set');
  m.device.mockClear();
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
});
afterEach(cleanup);

const show = async (read: HubConfigRead | Promise<HubConfigRead>) => {
  m.read.mockReturnValue(Promise.resolve(read));
  render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

describe('the config read comes first', () => {
  it('while it is out: "Connecting to Hoody…", no field, no button, nothing named', async () => {
    let answer!: (v: HubConfigRead) => void;
    m.read.mockReturnValue(new Promise((res) => { answer = res; }));
    render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} />);
    expect(screen.getByText('Connecting to Hoody…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in');
    expect(inputs()).toBe(0);
    expect(buttons()).toHaveLength(0);
    expect(m.set).not.toHaveBeenCalled();
    await act(async () => { answer(ok(HUB_FILE_BUILD)); });
    await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
  });

  it('answered and this build is new enough: Hoody is named with the domains it answered, then the sign-in ways', async () => {
    await show(ok(HUB_FILE_BUILD));
    expect(m.read).toHaveBeenCalledWith(ORIGIN);
    expect(m.set).toHaveBeenCalledTimes(1);
    expect(m.set).toHaveBeenCalledWith({ origin: ORIGIN, realmApiDomain: 'api.hoody.test', proxyDomain: 'computers.hoody.test' });
    await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
    cleanup();
    m.set.mockClear();
    await show(ok(null));
    expect(m.set).toHaveBeenCalledTimes(1);
  });

  for (const [what, read, title, text] of [
    ['no answer or a timeout', { ok: false, why: 'network' }, "Can't reach Hoody", /^Check your connection, then try again\.$/],
    ['a refusal such as a 404', { ok: false, why: 'refused' }, "Hoody can't open this Hub right now", /^Try again in a moment\.$/],
    ['a wrong body', { ok: false, why: 'shape' }, "Hoody can't open this Hub right now", /^Try again in a moment\.$/],
  ] as const) {
    it(`${what}: "${title}", zero fields, one button, nothing named; Try again reads once more`, async () => {
      await show(read);
      expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([title]);
      expect(screen.getByText(text)).toBeInTheDocument();
      if (read.why !== 'network') expect(document.body.textContent).not.toMatch(/connection/i);
      expect(inputs()).toBe(0);
      expect(buttons()).toHaveLength(1);
      expect(screen.getByRole('button', { name: /^Try again$/ })).toBeInTheDocument();
      expect(m.set).not.toHaveBeenCalled();
      expect(m.device).not.toHaveBeenCalled();
      m.read.mockResolvedValue(ok(HUB_FILE_BUILD));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Try again$/ })); });
      await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
      expect(m.read).toHaveBeenCalledTimes(2);
      expect(m.set).toHaveBeenCalledTimes(1);
    });
  }

  it('another tab signed in meanwhile (shared.js answers signed_in): sign out here first, no sign-in way', async () => {
    m.set.mockReturnValueOnce('signed_in');
    await show(ok(HUB_FILE_BUILD));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign out first');
    expect(screen.getByRole('button', { name: /^Sign out here$/ })).toBeInTheDocument();
    expect(inputs()).toBe(0);
  });

  it('no address field and no Back: nobody types a Hoody', async () => {
    await show(ok(HUB_FILE_BUILD));
    await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
    expect(screen.queryByRole('textbox', { name: /address/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Back/ })).toBeNull();
  });
});

describe('a file below the floor', () => {
  it('the out-of-date state: both builds, a download on the same Hoody, no sign-in way, nothing named', async () => {
    await show(ok(HUB_FILE_BUILD + 1));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This Hub is out of date');
    expect(document.body.textContent).toContain(`Build ${HUB_FILE_BUILD + 1} or later`);
    expect(document.body.textContent).toContain(`Build ${HUB_FILE_BUILD}`);
    const link = screen.getByRole('link', { name: /^Download the current Hub$/ });
    expect(link).toHaveAttribute('href', `${ORIGIN}/auth/hoody-hub.html`);
    expect(inputs()).toBe(0);
    expect(buttons()).toHaveLength(0);
    expect(m.set).not.toHaveBeenCalled();
    expect(m.device).not.toHaveBeenCalled();
  });
});

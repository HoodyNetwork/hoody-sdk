// FirstRun.tsx: every link the sign-in page draws goes through the kit's webAddress gate (an absolute http(s) URL);
// when an address fails it, no link is drawn. Covers the frame's "Open in a new tab", the memory card's
// "Open <site>" and the device waiting card's "Open <site>" (the device-off band's link has its own test in
// FirstRun.providers.test.tsx).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type * as Session from '@core/session';
import type * as SignIn from '@core/signin';
import type { HubConfigRead } from '@core/origin';
import type { DeviceState } from './device';
import { HUB_FILE_BUILD } from './build';

const ORIGIN = 'https://api.example.test:8443';
const m = vi.hoisted(() => ({ framed: false, read: vi.fn(), config: vi.fn(), device: vi.fn(), set: vi.fn() }));
vi.mock('@core/session', async (orig) => ({ ...(await orig<typeof Session>()), isFramed: () => m.framed }));
vi.mock('@core/origin', async (orig) => ({ ...(await orig<typeof Origin>()), readHubConfig: m.read, setStandaloneApi: m.set }));
vi.mock('@core/signin', async (orig) => ({ ...(await orig<typeof SignIn>()), readSignupConfig: m.config }));
vi.mock('./device', () => ({ startDeviceSignIn: m.device }));

const { FirstRun } = await import('./FirstRun');
const ok: HubConfigRead = { ok: true, realmApiDomain: 'api.example.test', proxyDomain: 'computers.example.test', fileMin: HUB_FILE_BUILD };
const realLocation = window.location;

beforeEach(() => {
  for (const f of [m.read, m.config, m.device, m.set]) f.mockReset();
  m.framed = false;
  m.read.mockResolvedValue(ok);
  m.config.mockResolvedValue({ open: true, invite: false, providers: [] });
  m.set.mockReturnValue('set');
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

const setHref = (href: string) => { Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, href } }); };

describe('links on the sign-in page pass the webAddress gate', () => {
  it('the frame card: "Open in a new tab" only for an http(s) page address', () => {
    m.framed = true;
    const start = { kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } } as const;
    setHref('https://hub.example.test/hoody-hub.html');
    render(<FirstRun start={start} />);
    expect(screen.getByRole('link', { name: /^Open in a new tab$/ })).toHaveAttribute('href', 'https://hub.example.test/hoody-hub.html');
    cleanup();
    for (const bad of ['javascript:alert(1)', 'file:///home/x/hoody-hub.html', '']) {
      setHref(bad);
      render(<FirstRun start={start} />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Open this page on its own');
      expect(screen.queryByRole('link')).toBeNull();
      cleanup();
    }
  });

  it('the memory card: "Open <site>" only for an http(s) origin', () => {
    render(<FirstRun start={{ kind: 'first-run', step: 'blocked', why: 'memory', choice: { origin: ORIGIN, asked: 'default' } }} />);
    expect(screen.getByRole('link', { name: /^Open / })).toHaveAttribute('href', `${ORIGIN}/auth/home`);
    cleanup();
    render(<FirstRun start={{ kind: 'first-run', step: 'blocked', why: 'memory', choice: { origin: 'javascript:alert(1)//', asked: 'default' } }} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('the device waiting card: "Open <site>" only for an http(s) approval address; the code still shows', async () => {
    for (const [verifyUrl, drawn] of [[`${ORIGIN}/auth/device?code=ABCD-EFGH`, true], ['javascript:alert(1)', false]] as const) {
      let onState: (s: DeviceState) => void = () => {};
      m.device.mockImplementation((cb: (s: DeviceState) => void) => { onState = cb; return { stop: vi.fn(), done: new Promise(() => {}) }; });
      render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={vi.fn()} />);
      await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Other ways to sign in/ })); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Sign in on / })); });
      await act(async () => { onState({ kind: 'waiting', userCode: 'ABCD-EFGH', verifyUrl, expiresAt: Date.now() + 15 * 60_000 }); });
      expect(screen.getByText('ABCD-EFGH')).toBeInTheDocument();
      if (drawn) expect(screen.getByRole('link', { name: /^Open / })).toHaveAttribute('href', verifyUrl);
      else expect(screen.queryByRole('link')).toBeNull();
      cleanup();
    }
  });
});

// FirstRun.tsx on a page opened from a file: some browsers call such a page not secure. It still gets the sign-in
// cards when the browser gives it crypto.subtle (PKCE and the vault need it), and the "Open this page securely" card
// when it does not, so no way to sign in can start and then stall. Plain http on another host is refused as before.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type * as Session from '@core/session';
import type * as SignIn from '@core/signin';
import type { HubConfigRead } from '@core/origin';
import type { SignInProvider, SignInResult } from '@core/signin';
import { HUB_FILE_BUILD } from './build';

const ORIGIN = 'https://api.example.test:8443';

type Config = { open: boolean; invite: boolean; providers: readonly SignInProvider[] } | null;
const m = vi.hoisted(() => ({
  read: vi.fn<(origin: string) => Promise<HubConfigRead>>(),
  config: vi.fn<() => Promise<Config>>(),
  signIn: vi.fn<(login: string, password: string) => Promise<SignInResult>>(),
  cancel: vi.fn(),
  start: vi.fn(),
  device: vi.fn(),
  deviceStop: vi.fn(),
  set: vi.fn(),
}));
const frame = vi.hoisted(() => ({ on: false }));
vi.mock('@core/session', async (orig) => ({ ...(await orig<typeof Session>()), isFramed: () => frame.on }));
vi.mock('@core/origin', async (orig) => ({ ...(await orig<typeof Origin>()), readHubConfig: m.read, setStandaloneApi: m.set }));
vi.mock('@core/signin', async (orig) => ({ ...(await orig<typeof SignIn>()), readSignupConfig: m.config, passwordSignIn: m.signIn, cancelSignIn: m.cancel, startSignup: m.start }));
vi.mock('./device', () => ({ startDeviceSignIn: m.device }));

const { FirstRun } = await import('./FirstRun');

const ok: HubConfigRead = { ok: true, realmApiDomain: 'api.example.test', proxyDomain: 'computers.example.test', fileMin: HUB_FILE_BUILD };

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.read.mockResolvedValue(ok);
  m.config.mockResolvedValue({ open: true, invite: false, providers: ['github', 'google'] });
  m.device.mockReturnValue({ stop: m.deviceStop, done: new Promise(() => {}) });
  m.set.mockReturnValue('set');
  frame.on = false;
  (globalThis as { isSecureContext?: boolean }).isSecureContext = false;
});
afterEach(cleanup);

const realSubtle = globalThis.crypto.subtle;
const setSubtle = (v: unknown) => { Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: v }); };
afterEach(() => { vi.unstubAllGlobals(); setSubtle(realSubtle); });

const start = { kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } } as const;
const insecure = () => screen.queryByRole('heading', { level: 1, name: 'Open this page securely' });

describe('the sign-in card on a page the browser calls not secure', () => {
  it('a file with crypto.subtle: the sign-in card, with the provider and other ways', async () => {
    vi.stubGlobal('location', { ...window.location, protocol: 'file:' });
    render(<FirstRun start={start} onSignedIn={vi.fn()} />);
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    expect(screen.getByRole('button', { name: /^Other ways to sign in/ })).toBeInTheDocument();
    expect(insecure()).toBeNull();
    expect(m.read).toHaveBeenCalled();
  });

  it('a file without crypto.subtle: the insecure card; no config read, no provider and no device way to start', () => {
    vi.stubGlobal('location', { ...window.location, protocol: 'file:' });
    setSubtle(undefined);
    render(<FirstRun start={start} onSignedIn={vi.fn()} />);
    expect(insecure()).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^Continue with/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Other ways to sign in/ })).toBeNull();
    expect(m.read).not.toHaveBeenCalled();
    expect(m.device).not.toHaveBeenCalled();
  });

  it('plain http on another host: the insecure card, even with crypto.subtle', () => {
    vi.stubGlobal('location', { ...window.location, protocol: 'http:', hostname: '192.168.1.20', host: '192.168.1.20' });
    render(<FirstRun start={start} onSignedIn={vi.fn()} />);
    expect(insecure()).not.toBeNull();
    expect(m.read).not.toHaveBeenCalled();
  });
});

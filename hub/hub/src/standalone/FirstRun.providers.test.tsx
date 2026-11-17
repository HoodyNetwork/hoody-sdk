// FirstRun.tsx + ProviderWays.tsx: "Continue with GitHub" / "Continue with Google" on the one-file Hub. The file never
// takes a provider's answer: a press starts the device flow (device.ts, stood in here) and the person finishes with
// that provider on Hoody's own page. core/signin.ts reads which providers Hoody offers (its own tests); here it is
// stood in so the screen's behaviour is what is checked.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type * as Session from '@core/session';
import type * as SignIn from '@core/signin';
import type { HubConfigRead } from '@core/origin';
import type { SignInProvider, SignInResult } from '@core/signin';
import type { DeviceState } from './device';
import { HUB_FILE_BUILD } from './build';

const ORIGIN = 'https://api.example.test:8443';
const SITE = 'example.test:8443';
const GOOD = 'Abcdefgh1234';
const VERIFY = `${ORIGIN}/auth/device?code=ABCD-EFGH`;

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

/** The device flow the test drives: `emit` reports a state, as device.ts does. */
function drivenDevice() {
  let onState: (s: DeviceState) => void = () => {};
  m.device.mockImplementation((cb: (s: DeviceState) => void) => {
    onState = cb;
    return { stop: m.deviceStop, done: new Promise<DeviceState>(() => {}) };
  });
  return { emit: async (s: DeviceState) => { await act(async () => { onState(s); }); } };
}

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.read.mockResolvedValue(ok);
  m.config.mockResolvedValue({ open: true, invite: false, providers: ['github', 'google'] });
  m.device.mockReturnValue({ stop: m.deviceStop, done: new Promise(() => {}) });
  m.set.mockReturnValue('set');
  frame.on = false;
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
});
afterEach(cleanup);

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = async (name: RegExp) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };
const card = () => screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;
/** The card's reachable buttons, in order (a closed fold keeps its panel in the DOM, hidden). */
const inCard = () => Array.from(card().querySelectorAll('button')).filter((b) => !b.closest('[hidden]')).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim());

async function open() {
  render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={vi.fn()} />);
  await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
}
async function openSignup() {
  await open();
  await press(/^Create an account$/);
  await waitFor(() => { expect(screen.getByRole('button', { name: /^Create account$/ })).not.toBeDisabled(); });
}

describe('provider buttons on the sign-in card', () => {
  it('one button per provider Hoody offers, GitHub first, between "Forgot password?" and the other ways; Sign in stays the one primary', async () => {
    await open();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    expect(inCard()).toEqual([expect.stringMatching(/^Show/), 'Sign in', 'Forgot password?', 'Continue with GitHub', 'Continue with Google', expect.stringMatching(/^Other ways to sign in/)]);
    // Each with its provider's own mark (kit Icon: GitHub's Octicon, Google's Simple Icons mark), in the text colour.
    for (const [name, mark] of [[/^Continue with GitHub$/, 'M6.766 11.328'], [/^Continue with Google$/, 'M12.48 10.92v3.28h7.84']] as const) {
      const b = screen.getByRole('button', { name });
      expect(b).toHaveAttribute('data-variant', 'secondary');
      expect(Array.from(b.querySelectorAll('path')).some((p) => p.getAttribute('d')?.startsWith(mark))).toBe(true);
      expect(b.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(b.closest('form')).toBeNull();
    }
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
    expect(m.config).toHaveBeenCalledTimes(1);
    expect(m.device).not.toHaveBeenCalled();
    // The fold's own way no longer claims the providers: they have their buttons, when Hoody offers them.
    await press(/^Other ways to sign in/);
    expect(screen.getByText('You finish in a new tab.')).toBeInTheDocument();
    expect(screen.queryByText(/Google and GitHub/)).toBeNull();
  });

  it('only what Hoody offers: one provider; none when it offers none or its config could not be read', async () => {
    m.config.mockResolvedValue({ open: true, invite: false, providers: ['google'] });
    await open();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with Google$/ })).toBeInTheDocument(); });
    expect(screen.queryByRole('button', { name: /^Continue with GitHub$/ })).toBeNull();
    cleanup();
    for (const config of [{ open: true, invite: false, providers: [] }, null] as const) {
      m.config.mockResolvedValue(config);
      await open();
      await waitFor(() => { expect(m.config).toHaveBeenCalled(); });
      await act(async () => {});
      expect(screen.queryByRole('button', { name: /^Continue with / })).toBeNull();
      expect(inCard()).toEqual([expect.stringMatching(/^Show/), 'Sign in', 'Forgot password?', expect.stringMatching(/^Other ways to sign in/)]);
      // No claim about providers anywhere, the open fold included.
      await press(/^Other ways to sign in/);
      expect(document.body.textContent).not.toMatch(/GitHub|Google/);
      cleanup();
      m.config.mockReset();
    }
  });

  it('a page shown inside another page offers none and reads nothing (the frame card)', async () => {
    frame.on = true;
    render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Open this page on its own');
    expect(screen.queryByRole('button', { name: /^Continue with / })).toBeNull();
    expect(document.body.textContent).not.toMatch(/GitHub|Google/);
    expect(m.read).not.toHaveBeenCalled();
    expect(m.config).not.toHaveBeenCalled();
    expect(m.device).not.toHaveBeenCalled();
  });

  it('nothing is read or offered before Hoody answered its config, or when that read failed', async () => {
    m.read.mockResolvedValue({ ok: false, why: 'network' });
    render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={vi.fn()} />);
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Try again$/ })).toBeInTheDocument(); });
    expect(m.config).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Continue with / })).toBeNull();
  });

  it('a press starts the device flow once and ends the password way; the waiting card says what to press on Hoody\'s page', async () => {
    const dev = drivenDevice();
    await open();
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'secret-password');
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    m.cancel.mockClear();
    await press(/^Continue with GitHub$/);
    expect(m.device).toHaveBeenCalledTimes(1);
    expect(m.cancel).toHaveBeenCalledTimes(1);
    expect(m.signIn).not.toHaveBeenCalled();
    // Still starting: the form is drawn, the password emptied, the address kept, the pressed button busy.
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Email or user name/) as HTMLInputElement).value).toBe('me@example.test');
    await dev.emit({ kind: 'waiting', userCode: 'ABCD-EFGH', verifyUrl: VERIFY, expiresAt: Date.now() + 15 * 60_000 });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`Finish on ${SITE}`);
    expect(screen.getByText(`On ${SITE}, press Continue, then Continue with GitHub.`)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: `Open ${SITE}` });
    expect(link).toHaveAttribute('href', VERIFY);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    // A second press cannot happen from here: the waiting card has no provider button.
    expect(screen.queryByRole('button', { name: /^Continue with / })).toBeNull();
  });

  it('a code with one minute left says so in the singular', async () => {
    const dev = drivenDevice();
    await open();
    await press(/^Other ways to sign in/);
    await press(/^Sign in on /);
    await dev.emit({ kind: 'waiting', userCode: 'ABCD-EFGH', verifyUrl: VERIFY, expiresAt: Date.now() + 60_000 });
    expect(screen.getByText(/It works for 1 minute\.$/)).toBeInTheDocument();
    await dev.emit({ kind: 'waiting', userCode: 'ABCD-EFGH', verifyUrl: VERIFY, expiresAt: Date.now() + 15 * 60_000 });
    expect(screen.getByText(/It works for 15 minutes\.$/)).toBeInTheDocument();
  });

  it('"Sign in on <site>" keeps its waiting card without a provider sentence', async () => {
    const dev = drivenDevice();
    await open();
    await press(/^Other ways to sign in/);
    await press(/^Sign in on /);
    await dev.emit({ kind: 'waiting', userCode: 'ABCD-EFGH', verifyUrl: VERIFY, expiresAt: Date.now() + 15 * 60_000 });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`Finish on ${SITE}`);
    expect(screen.queryByText(/^On .*press Continue/)).toBeNull();
  });

  it('Hoody does not run the device flow (off): the band says the provider cannot finish here and links Hoody\'s own sign-in page', async () => {
    const dev = drivenDevice();
    await open();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with Google$/ })).toBeInTheDocument(); });
    await press(/^Continue with Google$/);
    await dev.emit({ kind: 'failed', why: 'off' });
    expect(screen.getByText(`Google sign-in can't finish on this page right now. Continue on ${SITE} instead.`)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: `Open ${SITE}` });
    expect(link).toHaveAttribute('href', `${ORIGIN}/auth/login`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    // The sign-in card is back under the band.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in');
  });

  it('other failures after a provider press, and "off" after "Sign in on <site>", keep their own sentence and no link', async () => {
    const dev = drivenDevice();
    await open();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    await press(/^Continue with GitHub$/);
    await dev.emit({ kind: 'failed', why: 'expired' });
    expect(screen.getByText('The code expired. Start again.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: `Open ${SITE}` })).toBeNull();
    await press(/^Other ways to sign in/);
    await press(/^Sign in on /);
    await dev.emit({ kind: 'failed', why: 'off' });
    expect(screen.getByText(`Sign-in on ${SITE} is not available right now.`)).toBeInTheDocument();
    expect(screen.queryByText(/can't finish on this page/)).toBeNull();
    expect(screen.queryByRole('link', { name: `Open ${SITE}` })).toBeNull();
  });
});

describe('provider buttons on "Create your account"', () => {
  it('under the form, while sign-up is open: Create account stays the one primary', async () => {
    await openSignup();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create your account');
    expect(inCard()).toEqual([expect.stringMatching(/^Show/), 'Create account', 'Continue with GitHub', 'Continue with Google', 'I already have an account']);
    expect(screen.getByRole('button', { name: /^Continue with GitHub$/ }).closest('form')).toBeNull();
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
    expect(within(card()).queryByRole('button', { name: /^Sign in on / })).toBeNull();
  });

  it('sign-up closed: the closed sentence stands and names no provider', async () => {
    m.config.mockResolvedValue({ open: false, invite: false, providers: ['github', 'google'] });
    await open();
    await press(/^Create an account$/);
    await waitFor(() => { expect(screen.getByText(/not taking new accounts/)).toBeInTheDocument(); });
    expect(screen.queryByRole('button', { name: /^Continue with / })).toBeNull();
    expect(card().textContent).not.toMatch(/GitHub|Google/);
  });

  it('none when Hoody offers no provider, or its config could not be read (the form, no claim)', async () => {
    for (const config of [{ open: true, invite: false, providers: [] }, null] as const) {
      m.config.mockResolvedValue(config);
      await open();
      await press(/^Create an account$/);
      await waitFor(() => { expect(screen.getByRole('button', { name: /^Create account$/ })).not.toBeDisabled(); });
      expect(screen.queryByRole('button', { name: /^Continue with / })).toBeNull();
      expect(card().textContent).not.toMatch(/GitHub|Google/);
      cleanup();
    }
  });

  it('a press starts the device flow and empties the typed password; Cancel brings the form back with the address', async () => {
    const dev = drivenDevice();
    await openSignup();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with Google$/ })).toBeInTheDocument(); });
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    await press(/^Continue with Google$/);
    expect(m.device).toHaveBeenCalledTimes(1);
    expect(m.start).not.toHaveBeenCalled();
    await dev.emit({ kind: 'waiting', userCode: 'ABCD-EFGH', verifyUrl: VERIFY, expiresAt: Date.now() + 15 * 60_000 });
    expect(screen.getByText(`On ${SITE}, press Continue, then Continue with Google.`)).toBeInTheDocument();
    await press(/^Cancel$/);
    expect(m.deviceStop).toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create your account');
    expect((screen.getByLabelText(/^Email address/) as HTMLInputElement).value).toBe('new@example.test');
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
  });

  it('off: the band links Hoody\'s own sign-up page', async () => {
    const dev = drivenDevice();
    await openSignup();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    await press(/^Continue with GitHub$/);
    await dev.emit({ kind: 'failed', why: 'off' });
    expect(screen.getByText(`GitHub sign-in can't finish on this page right now. Continue on ${SITE} instead.`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Open ${SITE}` })).toHaveAttribute('href', `${ORIGIN}/auth/signup`);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Create your account');
  });

  // A provider press whose device answer is still out, then the person picks another way on the same card: that way
  // ends the device flow, and the late answer covers nothing.
  it('provider press, then "I already have an account" before the device answer: the flow ends; a late answer does not replace the sign-in form', async () => {
    const dev = drivenDevice();
    await openSignup();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    await press(/^Continue with GitHub$/);
    expect(m.device).toHaveBeenCalledTimes(1);
    await press(/^I already have an account$/);
    expect(m.deviceStop).toHaveBeenCalled();
    await dev.emit({ kind: 'waiting', userCode: 'ABCD-EFGH', verifyUrl: VERIFY, expiresAt: Date.now() + 15 * 60_000 });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in');
    expect(screen.queryByText('ABCD-EFGH')).toBeNull();
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument();
  });

  it('provider press, then Forgot password? before the device answer: the flow ends; a late answer does not replace the reset form', async () => {
    const dev = drivenDevice();
    await open();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    await press(/^Continue with GitHub$/);
    expect(m.device).toHaveBeenCalledTimes(1);
    await press(/^Forgot password\?$/);
    expect(m.deviceStop).toHaveBeenCalled();
    const title = screen.getByRole('heading', { level: 1 }).textContent;
    await dev.emit({ kind: 'waiting', userCode: 'ABCD-EFGH', verifyUrl: VERIFY, expiresAt: Date.now() + 15 * 60_000 });
    expect(screen.queryByText('ABCD-EFGH')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(title);
  });

  it('provider press, then Create account before the device answer: the flow ends; a late answer does not replace the sign-up', async () => {
    const dev = drivenDevice();
    m.start.mockImplementation((_i: unknown, cb: (s: unknown) => void) => {
      cb({ kind: 'sent' });
      return { stop: vi.fn(), done: Promise.resolve({ kind: 'sent' }) };
    });
    await openSignup();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    await press(/^Continue with GitHub$/);
    expect(m.device).toHaveBeenCalledTimes(1);
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    await press(/^Create account$/);
    expect(m.start).toHaveBeenCalledTimes(1);
    expect(m.deviceStop).toHaveBeenCalled();
    expect(m.deviceStop.mock.invocationCallOrder[0]).toBeLessThan(m.start.mock.invocationCallOrder[0]!);
    await dev.emit({ kind: 'waiting', userCode: 'ABCD-EFGH', verifyUrl: VERIFY, expiresAt: Date.now() + 15 * 60_000 });
    expect(screen.queryByText('ABCD-EFGH')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(/^Finish on/);
  });

  it('disabled while an account request is out', async () => {
    let settle!: (s: unknown) => void;
    m.start.mockImplementation((_i: unknown, cb: (s: unknown) => void) => {
      cb({ kind: 'sending' });
      return { stop: vi.fn(), done: new Promise((r) => { settle = r; }) };
    });
    await openSignup();
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Continue with GitHub$/ })).toBeInTheDocument(); });
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    await press(/^Create account$/);
    expect(m.start).toHaveBeenCalledTimes(1);
    await press(/^Continue with GitHub$/);
    expect(m.device).not.toHaveBeenCalled();
    await act(async () => { settle({ kind: 'sent' }); });
  });
});

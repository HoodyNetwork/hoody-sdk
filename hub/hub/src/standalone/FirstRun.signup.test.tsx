// Signup.tsx inside FirstRun: "Create an account" on the one-file Hub. core/signin.ts has its own tests (the request,
// the check loop, the password rule); here startSignup is stood in so the screen's behaviour is what is checked.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type * as SignIn from '@core/signin';
import type { HubConfigRead } from '@core/origin';
import type { ResetResult, SignupInput, SignupState } from '@core/signin';
import { HUB_FILE_BUILD } from './build';

const ORIGIN = 'https://api.example.test:8443';
const GOOD = 'Abcdefgh1234';

const m = vi.hoisted(() => ({
  read: vi.fn<(origin: string) => Promise<HubConfigRead>>(),
  config: vi.fn<() => Promise<{ open: boolean; invite: boolean; providers: readonly ('github' | 'google')[] } | null>>(),
  start: vi.fn<(input: SignupInput, onState: (s: SignupState) => void) => { stop: () => void; done: Promise<SignupState> }>(),
  resend: vi.fn<(email: string) => Promise<ResetResult>>(),
  stop: vi.fn(),
  device: vi.fn(),
  deviceStop: vi.fn(),
  set: vi.fn(),
}));
vi.mock('@core/origin', async (orig) => ({ ...(await orig<typeof Origin>()), readHubConfig: m.read, setStandaloneApi: m.set }));
vi.mock('@core/signin', async (orig) => ({ ...(await orig<typeof SignIn>()), readSignupConfig: m.config, startSignup: m.start, resendVerification: m.resend }));
vi.mock('./device', () => ({ startDeviceSignIn: m.device }));

const { FirstRun } = await import('./FirstRun');

const ok: HubConfigRead = { ok: true, realmApiDomain: 'api.example.test', proxyDomain: 'computers.example.test', fileMin: HUB_FILE_BUILD };

/** A run the test drives: `emit` sends a state, `end` settles it. */
function drivenRun() {
  let onState: (s: SignupState) => void = () => {};
  let settle: (s: SignupState) => void = () => {};
  m.start.mockImplementation((_input, cb) => {
    onState = cb;
    return { stop: m.stop, done: new Promise<SignupState>((r) => { settle = r; }) };
  });
  return {
    emit: async (s: SignupState) => { await act(async () => { onState(s); }); },
    end: async (s: SignupState) => { await act(async () => { onState(s); settle(s); }); },
    /** Settles without a state report, as core/signin.ts does for a stopped run. */
    settleOnly: async (s: SignupState) => { await act(async () => { settle(s); }); },
  };
}

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.read.mockResolvedValue(ok);
  m.config.mockResolvedValue({ open: true, invite: false, providers: [] });
  m.device.mockReturnValue({ stop: m.deviceStop });
  m.set.mockReturnValue('set');
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
});
afterEach(cleanup);

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
// The kit Form disables its fields while a request is out, and a browser then drops the focus to <body>. jsdom keeps
// the focus on a disabled field and its blur() does nothing there, so a test drops it just BEFORE the press.
const drop = () => {
  (document.activeElement as HTMLElement | null)?.blur();
  expect(document.activeElement).toBe(document.body);
};
const press = async (name: RegExp) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };

async function openSignup() {
  render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={vi.fn()} />);
  await waitFor(() => { expect(screen.getByRole('button', { name: /^Create an account$/ })).toBeInTheDocument(); });
  await press(/^Create an account$/);
  await waitFor(() => { expect(screen.getByRole('button', { name: /^Create account$/ })).not.toBeDisabled(); });
}

describe('create an account on the one-file Hub', () => {
  it('the form alone, under its own title: no device flow or key beside it, the password with its Show toggle', async () => {
    await openSignup();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Create your account']);
    expect(document.title).toBe('Create your account — Hoody');
    expect(screen.getByLabelText(/^Email address/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sign in on / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Use an access key/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Other ways to sign in/ })).toBeNull();
    expect(screen.queryByText(/^New to Hoody\?/)).toBeNull();
    expect(screen.queryByText(/sends your password/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Show/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Create account$/ })).toHaveAttribute('type', 'submit');
    expect(screen.queryByLabelText(/^Invite code/)).toBeNull();
  });

  it('the invite field shows only when Hoody asks for one, and is sent', async () => {
    m.config.mockResolvedValue({ open: true, invite: true, providers: [] });
    const run = drivenRun();
    await openSignup();
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    type(/^Invite code/, 'INV-1');
    await press(/^Create account$/);
    expect(m.start.mock.calls[0]?.[0]).toEqual({ email: 'new@example.test', password: GOOD, inviteCode: 'INV-1' });
    await run.end({ kind: 'sent' });
  });

  it('a password outside the rule sends nothing', async () => {
    await openSignup();
    type(/^Email address/, 'new@example.test');
    type(/^Password/, 'short1A');
    await press(/^Create account$/);
    expect(m.start).not.toHaveBeenCalled();
    expect(screen.getByText(/^This password does not follow the rule/)).toBeInTheDocument();
  });

  it('a check: link on the chosen Hoody + the code; then "check your email"; the password is emptied; resend; back prefills', async () => {
    const run = drivenRun();
    await openSignup();
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    await press(/^Create account$/);
    await run.emit({ kind: 'sending' });
    await run.emit({ kind: 'challenge', url: `${ORIGIN}/auth/challenge#tok.sec`, matchCode: 'K7QX' });
    const link = screen.getByRole('link', { name: /^Open the check$/ });
    expect(link).toHaveAttribute('href', `${ORIGIN}/auth/challenge#tok.sec`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('K7QX')).toBeInTheDocument();
    await run.end({ kind: 'sent' });
    expect(screen.getByText(/new@example\.test can get a new account/)).toBeInTheDocument();
    m.resend.mockResolvedValue({ kind: 'sent' });
    await press(/^Send the email again$/);
    expect(m.resend).toHaveBeenCalledWith('new@example.test');
    expect(screen.getByText(/^Asked again/)).toBeInTheDocument();
    await press(/^Back to sign in$/);
    expect((screen.getByLabelText(/^Email or user name/) as HTMLInputElement).value).toBe('new@example.test');
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
  });

  it('cancel during the check stops asking and keeps no password', async () => {
    const run = drivenRun();
    await openSignup();
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    await press(/^Create account$/);
    await run.emit({ kind: 'challenge', url: `${ORIGIN}/auth/challenge#tok.sec`, matchCode: 'K7QX' });
    await press(/^Cancel$/);
    expect(m.stop).toHaveBeenCalled();
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
  });

  it('a cancelled run settling late leaves a password typed after the cancel alone', async () => {
    const run = drivenRun();
    await openSignup();
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    await press(/^Create account$/);
    await run.emit({ kind: 'challenge', url: `${ORIGIN}/auth/challenge#tok.sec`, matchCode: 'K7QX' });
    await press(/^Cancel$/);
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
    type(/^Password/, 'Newpass12345');
    await run.settleOnly({ kind: 'refused', why: 'stopped' });
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('Newpass12345');
  });

  it('refusals read as one sentence; the password is emptied', async () => {
    const run = drivenRun();
    await openSignup();
    type(/^Email address/, 'new@mailinator.test');
    type(/^Password/, GOOD);
    await press(/^Create account$/);
    await run.end({ kind: 'refused', why: 'domain' });
    expect(screen.getByText(/does not accept addresses from this email provider/)).toBeInTheDocument();
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
  });

  it('a long wait is said in minutes, and beyond two hours as "later"', async () => {
    for (const [retryAfter, words] of [[900, /Wait 15 minutes/], [86400, /^Too many tries\. Try again later\.$/]] as const) {
      const run = drivenRun();
      await openSignup();
      type(/^Email address/, 'new@example.test');
      type(/^Password/, GOOD);
      await press(/^Create account$/);
      await run.end({ kind: 'refused', why: 'retry', retryAfter });
      expect(screen.getByText(words)).toBeInTheDocument();
      expect(screen.queryByText(/seconds/)).toBeNull();
      cleanup();
    }
  });

  it('paused sign-ups name the address that takes access requests', async () => {
    const run = drivenRun();
    await openSignup();
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    await press(/^Create account$/);
    await run.end({ kind: 'refused', why: 'paused' });
    expect(screen.getByText(/paused new accounts/)).toHaveTextContent(/request access at access@hoody\.com\.$/);
  });

  it('focus after a refusal: the password, which the request emptied; the address when Hoody refused its domain', async () => {
    for (const [why, field] of [['paused', /^Password/], ['unavailable', /^Password/], ['challenge-expired', /^Password/], ['domain', /^Email address/]] as const) {
      const run = drivenRun();
      await openSignup();
      type(/^Email address/, 'new@example.test');
      type(/^Password/, GOOD);
      drop();
      await press(/^Create account$/);
      expect(document.activeElement).toBe(document.body);
      await run.end({ kind: 'refused', why });
      expect([why, document.activeElement]).toEqual([why, screen.getByLabelText(field)]);
      cleanup();
    }
  });

  it('a state with no field focuses its title: the check, then "check your email"', async () => {
    const run = drivenRun();
    await openSignup();
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    drop();
    await press(/^Create account$/);
    await run.emit({ kind: 'challenge', url: `${ORIGIN}/auth/challenge#tok.sec`, matchCode: 'K7QX' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Quick check' }));
    await run.end({ kind: 'sent' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Check your email' }));
  });

  it('sign-up closed: one sentence, no form', async () => {
    m.config.mockResolvedValue({ open: false, invite: false, providers: [] });
    render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={vi.fn()} />);
    await waitFor(() => { expect(screen.getByRole('button', { name: /^Create an account$/ })).toBeInTheDocument(); });
    await press(/^Create an account$/);
    await waitFor(() => { expect(screen.getByText(/not taking new accounts/)).toBeInTheDocument(); });
    // The next step is named: the address that takes access requests.
    expect(screen.getByText(/not taking new accounts/)).toHaveTextContent(/request access at access@hoody\.com\.$/);
    expect(screen.queryByLabelText(/^Email address/)).toBeNull();
    // No field: the title holds the focus.
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Create your account' }));
  });

  it('leaving the screen stops a check in progress', async () => {
    const run = drivenRun();
    await openSignup();
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    await press(/^Create account$/);
    await run.emit({ kind: 'challenge', url: `${ORIGIN}/auth/challenge#tok.sec`, matchCode: 'K7QX' });
    cleanup();
    expect(m.stop).toHaveBeenCalled();
  });
});

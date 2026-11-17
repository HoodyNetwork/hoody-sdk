// FirstRun.tsx + PasswordSignIn.tsx: the password way in, its 2FA step, and how refusals read. core/signin.ts has its
// own tests; here it is stood in so the screen's behaviour is what is checked.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Origin from '@core/origin';
import type * as SignIn from '@core/signin';
import type { HubConfigRead } from '@core/origin';
import type { ResetResult, SignInResult } from '@core/signin';
import { HUB_FILE_BUILD } from './build';

const ORIGIN = 'https://api.example.test:8443';

const m = vi.hoisted(() => ({
  read: vi.fn<(origin: string) => Promise<HubConfigRead>>(),
  signIn: vi.fn<(login: string, password: string) => Promise<SignInResult>>(),
  verify: vi.fn<(code: string) => Promise<SignInResult>>(),
  reset: vi.fn<(email: string) => Promise<ResetResult>>(),
  cancel: vi.fn(),
  stop: vi.fn(),
  device: vi.fn(),
  set: vi.fn(() => 'set'),
}));
vi.mock('@core/origin', async (orig) => ({ ...(await orig<typeof Origin>()), readHubConfig: m.read, setStandaloneApi: m.set }));
vi.mock('@core/signin', async (orig) => ({ ...(await orig<typeof SignIn>()), passwordSignIn: m.signIn, cancelSignIn: m.cancel, requestPasswordReset: m.reset }));
vi.mock('./device', () => ({ startDeviceSignIn: m.device }));

const { FirstRun } = await import('./FirstRun');

const ok: HubConfigRead = { ok: true, realmApiDomain: 'api.example.test', proxyDomain: 'computers.example.test', fileMin: HUB_FILE_BUILD };
const step = { verify: m.verify } as unknown as Extract<SignInResult, { kind: 'two-factor' }>['step'];

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.read.mockResolvedValue(ok);
  m.device.mockReturnValue({ stop: m.stop });
  m.set.mockReturnValue('set');
  (globalThis as { isSecureContext?: boolean }).isSecureContext = true;
});
afterEach(cleanup);

async function open(onSignedIn = vi.fn()) {
  render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={onSignedIn} />);
  await waitFor(() => { expect(screen.getByLabelText(/^Password/)).toBeInTheDocument(); });
  return onSignedIn;
}
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = async (name: RegExp) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };
// The kit Form disables its fields while a request is out, and a browser then drops the focus to <body>. jsdom keeps
// the focus on a disabled field and its blur() does nothing there, so a test drops it just BEFORE the press, while the
// field can still lose it: the request then goes out with nothing focused, as in a browser.
const drop = () => {
  (document.activeElement as HTMLElement | null)?.blur();
  expect(document.activeElement).toBe(document.body);
};

describe('password sign-in on the one-file Hub', () => {
  it('one card: the brand, the title as the one h1, Sign in the one primary directly under the fields, no host named for the built-in server', async () => {
    await open();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Sign in']);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(document.title).toBe('Sign in — Hoody');
    // The primary is the form's own submit button, the next control after the password field.
    const submit = screen.getByRole('button', { name: /^Sign in$/ });
    expect(submit.closest('form')).toBe(screen.getByLabelText(/^Password/).closest('form'));
    expect(submit).toHaveAttribute('type', 'submit');
    // No band names the built-in server, and nothing says where the password goes.
    expect(screen.queryByText(/sends your password/)).toBeNull();
    expect(screen.queryByText(/api\.example\.test/)).toBeNull();
    // Exactly one primary on the ready card; no footer.
    expect(document.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
    expect(screen.queryByText(/Hoody Hub · Build/)).toBeNull();
    // In the card: the fields, Sign in, "Forgot password?" and one closed fold; nothing else is a button there.
    const card = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement;
    // A closed fold keeps its panel in the DOM, hidden: only what can be reached counts.
    const inCard = () => Array.from(card.querySelectorAll('button')).filter((b) => !b.closest('[hidden]')).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim());
    expect(inCard()).toEqual([expect.stringMatching(/^Show/), 'Sign in', 'Forgot password?', expect.stringMatching(/^Other ways to sign in/)]);
    expect(screen.queryByRole('button', { name: /^Sign in on / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Use an access key/ })).toBeNull();
    // "New to Hoody? Create an account" is a line under the card, not a button beside Sign in.
    const create = screen.getByRole('button', { name: /^Create an account$/ });
    expect(card.contains(create)).toBe(false);
    expect(screen.getByRole('main').contains(create)).toBe(true);
    expect(create.closest('p')?.textContent).toMatch(/^New to Hoody\? Create an account$/);
    expect(create.closest('form')).toBeNull();
    // The fold holds the other two ways, as text actions.
    await press(/^Other ways to sign in/);
    expect(screen.getByRole('button', { name: /^Sign in on example\.test:8443$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Use an access key$/ })).toBeInTheDocument();
    expect(m.device).not.toHaveBeenCalled();
    // The password field has its Show toggle; focus starts in the first field.
    expect(screen.getByRole('button', { name: /^Show/ })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Email or user name/));
  });

  it('password, then the 2FA step, then signed in; a wrong code keeps the step', async () => {
    const onSignedIn = await open();
    m.signIn.mockResolvedValue({ kind: 'two-factor', step });
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'secret-password');
    await press(/^Sign in$/);
    expect(m.signIn).toHaveBeenCalledWith('me@example.test', 'secret-password');
    expect(screen.queryByLabelText(/^Password/)).toBeNull();
    // The 2FA step is the card alone: no other way, no account line.
    expect(screen.queryByRole('button', { name: /^Other ways to sign in/ })).toBeNull();
    expect(screen.queryByText(/^New to Hoody\?/)).toBeNull();
    m.verify.mockResolvedValueOnce({ kind: 'refused', why: 'otp' });
    type(/^Code/, '000000');
    await press(/^Verify$/);
    expect(screen.getByText(/That code did not work/)).toBeInTheDocument();
    m.verify.mockResolvedValueOnce({ kind: 'signed-in' });
    type(/^Code/, '123456');
    await press(/^Verify$/);
    expect(m.verify).toHaveBeenLastCalledWith('123456');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('a refusal reads as one sentence and empties the password', async () => {
    await open();
    m.signIn.mockResolvedValue({ kind: 'refused', why: 'credentials' });
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'wrong');
    await press(/^Sign in$/);
    expect(screen.getByText(/do not match/)).toBeInTheDocument();
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
    m.signIn.mockResolvedValue({ kind: 'refused', why: 'retry', retryAfter: 42 });
    type(/^Password/, 'again');
    await press(/^Sign in$/);
    expect(screen.getByText(/Wait 42 seconds/)).toBeInTheDocument();
    // A lockout's wait (15 minutes) is said in minutes, never as 900 seconds.
    m.signIn.mockResolvedValue({ kind: 'refused', why: 'retry', retryAfter: 900 });
    type(/^Password/, 'again');
    await press(/^Sign in$/);
    expect(screen.getByText(/Wait 15 minutes/)).toBeInTheDocument();
    // A wait beyond two hours is not counted out in minutes (a day would read "1440 minutes"), nor called a moment.
    m.signIn.mockResolvedValue({ kind: 'refused', why: 'retry', retryAfter: 86400 });
    type(/^Password/, 'again');
    await press(/^Sign in$/);
    expect(screen.getByText(/^Too many tries\. Try again later\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/1440|a moment/)).toBeNull();
    expect(screen.queryByText(/900 seconds/)).toBeNull();
  });

  it('empty fields send nothing', async () => {
    await open();
    await press(/^Sign in$/);
    expect(m.signIn).not.toHaveBeenCalled();
  });

  it('a submit event on the form sends exactly one request; Sign in reads "Signing in…" while it is out', async () => {
    await open();
    let answer!: (r: SignInResult) => void;
    m.signIn.mockReturnValue(new Promise<SignInResult>((r) => { answer = r; }));
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'secret-password');
    const form = screen.getByLabelText(/^Password/).closest('form') as HTMLFormElement;
    await act(async () => { fireEvent.submit(form); });
    expect(m.signIn).toHaveBeenCalledTimes(1);
    // While pending, react-aria-components renders a submit Button as type="button" (private/Button.js:90), so a
    // second submit cannot come from it; the Form refuses one sent anyway (below).
    const busy = screen.getByRole('button', { name: /^Signing in…$/ });
    expect(busy).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('button', { name: /^Sign in$/ })).toBeNull();
    await act(async () => { fireEvent.submit(form); });
    expect(m.signIn).toHaveBeenCalledTimes(1);
    await act(async () => { answer({ kind: 'refused', why: 'credentials' }); });
    expect(screen.getByRole('button', { name: /^Sign in$/ })).toHaveAttribute('type', 'submit');
  });

  it('Enter in the password field submits Sign in, once', async () => {
    const u = userEvent.setup();
    await open();
    m.signIn.mockResolvedValue({ kind: 'refused', why: 'credentials' });
    await u.type(screen.getByLabelText(/^Email or user name/), 'me@example.test');
    await u.type(screen.getByLabelText(/^Password/), 'secret-password{Enter}');
    expect(m.signIn).toHaveBeenCalledTimes(1);
    expect(m.signIn).toHaveBeenCalledWith('me@example.test', 'secret-password');
  });

  it('Enter in the email field submits Sign in; never Create an account or another way', async () => {
    const u = userEvent.setup();
    await open();
    m.signIn.mockResolvedValue({ kind: 'refused', why: 'credentials' });
    await u.type(screen.getByLabelText(/^Password/), 'secret-password');
    await u.type(screen.getByLabelText(/^Email or user name/), 'me@example.test{Enter}');
    expect(m.signIn).toHaveBeenCalledTimes(1);
    expect(m.signIn).toHaveBeenCalledWith('me@example.test', 'secret-password');
    expect(m.device).not.toHaveBeenCalled();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Sign in']);
  });

  it('Enter with an empty field sends nothing and says what is missing; Enter while a request is out sends nothing more', async () => {
    const u = userEvent.setup();
    await open();
    await u.type(screen.getByLabelText(/^Email or user name/), 'me@example.test{Enter}');
    expect(m.signIn).not.toHaveBeenCalled();
    expect(screen.getByText(/^Enter your email or user name and your password\.$/)).toBeInTheDocument();
    m.signIn.mockReturnValue(new Promise<SignInResult>(() => {}));
    await u.type(screen.getByLabelText(/^Password/), 'secret-password{Enter}');
    expect(m.signIn).toHaveBeenCalledTimes(1);
    await u.type(screen.getByLabelText(/^Password/), '{Enter}');
    await u.type(screen.getByLabelText(/^Email or user name/), '{Enter}');
    expect(m.signIn).toHaveBeenCalledTimes(1);
  });

  it('focus: a missing password with the address filled, or credentials that do not match, focus the password field', async () => {
    await open();
    type(/^Email or user name/, 'me@example.test');
    await press(/^Sign in$/);
    expect(m.signIn).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Password/));
    // Both empty: the address field has the focus (its own focusOnError).
    type(/^Email or user name/, '');
    await press(/^Sign in$/);
    expect(document.activeElement).toBe(screen.getByLabelText(/^Email or user name/));
    m.signIn.mockResolvedValue({ kind: 'refused', why: 'credentials' });
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'wrong');
    screen.getByLabelText(/^Email or user name/).focus();
    await press(/^Sign in$/);
    expect(m.signIn).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText(/^Email or user name/) as HTMLInputElement).value).toBe('me@example.test');
    expect(document.activeElement).toBe(screen.getByLabelText(/^Password/));
  });

  it('focus after a refusal: the field to fill again, also when the locked form dropped it to <body> meanwhile', async () => {
    // Each case drops the focus to <body> before its request goes out (drop(), above), so only the refocus brings it back.
    const pending = () => {
      let answer!: (r: SignInResult) => void;
      const p = new Promise<SignInResult>((r) => { answer = r; });
      return { p, answer };
    };
    await open();
    // Password step, a refusal shown as a band (no field named): Password.
    const a = pending();
    m.signIn.mockReturnValueOnce(a.p);
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'secret-password');
    drop();
    await press(/^Sign in$/);
    expect(document.activeElement).toBe(document.body);
    await act(async () => { a.answer({ kind: 'refused', why: 'network' }); });
    expect(document.activeElement).toBe(screen.getByLabelText(/^Password/));
    // 2FA step: a wrong code and a refusal shown as a band both put the focus back in the code field.
    m.signIn.mockResolvedValueOnce({ kind: 'two-factor', step });
    type(/^Password/, 'secret-password');
    await press(/^Sign in$/);
    for (const why of ['otp', 'network'] as const) {
      const v = pending();
      m.verify.mockReturnValueOnce(v.p);
      type(/^Code/, '000000');
      drop();
      await press(/^Verify$/);
      await act(async () => { v.answer({ kind: 'refused', why }); });
      expect([why, document.activeElement]).toEqual([why, screen.getByLabelText(/^Code/)]);
    }
    // An expired 2FA attempt is back on the password step: Password.
    m.verify.mockResolvedValueOnce({ kind: 'refused', why: 'expired' });
    type(/^Code/, '123456');
    await press(/^Verify$/);
    expect(document.activeElement).toBe(screen.getByLabelText(/^Password/));
    expect(screen.getByText(/took too long/)).toBeInTheDocument();
    // A step that ended for another reason (its token was used, the session was revoked) is back on the password step
    // too, with words that do not blame the time.
    m.signIn.mockResolvedValueOnce({ kind: 'two-factor', step });
    type(/^Password/, 'secret-password');
    await press(/^Sign in$/);
    m.verify.mockResolvedValueOnce({ kind: 'refused', why: 'ended' });
    type(/^Code/, '123456');
    await press(/^Verify$/);
    expect(document.activeElement).toBe(screen.getByLabelText(/^Password/));
    expect(screen.getByText(/can't be finished\. Sign in again\./)).toBeInTheDocument();
    expect(screen.queryByText(/took too long/)).toBeNull();
  });

  it('focus after a refused reset request: the address field', async () => {
    await open();
    await press(/^Forgot password\?$/);
    type(/^Email address/, 'me@example.test');
    let answer!: (r: ResetResult) => void;
    m.reset.mockReturnValueOnce(new Promise<ResetResult>((r) => { answer = r; }));
    drop();
    await press(/^Email me a link$/);
    expect(document.activeElement).toBe(document.body);
    await act(async () => { answer({ kind: 'refused', why: 'network' }); });
    expect(document.activeElement).toBe(screen.getByLabelText(/^Email address/));
  });

  it('the access key replaces the password form; Back to sign in brings it back with the address kept', async () => {
    await open();
    type(/^Email or user name/, 'me@example.test');
    await press(/^Other ways to sign in/);
    await press(/^Use an access key$/);
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Sign in with an access key']);
    expect(document.title).toBe('Sign in with an access key — Hoody');
    expect(screen.queryByLabelText(/^Password/)).toBeNull();
    expect(screen.getByLabelText(/^Access key/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Check the key$/ })).toHaveAttribute('type', 'submit');
    expect(screen.queryByRole('button', { name: /^Create an account$/ })).toBeNull();
    await press(/^Back to sign in$/);
    expect((screen.getByLabelText(/^Email or user name/) as HTMLInputElement).value).toBe('me@example.test');
    expect(screen.getByRole('button', { name: /^Create an account$/ })).toBeInTheDocument();
  });

  it('switching to the access key while a password is out ends that attempt: its late answer does nothing, no password is kept', async () => {
    const onSignedIn = await open();
    let answer!: (r: SignInResult) => void;
    m.signIn.mockReturnValueOnce(new Promise<SignInResult>((r) => { answer = r; }));
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'secret-password');
    await press(/^Sign in$/);
    expect(m.signIn).toHaveBeenCalledTimes(1);
    m.cancel.mockClear();
    await press(/^Other ways to sign in/);
    await press(/^Use an access key$/);
    expect(m.cancel).toHaveBeenCalledTimes(1);
    // core/signin.ts answers a cancelled attempt 'stale' (its generation moved), whether Hoody signed it in or asked for
    // a 2FA code: nothing is stored and no step is made. The key form stays up.
    await act(async () => { answer({ kind: 'refused', why: 'stale' }); });
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Access key/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    // Back on the password way: the address is kept, the password is empty, no 2FA step, not busy.
    await press(/^Back to sign in$/);
    expect((screen.getByLabelText(/^Email or user name/) as HTMLInputElement).value).toBe('me@example.test');
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText(/^Code/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Sign in$/ })).toHaveAttribute('type', 'submit');
    expect(m.signIn).toHaveBeenCalledTimes(1);
  });

  it('starting the device sign-in while a password is out ends that attempt: its late answer does nothing, no password is kept', async () => {
    const onSignedIn = await open();
    let answer!: (r: SignInResult) => void;
    m.signIn.mockReturnValueOnce(new Promise<SignInResult>((r) => { answer = r; }));
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'secret-password');
    await press(/^Sign in$/);
    expect(m.signIn).toHaveBeenCalledTimes(1);
    m.cancel.mockClear();
    await press(/^Other ways to sign in/);
    await press(/^Sign in on /);
    expect(m.device).toHaveBeenCalledTimes(1);
    expect(m.cancel).toHaveBeenCalledTimes(1);
    // core/signin.ts answers a cancelled attempt 'stale' (signed in or a 2FA step alike): nothing stored, no step.
    await act(async () => { answer({ kind: 'refused', why: 'stale' }); });
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    // The device flow is still starting (the stand-in never answers), so the password form is still drawn: the address
    // is kept, the password is empty, no Code field, Sign in not busy.
    expect((screen.getByLabelText(/^Email or user name/) as HTMLInputElement).value).toBe('me@example.test');
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText(/^Code/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Sign in$/ })).toHaveAttribute('type', 'submit');
    expect(m.signIn).toHaveBeenCalledTimes(1);
  });

  it('a password going out stops a device sign-in in progress', async () => {
    await open();
    await press(/^Other ways to sign in/);
    fireEvent.click(screen.getByRole('button', { name: /^Sign in on / }));
    expect(m.device).toHaveBeenCalledTimes(1);
    m.signIn.mockResolvedValue({ kind: 'refused', why: 'network' });
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'secret-password');
    await press(/^Sign in$/);
    expect(m.stop).toHaveBeenCalled();
  });

  it('leaving the screen ends attempts in flight', async () => {
    await open();
    cleanup();
    expect(m.cancel).toHaveBeenCalled();
  });

  it('leaving the password form for reset or sign-up ends the attempt; its late answer changes nothing', async () => {
    for (const leave of [/^Forgot password\?$/, /^Create an account$/]) {
      await open();
      let answer!: (r: SignInResult) => void;
      m.signIn.mockReturnValue(new Promise<SignInResult>((r) => { answer = r; }));
      type(/^Email or user name/, 'me@example.test');
      type(/^Password/, 'secret-password');
      await press(/^Sign in$/);
      m.cancel.mockClear();
      await press(leave);
      expect(m.cancel).toHaveBeenCalledTimes(1);
      await act(async () => { answer({ kind: 'refused', why: 'stale' }); });
      // the new screen is usable: not busy, no message from the old attempt
      expect(screen.getByRole('button', { name: leave.source.includes('Forgot') ? /^Email me a link$/ : /^Create account$/ })).not.toHaveAttribute('data-pending');
      expect(screen.queryByRole('alert')).toBeNull();
      cleanup();
    }
  });

  it('forgot password: the address carries over, one request, the same answer either way, back to sign in', async () => {
    await open();
    type(/^Email or user name/, 'me@example.test');
    type(/^Password/, 'half-typed');
    await press(/^Forgot password\?$/);
    expect((screen.getByLabelText(/^Email address/) as HTMLInputElement).value).toBe('me@example.test');
    m.reset.mockResolvedValue({ kind: 'sent' });
    await press(/^Email me a link$/);
    expect(m.reset).toHaveBeenCalledWith('me@example.test');
    expect(screen.getByText(/If me@example\.test has a Hoody account/)).toBeInTheDocument();
    expect(m.signIn).not.toHaveBeenCalled();
    await press(/^Back to sign in$/);
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
  });

  it('"Check your email" has no field: its title takes the focus; Back to sign in focuses the address field again', async () => {
    await open();
    await press(/^Forgot password\?$/);
    type(/^Email address/, 'me@example.test');
    m.reset.mockResolvedValue({ kind: 'sent' });
    drop();
    await press(/^Email me a link$/);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Check your email' }));
    await press(/^Back to sign in$/);
    expect(document.activeElement).toBe(screen.getByLabelText(/^Email or user name/));
  });

  it('forgot password: Back while the request is out drops its answer; the sign-in form is not busy', async () => {
    await open();
    await press(/^Forgot password\?$/);
    type(/^Email address/, 'me@example.test');
    let answer!: (r: ResetResult) => void;
    m.reset.mockReturnValueOnce(new Promise<ResetResult>((r) => { answer = r; }));
    await press(/^Email me a link$/);
    expect(m.reset).toHaveBeenCalledTimes(1);
    await press(/^Back to sign in$/);
    expect(screen.getByRole('button', { name: /^Sign in$/ })).toHaveAttribute('type', 'submit');
    await act(async () => { answer({ kind: 'sent' }); });
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Sign in']);
    expect(screen.queryByText(/If me@example\.test has a Hoody account/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Sign in$/ })).toHaveAttribute('type', 'submit');
  });

  it('forgot password: no address sends nothing; a refusal reads as one sentence', async () => {
    await open();
    await press(/^Forgot password\?$/);
    await press(/^Email me a link$/);
    expect(m.reset).not.toHaveBeenCalled();
    type(/^Email address/, 'me@example.test');
    m.reset.mockResolvedValue({ kind: 'refused', why: 'retry', retryAfter: 60 });
    await press(/^Email me a link$/);
    expect(screen.getByText(/Wait 60 seconds/)).toBeInTheDocument();
    // The same ladder as sign-in: minutes from two of them, "later" beyond two hours.
    m.reset.mockResolvedValue({ kind: 'refused', why: 'retry', retryAfter: 900 });
    await press(/^Email me a link$/);
    expect(screen.getByText(/Wait 15 minutes/)).toBeInTheDocument();
    m.reset.mockResolvedValue({ kind: 'refused', why: 'retry', retryAfter: 86400 });
    await press(/^Email me a link$/);
    expect(screen.getByText(/^Too many tries\. Try again later\.$/)).toBeInTheDocument();
  });
});

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
const press = async (name: RegExp) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };

async function openSignup() {
  render(<FirstRun start={{ kind: 'first-run', step: 'sign-in', choice: { origin: ORIGIN, asked: 'default' } }} onSignedIn={vi.fn()} />);
  await waitFor(() => { expect(screen.getByRole('button', { name: /^Create an account$/ })).toBeInTheDocument(); });
  await press(/^Create an account$/);
  await waitFor(() => { expect(screen.getByRole('button', { name: /^Create account$/ })).not.toBeDisabled(); });
}

describe('"Send the email again" says a wait as sign-in does', () => {
  it.each([[3600, /Wait 60 minutes/], [60, /Wait 60 seconds/], [86400, /^Too many tries\. Try again later\.$/], [undefined, /^Too many tries\. Try again later\.$/]] as const)('%s', async (retryAfter, words) => {
    const run = drivenRun();
    await openSignup();
    type(/^Email address/, 'new@example.test');
    type(/^Password/, GOOD);
    await press(/^Create account$/);
    await run.end({ kind: 'sent' });
    m.resend.mockResolvedValue(retryAfter === undefined ? { kind: 'refused', why: 'retry' } : { kind: 'refused', why: 'retry', retryAfter });
    await press(/^Send the email again$/);
    expect(screen.getByText(words)).toBeInTheDocument();
    if (retryAfter === 3600) expect(screen.queryByText(/3600/)).toBeNull();
    expect(document.body.textContent).not.toContain(GOOD);
  });
});

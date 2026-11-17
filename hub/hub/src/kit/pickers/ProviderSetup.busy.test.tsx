// ChatGPT sign-in against an agent that holds one pending sign-in per provider: the dev build's
// StrictMode runs the start effect twice, and a second start under a new Idempotency-Key met the first one's job as
// "A sign-in is already open". One attempt is one key; a sign-in that really is open elsewhere is followed, or
// cancelled and started again; a 409 naming no job is a failed start; a cancelled job ends the wait.
import type { providers } from '@core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as States from '../states/States';
import { ChatGptSetup } from './ProviderSetup';
import strings from './ProviderSetup.strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const refusal = (code: string, status: number, details: Record<string, unknown> = {}): Settled => ({ ok: false, err: { kind: 'failed', code, status, retryAfter: null, details } });

/**
 * The agent's start rules: a key it holds answers its job; another key while a job is pending is 409 (with the job's id
 * when `named`). `lost`: a cancel's answer is lost, and the job ends as given (or stays pending); `onCancel` runs on each
 * cancel; `goneOnce`: the next poll reads 404; `badOnce`: the next poll's answer is unreadable (500); `authBad`: that many login reads are unreadable; `holdAuth`: login reads wait in `authHeld`; `stored`: what login reads say, when set; `startEmpty`: the next start answers without a job. A completed job stores the login.
 */
function agent({ named = true, held = null as string | null, lost = null as 'complete' | 'cancelled' | 'pending' | null } = {}) {
  const byKey = new Map<string, string>();
  const jobs = new Map<string, { code: string; state: string }>();
  if (held) jobs.set(held, { code: 'HELD-0000', state: 'pending' });
  let n = 0;
  const starts: string[] = [];
  const cancels: string[] = [];
  const polled: string[] = [];
  const hooks = { onCancel: () => undefined as void, goneOnce: false, badOnce: false, authBad: 0, authHeld: [] as Array<() => void>, holdAuth: false, stored: null as boolean | null, startEmpty: false, authReads: 0 };
  const pending = () => [...jobs.entries()].find(([, j]) => j.state === 'pending')?.[0];
  const api = {
    auth: () => {
      hooks.authReads++;
      if (hooks.authBad > 0) {
        hooks.authBad--;
        return Promise.resolve(refusal('internal', 500));
      }
      const read = () => ok({ auth: { oauth_stored: hooks.stored ?? [...jobs.values()].some((j) => j.state === 'complete') } });
      if (hooks.holdAuth) return new Promise<Settled>((r) => void hooks.authHeld.push(() => r(read())));
      return Promise.resolve(read());
    },
    oauthStart: (_another: boolean, idem: string) => {
      starts.push(idem);
      if (hooks.startEmpty) {
        hooks.startEmpty = false;
        return Promise.resolve(ok({}));
      }
      const prior = byKey.get(idem);
      if (prior) return Promise.resolve(ok({ job_id: prior, user_code: jobs.get(prior)?.code, verification_uri: 'https://auth.openai.com/codex/device' }));
      const busy = pending();
      if (busy) return Promise.resolve(refusal('oauth_in_progress', 409, named ? { job_id: busy } : {}));
      const id = `j${++n}`;
      const code = `CODE-000${n}`;
      jobs.set(id, { code, state: 'pending' });
      byKey.set(idem, id);
      return Promise.resolve(ok({ job_id: id, user_code: code, verification_uri: 'https://auth.openai.com/codex/device' }));
    },
    oauthPoll: (id: string) => {
      polled.push(id);
      if (hooks.badOnce) {
        hooks.badOnce = false;
        return Promise.resolve(refusal('internal', 500));
      }
      if (hooks.goneOnce) {
        hooks.goneOnce = false;
        return Promise.resolve(refusal('job_not_found', 404));
      }
      const j = jobs.get(id);
      return Promise.resolve(j ? ok({ state: j.state, user_code: j.code }) : refusal('job_not_found', 404));
    },
    oauthCancel: (id: string) => {
      cancels.push(id);
      hooks.onCancel();
      const j = jobs.get(id);
      if (lost) {
        if (j && lost !== 'pending') j.state = lost;
        return Promise.resolve(refusal('internal', 500));
      }
      if (j) j.state = 'cancelled';
      return Promise.resolve(ok({ state: 'cancelled' }));
    },
  } as unknown as providers.ProvidersApi;
  return { api, starts, cancels, polled, jobs, hooks };
}

// The poll waits after each read until tick(), so a test sees the waiting screen.
const sleepers: Array<() => void> = [];
const tick = () =>
  act(async () => {
    for (const r of sleepers.splice(0)) r();
    await Promise.resolve();
  });

function envWith(): providers.Env {
  let k = 0;
  return {
    sleep: (ms: number) => (ms === 0 ? Promise.resolve() : new Promise<void>((r) => sleepers.push(r))),
    now: () => 0,
    hidden: () => false,
    visible: () => Promise.resolve(),
    newKey: () => `k-${++k}`,
    digest: () => Promise.resolve('fp-1'),
    alive: () => true,
  };
}

// The code itself sits in a SecretField; the waiting screen is its steps line and the code field.
async function waiting() {
  expect(await screen.findByText(strings['gpt.steps'])).toBeInTheDocument();
  expect(screen.getByText(strings['gpt.code'])).toBeInTheDocument();
}

const props = (api: providers.ProvidersApi, env: providers.Env) => ({ api, env, providerId: 'openai', providerLabel: 'OpenAI', onConnected: vi.fn(), onBack: vi.fn() });

describe('ChatGPT sign-in: one attempt, one key', () => {
  it('under StrictMode the code shows and the busy screen never does', async () => {
    const a = agent({ named: false });
    render(
      <StrictMode>
        <ChatGptSetup {...props(a.api, envWith())} />
      </StrictMode>,
    );
    await waiting();
    expect(screen.queryByText(strings['gpt.failedTitle'])).toBeNull();
    expect(new Set(a.starts).size).toBe(1);
    expect(new Set(a.polled)).toEqual(new Set(['j1']));
    expect(a.cancels).toEqual([]);
  });

  it('a sign-in open elsewhere is followed, and can be cancelled and started again', async () => {
    const a = agent({ held: 'j9' });
    render(<ChatGptSetup {...props(a.api, envWith())} />);
    await waiting();
    expect(a.polled).toContain('j9');
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    await waitFor(() => expect(a.polled).toContain('j1'));
    await waiting();
    expect(screen.queryByRole('button', { name: strings['gpt.restart'] })).toBeNull();
    expect(a.cancels).toEqual(['j9']);
    expect(a.starts).toEqual(['k-1', 'k-2']);
  });

  it('a followed sign-in is left running when the setup closes', async () => {
    const a = agent({ held: 'j9' });
    const { unmount } = render(<ChatGptSetup {...props(a.api, envWith())} />);
    await waiting();
    unmount();
    expect(a.cancels).toEqual([]);
  });

  it('a 409 that names no job is a failed start (the agent always names it), and Try again starts anew', async () => {
    const a = agent({ named: false, held: 'j9' });
    render(<ChatGptSetup {...props(a.api, envWith())} />);
    expect(await screen.findByText(strings['gpt.failedTitle'])).toBeInTheDocument();
    expect(a.polled).toEqual([]);
    a.jobs.delete('j9');
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.again'] }));
    await waitFor(() => expect(a.polled).toContain('j1'));
    await waiting();
    expect(a.starts).toEqual(['k-1', 'k-2']);
  });

  it('a job cancelled elsewhere ends the wait instead of polling it until it expires, and trying again starts anew', async () => {
    const a = agent();
    const env = envWith();
    env.sleep = () => Promise.resolve();
    let polls = 0;
    const poll = a.api.oauthPoll;
    a.api.oauthPoll = (id: string) => {
      polls++;
      // Without an end on 'cancelled' the poll would read the job until it expires: the agent forgets it at 50 reads.
      if (polls >= 50) return Promise.resolve(refusal('job_not_found', 404));
      if (polls === 2) {
        const j = a.jobs.get(id);
        if (j) j.state = 'cancelled';
      }
      return poll(id);
    };
    render(<ChatGptSetup {...props(a.api, env)} />);
    expect(await screen.findByText(strings['gpt.ended'])).toBeInTheDocument();
    await waitFor(() => expect(polls).toBe(2));
    // Trying again is a new attempt: the ended job's key would only replay it.
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.again'] }));
    await waitFor(() => expect(a.starts).toEqual(['k-1', 'k-2']));
  });
});

/** The setup on its own; answers its onConnected. */
// The verifying screen has no actions, so a second Check cannot be clicked while a login read is out. To prove the
// generation fence (not only the unmount guard), a test keeps the Check handler the banner was given (its typed `onCheck`
// prop, the component's own Check) from before the screen switched and calls it again: the same function a press runs.
// The kit's OutcomeBanner is wrapped, not replaced: it renders unchanged and only records the prop it was given.
const banner = vi.hoisted(() => ({ checks: [] as Array<() => void> }));
vi.mock('../states/States', async (orig) => {
  const states = await orig<typeof States>();
  const Real = states.OutcomeBanner;
  return {
    ...states,
    OutcomeBanner: (p: ComponentProps<typeof Real>) => {
      if (p.onCheck) banner.checks.push(p.onCheck);
      return <Real {...p} />;
    },
  };
});
const lastCheck = (): (() => void) => {
  const on = banner.checks.at(-1);
  if (!on) throw new Error('no Check handler');
  return on;
};

function mount(api: providers.ProvidersApi) {
  const pr = props(api, envWith());
  render(<ChatGptSetup {...pr} />);
  return pr.onConnected;
}

describe('ChatGPT sign-in: restart and the code after a lost cancel or another job', () => {
  beforeEach(() => {
    sleepers.splice(0);
    banner.checks.length = 0;
  });

  it('a lost cancel answer on restart keeps a sign-in that completed, and starts nothing new', async () => {
    const a = agent({ held: 'j9', lost: 'complete' });
    const done = mount(a.api);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(a.starts).toEqual(['k-1']);
  });

  it('a lost cancel answer on restart starts anew once the job ended without a sign-in', async () => {
    const a = agent({ held: 'j9', lost: 'cancelled' });
    mount(a.api);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    await waitFor(() => expect(a.polled).toContain('j1'));
    expect(a.starts).toEqual(['k-1', 'k-2']);
  });

  it('a lost cancel answer on restart with the job still open says not confirmed, and starts nothing new', async () => {
    const a = agent({ held: 'j9', lost: 'pending' });
    mount(a.api);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(a.starts).toEqual(['k-1']);
  });

  it('Check again after a lost cancel follows the job still open and keeps the sign-in it completes; nothing new starts', async () => {
    const a = agent({ held: 'j9', lost: 'pending' });
    const done = mount(a.api);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(await screen.findByText(strings['gpt.steps'])).toBeInTheDocument();
    const j9 = a.jobs.get('j9');
    if (j9) j9.state = 'complete';
    await tick();
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(a.starts).toEqual(['k-1']);
  });

  it('Check again that cannot read the job keeps it: a sign-in it completes before the next check is kept', async () => {
    const a = agent({ held: 'j9', lost: 'pending' });
    const done = mount(a.api);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    a.hooks.badOnce = true;
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(a.hooks.badOnce).toBe(false));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['gpt.again'] })).toBeNull();
    const j9 = a.jobs.get('j9');
    if (j9) j9.state = 'complete';
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(a.starts).toEqual(['k-1']);
  });

  it('Check again that cannot read the job keeps it: only once it reads as ended without a sign-in can a new attempt start', async () => {
    const a = agent({ held: 'j9', lost: 'pending' });
    const done = mount(a.api);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    a.hooks.badOnce = true;
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(a.hooks.badOnce).toBe(false));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    const j9 = a.jobs.get('j9');
    if (j9) j9.state = 'cancelled';
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(await screen.findByText(strings['gpt.signedOut'])).toBeInTheDocument();
    expect(a.starts).toEqual(['k-1']);
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.again'] }));
    await waitFor(() => expect(a.polled).toContain('j1'));
    expect(a.starts).toEqual(['k-1', 'k-2']);
    expect(done).not.toHaveBeenCalled();
  });

  it('a completion read on Check whose login read fails is kept: the next Check connects (the first login read failed too)', async () => {
    const a = agent({ held: 'j9', lost: 'pending' });
    a.hooks.authBad = 1;
    const done = mount(a.api);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    const j9 = a.jobs.get('j9');
    if (j9) j9.state = 'complete';
    a.hooks.authBad = 1;
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(a.hooks.authBad).toBe(0));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(done).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(a.starts).toEqual(['k-1']);
  });

  it("a completed job proves its own attempt only: a later attempt with an unknown start does not take a login for its own", async () => {
    const a = agent({ held: 'j9', lost: 'pending' });
    const done = mount(a.api);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    const j9 = a.jobs.get('j9');
    if (j9) j9.state = 'complete';
    a.hooks.stored = false;
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(await screen.findByText(strings['gpt.signedOut'])).toBeInTheDocument();
    // A new attempt: its first login read fails and its start answers without a job.
    a.hooks.stored = null;
    a.hooks.authBad = 1;
    a.hooks.startEmpty = true;
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.again'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(a.starts).toEqual(['k-1', 'k-2']);
    const reads = a.hooks.authReads;
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(a.hooks.authReads).toBe(reads + 1));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(done).not.toHaveBeenCalled();
  });

  it('a newer Check supersedes an older one while it reads the login: the older sign-in read connects nothing', async () => {
    const a = agent({ held: 'j9', lost: 'pending' });
    const done = mount(a.api);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    const checkAgain = lastCheck();
    const j9 = a.jobs.get('j9');
    if (j9) j9.state = 'complete';
    a.hooks.holdAuth = true;
    // The older Check reads the completion and waits on its login read.
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(a.hooks.authHeld).toHaveLength(1));
    // A newer Check (no job held any more) reads the login too.
    act(() => checkAgain());
    await waitFor(() => expect(a.hooks.authHeld).toHaveLength(2));
    const [older, newer] = a.hooks.authHeld.splice(0);
    a.hooks.stored = false;
    await act(async () => newer?.());
    expect(await screen.findByText(strings['gpt.signedOut'])).toBeInTheDocument();
    // The older read answers signed in after the newer Check settled: it changes nothing.
    a.hooks.stored = true;
    await act(async () => older?.());
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByText(strings['gpt.signedOut'])).toBeInTheDocument();
  });

  it('a login read that answers after the setup closed connects nothing (the unmount guard)', async () => {
    const a = agent({ held: 'j9', lost: 'pending' });
    const pr = props(a.api, envWith());
    const { unmount } = render(<ChatGptSetup {...pr} />);
    await waiting();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    const j9 = a.jobs.get('j9');
    if (j9) j9.state = 'complete';
    a.hooks.holdAuth = true;
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(a.hooks.authHeld).toHaveLength(1));
    unmount();
    await act(async () => void a.hooks.authHeld.splice(0).forEach((r) => r()));
    expect(pr.onConnected).not.toHaveBeenCalled();
  });

  it("a wiped code stays wiped for its own job, and another job's code shows", async () => {
    const a = agent({ held: 'j9' });
    mount(a.api);
    await waiting();
    // The page hidden wipes the code shown (once the field's effects have run: a found label can precede them).
    await act(async () => undefined);
    act(() => void window.dispatchEvent(new Event('pagehide')));
    await waitFor(() => expect(screen.queryByText(strings['gpt.code'])).toBeNull());
    // The same job followed again (its poll read 404 once, then Try again meets it): still wiped.
    a.hooks.goneOnce = true;
    await tick();
    await userEvent.click(await screen.findByRole('button', { name: strings['gpt.again'] }));
    await waitFor(() => expect(a.starts).toEqual(['k-1', 'k-2']));
    await waitFor(() => expect(a.polled.filter((x) => x === 'j9').length).toBe(3));
    expect(screen.getByText(strings['gpt.steps'])).toBeInTheDocument();
    expect(screen.queryByText(strings['gpt.code'])).toBeNull();
    // Restart: j9 is cancelled while another tab opens jB, which this attempt then follows: its code shows.
    a.hooks.onCancel = () => void a.jobs.set('jB', { code: 'NEXT-0001', state: 'pending' });
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    await waitFor(() => expect(a.polled).toContain('jB'));
    await waiting();
  });
});

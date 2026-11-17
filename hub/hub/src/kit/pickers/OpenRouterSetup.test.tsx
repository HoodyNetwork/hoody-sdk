// Vitest: the kit's OpenRouter sign-in (OpenRouterSetup: the AI page step's cases,
// moved with fake api/env adapters and the kit's words; the C9 cases are unchanged) over a scripted Api. The person pastes the address of
// the localhost page OpenRouter sent them to; the step sends its code once, never shows it (the field is masked, the text
// is cleared at the send), never sends it again after a lost or "already" answer, and says "signed in" only when the
// job itself ends complete. Leaving or cancelling ends the job; a lost cancel reads the job's end before it says anything.
import { providers } from '@core';
import { act, render, screen, userEvent, waitFor } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { OpenRouterSetup } from './OpenRouterSetup';
import strings from './ProviderSetup.strings.en.json';

type Settled = providers.Settled<unknown>;
type Outcome = providers.Outcome;
const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const out = (kind: Outcome['kind'], code = '', status = 0, extra: Partial<Outcome> = {}): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {}, ...extra } });
const lost = () => out('pending');

const AUTH = 'https://openrouter.ai/auth?callback_url=http%3A%2F%2Flocalhost%3A53781%2Fcallback&code_challenge=abc&code_challenge_method=S256';
const CODE = 'c0de-7f3a9bc1';
const PASTE = `http://localhost:53781/callback?code=${CODE}`;
const pending = (uri: string = AUTH) => ok({ state: 'pending', needs_code: true, verification_uri: uri });

type Name = 'pkceStart' | 'pkcePoll' | 'pkceCode' | 'pkceCancel' | 'auth';
type Answer = Settled | (() => Promise<Settled>);
type Script = Partial<Record<Name, Answer[]>>;
const NOT_SIGNED = ok({ auth: { oauth_stored: false } });

/** An answer held until the test lets it go. */
function held() {
  let let_go: (a: Settled) => void = () => undefined;
  const p = new Promise<Settled>((r) => (let_go = r));
  return { answer: () => p, release: (a: Settled) => act(async () => { let_go(a); await p; }) };
}

/**
 * The step over a fake Api: each call takes the next scripted answer (the last one repeats; a function answers when the
 * test releases it); the poll waits for tick(), and jump() moves the clock.
 */
function setup(script: Script) {
  const calls: Array<{ name: Name; args: unknown[] }> = [];
  const used = new Map<Name, number>();
  const answer = (name: Name, args: unknown[]) => {
    calls.push({ name, args: JSON.parse(JSON.stringify(args)) as unknown[] });
    const q = script[name] ?? [name === 'auth' ? NOT_SIGNED : ok()];
    const i = Math.min(used.get(name) ?? 0, q.length - 1);
    used.set(name, (used.get(name) ?? 0) + 1);
    const a = q[i]!;
    return typeof a === 'function' ? a() : Promise.resolve(a);
  };
  const api = {
    pkceStart: (...a: unknown[]) => answer('pkceStart', a),
    pkcePoll: (...a: unknown[]) => answer('pkcePoll', a),
    pkceCode: (...a: unknown[]) => answer('pkceCode', a),
    pkceCancel: (...a: unknown[]) => answer('pkceCancel', a),
    auth: (...a: unknown[]) => answer('auth', a),
  } as unknown as providers.ProvidersApi;
  let now = 1_000_000;
  let keys = 0;
  const sleepers: Array<() => void> = [];
  const env: providers.Env = {
    sleep: (ms) => (ms === 0 ? Promise.resolve() : new Promise<void>((r) => sleepers.push(r))),
    now: () => now,
    hidden: () => false,
    visible: () => Promise.resolve(),
    newKey: () => `idem-${++keys}`,
    digest: () => Promise.resolve(null),
    alive: () => true,
  };
  const onSigned = vi.fn();
  const onBack = vi.fn();
  const view = render(<OpenRouterSetup api={api} env={env} onSigned={onSigned} onBack={onBack} />);
  const tick = async () => {
    await act(async () => {
      for (const r of sleepers.splice(0)) r();
      await Promise.resolve();
    });
  };
  const argsOf = (n: Name) => calls.filter((c) => c.name === n).map((c) => c.args);
  const jump = (ms: number) => void (now += ms);
  return { view, calls, argsOf, count: (n: Name) => argsOf(n).length, tick, jump, onSigned, onBack };
}

const field = () => screen.getByLabelText(strings['or.paste']) as HTMLInputElement;
const finishBtn = () => screen.getByRole('button', { name: strings['or.finish'] });
async function paste(text: string) {
  await userEvent.click(field());
  await userEvent.paste(text);
}

describe('the kit OpenRouter sign-in (OpenRouterSetup)', () => {
  it('starts one job with a fresh key and shows the steps, the OpenRouter link and a masked field', async () => {
    const f = setup({ pkceStart: [ok({ job_id: 'j1', verification_uri: AUTH })], pkcePoll: [pending()] });
    await screen.findByText(strings['or.step3']);
    expect(f.argsOf('pkceStart')).toEqual([['openrouter', 'idem-1']]);
    expect(screen.getByRole('button', { name: strings['or.open'] })).toBeInTheDocument();
    expect(field().type).toBe('password');
    // No Show toggle: what was pasted is never shown back.
    expect(screen.queryByRole('button', { name: /show/i })).toBeNull();
  });

  it('sends the pasted code once, clears the field, never shows the code, and is signed in only when the job ends complete', async () => {
    const f = setup({ pkceStart: [ok({ job_id: 'j1', verification_uri: AUTH })], pkcePoll: [pending(), ok({ state: 'complete' })], pkceCode: [ok({ submitted: true })] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    expect(document.body.textContent).not.toContain(CODE);
    await userEvent.click(finishBtn());
    expect(f.argsOf('pkceCode')).toEqual([['openrouter', 'j1', { code: CODE }]]);
    expect(await screen.findByText(strings['or.finishing'])).toBeInTheDocument();
    expect(finishBtn()).toBeDisabled();
    expect(screen.queryByLabelText(strings['or.paste'])).toBeNull();
    expect(document.body.innerHTML).not.toContain(CODE);
    expect(f.onSigned).not.toHaveBeenCalled();
    await f.tick();
    await waitFor(() => expect(f.onSigned).toHaveBeenCalledTimes(1));
    expect(f.count('pkceCode')).toBe(1);
    expect(f.count('pkceCancel')).toBe(0);
  });

  it('a double press sends the code once', async () => {
    const f = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()], pkceCode: [ok({ submitted: true })] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    await userEvent.dblClick(finishBtn());
    expect(await screen.findByText(strings['or.finishing'])).toBeInTheDocument();
    expect(f.count('pkceCode')).toBe(1);
  });

  it('two presses in the same instant (before the step redraws) send the code once', async () => {
    const code = held();
    const f = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()], pkceCode: [code.answer] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    const b = finishBtn();
    act(() => {
      b.click();
      b.click();
    });
    expect(f.count('pkceCode')).toBe(1);
    await code.release(ok({ submitted: true }));
    expect(await screen.findByText(strings['or.finishing'])).toBeInTheDocument();
    expect(f.count('pkceCode')).toBe(1);
  });

  it('a lost answer to the code is never sent again: the job decides', async () => {
    const f = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending(), ok({ state: 'complete' })], pkceCode: [lost()] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    await userEvent.click(finishBtn());
    expect(await screen.findByText(strings['or.finishing'])).toBeInTheDocument();
    await f.tick();
    await waitFor(() => expect(f.onSigned).toHaveBeenCalledTimes(1));
    expect(f.count('pkceCode')).toBe(1);
  });

  it('an "already fed" answer waits for the job too, and a job gone (404) is "may have gone through", never failed', async () => {
    const a = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()], pkceCode: [ok({ submitted: false })] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    await userEvent.click(finishBtn());
    expect(await screen.findByText(strings['or.finishing'])).toBeInTheDocument();
    expect(a.onSigned).not.toHaveBeenCalled();
    a.view.unmount();

    const b = setup({ pkceStart: [ok({ job_id: 'j2' })], pkcePoll: [pending()], pkceCode: [out('failed', 'job_not_found', 404)] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    await userEvent.click(finishBtn());
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(screen.queryByText(strings['gpt.failedTitle'])).toBeNull();
    expect(b.onSigned).not.toHaveBeenCalled();
  });

  it('refuses what holds no code, or an API key, without sending anything, and keeps it to be fixed', async () => {
    const f = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()] });
    await screen.findByText(strings['or.step3']);
    await userEvent.click(finishBtn());
    expect(await screen.findByText(strings['or.empty'])).toBeInTheDocument();
    await paste('sk-or-v1-0000000000000000');
    await userEvent.click(finishBtn());
    expect(await screen.findByText(strings['or.key'])).toBeInTheDocument();
    await userEvent.clear(field());
    await paste('http://localhost:53781/callback?state=x');
    await userEvent.click(finishBtn());
    expect(await screen.findByText(strings['or.noCode'])).toBeInTheDocument();
    expect(field().value).toBe('http://localhost:53781/callback?state=x');
    expect(f.count('pkceCode')).toBe(0);
  });

  it('a definite refusal of the code lets the person paste again; the code is gone from the field', async () => {
    const f = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()], pkceCode: [out('failed', 'bad_request', 400), ok({ submitted: true })] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    await userEvent.click(finishBtn());
    await waitFor(() => expect(f.count('pkceCode')).toBe(1));
    expect(field().value).toBe('');
    // Without the caller's words, the kit's own sentence (the agent's message is never shown).
    expect(await screen.findByText(strings['or.codeFailed'])).toBeInTheDocument();
    await paste(PASTE);
    await userEvent.click(finishBtn());
    expect(await screen.findByText(strings['or.finishing'])).toBeInTheDocument();
    expect(f.count('pkceCode')).toBe(2);
  });

  it('shows no link that is not https on openrouter.ai', async () => {
    setup({ pkceStart: [ok({ job_id: 'j1', verification_uri: 'https://openrouter.ai.example.com/auth' })], pkcePoll: [pending('https://openrouter.ai.example.com/auth')] });
    await screen.findByText(strings['or.step3']);
    expect(screen.queryByRole('button', { name: strings['or.open'] })).toBeNull();
    expect(screen.getByText(strings['or.noLink'])).toBeInTheDocument();
  });

  it('a job already in progress is followed, never a second start', async () => {
    const f = setup({ pkceStart: [out('failed', 'oauth_in_progress', 409, { details: { job_id: 'j9' } })], pkcePoll: [pending()] });
    await screen.findByText(strings['or.step3']);
    expect(f.count('pkceStart')).toBe(1);
    await waitFor(() => expect(f.argsOf('pkcePoll')[0]).toEqual(['openrouter', 'j9']));
  });

  it('a job already in progress can be cancelled and started again under a new key; leaving never cancels it', async () => {
    const f = setup({ pkceStart: [out('failed', 'oauth_in_progress', 409, { details: { job_id: 'j9' } }), ok({ job_id: 'j1', verification_uri: AUTH })], pkcePoll: [pending()], pkceCancel: [ok({ state: 'cancelled' })] });
    await screen.findByText(strings['or.step3']);
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    await waitFor(() => expect(f.argsOf('pkcePoll').at(-1)).toEqual(['openrouter', 'j1']));
    expect(f.argsOf('pkceCancel')).toEqual([['openrouter', 'j9']]);
    expect(f.argsOf('pkceStart')).toEqual([['openrouter', 'idem-1'], ['openrouter', 'idem-2']]);
    expect(screen.queryByRole('button', { name: strings['gpt.restart'] })).toBeNull();

    const g = setup({ pkceStart: [out('failed', 'oauth_in_progress', 409, { details: { job_id: 'j9' } })], pkcePoll: [pending()] });
    await waitFor(() => expect(g.argsOf('pkcePoll')[0]).toEqual(['openrouter', 'j9']));
    g.view.unmount();
    expect(g.count('pkceCancel')).toBe(0);
  });

  it('a lost cancel answer on restart reads the job: a completed sign-in is kept, a cancelled job starts anew, an open one is not confirmed', async () => {
    const busy = out('failed', 'oauth_in_progress', 409, { details: { job_id: 'j9' } });
    const done = setup({ pkceStart: [busy], pkcePoll: [pending(), ok({ state: 'complete' })], pkceCancel: [lost()] });
    await screen.findByText(strings['or.step3']);
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    await waitFor(() => expect(done.onSigned).toHaveBeenCalledTimes(1));
    expect(done.count('pkceStart')).toBe(1);
    done.view.unmount();

    const ended = setup({ pkceStart: [busy, ok({ job_id: 'j1', verification_uri: AUTH })], pkcePoll: [pending(), ok({ state: 'cancelled' }), pending()], pkceCancel: [lost()] });
    await screen.findByText(strings['or.step3']);
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    await waitFor(() => expect(ended.argsOf('pkcePoll').at(-1)).toEqual(['openrouter', 'j1']));
    expect(ended.argsOf('pkceStart')).toEqual([['openrouter', 'idem-1'], ['openrouter', 'idem-2']]);
    ended.view.unmount();

    const open = setup({ pkceStart: [busy], pkcePoll: [pending()], pkceCancel: [lost()] });
    await screen.findByText(strings['or.step3']);
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.restart'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(open.count('pkceStart')).toBe(1);
  });

  it('a 409 that names no job is a failed start (the agent always names it), and Try again starts anew', async () => {
    const f = setup({ pkceStart: [out('failed', 'oauth_in_progress', 409), ok({ job_id: 'j1', verification_uri: AUTH })], pkcePoll: [pending()] });
    expect(await screen.findByText(strings['gpt.failedTitle'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.again'] }));
    await waitFor(() => expect(f.argsOf('pkcePoll')[0]).toEqual(['openrouter', 'j1']));
    expect(f.argsOf('pkceStart')).toEqual([['openrouter', 'idem-1'], ['openrouter', 'idem-2']]);
  });

  // Check again only reads (C9). A lost start is never sent again from it, under any key; a new
  // start (Back, then sign in) adopts the job the lost one may have made (oauth_in_progress).
  it('a start whose answers are lost is not confirmed; checking only reads whether OpenRouter is signed in', async () => {
    const f = setup({ pkceStart: [lost(), lost(), ok({ job_id: 'j3' })], pkcePoll: [pending()] });
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(f.argsOf('pkceStart')).toEqual([['openrouter', 'idem-1'], ['openrouter', 'idem-1']]);
    const auths = f.count('auth');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(f.count('auth')).toBe(auths + 1));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(f.count('pkceStart')).toBe(2);
    expect(f.count('pkcePoll')).toBe(0);
    expect(f.onSigned).not.toHaveBeenCalled();
  });

  it('after lost starts, Check again says signed in when OpenRouter now holds a sign-in it did not hold before', async () => {
    const f = setup({ pkceStart: [lost()], auth: [NOT_SIGNED, ok({ auth: { oauth_stored: true } })] });
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(f.onSigned).toHaveBeenCalledTimes(1));
    expect(f.count('pkceStart')).toBe(2);
    expect(f.count('auth')).toBe(2);
  });

  it('after lost starts, a sign-in that was already stored proves nothing: Check again stays not confirmed', async () => {
    const SIGNED = ok({ auth: { oauth_stored: true } });
    const f = setup({ pkceStart: [lost()], auth: [SIGNED] });
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(f.count('auth')).toBe(2));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(f.onSigned).not.toHaveBeenCalled();
    expect(f.count('pkceStart')).toBe(2);
  });

  it('cancel ends the job and goes back; a cancel that races a finished sign-in says signed in', async () => {
    const a = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()], pkceCancel: [ok({ state: 'cancelled' })] });
    await screen.findByText(strings['or.step3']);
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.cancel'] }));
    await waitFor(() => expect(a.onBack).toHaveBeenCalledTimes(1));
    expect(a.argsOf('pkceCancel')).toEqual([['openrouter', 'j1']]);
    a.view.unmount();
    expect(a.count('pkceCancel')).toBe(1);

    const b = setup({ pkceStart: [ok({ job_id: 'j2' })], pkcePoll: [pending()], pkceCancel: [ok({ state: 'complete' })] });
    await screen.findByText(strings['or.step3']);
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.cancel'] }));
    await waitFor(() => expect(b.onSigned).toHaveBeenCalledTimes(1));
    expect(b.onBack).not.toHaveBeenCalled();
  });

  it('a lost cancel reads the job: complete is signed in, still pending is not confirmed', async () => {
    const a = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending(), ok({ state: 'complete' })], pkceCancel: [lost()] });
    await screen.findByText(strings['or.step3']);
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.cancel'] }));
    await waitFor(() => expect(a.onSigned).toHaveBeenCalledTimes(1));
    a.view.unmount();

    const b = setup({ pkceStart: [ok({ job_id: 'j2' })], pkcePoll: [pending()], pkceCancel: [lost()] });
    await screen.findByText(strings['or.step3']);
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.cancel'] }));
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(b.onSigned).not.toHaveBeenCalled();
    expect(b.onBack).not.toHaveBeenCalled();
  });

  it('leaving the step cancels its job once', async () => {
    const f = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()] });
    await screen.findByText(strings['or.step3']);
    f.view.unmount();
    expect(f.argsOf('pkceCancel')).toEqual([['openrouter', 'j1']]);
  });

  it('a computer that cannot run the sign-in says to use an API key instead', async () => {
    const f = setup({ pkceStart: [out('failed', 'oauth_unsupported', 422)] });
    expect(await screen.findByText(strings['or.unsupported'])).toBeInTheDocument();
    expect(f.count('pkcePoll')).toBe(0);
  });

  it('a job that ends in error says so, and Try again starts a new job with a new key', async () => {
    const f = setup({ pkceStart: [ok({ job_id: 'j1' }), ok({ job_id: 'j2' })], pkcePoll: [ok({ state: 'error', error: 'exchange failed: key sk-or-secret' }), pending()] });
    expect(await screen.findByText(strings['or.error'])).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('sk-or-secret');
    await userEvent.click(screen.getByRole('button', { name: strings['gpt.again'] }));
    await screen.findByText(strings['or.step3']);
    expect(f.argsOf('pkceStart')).toEqual([['openrouter', 'idem-1'], ['openrouter', 'idem-2']]);
    expect(f.onSigned).not.toHaveBeenCalled();
  });

  it('the field and its state drop the pasted text the moment it is sent, before the answer comes back', async () => {
    const code = held();
    setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()], pkceCode: [code.answer] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    await userEvent.click(finishBtn());
    expect(field().value).toBe('');
    expect(document.body.innerHTML).not.toContain(CODE);
    // While the send is on its way, Finish and the field are off.
    expect(finishBtn()).toBeDisabled();
    expect(field()).toBeDisabled();
    await code.release(ok({ submitted: true }));
    expect(await screen.findByText(strings['or.finishing'])).toBeInTheDocument();
  });

  // The cancel answers how the job ended, so nothing is left to read: no poll at all (the step never follows the late job).
  // A cancel whose answer is lost is read as on any leave: signin.leave.test.tsx.
  it('closing while the start is on its way cancels the job it made, and starts nothing again', async () => {
    const st = held();
    const f = setup({ pkceStart: [st.answer], pkcePoll: [pending()], pkceCancel: [ok({ state: 'cancelled' })] });
    await waitFor(() => expect(f.count('pkceStart')).toBe(1));
    f.view.unmount();
    expect(f.count('pkceCancel')).toBe(0);
    await st.release(ok({ job_id: 'j7' }));
    await waitFor(() => expect(f.argsOf('pkceCancel')).toEqual([['openrouter', 'j7']]));
    expect(f.count('pkceStart')).toBe(1);
    expect(f.count('pkcePoll')).toBe(0);
  });

  it('a code answer that comes back after the job ended changes nothing', async () => {
    const code = held();
    const f = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending(), ok({ state: 'error' })], pkceCode: [code.answer] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    await userEvent.click(finishBtn());
    await f.tick();
    expect(await screen.findByText(strings['or.error'])).toBeInTheDocument();
    await code.release(ok({ submitted: true }));
    expect(screen.getByText(strings['or.error'])).toBeInTheDocument();
    expect(screen.queryByText(strings['or.finishing'])).toBeNull();
  });

  it('a poll that runs out of time is "may have gone through"; Check reads the job and follows it again while it waits', async () => {
    const f = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()] });
    await screen.findByText(strings['or.step3']);
    f.jump(providers.LIFE);
    await f.tick();
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(screen.queryByText(strings['gpt.failedTitle'])).toBeNull();
    expect(f.count('pkceCancel')).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(await screen.findByText(strings['or.step3'])).toBeInTheDocument();
    expect(f.onSigned).not.toHaveBeenCalled();
  });

  it('the poll runs out of time while the code is on its way, then its answer is lost: Check never reopens the field, nothing is sent twice', async () => {
    const code = held();
    const f = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [pending()], pkceCode: [code.answer] });
    await screen.findByText(strings['or.step3']);
    await paste(PASTE);
    await userEvent.click(finishBtn());
    expect(f.count('pkceCode')).toBe(1);
    f.jump(providers.LIFE);
    await f.tick();
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    await code.release(lost());
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(await screen.findByText(strings['or.finishing'])).toBeInTheDocument();
    expect(screen.queryByLabelText(strings['or.paste'])).toBeNull();
    expect(f.count('pkceCode')).toBe(1);
  });

  it('a job that disappears is "may have gone through"; Check says signed in only when OpenRouter was not signed in before', async () => {
    const a = setup({ pkceStart: [ok({ job_id: 'j1' })], pkcePoll: [out('failed', 'job_not_found', 404)], auth: [NOT_SIGNED, ok({ auth: { oauth_stored: true } })] });
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(a.onSigned).toHaveBeenCalledTimes(1));
    a.view.unmount();

    const signedBefore = ok({ auth: { oauth_stored: true } });
    const b = setup({ pkceStart: [ok({ job_id: 'j2' })], pkcePoll: [out('failed', 'job_not_found', 404)], auth: [signedBefore] });
    expect(await screen.findByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await waitFor(() => expect(b.count('auth')).toBe(2));
    expect(screen.getByText(strings['gpt.unconfirmedTitle'])).toBeInTheDocument();
    expect(b.onSigned).not.toHaveBeenCalled();
  });
});

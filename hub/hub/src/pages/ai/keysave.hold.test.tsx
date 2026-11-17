// A key save whose answer was lost is core's hold (keySaveHold.ts), on the lock a key or endpoint removal of that provider
// on that computer takes. While it is held such a removal waits: a save that lands after the removal would leave a key the
// person believes gone. The disconnect dialog shows the save with Check again and Stop tracking, and Remove sends nothing.
// The held record carries no key material. Once Check again proves the key saved (only the tab that sent it can, and only
// for a key not stored before), or the person stops tracking it, the removal goes as before. A sign-out takes its own lock
// and waits for no key. Every call of a save (the PUT, its read-back, Check again) goes only to the computer the caller was
// shown.
import { heldAttempts, holdAttempt, providers } from '@core';
import { act, cleanup, render, screen, userEvent, waitFor, within } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { runAuthPurge } from '@core/realm';
import { boot } from '@core/test/env';
import kit from '@kit/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import { DISCONNECT_HOLD_BY, disconnectLock } from './disconnectHold';
import { saveKey } from './flows-key';
import { checkKeySave, sendKeySave, type HeldKeySave } from './keySaveHold';
import type { Account } from './logic';
import { DisconnectDialog } from './parts/Connect';
import { AiProvider, type AiCtx } from './parts/ctx';
import { KeyStep } from './parts/KeyStep';
import { shownComputer } from './shownGate';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const lost: Settled = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const OPENAI: Account = { id: 'openai', prefix: 'openai', label: 'OpenAI', ready: true, pay: 'own_key', custom: false, via: 'stored_key', status: 'ready' };
const OPENAI_SIGNIN: Account = { ...OPENAI, via: 'signin' };
const DEF = ok({ provider: { id: 'my-ep', display_name: 'My endpoint', definition_rev: 'rev-3', custom_definition: { base_url: 'https://x.example', wire_format: 'openai' } } });
const AT = { project: 'p1', computer: 'c1' };
const C1 = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const C2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
/** The lock a key save and a key or endpoint removal of one provider on the computer p1/c1 share (credentialLock). */
const LOCK = 'ai.credential:p1/c1/openai';
const EP_LOCK = 'ai.credential:p1/c1/my-ep';
const KEY = 'sk-test-1';
/** The key's short fingerprint as GET auth shows it once the key is stored. */
const FP = 'fp-new';
const REMOVE = strings['dis.confirm.key'];
const env: providers.Env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: (k) => Promise.resolve(k === KEY ? FP : 'fp-other'), alive: () => true };

/** The fingerprint GET auth shows (the old key's until the save lands). */
let stored: string;
let reads: number;
/** The answer of the next GET auth only, when set (the read a save takes as it starts). */
let nextRead: (() => Promise<Settled>) | null;
let keyPut: ReturnType<typeof vi.fn>;
let keyDelete: ReturnType<typeof vi.fn>;
let signOut: ReturnType<typeof vi.fn>;
let api: Api;
let ctx: AiCtx;

/** The AI page as far as this goes: the key step (of `step`, when open) and the disconnect dialog (open with `remove`). */
function Page({ step, remove }: { step: 'openai' | 'my-ep' | null; remove: Account | null }) {
  return (
    <AiProvider value={ctx}>
      {step === 'openai' && <KeyStep providerId="openai" providerLabel="OpenAI" onSaved={vi.fn()} />}
      {step === 'my-ep' && <KeyStep providerId="my-ep" providerLabel="My endpoint" endpoint onSaved={vi.fn()} />}
      <DisconnectDialog account={remove} onClose={vi.fn()} />
    </AiProvider>
  );
}
const save = () => screen.getByRole('button', { name: strings['key.save'] });
const dialog = () => screen.findByRole('alertdialog');
const line = (k: 'key.saveHeld' | 'key.saveHeldRemove') => strings[k].replace('{{provider}}', 'OpenAI');
/** A band or dialog button, once the save's request has answered (until then it stays focusable and does nothing). */
async function press(q: ReturnType<typeof within>, name: string) {
  const b = await q.findByRole('button', { name });
  await waitFor(() => expect(b).not.toHaveAttribute('aria-disabled', 'true'));
  await userEvent.click(b);
}
/** Types the key into the step and sends it. */
async function send(label: RegExp) {
  await userEvent.type(await screen.findByLabelText(label), KEY);
  await waitFor(() => expect(save()).toBeEnabled());
  await userEvent.click(save());
}
/** Every stored value, as one string. */
function storedText(): string {
  const out: string[] = [];
  // eslint-disable-next-line no-restricted-globals -- the test reads the browser's storage to prove no key was kept there
  for (const box of [localStorage, sessionStorage]) for (let i = 0; i < box.length; i++) out.push(`${box.key(i)}=${box.getItem(box.key(i) ?? '') ?? ''}`);
  return out.join('\n');
}
/** The held save on LOCK as the dialog reads it (its request answered). */
function heldNow(): HeldKeySave {
  const h = heldAttempts(LOCK)[0]!;
  return { id: h.id, metaVersion: h.metaVersion, inFlight: false };
}
/** A built-in key save of OpenAI sent the way the step sends it, from `on`. */
const sendOpenAi = (on: string) => sendKeySave(api, env, AT, 'openai', on, (a) => saveKey(a, env, 'openai', KEY, null, () => true));

beforeEach(() => {
  boot();
  setTarget(C1);
  stored = 'fp-old';
  reads = 0;
  nextRead = null;
  keyPut = vi.fn(() => Promise.resolve(lost));
  keyDelete = vi.fn(() => Promise.resolve(ok({})));
  signOut = vi.fn(() => Promise.resolve(ok({})));
  const over = {
    keyPut,
    keyDelete,
    signOut,
    provider: (pid: string) => Promise.resolve(pid === 'my-ep' ? DEF : lost),
    auth: () => {
      reads++;
      const once = nextRead;
      nextRead = null;
      return once ? once() : Promise.resolve(ok({ auth: { api_key_stored: true, api_key_fingerprint: stored, oauth_stored: true } }));
    },
  } as Partial<Api>;
  api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : () => Promise.resolve(lost)) });
  const m = {
    computer: { id: 'c1', name: 'atlas' }, target: C1,
    realm: null, defaults: null, models: [], bots: null, accounts: [OPENAI],
  };
  ctx = { m, api, env, reload: vi.fn(), connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
});
afterEach(() => {
  cleanup();
  setTarget(null);
  resetAttempts();
});

describe('a key save whose answer was lost holds a key removal of that provider', () => {
  it('the dialog shows the save and Remove key sends nothing; Check again proves the key, then the removal goes', async () => {
    const view = render(<Page step="openai" remove={null} />);
    await send(/OpenAI API key/);
    await screen.findByRole('button', { name: strings['key.typeAgain'] });
    expect(keyPut).toHaveBeenCalledTimes(1);

    view.rerender(<Page step="openai" remove={OPENAI} />);
    const d = await dialog();
    await waitFor(() => expect(d).toHaveTextContent(line('key.saveHeldRemove')));
    await userEvent.click(within(d).getByRole('button', { name: REMOVE }));
    expect(keyDelete).not.toHaveBeenCalled();
    expect(heldAttempts(LOCK).map((h) => h.by)).toEqual(['ai.key-save']);

    // Check again reads the stored fingerprint against the key's: another key is stored, so the save stays held.
    await press(within(d), kit['outcome.pending.check']);
    await waitFor(() => expect(d).toHaveTextContent(strings['key.saveStill']));
    expect(heldAttempts(LOCK)).toHaveLength(1);
    expect(keyDelete).not.toHaveBeenCalled();

    // The key shows: the save is proved, its hold goes, and Remove key sends the removal once.
    stored = FP;
    await press(within(d), kit['outcome.pending.check']);
    await waitFor(() => expect(heldAttempts(LOCK)).toHaveLength(0));
    const remove = within(await dialog()).getByRole('button', { name: REMOVE });
    await waitFor(() => expect(remove).toBeEnabled());
    await userEvent.click(remove);
    await waitFor(() => expect(keyDelete).toHaveBeenCalledTimes(1));
    expect(keyPut).toHaveBeenCalledTimes(1);
  });

  it('the held record carries no key material: no key and no fingerprint anywhere in storage', async () => {
    render(<Page step="openai" remove={null} />);
    await send(/OpenAI API key/);
    await screen.findByRole('button', { name: strings['key.typeAgain'] });
    const [h] = heldAttempts(LOCK);
    expect(h?.by).toBe('ai.key-save');
    expect(h?.meta ?? null).toBeNull();
    const all = storedText();
    expect(all, 'the hold is stored').toContain(LOCK);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(FP);
  });

  it('opened again, the key step shows the save and takes no key; Stop tracking, after its warning, lets the removal go', async () => {
    const view = render(<Page step="openai" remove={null} />);
    await send(/OpenAI API key/);
    await screen.findByRole('button', { name: strings['key.typeAgain'] });
    view.rerender(<Page step={null} remove={null} />);
    view.rerender(<Page step="openai" remove={null} />);
    expect(await screen.findByText(line('key.saveHeld'))).toBeInTheDocument();
    expect(screen.getByLabelText(/OpenAI API key/)).toBeDisabled();
    expect(save()).toBeDisabled();

    await press(screen, kit['held.dismiss']);
    const ask = within(await screen.findByRole('alertdialog'));
    expect(ask.getByText(strings['dis.stopWarn'])).toBeInTheDocument();
    await userEvent.click(ask.getByRole('button', { name: kit['held.dismissGo'] }));
    await waitFor(() => expect(screen.queryByText(line('key.saveHeld'))).toBeNull());
    expect(heldAttempts(LOCK)).toHaveLength(0);
    expect(screen.getByLabelText(/OpenAI API key/)).toBeEnabled();

    view.rerender(<Page step={null} remove={OPENAI} />);
    const remove = within(await dialog()).getByRole('button', { name: REMOVE });
    await waitFor(() => expect(remove).toBeEnabled());
    await userEvent.click(remove);
    await waitFor(() => expect(keyDelete).toHaveBeenCalledTimes(1));
  });

  it('a save sent from another tab (or before a reload) cannot be checked here: Check again says so, Stop tracking frees it', async () => {
    const got = await holdAttempt(LOCK, { by: 'ai.key-save', identity: { project: 'p1', computer: 'c1', provider: 'openai' } });
    if (!got.ok) throw new Error(`not held: ${got.code}`);
    got.hold.sent();
    render(<Page step={null} remove={OPENAI} />);
    const d = await dialog();
    await waitFor(() => expect(d).toHaveTextContent(line('key.saveHeldRemove')));
    await press(within(d), kit['outcome.pending.check']);
    await waitFor(() => expect(d).toHaveTextContent(strings['key.saveUnprovedRemove']));
    expect(reads, 'nothing to read it back with').toBe(0);
    expect(heldAttempts(LOCK)).toHaveLength(1);

    const stop = within(d).getByRole('button', { name: strings['dis.stop'] });
    expect(document.getElementById(stop.getAttribute('aria-describedby') ?? '')).toHaveTextContent(strings['dis.stopWarn']);
    await userEvent.click(stop);
    await waitFor(() => expect(heldAttempts(LOCK)).toHaveLength(0));
    const remove = within(await dialog()).getByRole('button', { name: REMOVE });
    await waitFor(() => expect(remove).toBeEnabled());
    await userEvent.click(remove);
    await waitFor(() => expect(keyDelete).toHaveBeenCalledTimes(1));
  });

  it("an answer that comes back lets the hold go, even after its step went (an endpoint's key, whose late answer the step no longer takes)", async () => {
    let answer: (s: Settled) => void = () => undefined;
    keyPut.mockImplementation(() => new Promise<Settled>((r) => (answer = r)));
    const view = render(<Page step="my-ep" remove={null} />);
    await send(/My endpoint API key/);
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    expect(heldAttempts(EP_LOCK), 'held while the key is out').toHaveLength(1);
    view.rerender(<Page step={null} remove={null} />);
    await act(async () => answer(ok({ check: 'valid' })));
    await waitFor(() => expect(heldAttempts(EP_LOCK)).toHaveLength(0));
  });
});

describe('a key save and a sign-out of one provider take separate locks', () => {
  it('a held sign-out does not stop a key save of that provider, and both stay held', async () => {
    const signLock = disconnectLock(AT, 'openai', 'signin')!;
    const got = await holdAttempt(signLock, { by: DISCONNECT_HOLD_BY, identity: { ...AT, provider: 'openai' }, meta: { what: 'signin' } });
    if (!got.ok) throw new Error(`not held: ${got.code}`);
    got.hold.sent();
    const r = await sendOpenAi(shownComputer());
    expect(r.state).toBe('not_confirmed');
    expect(keyPut).toHaveBeenCalledTimes(1);
    expect(heldAttempts(LOCK).map((h) => h.by)).toEqual(['ai.key-save']);
    expect(heldAttempts(signLock)).toHaveLength(1);
  });

  it('a held key save does not lock a sign-out: the dialog of a signed-in provider shows no save and sends the sign-out', async () => {
    expect((await sendOpenAi(shownComputer())).state).toBe('not_confirmed');
    expect(heldAttempts(LOCK)).toHaveLength(1);
    ctx = { ...ctx, m: { ...ctx.m, accounts: [OPENAI_SIGNIN] } } as AiCtx;
    render(<Page step={null} remove={OPENAI_SIGNIN} />);
    const d = await dialog();
    expect(d).not.toHaveTextContent(line('key.saveHeldRemove'));
    const go = within(d).getByRole('button', { name: strings['dis.confirm.signin'] });
    await waitFor(() => expect(go).toBeEnabled());
    await userEvent.click(go);
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(heldAttempts(LOCK), 'the key save is still held').toHaveLength(1);
  });
});

describe('a key save stays on the computer the caller was shown', () => {
  it('a computer switch while the hold is being taken sends no key and leaves no hold', async () => {
    const r = sendOpenAi(shownComputer());
    // The switch lands before holdAttempt answers.
    setTarget(C2);
    expect(await r).toEqual({ state: 'stale' });
    expect(keyPut).not.toHaveBeenCalled();
    expect(heldAttempts(LOCK)).toEqual([]);
  });

  it('a switch after the key left: its read-back goes nowhere and the hold stays for that computer', async () => {
    let answer: (s: Settled) => void = () => undefined;
    keyPut.mockImplementation(() => new Promise<Settled>((res) => (answer = res)));
    const r = sendOpenAi(shownComputer());
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    // The other computer would show this key's fingerprint.
    setTarget(C2);
    stored = FP;
    const n = reads;
    answer(lost);
    expect((await r).state).toBe('stale');
    expect(reads).toBe(n);
    expect(heldAttempts(LOCK)).toHaveLength(1);
  });

  it('Check again from a computer no longer shown reads nothing and frees nothing; back on it, it proves the key', async () => {
    const on = shownComputer();
    expect((await sendOpenAi(on)).state).toBe('not_confirmed');
    const before = reads;
    setTarget(C2);
    stored = FP;
    expect(await checkKeySave(api, env, 'openai', heldNow(), on)).toBe('not_confirmed');
    expect(reads).toBe(before);
    expect(heldAttempts(LOCK)).toHaveLength(1);
    setTarget(C1);
    expect(await checkKeySave(api, env, 'openai', heldNow(), on)).toBe('saved');
    expect(heldAttempts(LOCK)).toEqual([]);
    expect(keyPut).toHaveBeenCalledTimes(1);
  });
});

describe('a read-back proves only a key that was not stored before', () => {
  for (const [why, first] of [
    ['the same key was stored already', null],
    ['what was stored could not be read', () => Promise.resolve(lost)],
  ] as const) {
    it(`${why}: the read-back that shows the key lets nothing go; Remove sends nothing, and Check again cannot tell`, async () => {
      stored = FP;
      nextRead = first;
      const r = await sendOpenAi(shownComputer());
      expect(r.state, 'the key is stored').toBe('saved');
      expect(keyPut).toHaveBeenCalledTimes(1);
      expect(heldAttempts(LOCK).map((h) => h.by), 'but this PUT may still land').toEqual(['ai.key-save']);

      render(<Page step={null} remove={OPENAI} />);
      const d = await dialog();
      await waitFor(() => expect(d).toHaveTextContent(line('key.saveHeldRemove')));
      await userEvent.click(within(d).getByRole('button', { name: REMOVE }));
      expect(keyDelete).not.toHaveBeenCalled();
      const n = reads;
      await press(within(d), kit['outcome.pending.check']);
      await waitFor(() => expect(d).toHaveTextContent(strings['key.saveUnprovedRemove']));
      expect(reads, 'no read can tell').toBe(n);
      expect(heldAttempts(LOCK)).toHaveLength(1);

      await userEvent.click(within(d).getByRole('button', { name: strings['dis.stop'] }));
      await waitFor(() => expect(heldAttempts(LOCK)).toHaveLength(0));
      const remove = within(await dialog()).getByRole('button', { name: REMOVE });
      await waitFor(() => expect(remove).toBeEnabled());
      await userEvent.click(remove);
      await waitFor(() => expect(keyDelete).toHaveBeenCalledTimes(1));
    });
  }

  it("the step's own Check again of such a save says it cannot tell, and reads nothing", async () => {
    nextRead = () => Promise.resolve(lost);
    render(<Page step="openai" remove={null} />);
    await send(/OpenAI API key/);
    await screen.findByRole('button', { name: strings['key.typeAgain'] });
    const n = reads;
    await press(screen, kit['outcome.pending.check']);
    expect(await screen.findByText(strings['key.saveUnproved'])).toBeInTheDocument();
    expect(screen.queryByText(strings['key.stillNot'])).toBeNull();
    expect(reads).toBe(n);
    expect(heldAttempts(LOCK)).toHaveLength(1);
  });

  it('another key stored before (control): the read-back that shows this key proves it and lets the hold go', async () => {
    // The PUT lands, then its answer is lost.
    keyPut.mockImplementation(() => {
      stored = FP;
      return Promise.resolve(lost);
    });
    expect((await sendOpenAi(shownComputer())).state).toBe('saved');
    expect(heldAttempts(LOCK)).toEqual([]);
  });

  it('the read of what was stored never holds the key back: GET auth not answering, the PUT leaves and its answer lets the hold go', async () => {
    nextRead = () => new Promise<Settled>(() => undefined);
    keyPut.mockImplementation(() => Promise.resolve(ok({ check: 'valid' })));
    expect((await sendOpenAi(shownComputer())).state).toBe('valid');
    expect(keyPut).toHaveBeenCalledTimes(1);
    expect(heldAttempts(LOCK)).toEqual([]);
  });
});

describe('the fingerprint of a save lives no longer than the account', () => {
  it('taken after the account ended, it is not kept: Check again of that hold cannot tell and reads nothing', async () => {
    let answer: (s: Settled) => void = () => undefined;
    keyPut.mockImplementation(() => new Promise<Settled>((res) => (answer = res)));
    const r = sendOpenAi(shownComputer());
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    runAuthPurge();
    setTarget(C1);
    answer(lost);
    const got = await r;
    expect(got.state).toBe('not_confirmed');
    const held = (got as { held?: HeldKeySave }).held;
    expect(held).toBeDefined();
    const n = reads;
    expect(await checkKeySave(api, env, 'openai', held!, shownComputer())).toBe('unproved');
    expect(reads).toBe(n);
  });
});

describe('what proves a save, and how it is let go', () => {
  it('a first read with no fingerprint while a key is stored is unknown, never "no key": a later read of this key proves nothing', async () => {
    nextRead = () => Promise.resolve(ok({ auth: { api_key_stored: true } }));
    // The PUT lands (the agent now shows this key), then its answer is lost.
    keyPut.mockImplementation(() => {
      stored = FP;
      return Promise.resolve(lost);
    });
    const r = await sendOpenAi(shownComputer());
    expect(r.state, 'the read-back shows the key').toBe('saved');
    expect(heldAttempts(LOCK).map((h) => h.by), 'but the key stored before is unknown, so this PUT may still land').toEqual(['ai.key-save']);
    const n = reads;
    expect(await checkKeySave(api, env, 'openai', heldNow(), shownComputer())).toBe('unproved');
    expect(reads).toBe(n);
  });

  it('a first read that says no key is stored (control): the read-back of this key proves it', async () => {
    nextRead = () => Promise.resolve(ok({ auth: { api_key_stored: false } }));
    keyPut.mockImplementation(() => {
      stored = FP;
      return Promise.resolve(lost);
    });
    expect((await sendOpenAi(shownComputer())).state).toBe('saved');
    expect(heldAttempts(LOCK)).toEqual([]);
  });

  it('a first read that never answers is bounded: the lost save settles held and answered, so it can be let go', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      nextRead = () => new Promise<Settled>(() => undefined);
      let done = false;
      const r = sendOpenAi(shownComputer()).then((x) => { done = true; return x; });
      await vi.advanceTimersByTimeAsync(providers.FIRST_READ_WAIT_MS - 1);
      expect(done, 'still waiting on the first read').toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const got = await r;
      const held = (got as { held?: HeldKeySave }).held;
      expect(held, 'held, its request answered (Stop tracking is offered)').toEqual(expect.objectContaining({ inFlight: false }));
      expect(heldAttempts(LOCK)[0]?.inFlight).toBe(false);
      expect(await checkKeySave(api, env, 'openai', held!, shownComputer()), 'no read proves it').toBe('unproved');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a save this tab proved stays proved: a second Check again of it (the leave toast after the band) answers saved, reading nothing', async () => {
    // The PUT does not land before its answer is lost: the read-backs show the old key, the hold stays with its proof.
    const got = await sendOpenAi(shownComputer());
    const held = (got as { held?: HeldKeySave }).held!;
    expect(heldAttempts(LOCK)).toHaveLength(1);
    stored = FP;
    expect(await checkKeySave(api, env, 'openai', held, shownComputer())).toBe('saved');
    expect(heldAttempts(LOCK)).toEqual([]);
    const n = reads;
    expect(await checkKeySave(api, env, 'openai', held, shownComputer())).toBe('saved');
    expect(reads).toBe(n);
  });

  it('proved holds are forgotten with the account', async () => {
    const held = ((await sendOpenAi(shownComputer())) as { held?: HeldKeySave }).held!;
    stored = FP;
    expect(await checkKeySave(api, env, 'openai', held, shownComputer())).toBe('saved');
    runAuthPurge();
    setTarget(C1);
    expect(await checkKeySave(api, env, 'openai', held, shownComputer())).toBe('unproved');
  });

  it('"Stop tracking this save" asks first; Cancel keeps the save tracked and the key step waiting', async () => {
    render(<Page step="openai" remove={null} />);
    await send(/OpenAI API key/);
    await userEvent.click(await screen.findByRole('button', { name: strings['key.typeAgain'] }));
    const ask = await screen.findByRole('alertdialog', { name: strings['key.typeAgainTitle'] });
    expect(ask).toHaveTextContent(strings['dis.stopWarn']);
    await userEvent.click(within(ask).getByRole('button', { name: kit['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(heldAttempts(LOCK)).toHaveLength(1);
    expect(screen.getByRole('button', { name: strings['key.typeAgain'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['key.typeAgain'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['key.typeAgainGo'] }));
    await waitFor(() => expect(heldAttempts(LOCK)).toEqual([]));
  });
});

// The key step (also "Replace key") sends no key while a removal of the same provider's key or endpoint on the same
// computer may still go through (core's hold, disconnectHold.ts): a removal that lands late would end the new key as well.
// The step shows that removal with Check again and Stop tracking; once it is proved gone or no longer tracked, a key saves
// as before. A held sign-out ends only the sign-in and takes its own lock, so it does not stop the step. Check again reads
// only the computer the step was drawn for.
import { holdAttempt, heldAttempts, type providers } from '@core';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { setTarget } from '@core/ctx';
import { boot } from '@core/test/env';
import kit from '@kit/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from './api';
import type { DisconnectWhat } from './flows-disconnect';
import { DISCONNECT_HOLD_BY, disconnectLock, stopDisconnect, type DisconnectAt } from './disconnectHold';
import { AiProvider, type AiCtx } from './parts/ctx';
import { KeyStep } from './parts/KeyStep';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const lost: Settled = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const AT: DisconnectAt = { project: 'p1', computer: 'c1' };
const M = { computer: { id: 'c1', name: 'atlas' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };
const C2 = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
const LOCK = () => disconnectLock(AT, 'openai', 'key')!;
const env: providers.Env = { sleep: () => Promise.resolve(), now: () => 0, hidden: () => false, visible: () => Promise.resolve(), newKey: () => 'idem-1', digest: () => Promise.resolve('fp-1'), alive: () => true };

/** Whether the agent still stores the old key (what a removal's Check again reads). */
let stored: boolean;
/** GET auth reads sent. */
let reads: number;
let keyPut: ReturnType<typeof vi.fn>;
let api: Api;

/** A removal of `what` of `provider` at `at` whose answer was lost: held by core on its lock, its request answered, with
 *  the meta the dialog stores ({ what }; `meta` overrides it). */
async function holdRemoval(provider = 'openai', at: DisconnectAt = AT, what: DisconnectWhat = 'key', meta: unknown = { what }) {
  const got = await holdAttempt(disconnectLock(at, provider, what)!, { by: DISCONNECT_HOLD_BY, identity: { ...at, provider }, meta });
  if (!got.ok) throw new Error(`not held: ${got.code}`);
  got.hold.sent();
}
const draw = () => render(
  <AiProvider value={{ m: M, api, env, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx}>
    <KeyStep providerId="openai" providerLabel="OpenAI" onSaved={vi.fn()} />
  </AiProvider>,
);
const input = () => screen.getByLabelText(/OpenAI API key/);
const save = () => screen.getByRole('button', { name: strings['key.save'] });
const BAND = strings['key.removalHeld'].replace('{{provider}}', 'OpenAI');
const band = () => screen.findByText(BAND);
const bandGone = () => waitFor(() => expect(screen.queryByText(BAND)).toBeNull());
/** A band button, once the removal's request has answered (until then it stays focusable and does nothing). */
async function press(name: string) {
  const b = await screen.findByRole('button', { name });
  await waitFor(() => expect(b).not.toHaveAttribute('aria-disabled', 'true'));
  await userEvent.click(b);
}
async function typeAndSave() {
  await userEvent.type(input(), 'sk-test-1');
  await waitFor(() => expect(save()).toBeEnabled());
  await userEvent.click(save());
}

beforeEach(() => {
  boot();
  setTarget(M.target);
  stored = true;
  reads = 0;
  keyPut = vi.fn(() => Promise.resolve(lost));
  const auth = () => { reads++; return Promise.resolve(ok({ auth: { api_key_stored: stored, api_key_fingerprint: 'fp-old' } })); };
  const over = { keyPut, auth } as Partial<Api>;
  api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : () => Promise.resolve(lost)) });
});
afterEach(() => {
  setTarget(null);
  resetAttempts();
});

describe('KeyStep while a removal of the same provider may still go through', () => {
  it('shows the removal, takes no key and sends nothing; Check again proves it gone, then a key saves', async () => {
    await holdRemoval();
    draw();
    await band();
    expect(input()).toBeDisabled();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(keyPut).not.toHaveBeenCalled();

    // Check again: the old key is still stored, so the removal stays held and says so.
    await press(kit['outcome.pending.check']);
    expect(await screen.findByText(strings['dis.stillThere'])).toBeInTheDocument();
    expect(heldAttempts(LOCK())).toHaveLength(1);
    expect(input()).toBeDisabled();

    // Gone: the hold goes with the band, and the key the person types now is sent, once.
    stored = false;
    await press(kit['outcome.pending.check']);
    await bandGone();
    expect(heldAttempts(LOCK())).toHaveLength(0);
    await typeAndSave();
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
  });

  it('Stop tracking, after the warning, lets the removal go and the key can be typed', async () => {
    await holdRemoval();
    draw();
    await band();
    await press(kit['held.dismiss']);
    const ask = within(await screen.findByRole('alertdialog'));
    expect(ask.getByText(strings['dis.stopWarn'])).toBeInTheDocument();
    await userEvent.click(ask.getByRole('button', { name: kit['held.dismissGo'] }));
    await bandGone();
    expect(heldAttempts(LOCK())).toHaveLength(0);
    await typeAndSave();
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
  });

  it('a removal of another provider, or on another computer, does not stop this step', async () => {
    await holdRemoval('anthropic');
    await holdRemoval('openai', { project: 'p1', computer: 'c2' });
    draw();
    expect(screen.queryByText(BAND)).toBeNull();
    await typeAndSave();
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
  });

  it('a held sign-out of the same provider does not stop the step: it ends the sign-in, not a key', async () => {
    await holdRemoval('openai', AT, 'signin');
    draw();
    expect(screen.queryByText(BAND)).toBeNull();
    expect(input()).toBeEnabled();
    await typeAndSave();
    await waitFor(() => expect(keyPut).toHaveBeenCalledTimes(1));
    // The sign-out stays held on its own lock: only its own dialog settles it.
    expect(heldAttempts(disconnectLock(AT, 'openai', 'signin')!)).toHaveLength(1);
  });

  it('a hold whose stored meta cannot be read still stops the step (control)', async () => {
    await holdRemoval('openai', AT, 'key', {});
    draw();
    await band();
    expect(input()).toBeDisabled();
    expect(save()).toBeDisabled();
  });

  it('"Still there" belongs to the hold it was read for: a later removal held while the step is open starts without it', async () => {
    await holdRemoval();
    draw();
    await band();
    await press(kit['outcome.pending.check']);
    expect(await screen.findByText(strings['dis.stillThere'])).toBeInTheDocument();
    // That hold is let go elsewhere (another tab's Stop tracking), and a new removal of the same provider is held.
    const h = heldAttempts(LOCK())[0]!;
    expect(await stopDisconnect({ id: h.id, what: 'key', metaVersion: h.metaVersion, inFlight: false })).toBe(true);
    await bandGone();
    await holdRemoval();
    await band();
    expect(screen.queryByText(strings['dis.stillThere'])).toBeNull();
  });

  it('Check again after the shown computer moved reads nothing and lets nothing go; back on that computer it does', async () => {
    await holdRemoval();
    draw();
    await band();
    // The shell now shows another computer, whose key would read gone; this step was drawn for c1.
    setTarget(C2);
    stored = false;
    await press(kit['outcome.pending.check']);
    await waitFor(() => expect(screen.getByRole('button', { name: kit['outcome.pending.check'] })).not.toHaveAttribute('aria-disabled', 'true'));
    expect(reads).toBe(0);
    expect(heldAttempts(LOCK())).toHaveLength(1);
    expect(screen.getByText(BAND)).toBeInTheDocument();
    // Back on c1: the same Check again reads it gone and lets it go.
    setTarget(M.target);
    await press(kit['outcome.pending.check']);
    await bandGone();
    expect(reads).toBe(1);
    expect(heldAttempts(LOCK())).toHaveLength(0);
  });
});

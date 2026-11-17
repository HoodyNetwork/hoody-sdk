// An endpoint edit whose answer was lost is core's hold (endpointEditHold.ts), never the form's own state. The edit drawn
// again (the drawer closed and opened, the page left and back) still shows "may have gone through" with Check again over
// a locked form, and Save sends nothing; Check again only reads the endpoint back and compares it with what was sent.
import { heldAttempts, type providers } from '@core';
import { cleanup, render, screen, userEvent, waitFor, within } from '@app/testing';
import { resetAttempts } from '@core/attempts';
import { boot } from '@core/test/env';
import kit from '@kit/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Api } from './api';
import { EDIT_HOLD_BY, editLock } from './endpointEditHold';
import { AiProvider, type AiCtx } from './parts/ctx';
import { EndpointEdit } from './parts/EndpointStep';
import strings from './strings.en.json';

type Settled = providers.Settled<unknown>;
const ok = (body: unknown): Settled => ({ ok: true, body });
const lost: Settled = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const M = { computer: { id: 'c1' }, target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } } };
const LOCK = () => editLock({ project: 'p1', computer: 'c1' }, 'my-ep')!;
const def = (name: string, models = ['m1']) => ok({ provider: { id: 'my-ep', display_name: name, definition_rev: 'rev-3', custom_definition: { base_url: 'https://x.example/v1', wire_format: 'chat_completions' }, models: models.map((m) => ({ spec: `my-ep/${m}` })) } });

/** What the agent stores: the old name until the edit lands. */
let stored = 'My endpoint';
let sent: unknown[];
let onSaved: Mock<() => void>;
let api: Api;

const draw = () => (
  <AiProvider value={{ m: M, api, env: {}, reload: () => undefined, connect: () => undefined, goto: () => undefined } as unknown as AiCtx}>
    <EndpointEdit providerId="my-ep" onSaved={onSaved} />
  </AiProvider>
);
const name = () => screen.getByRole('textbox', { name: /^Name/ });
const save = () => screen.getByRole('button', { name: strings['ep.save'] });
const band = () => screen.findByText(strings['err.notConfirmed']);
/** The band's Check again, once its request has answered (until then it stays focusable and does nothing). */
async function checkAgain() {
  const b = await screen.findByRole('button', { name: kit['outcome.pending.check'] });
  await waitFor(() => expect(b).not.toHaveAttribute('aria-disabled', 'true'));
  await userEvent.click(b);
}

beforeEach(() => {
  boot();
  stored = 'My endpoint';
  sent = [];
  onSaved = vi.fn();
  const none = () => Promise.resolve(lost);
  const over = { provider: () => Promise.resolve(def(stored)), customPatch: (_p: string, b: unknown) => { sent.push(b); return Promise.resolve(lost); } } as Partial<Api>;
  api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : none) });
});
afterEach(() => { cleanup(); resetAttempts(); });

describe('EndpointEdit: an unknown save is held by core', () => {
  it('kept when the form is drawn again: locked, Save sends nothing; Check again only reads, then lets it go', async () => {
    const view = render(draw());
    await screen.findByDisplayValue('My endpoint');
    await userEvent.clear(name());
    await userEvent.type(name(), 'Renamed');
    await userEvent.click(save());
    await band();
    expect(sent).toEqual([{ display_name: 'Renamed' }]);
    expect(heldAttempts(LOCK())).toHaveLength(1);

    // The drawer closed and opened again: the form is drawn anew and reads the endpoint as stored (the old name).
    view.unmount();
    render(draw());
    await band();
    await screen.findByDisplayValue('My endpoint');
    expect(name()).toBeDisabled();
    await userEvent.click(save());
    expect(sent).toHaveLength(1);

    // Check again: not there yet, so it stays held and says so; then it is: let go and closed, still one send.
    await checkAgain();
    expect(await screen.findByText(strings['ep.stillNot'])).toBeInTheDocument();
    expect(heldAttempts(LOCK())).toHaveLength(1);
    stored = 'Renamed';
    await checkAgain();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(heldAttempts(LOCK())).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it('Check again compares the models sent, in any order: another list is not the change', async () => {
    let models = ['m1'];
    const over = { provider: () => Promise.resolve(def('My endpoint', models)), customPatch: (_p: string, b: unknown) => { sent.push(b); return Promise.resolve(lost); } } as Partial<Api>;
    api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : () => Promise.resolve(lost)) });
    render(draw());
    await screen.findByDisplayValue('My endpoint');
    await userEvent.type(screen.getByRole('textbox', { name: /^Models/ }), '{Enter}m2');
    await userEvent.click(save());
    await band();
    models = ['m1', 'm3'];
    await checkAgain();
    expect(await screen.findByText(strings['ep.stillNot'])).toBeInTheDocument();
    models = ['m2', 'm1'];
    await checkAgain();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('Stop tracking, after the kit question, lets the hold go and the form reads the endpoint again', async () => {
    render(draw());
    await screen.findByDisplayValue('My endpoint');
    await userEvent.clear(name());
    await userEvent.type(name(), 'Renamed');
    await userEvent.click(save());
    await band();
    const stop = await screen.findByRole('button', { name: kit['held.dismiss'] });
    await waitFor(() => expect(stop).not.toHaveAttribute('aria-disabled', 'true'));
    await userEvent.click(stop);
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: kit['held.dismissGo'] }));
    await waitFor(() => expect(heldAttempts(LOCK())).toHaveLength(0));
    await waitFor(() => expect(name()).toBeEnabled());
    expect(name()).toHaveValue('My endpoint');
  });

  it('its lock: one per project, computer and endpoint, with no realm', () => {
    expect(LOCK()).toBe(`${EDIT_HOLD_BY}:p1/c1/my-ep`);
    expect(editLock({ project: 'p2', computer: 'c1' }, 'my-ep')).not.toBe(LOCK());
    expect(editLock({ project: 'p1', computer: 'c1' }, 'a b')).toBeNull();
  });

  it('a save answered at once holds nothing', async () => {
    const over = { provider: () => Promise.resolve(def(stored)), customPatch: (_p: string, b: unknown) => { sent.push(b); return Promise.resolve(ok({})); } } as Partial<Api>;
    api = new Proxy({ ...over } as Api, { get: (t, k) => (k in t ? t[k as keyof Api] : () => Promise.resolve(lost)) });
    render(draw());
    await screen.findByDisplayValue('My endpoint');
    await userEvent.type(name(), ' two');
    await userEvent.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(heldAttempts(LOCK())).toHaveLength(0);
  });
});

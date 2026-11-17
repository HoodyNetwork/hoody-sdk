// A safety checker change whose outcome is unknown is core's hold (checkerHold.ts), never the section's own state. The
// section drawn again (a realm switch and back remounts it, as does leaving Settings and coming back) still shows "may have
// gone through" with Check again and the switch off, so no second change can be sent over the first; Check again only reads.
import { cleanup, render, screen, waitFor, within } from '@app/testing';
import userEvent from '@testing-library/user-event';
import { heldAttempts } from '@core';
import { resetAttempts } from '@core/attempts';
import { boot, R1 } from '@core/test/env';
import kit from '@kit/strings.en.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../api';
import { checkerLock } from '../checkerHold';
import { checkerOf, DECIDE } from '../logic';
import { modelLock } from '../modelHold';
import strings from '../strings.en.json';
import type { Settled } from '../types';
import { AdvancedSection } from './Advanced';
import { AiProvider, type AiCtx } from './ctx';

const lost: Settled<unknown> = { ok: false, err: { kind: 'pending', code: '', status: 502, retryAfter: null, details: {} } };
const eff = (enabled: boolean): Settled<unknown> => ({ ok: true, body: { effective: { enabled, model: DECIDE, usable: enabled } } });
const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const LOCK = () => checkerLock({ project: 'p1', computer: 'c1', realm: R1 })!;

/** What the checker read-back shows: off until the change lands. */
let lands = false;
let puts = 0;
let reload: ReturnType<typeof vi.fn>;
let api: Api;

function ctx(): AiCtx {
  const m = {
    computer: { id: 'c1', name: 'atlas' }, target: TARGET, realm: R1, realmIds: [R1],
    caps: { jev_realm_settings: true }, defaults: null, models: [], accounts: [], guarded: {},
    checker: checkerOf(eff(false), { realm: R1, realmSettings: true }), checkerChoices: { models: [] }, loads: { checker: 'ok' },
  };
  return { m, api, env: {}, reload, connect: () => undefined, goto: () => undefined } as unknown as AiCtx;
}
/** The section as the page draws it, under `key` (the page keys it by computer and realm). */
const draw = (key: string) => <AiProvider value={ctx()}><AdvancedSection key={key} /></AiProvider>;
const open = () => userEvent.click(screen.getByRole('button', { name: strings['adv.show'] }));
const toggle = () => screen.getByRole('switch', { name: strings['adv.checker'] });

beforeEach(() => {
  boot({ realm: R1 });
  lands = false;
  puts = 0;
  reload = vi.fn();
  api = {
    jevPut: vi.fn(async () => { puts++; return lost; }),
    jev: vi.fn(async () => eff(lands)),
  } as unknown as Api;
});
afterEach(() => { cleanup(); resetAttempts(); });

describe('the safety checker: an unknown outcome is held by core', () => {
  it('kept when the section is drawn again: the switch stays off and nothing is sent twice; Check again only reads, then lets it go', async () => {
    const view = render(draw(`c1|${R1}`));
    await open();
    await userEvent.click(toggle());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(kit['outcome.pending.title']);
    expect(toggle()).toBeDisabled();
    expect(puts).toBe(1);
    expect(heldAttempts(LOCK())).toHaveLength(1);

    // A realm switch and back: the page draws the section again under another key, then this one.
    view.rerender(draw('c1|other'));
    view.rerender(draw(`c1|${R1}`));
    await open();
    const again = await screen.findByRole('alert');
    expect(again).toHaveTextContent(kit['outcome.pending.title']);
    expect(toggle()).toBeDisabled();
    await userEvent.click(toggle());
    expect(puts).toBe(1);

    // Check again: not there yet, so it stays held; then it is (the change went through): let go, still one send.
    await userEvent.click(within(again).getByRole('button', { name: kit['outcome.pending.check'] }));
    expect(heldAttempts(LOCK())).toHaveLength(1);
    // Check again says what it found: not there yet.
    expect(await within(screen.getByRole('alert')).findByText(strings['def.stillNot'])).toBeInTheDocument();
    lands = true;
    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: kit['outcome.pending.check'] }));
    await waitFor(() => expect(heldAttempts(LOCK())).toHaveLength(0));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(reload).toHaveBeenCalled();
    expect(puts).toBe(1);
  });

  it('its own lock: one per project, computer and realm, never an agent model lock', () => {
    const at = { project: 'p1', computer: 'c1', realm: R1 };
    expect(LOCK().startsWith('ai.checker:')).toBe(true);
    expect(checkerLock({ ...at, realm: 'global' })).not.toBe(LOCK());
    expect(checkerLock({ ...at, project: 'p2' })).not.toBe(LOCK());
    expect(LOCK()).not.toBe(modelLock(at, 'checker'));
  });

  it('a change saved at once holds nothing: the read-back shows it', async () => {
    lands = true;
    api = { jevPut: vi.fn(async () => { puts++; return { ok: true, body: {} }; }), jev: vi.fn(async () => eff(lands)) } as unknown as Api;
    render(draw(`c1|${R1}`));
    await open();
    await userEvent.click(toggle());
    expect(await screen.findByText(strings['adv.saved'])).toBeInTheDocument();
    expect(heldAttempts(LOCK())).toHaveLength(0);
    expect(puts).toBe(1);
  });
});

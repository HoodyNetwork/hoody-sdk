// The live terminal's money hand-off ("… nothing was sent and nothing was charged", parts/moneyHandoff.term.tsx) is
// never drawn beside a payment that is not confirmed or held (C9: a pending outcome is never said not to have
// happened). The live terminal reaches that state only from a record an earlier build left; the guard holds if it does.
// The hold is made the way a person makes one (held-opened.term.test.tsx): state `topup-unknown` answers the top-up
// pending, the drawer is closed (the hold stays on the page). Then the live gate is installed and Add funds is opened
// again: the billing view draws the drawer anew (it reads ?sheet=funds), so Funds judges the gate with the hold in
// place. A control proves that path: with no hold, the same reopen DOES draw the hand-off.
// A checkout send in flight (posting, reconciling) is not driven here: with the gate the drawer has no Confirm, and a
// drawer that is posting cannot be closed and opened again; its guard (noSendStep, CheckoutDrawer.tsx) is read, not run.
// Installing the gate and only resizing redraws no billing component (the controls
// failed); the view's own redraw on ?sheet=funds is used instead.
// The held test proves the drawer reopened (a Cancel button exists only in the drawers), so
// its negative checks cannot pass on a closed drawer (the page band has its own Check again).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';
import { setLiveGate, type LiveGate } from '../../core/live-gate';
import { resetUnknownCheckouts } from './data';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; setLiveGate(null); resetUnknownCheckouts(); });

// A gate that sends nothing: nothing is sent after it is installed.
const GATE: LiveGate = { direct: () => Promise.reject(Object.assign(new Error('not sent'), { kind: 'not_sent', notSent: true })) };
const HANDOFF = 'nothing was sent';
const flat = (f: string): string => f.replace(/\s+/g, ' ');
/** The drawer's framed rows (`┃ │ … │`), trimmed and joined: the hand-off's words wrap at a space the frame drops. */
const boxText = (f: string): string => f.split('\n').map((r) => /┃ │ (.*?) │/.exec(r)?.[1]?.trim() ?? '').filter((r) => r !== '').join(' ');

function all(role: Role, name: string | RegExp) {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
}

async function press(role: Role, name: string | RegExp): Promise<void> {
  let n = all(role, name)[0];
  for (let i = 0; i < 5 && !n; i++) { await s!.settle(); n = all(role, name)[0]; }
  expect(n).toBeDefined();
  act(n!, 'press');
  await s!.settle();
}

/** Opens Add funds, closes it, installs the live gate, opens it again: the frame of the reopened drawer. */
async function reopenLive(): Promise<string> {
  await press('button', 'Cancel');
  setLiveGate(GATE);
  await press('button', 'Add funds');
  return s!.settle();
}

test('control: no hold; Add funds reopened after the gate draws the hand-off', async () => {
  s = await renderPage({ page: 'billing', path: '/billing', fx: null, cols: 140, rows: 60 });
  await s.settle();
  await press('button', 'Add funds');
  expect(flat(s.frame)).not.toContain(HANDOFF);
  expect(boxText(await reopenLive())).toContain(HANDOFF);
}, 180_000);

test('a held top-up: Add funds reopened after the gate shows Check again and no hand-off', async () => {
  s = await renderPage({ page: 'billing', path: '/billing', fx: 'topup-unknown', cols: 140, rows: 60 });
  await s.settle();
  await press('button', 'Add funds');
  await press('radio' as Role, 'Card');
  await press('button', 'Continue to payment');
  expect(s.frame).toContain('Payment page: not confirmed');
  const raw = await reopenLive();
  expect(all('button', 'Cancel').length).toBeGreaterThan(0);
  expect(flat(raw)).toContain('Check again');
  expect(flat(raw)).not.toContain(HANDOFF);
  expect(boxText(raw)).not.toContain(HANDOFF);
}, 180_000);

// The live terminal Hub sends no payment (term/app/live-wire.ts refuses every money route unsent), and each
// money step says so before any press (parts/moneyHandoff.term.tsx: kit Handoff with the web Hub's address, no Confirm
// or Continue). money-handoff.term.test.tsx pins buy, rent, reserve and Add funds at 120x40. This file pins what it does
// not draw: Pay now and Upgrade (the two checkouts of a server you already have) at 120x40, all six money steps at 80x24,
// and the Add funds step a checkout opens itself when the wallet is short (useFunds inside CheckoutDrawer: "Back to
// checkout", the "Still needed for" row). Every "not drawn" check has a positive control on the same path and size
// without the gate, so none can pass on a frame that never showed the step.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, within, type SemNode } from '../../term/prim/semantics';
import { setLiveGate, type LiveGate } from '../../core/live-gate';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; setLiveGate(null); });

// A gate that sends nothing: no test here reaches a send.
const GATE: LiveGate = { direct: () => Promise.reject(Object.assign(new Error('not sent'), { kind: 'not_sent', notSent: true })) };

const REASON = 'Payments and plan changes are made in the web Hub. The terminal sends none: nothing was sent and nothing was charged.';
const PAY_ACTIONS = /Confirm purchase|Confirm and pay|Confirm payment|Upgrade and pay|Continue to payment/;
const flat = (frame: string): string => frame.replace(/\s+/g, ' ');

/** The hand-off box's rows (`┃ │ … │`, the drawer's framed part), trimmed: the words wrap at a space the frame drops. */
function boxRows(frame: string): string[] {
  return frame.split('\n').map((r) => /┃ │ (.*?) │/.exec(r)?.[1]?.trim() ?? '').filter((r) => r !== '');
}

function tree(): SemNode[] {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
}

// The fixture's subscriptions (fixtures.ts SUBS): ...4b02 is fra-7, on hold (Pay now); ...4b01 is n12 on Small (Upgrade).
const PAY = '/billing?checkout=pay&sub=a1b2c3d4e5f60718293a4b02';
const UPGRADE = '/billing?checkout=upgrade&sub=a1b2c3d4e5f60718293a4b01&plan=fam-pro';

const NEW_AT_120 = [
  { what: 'pay for a server on hold', path: PAY, action: 'Confirm payment' },
  { what: 'upgrade a server', path: UPGRADE, action: 'Upgrade and pay' },
] as const;

for (const c of NEW_AT_120) {
  test(`live terminal, ${c.what}: the web Hub's address and no payment action`, async () => {
    setLiveGate(GATE);
    s = await renderPage({ page: 'billing', path: c.path, fx: null, cols: 120, rows: 40 });
    const raw = await s.settle();
    const box = boxRows(raw);
    expect(box.join(' ')).toContain(REASON);
    expect(box.join('')).toMatch(/https:\/\/[^\s/]+\/auth\/home\?\S*#\/billing/);
    expect(flat(raw)).toContain('[c Copy link]');
    expect(flat(raw).match(PAY_ACTIONS)?.[0] ?? null).toBeNull();
  }, 180_000);

  test(`no live gate, ${c.what}: drawn as on the web (its payment action, no hand-off)`, async () => {
    s = await renderPage({ page: 'billing', path: c.path, fx: null, cols: 120, rows: 40 });
    const frame = flat(await s.settle());
    expect(frame).toContain(c.action);
    expect(frame).not.toContain('made in the web Hub');
  }, 180_000);
}

const AT_80 = [
  { what: 'buy a plan', path: '/billing?checkout=buy&plan=fam-plus', action: 'Confirm purchase' },
  { what: 'pay for a server on hold', path: PAY, action: 'Confirm payment' },
  { what: 'upgrade a server', path: UPGRADE, action: 'Upgrade and pay' },
  { what: 'rent', path: '/billing?checkout=rent&item=mkt_sin_m&days=30', action: 'Confirm and pay' },
  { what: 'reserve', path: '/billing?checkout=reserve&item=mkt_sin_m&days=30', action: 'Confirm and pay' },
  { what: 'add funds', path: '/billing?sheet=funds', action: 'Continue to payment' },
] as const;

for (const c of AT_80) {
  test(`80x24, live terminal, ${c.what}: the whole reason, Copy link, no payment action`, async () => {
    setLiveGate(GATE);
    s = await renderPage({ page: 'billing', path: c.path, fx: null, cols: 80, rows: 24 });
    const raw = await s.settle();
    // The hand-off is the first thing in the step's body: its reason is on the first screen, whole, at 80x24.
    expect(boxRows(raw).join(' ')).toContain(REASON);
    expect(flat(raw)).toContain('[c Copy link]');
    expect(flat(raw).match(PAY_ACTIONS)?.[0] ?? null).toBeNull();
  }, 180_000);

  test(`80x24, no live gate, ${c.what}: its payment action is on the first screen`, async () => {
    s = await renderPage({ page: 'billing', path: c.path, fx: null, cols: 80, rows: 24 });
    const frame = flat(await s.settle());
    expect(frame).toContain(c.action);
    expect(frame).not.toContain('made in the web Hub');
  }, 180_000);
}

/** Presses the checkout drawer's own "Add funds" (the shortfall's), never the page header's button of the same name. */
async function pressDrawerAddFunds(): Promise<void> {
  let btn: SemNode | undefined;
  for (let i = 0; i < 5 && !btn; i++) {
    // Inside a dialog only (the checkout drawer): the header's Add funds sits in the page, outside every dialog.
    btn = queryAllByRole(tree(), 'dialog').flatMap((d) => queryAllByRole(within(d), 'button', { name: 'Add funds' }))[0];
    if (!btn) await s!.settle();
  }
  expect(btn).toBeDefined();
  act(btn!, 'press');
  await s!.settle();
}

// fx `wallet-short`: the plan costs $12.00 and the wallet holds $8.80, so the review offers its own Add funds.
const BUY = '/billing?checkout=buy&plan=fam-plus';

test('no live gate: a short checkout\'s Add funds step has its Continue to payment (control)', async () => {
  s = await renderPage({ page: 'billing', path: BUY, fx: 'wallet-short', cols: 140, rows: 60 });
  await s.settle();
  await pressDrawerAddFunds();
  const frame = flat(s.frame);
  // The checkout's own funds step: its way back and the row naming what the purchase still needs.
  expect(queryAllByRole(tree(), 'button', { name: 'Back to checkout' }).length).toBeGreaterThan(0);
  expect(frame).toMatch(/Still needed for/);
  expect(frame).toContain('Continue to payment');
  expect(frame).not.toContain('made in the web Hub');
}, 180_000);

test('live terminal: a short checkout\'s Add funds step hands off too, with no Continue to payment', async () => {
  setLiveGate(GATE);
  s = await renderPage({ page: 'billing', path: BUY, fx: 'wallet-short', cols: 140, rows: 60 });
  await s.settle();
  // The review itself already hands off (no Confirm purchase) and still offers the shortfall's Add funds.
  expect(flat(s.frame).match(PAY_ACTIONS)?.[0] ?? null).toBeNull();
  await pressDrawerAddFunds();
  const raw = s.frame;
  expect(queryAllByRole(tree(), 'button', { name: 'Back to checkout' }).length).toBeGreaterThan(0);
  expect(flat(raw)).toMatch(/Still needed for/);
  expect(boxRows(raw).join(' ')).toContain(REASON);
  expect(flat(raw).match(PAY_ACTIONS)?.[0] ?? null).toBeNull();
}, 180_000);

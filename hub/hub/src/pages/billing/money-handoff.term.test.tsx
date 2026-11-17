// The live terminal Hub sends no payment (term/app/live-wire.ts refuses every money route at the wire and keeps no
// money record), so a checkout (buy, upgrade, pay, rent, reserve) or Add funds there must not end on a refusal that
// blamed browser storage ("Free up browser storage or leave private browsing"): advice that never helps in a terminal.
// With the live gate installed the money step now says, before any press, that payments are made in the web Hub and
// that nothing was sent or charged, gives this page's web Hub address (kit Handoff: Copy link, QR code), and draws no
// Confirm or Continue at all (parts/moneyHandoff.term.tsx). Without a live gate (fixtures, goldens, the web) the
// steps are drawn as before.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { setLiveGate, type LiveGate } from '../../core/live-gate';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; setLiveGate(null); });

// A gate that sends nothing: this test never reaches a send.
const GATE: LiveGate = { direct: () => Promise.reject(Object.assign(new Error('not sent'), { kind: 'not_sent', notSent: true })) };

const REASON = 'Payments and plan changes are made in the web Hub. The terminal sends none: nothing was sent and nothing was charged.';
const PAY_ACTIONS = /Confirm purchase|Confirm and pay|Confirm payment|Upgrade and pay|Continue to payment/;

const CASES = [
  { what: 'buy a plan', path: '/billing?checkout=buy&plan=fam-plus', action: 'Confirm purchase' },
  { what: 'rent', path: '/billing?checkout=rent&item=mkt_sin_m&days=30', action: 'Confirm and pay' },
  { what: 'reserve', path: '/billing?checkout=reserve&item=mkt_sin_m&days=30', action: 'Confirm and pay' },
  { what: 'add funds', path: '/billing?sheet=funds', action: 'Continue to payment' },
] as const;

const flat = (frame: string): string => frame.replace(/\s+/g, ' ');

/** The hand-off box's rows (`┃ │ … │`, the drawer's framed part), trimmed: the words wrap at a space the frame
 *  drops, the address wraps anywhere. */
function boxRows(frame: string): string[] {
  return frame.split('\n').map((r) => /┃ │ (.*?) │/.exec(r)?.[1]?.trim() ?? '').filter((r) => r !== '');
}

for (const c of CASES) {
  test(`live terminal, ${c.what}: the web Hub's address and no payment action`, async () => {
    setLiveGate(GATE);
    s = await renderPage({ page: 'billing', path: c.path, fx: null, cols: 120, rows: 40 });
    const raw = await s.settle();
    const frame = flat(raw);
    const box = boxRows(raw);
    expect(box.join(' ')).toContain(REASON);
    // https://<web Hub origin>/auth/home?<realm, computer>#/billing: the billing page of the served Hub.
    expect(box.join('')).toMatch(/https:\/\/[^\s/]+\/auth\/home\?\S*#\/billing/);
    expect(frame).toContain('[c Copy link]');
    expect(frame.match(PAY_ACTIONS)?.[0] ?? null).toBeNull();
    expect(frame).not.toContain('browser storage');
  }, 180_000);

  test(`no live gate, ${c.what}: drawn as before (its payment action, no hand-off)`, async () => {
    s = await renderPage({ page: 'billing', path: c.path, fx: null, cols: 120, rows: 40 });
    const frame = flat(await s.settle());
    expect(frame).toContain(c.action);
    expect(frame).not.toContain('made in the web Hub');
  }, 180_000);
}

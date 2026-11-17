// The old /market route in a terminal: an old link lands on Plans & billing in the view it named (market/view.tsx
// redirectFor), with the listing or plan it pointed at, and never with a Billing drawer: a checkout (`checkout`, `item`)
// or Add funds (`sheet=funds`) key on an old link is dropped, so no payment step opens from it.
//
// | # | Old address | Lands on |
// |---|---|---|
// | 1 | /market?sel=l01&days=30 | Bare metal view, listing l01 open (its order) |
// | 2 | /market?sel=l01&checkout=rent&item=mkt_sin_m&days=30&sheet=funds | the same, and no checkout or Add funds step |
// | 3 | /market?plan=fam-plus, /market#plans | Plans view |
//
// The "not drawn" checks of row 2 have controls in this file: the same checkout and Add funds keys given to /billing
// directly do draw their payment action (as billing/money-handoff.term.test.tsx's no-gate rows), so their absence
// after the redirect means the keys did not travel.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import billing from '../billing/strings.en.json';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const flat = (frame: string): string => frame.replace(/\s+/g, ' ');
/** Settles until `ok` holds on the frame (the redirect, then the Billing page's own lazy load), at most ~10 s. */
async function until(ok: (frame: string) => boolean): Promise<string> {
  let frame = flat(await s!.settle());
  for (let i = 0; i < 100 && !ok(frame); i++) { await new Promise((r) => setTimeout(r, 100)); frame = flat(await s!.settle()); }
  return frame;
}
const BARE_METAL = `▸ ${billing['view.servers']}`;
const PLANS = `▸ ${billing['view.plans']}`;
/** The open listing's own block (servers/parts/DetailSections.term.tsx): its order and first payment. */
const ORDER = /Your order .*Total first payment/;
/** The payment actions a kept checkout or Add funds key would draw (billing/money-handoff.term.test.tsx CASES). */
const PAY = /Confirm and pay|Continue to payment/;

function clean(): void {
  expect(s!.failures).toEqual([]);
  expect(s!.trapsAt).toEqual([]);
}

test('an old listing link opens that listing in the Bare metal view', async () => {
  s = await renderPage({ page: 'market', path: '/market?sel=l01&days=30', cols: 120, rows: 40 });
  const frame = await until((f) => ORDER.test(f));
  expect(frame).toContain(BARE_METAL);
  expect(frame).toMatch(ORDER);
  expect(frame).toContain('Frankfurt L');
  // The market's own "Opening Plans & billing…" stood only until the move.
  expect(frame).not.toContain(strings.opening);
  clean();
}, 180_000);

test('an old link carrying checkout and Add funds keys opens the listing and no payment step', async () => {
  s = await renderPage({ page: 'market', path: '/market?sel=l01&checkout=rent&item=mkt_sin_m&days=30&sheet=funds', cols: 120, rows: 40 });
  const frame = await until((f) => ORDER.test(f));
  // Positive: the redirect happened and kept what the view reads.
  expect(frame).toContain(BARE_METAL);
  expect(frame).toMatch(ORDER);
  // Negative: neither the rent checkout nor Add funds opened.
  expect(frame.match(PAY)?.[0] ?? null).toBeNull();
  clean();
}, 180_000);

// Controls for the test above: the same keys on /billing itself draw their payment action (no live gate: fixtures).
for (const [what, path, action] of [
  ['rent checkout', '/billing?checkout=rent&item=mkt_sin_m&days=30', 'Confirm and pay'],
  ['Add funds', '/billing?sheet=funds', 'Continue to payment'],
] as const) {
  test(`control: ${what} keys on /billing draw "${action}"`, async () => {
    s = await renderPage({ page: 'billing', path, cols: 120, rows: 40 });
    const frame = await until((f) => f.includes(action));
    expect(frame).toContain(action);
    clean();
  }, 180_000);
}

for (const path of ['/market?plan=fam-plus', '/market#plans'] as const) {
  test(`${path} opens the Plans view`, async () => {
    s = await renderPage({ page: 'market', path, cols: 120, rows: 40 });
    const frame = await until((f) => f.includes(billing.plansLede));
    expect(frame).toContain(PLANS);
    expect(frame).toContain(billing.plansLede);
    expect(frame).not.toContain(BARE_METAL);
    expect(frame.match(PAY)?.[0] ?? null).toBeNull();
    clean();
  }, 180_000);
}

test('80x24: an old listing link lands on Plans & billing with no trap', async () => {
  s = await renderPage({ page: 'market', path: '/market?sel=l01&days=30', cols: 80, rows: 24 });
  const frame = await until((f) => f.includes(billing.title) && !f.includes(strings.opening));
  expect(frame).toContain(billing.title);
  expect(frame).not.toContain(strings.opening);
  clean();
}, 180_000);

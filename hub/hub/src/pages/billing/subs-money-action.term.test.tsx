// Wallet & usage in a terminal, Server subscriptions: a row's money action (Pay now, Upgrade) and the word for a change
// under way are drawn in the row at every width, 80 columns included. The table drops columns to fit, the last one
// first, and the Actions column was the first to go: from 80 to about 150 columns the action stood only in the ⋯ menu
// and the change under way nowhere. The pay action opens the same checkout as before; nothing is sent by the press.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { queryAllByRole, semanticsOf, within, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** The buttons of the Server subscriptions section (Bits.term.tsx Section: region `billing-subscriptions`). */
function buttons(): SemNode[] {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  const tree = semanticsOf({ root: r.root, stdin: r.stdin });
  return queryAllByRole(tree, 'region', { id: 'billing-subscriptions' }).flatMap((g) => queryAllByRole(within(g), 'button'));
}
const named = (name: string): SemNode[] => buttons().filter((n) => n.name === name);
/** Pages down until `mark` is drawn, and returns that frame. */
async function reach(mark: string): Promise<string> {
  let frame = await s!.settle();
  for (let i = 0; i < 12 && !frame.includes(mark); i++) {
    await s!.keys.press('pagedown');
    frame = await s!.settle();
  }
  return frame;
}
const lineWith = (frame: string, word: string): string => frame.split('\n').find((l) => l.includes(word)) ?? '';

// 80x24 is the smallest terminal the Hub runs in; at 100 and 120 the sidebar takes 24 cells, so the page is narrower
// than at 80 and a little wider.
const SIZES = [[80, 24], [100, 40], [120, 40], [160, 50]] as const;

for (const [cols, rows] of SIZES) {
  test(`${cols}x${rows}: Pay now and Upgrade are drawn in their rows, once each`, async () => {
    s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: null, cols, rows });
    // The default fixture (fixtures.ts SUBS): fra-7 is on hold (pay), Singapore M and n12 can be upgraded.
    const frame = await reach('● On hold');
    expect(lineWith(frame, '● On hold')).toContain('[Pay now]');
    expect(named('Pay now').length).toBe(1);
    expect(named('Upgrade').length).toBe(2);
    // Said once: where the action is in the row's actions cell there is no Actions column repeating it.
    expect(frame).not.toContain('Actions');
    expect(buttons().filter((n) => n.name.startsWith('Pay now ·')).length).toBe(0);
    expect(s.failures).toEqual([]);
  }, 180_000);

  test(`${cols}x${rows}: a change under way is said in its row, as a word that takes no press`, async () => {
    // busy-tones: n12 is active with an upgrade running.
    s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: 'busy-tones', cols, rows });
    const frame = await reach('● Active');
    expect(lineWith(frame, '● Active')).toContain('[Changing…]');
    const word = named('Changing…');
    expect(word.length).toBe(1);
    expect(word[0]!.states.disabled).toBe(true);
    expect(word[0]!.description ?? '').toContain('is still finishing');
    expect(s.errors.filter((e) => e.includes('without a reason'))).toEqual([]);
  }, 180_000);
}

test('80x24: pressing Pay now opens the pay checkout of that server', async () => {
  s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: null, cols: 80, rows: 24 });
  const frame = await reach('● On hold');
  const y = frame.split('\n').findIndex((l) => l.includes('● On hold'));
  const x = lineWith(frame, '● On hold').indexOf('[Pay now]');
  expect(x).toBeGreaterThan(0);
  await s.click(x + 2, y);
  const after = await s.settle();
  expect(after).toContain('Pay for a server');
  expect(after).toContain('Medium fra-7');
}, 180_000);

test('suspended at 80x24: Pay now stays in its row, off, and says why', async () => {
  s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: 'banned', cols: 80, rows: 24 });
  await reach('● On hold');
  const pay = named('Pay now');
  expect(pay.length).toBeGreaterThan(0);
  for (const n of pay) {
    expect(n.states.disabled).toBe(true);
    expect((n.description ?? '').length).toBeGreaterThan(0);
  }
  expect(s.errors.filter((e) => e.includes('without a reason'))).toEqual([]);
}, 180_000);

test('80x24: a held server that can be started again shows Try again in its row', async () => {
  s = await renderPage({ page: 'billing', path: '/billing?view=wallet', fx: 'retry', cols: 80, rows: 24 });
  const frame = await reach('[Try again]');
  expect(frame).toContain('[Try again]');
  expect(named('Try again').length).toBe(1);
}, 180_000);

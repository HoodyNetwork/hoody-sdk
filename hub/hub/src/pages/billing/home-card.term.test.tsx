// The Billing card on the terminal Home (this page's widget.tsx, drawn among Home's page cards). It shows money, so what
// it may show is pinned here as on the web (widget.test.tsx):
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | A balance the read did not give is a dash, never $0 | 'an absent balance' |
// | 2 | A balance read that failed says so with Try again; no amount is drawn | 'a failed balance read' |
// | 3 | A server row only opens the Billing page: nothing is sent, no change starts | 'a server row' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { queryClient } from '../../core';
import { installTransport, transport } from '../../core/transport';
import { act, queryAllByRole, queryAllByText, semanticsOf, semText, within, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
let unsubscribe: (() => void) | null = null;
afterEach(() => { unsubscribe?.(); unsubscribe = null; s?.close(); s = null; });

// Wide and tall: four cards a line, and every card above Billing (order 35) on screen with it.
const COLS = 200;
const ROWS = 80;

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
/** Settles until `ok` holds (page cards load after the first frame), at most 20 s; returns the last frame. */
async function until(p: PageSession, ok: (frame: string) => boolean): Promise<string> {
  const end = performance.now() + 20_000;
  let frame = await p.settle();
  while (!ok(frame) && performance.now() < end) {
    await new Promise((r) => setTimeout(r, 250));
    frame = await p.settle();
  }
  return frame;
}
/** The card's server list (another card may name a list "Servers" too): the one holding the fra-7 row (the fixture's
 *  server on hold, which leads). */
const rowIn = (l: SemNode): SemNode | undefined => queryAllByRole(within(l), 'link', { name: /fra-7/ })[0];
const serverList = (p: PageSession): SemNode | undefined =>
  queryAllByRole(tree(p), 'list', { name: strings['widget.servers'] }).find((l) => rowIn(l) !== undefined);
/** The card's balance as drawn: the line above its "Wallet balance" caption, from the caption's column. */
function balanceShown(frame: string): string {
  const lines = frame.split('\n');
  const y = lines.findIndex((l) => l.includes(strings['widget.balance']));
  expect(y).toBeGreaterThan(0);
  const x = lines[y]!.indexOf(strings['widget.balance']);
  const line = lines[y - 1]!;
  const end = line.slice(x).search(/[│┃║]/);
  return line.slice(x, end < 0 ? undefined : x + end).trim();
}

test(`${COLS}x${ROWS} an absent balance: the card shows a dash, never $0`, async () => {
  // Billing's state with no general balance (the read gave none: data.ts keeps it '', usd() draws "—").
  const p = await renderPage({ page: 'home', fx: 'checkout-referral-nogeneral', cols: COLS, rows: ROWS, settleMs: 3000 });
  s = p;
  const frame = await until(p, (f) => f.includes(strings['widget.balance']));
  expect(balanceShown(frame)).toBe('—');
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
}, 240_000);

test(`${COLS}x${ROWS} a failed balance read: the card says so with Try again and draws no amount`, async () => {
  const p = await renderPage({ page: 'home', fx: 'widget-balance-error', cols: COLS, rows: ROWS, settleMs: 3000 });
  s = p;
  const frame = await until(p, (f) => f.includes(strings.balanceErr));
  const alert = queryAllByRole(tree(p), 'alert').find((a) => queryAllByText(within(a), strings.balanceErr).length > 0);
  expect(alert ? 'found' : semText(tree(p))).toBe('found');
  expect(queryAllByRole(within(alert!), 'button', { name: 'Try again' })).toHaveLength(1);
  // No amount: the balance figure is drawn only above its caption, and the caption is not drawn.
  expect(frame).not.toContain(strings['widget.balance']);
  // The servers still show (the other read did not fail).
  expect(serverList(p) ? 'found' : semText(tree(p))).toBe('found');
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
}, 240_000);

test(`${COLS}x${ROWS} a server row: pressing it opens the Billing page and sends nothing`, async () => {
  // Every request the Hub makes, by method (core's api() and raw fetch), from the press on.
  const sent: string[] = [];
  s = await renderPage({
    page: 'home', cols: COLS, rows: ROWS, settleMs: 3000,
    afterBoot: () => {
      const inner = transport();
      installTransport({
        ...inner,
        hoody: (method, url, body, opts, meta) => { sent.push(`${method.toUpperCase()} ${url}`); return inner.hoody(method, url, body, opts, meta); },
        fetch: (url, init, meta) => { sent.push(`${(init.method ?? 'GET').toUpperCase()} ${url}`); return inner.fetch(url, init, meta); },
      });
    },
  });
  const p = s;
  const before = await until(p, (f) => f.includes('$42.50'));
  expect(before).toContain('$42.50');
  const list = serverList(p);
  expect(list ? 'found' : semText(tree(p))).toBe('found');
  const row = rowIn(list!)!;
  // Every change (a fixture source's or core's) is one mutation in the app's query client.
  let changes = 0;
  unsubscribe = queryClient.getMutationCache().subscribe((e) => { if (e.type === 'added') changes++; });
  sent.length = 0;
  act(row, 'press');
  // The page's title is its one level-1 heading (the sidebar names the page too, but not as a heading): Billing's now.
  const titled = (): boolean => queryAllByRole(tree(p), 'heading', { name: strings.title, level: 1 }).length > 0;
  await until(p, titled);
  expect(titled()).toBe(true);
  expect(changes).toBe(0);
  // Opening the page may read; it writes nothing.
  expect(sent.filter((r) => !r.startsWith('GET '))).toEqual([]);
  expect(p.trapsAt).toEqual([]);
  expect(p.failures).toEqual([]);
}, 240_000);

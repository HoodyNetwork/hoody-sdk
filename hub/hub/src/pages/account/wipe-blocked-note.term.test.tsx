// Account > Remove all local data, in the terminal, when a payment made on this device has no final answer yet. The
// confirm is then off from the start, and the page says why in a note after the body and the list of what is removed.
// At 80x24 the body scrolls and the note was below the fold: the action was dim and the first screen did not say why.
// A dialog whose action is off now draws that note first (kit/overlays/Dialog.term.tsx).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | 80x24, payments block the confirm: the reason and what to do are on the first screen, above the body, and the body's first words are still on it (the dialog opens at its top) | 'payments at 80x24' |
// | 2 | 120x40: the same order, with the list of what is removed under the body | 'payments, roomy' |
// | 3 | A refusal after a press ("Nothing was removed") is not such a note: it stays at the end of the body | 'a refusal stays at the end' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, type SemNode } from '../../term/prim/semantics';
import web from './strings.en.json';
import kit from '../../kit/strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const focused = (): string => focusedNode(tree())?.name ?? '';
const row = (text: string): number => s!.frame.split('\n').findIndex((l) => l.includes(text));
const flat = (): string => s!.frame.replace(/[│█▀▄]/g, ' ').replace(/\s+/g, ' ');
const WHY = 'has no final answer';
const DO = 'Check it in Billing first';
const BODY = 'The Hub forgets';

/** Opens the confirm and waits for `text` in it (the payments note is read after the dialog opens). */
async function open(fx: string, text: string, cols = 80, rows = 24): Promise<void> {
  s = await renderPage({ page: 'account', fx, cols, rows, path: '/account?sheet=wipe' });
  await s.settle();
  for (let i = 0; i < 20 && !flat().includes(text); i++) await s.settle();
  expect(flat()).toContain(text);
}

test('payments at 80x24', async () => {
  await open('wipe-payments', DO);
  expect(flat()).toContain(WHY);
  // The note's title says what to do; nothing was tried, so the kit's failed title would contradict the body.
  expect(row(web['w.payTitle'])).toBeGreaterThan(-1);
  expect(row(WHY)).toBeGreaterThan(row(web['w.payTitle']));
  expect(flat()).not.toContain(kit['outcome.failed.title']);
  expect(row(BODY)).toBeGreaterThan(-1);
  expect(row(BODY)).toBeGreaterThan(row(WHY));
  expect(s!.failures).toEqual([]);
}, 240_000);

test('payments, roomy', async () => {
  await open('wipe-payments', DO, 120, 40);
  expect(flat()).toContain(web['w.more']);
  expect(row(BODY)).toBeGreaterThan(row(WHY));
  expect(row(WHY)).toBeGreaterThan(-1);
  expect(s!.failures).toEqual([]);
}, 240_000);

test('a refusal stays at the end', async () => {
  await open('wipe-tabs', web['w.more'], 120, 40);
  for (let i = 0; i < 30 && !/^Remove and /.test(focused()); i++) await s!.keys.press('tab');
  expect(focused()).toMatch(/^Remove and /);
  await s!.keys.press('enter');
  await s!.releaseHeld();
  await s!.settle();
  expect(row(web['w.notRemoved'])).toBeGreaterThan(row(BODY));
  expect(row(BODY)).toBeGreaterThan(-1);
}, 240_000);

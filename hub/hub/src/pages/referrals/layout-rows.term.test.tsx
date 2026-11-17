// The links card in a terminal: one blank row parts Main code from Your own codes, one blank row parts the codes already
// made from the form that makes a new one, and a create refused for the code itself says why under the field (the page
// note above the card is rows away from it).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** The text inside the card on each frame line (between the card's borders), trimmed; null for a line outside it. */
const cardLines = (frame: string): (string | null)[] =>
  frame.split('\n').map((l) => {
    const parts = l.split('│');
    return parts.length >= 4 ? parts[2]!.trim() : null;
  });
const indexOf = (lines: (string | null)[], start: string): number => lines.findIndex((l) => l !== null && l.startsWith(start));

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };

test('120x40: one blank row before Your own codes, and one before the New code field', async () => {
  s = await renderPage({ page: 'referrals', fx: null, cols: 120, rows: 40 });
  const lines = cardLines(await s.settle());
  const main = indexOf(lines, 'k7m2q9xa');
  const own = indexOf(lines, strings['link.custom']);
  expect(main).toBeGreaterThan(0);
  expect(own - main).toBe(2);
  expect(lines[main + 1]).toBe('');
  const field = indexOf(lines, strings['create.label']);
  expect(field).toBeGreaterThan(own);
  expect(lines[field - 1]).toBe('');
  expect(lines[field - 2]).not.toBe('');
}, 180_000);

test('120x40: a create refused as taken says so under the field', async () => {
  s = await renderPage({ page: 'referrals', fx: 'createTaken', cols: 120, rows: 40 });
  await s.settle();
  const box = queryAllByRole(tree(), 'textbox', { name: strings['create.label'] })[0];
  expect(box).toBeDefined();
  act(box!, 'type', 'fresh-one');
  await s.settle();
  for (let i = 0; i < 5; i++) await s.settle();
  const go = queryAllByRole(tree(), 'button', { name: strings['create.action'] })[0];
  expect(go).toBeDefined();
  act(go!, 'press');
  let frame = await s.settle();
  for (let i = 0; i < 5 && !frame.includes(strings['check.taken']); i++) frame = await s.settle();
  const lines = cardLines(frame);
  const field = indexOf(lines, strings['create.label']);
  const button = lines.findIndex((l, i) => i > field && l !== null && l.startsWith(`[${strings['create.action']}]`));
  expect(field).toBeGreaterThan(0);
  expect(button).toBeGreaterThan(field);
  const between = lines.slice(field, button).join(' ');
  expect(between).toContain(strings['check.taken']);
}, 180_000);

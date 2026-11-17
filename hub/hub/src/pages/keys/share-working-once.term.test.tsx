// Keys, the Share drawer in the terminal: "Reading this realm's computers…" while the realm's computers are read, and
// "Creating…" while the share is being made, each said once. Both lines put a labelled Spinner before the same words; the
// web's Spinner keeps its label for assistive tech only, the terminal's draws it (kit/states/Spinner.term.tsx), so the
// terminal said each line twice. The spinner is only the mark and the words are the status: once on the line, and as the
// status's name. 120 columns: the drawer holds each line whole (at 80 it can wrap, and a wrapped twin is on no one line).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { REALM_A, shareComputersFixture, slowGate } from './fixtures';
import { links } from './links';
import strings from './strings.en.json';

let s: PageSession | null = null;
let release: (() => void) | null = null;
afterEach(() => {
  release?.();
  release = null;
  s?.close();
  s = null;
  shareComputersFixture.reset();
  slowGate.reset();
});

const tree = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
async function until(ok: () => boolean, ms = 20_000): Promise<string> {
  const end = performance.now() + ms;
  while (!ok() && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}
const times = (line: string, word: string) => line.split(word).length - 1;
const literal = (w: string) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const enabled = (name: string) => queryAllByRole(tree(), 'button', { name, disabled: false });

function saidOnce(f: string, word: string) {
  const lines = f.split('\n').filter((l) => l.includes(word));
  expect(lines.length, f).toBeGreaterThan(0);
  expect(lines.map((l) => times(l, word)), f).toEqual(lines.map(() => 1));
  expect(queryAllByRole(tree(), 'status', { name: literal(word) }).length, f).toBeGreaterThan(0);
  expect(s!.trapsAt).toEqual([]);
  expect(s!.failures).toEqual([]);
  expect(f).not.toContain('could not be drawn');
}

test('120x40: the realm\'s computers being read are said once', async () => {
  // The read answers only when the test ends: the drawer stays on its reading line.
  shareComputersFixture.answer = () => new Promise((go) => { release = () => go({ status: 200, body: { data: { computers: [] } } }); });
  s = await renderPage({ page: 'keys', fx: 'shared', path: links.shareRealm(REALM_A), cols: 120, rows: 40, settleMs: 2000 });
  const word = strings['share.compReading'];
  saidOnce(await until(() => s!.frame.includes(word)), word);
}, 180_000);

test('120x80: the share being made is said once', async () => {
  // 80 rows: the Review step's sending line sits under its checks, inside the drawer without scrolling.
  s = await renderPage({ page: 'keys', fx: 'slowSharePending', path: links.shareRealm(REALM_A), cols: 120, rows: 80, settleMs: 2000 });
  await until(() => enabled(strings['share.review']).length > 0);
  const review = enabled(strings['share.review']).at(-1);
  expect(review, s.frame).toBeDefined();
  act(review!, 'press');
  await s.settle();
  await until(() => enabled(strings['share.create']).length > 0);
  const create = enabled(strings['share.create']).at(-1);
  expect(create, s.frame).toBeDefined();
  // The share's answer waits for the test (fixtures.ts slowGate): the drawer stays on its sending line.
  slowGate.hold();
  act(create!, 'press');
  await s.settle();
  const word = strings['share.creating'];
  // The Create button reads "Creating…" too, on its own line in the footer: each line says it once.
  saidOnce(await until(() => slowGate.arrived > 0 && s!.frame.includes(word)), word);
}, 180_000);

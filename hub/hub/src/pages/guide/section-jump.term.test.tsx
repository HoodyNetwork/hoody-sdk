// The Guide's section jumps in a terminal (parts/useScrollSpy.term.ts).
//
// | # | Web | Terminal without the guard |
// |---|---|---|
// | 1 | A #hash link (the account menu's "Ways to connect", the palette's "Show keyboard shortcuts") scrolls to its section | The section was marked current in the index; the reader stayed at the top, on "Ask your agent" |
// | 2 | An index pick scrolls to the section | Same: only the mark moved |
// | 3 | J / K scroll to the next / previous section | Same |
//
// The jump now brings the section's card (anchor `guide-<id>`) into view through kit focusSection. The first test is the
// control: the page opens at its top, so the texts the others look for are below the frame until a jump brings them up.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** The Guide index's entries (strings.en.json ix.*). */
const INDEX = new Set(['Ask your agent', 'Connect', 'Skills', 'Build your own', 'Every link', 'Bots', 'Tools', 'Try this', 'Realms', 'Topics', 'Keyboard', 'Look']);
/** The index entries marked current (SectionMenuItem: a link with aria-current); the sidebar's current page is not one. */
const current = (p: PageSession): string[] => flat(tree(p)).filter((n) => n.role === 'link' && INDEX.has(n.name) && n.states.current !== undefined).map((n) => n.name);
async function pick(p: PageSession, name: string): Promise<string> {
  const entry = flat(tree(p)).find((n) => n.role === 'link' && n.name === name);
  expect(entry, `index entry ${name}\n${p.frame}`).toBeDefined();
  act(getByRef(tree(p), entry!.ref), 'press');
  return p.settle();
}

/** The Ask section's lede: on screen only while the page is at its top. */
const TOP = 'Every computer comes with its own agent';
/** A row of the Keyboard section's table (near the end of the page). */
const KEY_ROW = 'Search or jump to anything';
const BUILD = "See the Hub's own calls";
const REALMS = 'One realm per client, project or experiment';

test('control: the Guide opens at its top, the later sections below the frame', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  const frame = await s.settle();
  expect(frame).toContain(TOP);
  for (const below of [KEY_ROW, BUILD, REALMS]) expect(frame).not.toContain(below);
  expect(current(s)).toEqual(['Ask your agent']);
  expect(s.failures).toEqual([]);
}, 180_000);

test('#keys: the Keyboard section is current and on screen', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40, path: '/guide#keys' });
  const frame = await s.settle();
  expect(current(s)).toEqual(['Keyboard']);
  expect(frame).toContain(KEY_ROW);
  expect(frame).not.toContain(TOP);
  expect(s.failures).toEqual([]);
}, 180_000);

test('an index pick brings its section into view', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  const frame = await pick(s, 'Realms');
  expect(current(s)).toEqual(['Realms']);
  expect(frame).toContain(REALMS);
  expect(frame).not.toContain(TOP);
  expect(s.trapsAt).toEqual([]);
}, 180_000);

test('J walks to the next section and brings it up; K goes back', async () => {
  s = await renderPage({ page: 'guide', cols: 120, rows: 40 });
  await s.settle();
  for (let i = 0; i < 3; i++) { await s.keys.press('j'); await s.settle(); }
  expect(current(s)).toEqual(['Build your own']);
  expect(s.frame).toContain(BUILD);
  expect(s.frame).not.toContain(TOP);
  await s.keys.press('k');
  await s.settle();
  expect(current(s)).toEqual(['Skills']);
  expect(s.frame).toContain('Install the skill');
  expect(s.frame).not.toContain(TOP);
}, 180_000);

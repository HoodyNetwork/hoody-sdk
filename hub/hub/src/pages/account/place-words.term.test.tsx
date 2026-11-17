// Account in a terminal names the place it keeps things as the rest of the terminal Hub does (term/app/termWords.json),
// never as "this browser": the section's menu entry and its title, its lead, the Performance mode help, and Remove all
// local data. A terminal keeps each account's records apart and checks for no other Hub, so the wipe's words say that
// instead of naming every account or other tabs. The web keeps its own words.
//
// Both texts are read from the files on disk: the terminal app writes its wording into the imported string tables, so
// an imported table would hold the terminal text by the time the page has drawn. Words are read from the semantics
// tree (a text run is one node, whole), never from the wrapped frame.
import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf, type SemNode } from '../../term/prim/semantics';

const SRC = path.resolve(import.meta.dir, '../..');
const read = (name: string) => JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>;
const words = JSON.parse(readFileSync(path.join(SRC, 'term/app/termWords.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
const web = read('pages/account/strings.en.json');
const term = words['pages/account/strings.en.json'] ?? {};
const webPerf = read('kit/perf.strings.en.json');
const termPerf = words['kit/perf.strings.en.json'] ?? {};
const kit = read('kit/strings.en.json');

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const flat = (ns: SemNode[]): SemNode[] => ns.flatMap((n) => [n, ...flat(n.children)]);
const all = (p: PageSession): SemNode[] => flat(tree(p));
/** The nodes of this role named exactly these words. */
const roleNamed = (ns: SemNode[], role: string, words: string): SemNode[] => ns.filter((n) => n.role === role && n.name === words);
/** Whether the screen says these words (a node's name or description). */
const says = (p: PageSession, words: string): boolean => all(p).some((n) => n.name.includes(words) || (n.description ?? '').includes(words));

test('the section menu entry and the section title use the terminal word, its lead and rows too', async () => {
  // The terminal has its own words for these keys (on live it has none, and the web words are drawn).
  for (const k of ['w.section', 'w.sectionLead', 'w.help']) expect({ k, has: typeof term[k] }).toEqual({ k, has: 'string' });
  expect(typeof termPerf['perf.help']).toBe('string');
  s = await renderPage({ page: 'account', cols: 120, rows: 40, path: '/account?section=browser' });
  await s.settle();
  const nodes = all(s);
  // Controls: the section menu and the section's two rows are drawn.
  const menus = roleNamed(nodes, 'navigation', kit['settings.sections']!);
  expect(menus.length, s.frame).toBeGreaterThan(0);
  expect(says(s, web['w.title']!), s.frame).toBe(true);
  expect(says(s, webPerf['perf.label']!), s.frame).toBe(true);
  // The menu entry: a button of the section menu.
  const entries = flat(menus.flatMap((m) => m.children));
  expect(roleNamed(entries, 'button', term['w.section']!).length, s.frame).toBeGreaterThan(0);
  expect(roleNamed(entries, 'button', web['w.section']!)).toEqual([]);
  // The section itself: its region and, inside it, its heading.
  const regions = roleNamed(nodes, 'region', term['w.section']!);
  expect(regions.length, s.frame).toBeGreaterThan(0);
  expect(regions.every((r) => roleNamed(flat(r.children), 'heading', term['w.section']!).length > 0), s.frame).toBe(true);
  expect(roleNamed(nodes, 'region', web['w.section']!)).toEqual([]);
  expect(roleNamed(nodes, 'heading', web['w.section']!)).toEqual([]);
  expect(nodes.filter((n) => n.name === web['w.section'])).toEqual([]);
  // The lead, the Remove row's help and the Performance mode help.
  expect(says(s, term['w.sectionLead']!), s.frame).toBe(true);
  expect(says(s, web['w.sectionLead']!)).toBe(false);
  expect(says(s, term['w.help']!), s.frame).toBe(true);
  expect(says(s, web['w.help']!)).toBe(false);
  expect(says(s, termPerf['perf.help']!), s.frame).toBe(true);
  expect(says(s, webPerf['perf.help']!)).toBe(false);
  expect(s.failures).toEqual([]);
}, 180_000);

test('Remove all local data asks in the terminal words', async () => {
  for (const k of ['w.confirmTitle', 'w.bodyShort', 'w.oneTab', 'w.otherAccounts']) expect({ k, has: typeof term[k] }).toEqual({ k, has: 'string' });
  s = await renderPage({ page: 'account', cols: 120, rows: 40, path: '/account?sheet=wipe' });
  await s.settle();
  // Control: the confirm's own button is drawn, by the terminal's name for it (the removal leaves the Hub there; it
  // does not sign out), never by the web's.
  expect(term['w.confirm']).toBe('Remove and leave the Hub');
  expect(says(s, term['w.confirm']!), s.frame).toBe(true);
  expect(says(s, web['w.confirm']!)).toBe(false);
  expect(says(s, term['w.confirmTitle']!), s.frame).toBe(true);
  expect(says(s, web['w.confirmTitle']!)).toBe(false);
  expect(says(s, term['w.bodyShort']!), s.frame).toBe(true);
  expect(says(s, web['w.bodyShort']!)).toBe(false);
  // What to know before confirming: no other tabs to close, and other accounts' records stay.
  expect(says(s, term['w.oneTab']!), s.frame).toBe(true);
  expect(says(s, web['w.oneTab']!)).toBe(false);
  expect(says(s, term['w.otherAccounts']!), s.frame).toBe(true);
  expect(says(s, web['w.otherAccounts']!)).toBe(false);
  expect(s.failures).toEqual([]);
}, 180_000);

test('a wipe that could not start says so in the terminal words, not as other tabs', async () => {
  for (const k of ['w.tabs', 'w.tabsLead']) expect({ k, has: typeof term[k] }).toEqual({ k, has: 'string' });
  s = await renderPage({ page: 'account', fx: 'wipe-tabs', cols: 120, rows: 40, path: '/account?sheet=wipe' });
  await s.settle();
  const focused = (): string | undefined => focusedNode(tree(s!))?.name;
  // Control: before the press no refusal is drawn.
  expect(says(s, web['w.notRemoved']!), s.frame).toBe(false);
  for (let i = 0; i < 10 && focused() !== term['w.confirm']; i++) await s.keys.press('tab');
  expect(focused(), s.frame).toBe(term['w.confirm']);
  await s.keys.press('enter');
  await s.releaseHeld();
  // The fixture refuses with TABS: the refusal is drawn, in the terminal words.
  expect(says(s, web['w.notRemoved']!), s.frame).toBe(true);
  expect(says(s, term['w.tabs']!), s.frame).toBe(true);
  expect(says(s, term['w.tabsLead']!), s.frame).toBe(true);
  expect(says(s, web['w.tabs']!)).toBe(false);
  expect(says(s, web['w.tabsLead']!)).toBe(false);
  expect(s.failures).toEqual([]);
}, 240_000);

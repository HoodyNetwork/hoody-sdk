// The Guide's Look and Build sections in a terminal say what a terminal has (the terminal's own wording,
// term/app/termWords.json). Look: light or dark follows the terminal's background as read once at start, else dark
// (term/app/run.ts; its account menu has no Appearance rows, term/shell/Menus.tsx). Build, "See the Hub's own calls": the developer-tools steps are a browser's, so
// the section says they are the web Hub's.
//
// | # | Web | Terminal without the guard |
// |---|---|---|
// | 1 | "Light or dark is in the account menu, under Appearance. It is saved in this browser only." | The same words: no such menu row, no browser |
// | 2 | Open the browser's developer tools, then the Network tab | The same steps, with nothing saying they are the web Hub's |
//
// Both texts are read from the files on disk: the terminal app writes its wording into the imported string tables, so
// an imported table would hold the terminal text by the time the page has drawn. Words are read from the semantics
// tree (a text run is one node, whole), never from the wrapped frame.
import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { semanticsOf, type SemNode } from '../../term/prim/semantics';

const SRC = path.resolve(import.meta.dir, '../..');
const web = JSON.parse(readFileSync(path.join(SRC, 'pages/guide/strings.en.json'), 'utf8')) as Record<string, string>;
const term = (JSON.parse(readFileSync(path.join(SRC, 'term/app/termWords.json'), 'utf8')) as Record<string, Record<string, string> | undefined>)['pages/guide/strings.en.json'] ?? {};

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** Whether the screen says these words (a node's name or description). */
const says = (p: PageSession, words: string): boolean => flat(tree(p)).some((n) => n.name.includes(words) || (n.description ?? '').includes(words));

test('Look: light or dark follows the terminal; no account-menu Appearance, no browser', async () => {
  // The terminal has its own words for this key (on live it has none, and the web words are drawn).
  expect(typeof term['look.body']).toBe('string');
  s = await renderPage({ page: 'guide', cols: 120, rows: 40, path: '/guide#look' });
  await s.settle();
  // Control: the section is drawn.
  expect(says(s, web['look.title']!), s.frame).toBe(true);
  expect(says(s, term['look.body']!), s.frame).toBe(true);
  expect(says(s, web['look.body']!)).toBe(false);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

test('Build: the developer-tools steps say they are the web Hub\'s', async () => {
  expect(typeof term['build.find']).toBe('string');
  s = await renderPage({ page: 'guide', cols: 120, rows: 40, path: '/guide#build' });
  await s.settle();
  // Control: the subsection and its first step are drawn.
  expect(says(s, web['build.see']!), s.frame).toBe(true);
  expect(says(s, web['build.step1']!), s.frame).toBe(true);
  expect(says(s, term['build.find']!), s.frame).toBe(true);
  expect(says(s, web['build.find']!)).toBe(false);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

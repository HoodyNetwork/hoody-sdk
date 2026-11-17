// Account in a terminal: the agent sign-in row names this device, never "this browser" (term/app/termWords.json). The
// days it saves are kept in this account's store on disk and the terminal's mint asks for them
// (term/app/boot-days.term.test.ts); the web keeps its own words.
//
// Both texts are read from the files on disk: the terminal app writes its wording into the imported string tables, so
// an imported table would hold the terminal text by the time the page has drawn.
import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { semanticsOf, type SemNode } from '../../term/prim/semantics';

const SRC = path.resolve(import.meta.dir, '../..');
const web = JSON.parse(readFileSync(path.join(SRC, 'pages/account/strings.en.json'), 'utf8')) as Record<string, string>;
const term = (JSON.parse(readFileSync(path.join(SRC, 'term/app/termWords.json'), 'utf8')) as Record<string, Record<string, string> | undefined>)['pages/account/strings.en.json'] ?? {};

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const all = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  const flat = (ns: SemNode[]): SemNode[] => ns.flatMap((n) => [n, ...flat(n.children)]);
  return flat(semanticsOf({ root: r.root, stdin: r.stdin }));
};
/** Whether the screen says these words (a node's name or description). */
const says = (p: PageSession, words: string): boolean => all(p).some((n) => n.name.includes(words) || (n.description ?? '').includes(words));

test('the agent sign-in row says how long an agent stays signed in from this device', async () => {
  // The terminal has its own words for these keys (on live it has none, and the web words are drawn).
  for (const k of ['ag.rowHelp', 'ag.notSaved', 'faq.agentDays.a']) expect({ k, has: typeof term[k] }).toEqual({ k, has: 'string' });
  s = await renderPage({ page: 'account', cols: 120, rows: 40, path: '/account?section=agent-sign-in' });
  await s.settle();
  // Controls: the section and its row are drawn, with the field's own help (the same words on the web and here).
  expect(says(s, web['ag.title']!), s.frame).toBe(true);
  expect(says(s, web['ag.row']!), s.frame).toBe(true);
  expect(says(s, web['ag.help']!), s.frame).toBe(true);
  expect(says(s, term['ag.rowHelp']!), s.frame).toBe(true);
  expect(says(s, web['ag.rowHelp']!)).toBe(false);
  expect(s.failures).toEqual([]);
}, 240_000);

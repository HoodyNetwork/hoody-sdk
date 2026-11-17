// Support in a terminal: a reply the Hub could not keep a record of is refused before anything is sent, and the
// refusal says "this device" (the terminal's own wording, term/app/termWords.json), never "this browser".
//
// The record store is made to refuse its write (core/change-store.ts setChangeStoreAdapter, the seam the core tests
// use), so the send's hold is not durable (core/attempts.ts NOT_DURABLE) and the page answers 'notSent'.
// Both texts are read from the files on disk: the terminal app writes its wording into the imported string tables, so
// an imported table would hold the terminal text by the time the page has drawn.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { setChangeStoreAdapter } from '../../core/change-store';
import { act, queryAllByRole, semanticsOf, type Role, type SemNode } from '../../term/prim/semantics';
import { requestLog } from './fixtures';

const SRC = path.resolve(import.meta.dir, '../..');
const read = (name: string) => JSON.parse(readFileSync(path.join(SRC, name), 'utf8')) as Record<string, string>;
const web = read('pages/support/strings.en.json');
const kit = read('kit/strings.en.json');
const term = (JSON.parse(readFileSync(path.join(SRC, 'term/app/termWords.json'), 'utf8')) as Record<string, Record<string, string> | undefined>)['pages/support/strings.en.json'] ?? {};

/** T_OPEN of the fixtures: "Invoice shows the wrong country", billing, waiting for support. */
const OPEN = '0000000000000000' + (0x6720a1b2 + 2).toString(16);

let s: PageSession | null = null;
beforeEach(() => { requestLog.length = 0; });
afterEach(() => { setChangeStoreAdapter(null); s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
/** Whether the screen draws these words (a text or a control's name or description; a field's value is not counted). */
const says = (text: string): boolean => flat(tree()).some((n) => n.role !== 'textbox' && (n.name.includes(text) || (n.description ?? '').includes(text)));
async function one(role: Role, name: string): Promise<SemNode> {
  let n = queryAllByRole(tree(), role, { name })[0];
  for (let i = 0; i < 5 && !n; i++) { await s!.settle(); n = queryAllByRole(tree(), role, { name })[0]; }
  expect(n, `${role} ${name}`).toBeDefined();
  return n!;
}

test('a reply the Hub could not keep a record of: nothing is sent, and the refusal names this device', async () => {
  // The terminal has its own words for this key (on live it has none, and the web words are drawn).
  expect(typeof term['send.notSent']).toBe('string');
  s = await renderPage({ page: 'support', cols: 120, rows: 40, path: `/support?sel=${OPEN}`, afterBoot: () => setChangeStoreAdapter({ read: () => null, write: () => false }) });
  await s.settle();
  const words = 'Here is the invoice number you asked for.';
  // An engine field takes keys only once it draws focused: focus, let it draw, then type.
  act(await one('textbox', web['reply.label']!), 'focus');
  await s.settle();
  await s.keys.type(words);
  // Control: the words are in the box, and no refusal is drawn yet.
  expect((await one('textbox', web['reply.label']!)).value).toBe(words);
  expect(says(kit['outcome.failed.title']!), s.frame).toBe(false);
  act(await one('button', web['action.send']!), 'press');
  for (let i = 0; i < 5 && !says(kit['outcome.failed.title']!); i++) await s.settle();
  // Refused before anything left: no reply request, and the refusal is drawn in the terminal words.
  expect(requestLog.filter((r) => r.route === 'reply')).toEqual([]);
  expect(says(kit['outcome.failed.title']!), s.frame).toBe(true);
  expect(says(term['send.notSent']!), s.frame).toBe(true);
  expect(says(web['send.notSent']!)).toBe(false);
  // The text stays in the box to send again.
  expect((await one('textbox', web['reply.label']!)).value).toBe(words);
  expect(s.failures).toEqual([]);
  expect(s.trapsAt).toEqual([]);
}, 240_000);

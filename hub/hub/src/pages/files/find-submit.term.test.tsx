// Files, Find: an Enter that arrives with the text searches for that text.
//
// | # | Flow | Pins |
// |---|---|---|
// | 1 | /home → Find, then "site" and Enter in one input chunk (a paste ending in a newline) | the match lists: the search ran on the text the field sent, not the empty text it last drew |
//
// The chunk goes in raw, as a terminal sends a paste when bracketed paste is off: the input parser turns it into five
// keys in one go, so no render runs between the last letter and Enter. A bracketed paste never submits (the field drops
// its newlines), so it is not this case.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tree = (p: PageSession): SemNode[] => { const r = p.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(p: PageSession, ok: () => boolean, tries = 40): Promise<string> {
  let frame = await p.settle();
  for (let i = 0; i < tries && !ok(); i++) { await pause(250); frame = await p.settle(); }
  return frame;
}
const rowNamed = (p: PageSession, name: string): SemNode | undefined => queryAllByRole(tree(p), 'row').find((r) => r.name.split(/\s+/).includes(name));
/** Bytes into the renderer's input as one chunk, the way a terminal delivers a paste. */
const chunk = (p: PageSession, text: string): void => {
  (p.renderer as unknown as { stdin: { emit(e: 'data', b: Buffer): boolean } }).stdin.emit('data', Buffer.from(text));
};

test('Find: "site" and Enter in one chunk searches for "site"', async () => {
  s = await renderPage({ page: 'files', cols: 120, rows: 40, path: '/files?a=atlas.00a1&ap=%2Fhome' });
  const p = s;
  await until(p, () => rowNamed(p, 'ada') !== undefined);
  const find = queryAllByRole(tree(p), 'button', { name: strings['action.find'] })[0];
  expect(find).toBeDefined();
  act(find!, 'press');
  const box = () => queryAllByRole(tree(p), 'searchbox', { name: strings['find.field'] })[0];
  await until(p, () => box() !== undefined);
  act(box()!, 'focus');
  await p.settle();
  expect(box()?.value ?? '').toBe('');
  chunk(p, 'site\r');
  // find.openOne "Open {{name}}": the one folder below /home whose name holds "site" (projects/site).
  const [before] = strings['find.openOne'].split('{{name}}');
  const open = () => queryAllByRole(tree(p), 'button', { name: new RegExp(`^${esc(before!)}.*site$`) });
  await until(p, () => open().length > 0);
  expect(box()?.value).toBe('site');
  expect(open().length).toBe(1);
  expect(p.failures).toEqual([]);
}, 240_000);

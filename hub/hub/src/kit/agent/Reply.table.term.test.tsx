// Reply.term's tables draw each cell from its inline nodes, as the web's table does (Reply.tsx: <td><Inlines/></td>) and as a
// terminal paragraph does: a link keeps its checked address (OSC 8) and its host, an address the reader will not link keeps
// its warning, a computer's address reads as its mark, and words holding an id are never drawn. Before, every cell was
// flattened to plain text: the link went, the warning went, and a bare computer address was drawn with its ids.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { setProxyDomain } from '../../core/hosts';
import { LinkHost, type HostComputer, type LinkHostValue } from './linkHost';
import { Prose } from './Reply';
import { queryAllByRole, semanticsOf } from '../../term/prim/semantics';

const PROXY = 'computers.hoody.test';
const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const atlas: HostComputer = { id: C, project: P, name: 'atlas' };
const host: LinkHostValue = { realm: 'global', lives: atlas, runs: atlas, computers: { rows: [{ id: C, project_id: P, name: 'atlas', status: 'running', server_name: 'sg1' }], complete: true, failed: false }, openHub: () => undefined };
const on = (name: string, n: number | string) => `https://${P}-${C}-${name}-${n}.sg1.${PROXY}`;

let t: TestTerm | null = null;
beforeEach(() => setProxyDomain(PROXY));
afterEach(() => { t?.renderer.destroy(); t = null; setProxyDomain(null); });

/** Every OSC 8 link the renderer holds (as Reply.links.term.test.tsx reads them). */
function linksOf(node: unknown, out: string[] = []): string[] {
  const spans = (x: unknown): void => {
    const s = x as { _link?: { url?: unknown }; _children?: unknown[] } | null;
    if (!s || typeof s !== 'object') return;
    if (typeof s._link?.url === 'string') out.push(s._link.url);
    for (const c of s._children ?? []) spans(c);
  };
  const n = node as { rootTextNode?: unknown; getChildren?: () => unknown[] };
  try { spans(n.rootTextNode); } catch { /* not a text */ }
  for (const k of n.getChildren?.() ?? []) linksOf(k, out);
  return out;
}

const table = (rows: string[][]): string => ['| What | Where |', '| --- | --- |', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const draw = async (text: string, value: LinkHostValue | null, width = 120): Promise<string> => {
  t = await drawTest(<FocusRoot><LinkHost value={value}><Box dir="column" width={width}><Prose text={text} marks /></Box></LinkHost></FocusRoot>, { width, height: 16 });
  return t.settle();
};

test('a link in a cell keeps its checked address', async () => {
  const f = await draw(table([['guide', '[the docs](https://example.com/docs)']]), null);
  expect(f).toContain('the docs');
  expect(linksOf(t!.renderer.root)).toContain('https://example.com/docs');
}, 60_000);

test('an address the reader will not link keeps its warning in a cell', async () => {
  const f = await draw(table([['danger', `${on('terminal', 3)}/?cmd=rm`]]), null, 180);
  expect(f.replace(/\s+/g, ' ')).toContain('(Not linked: opening this address could run something.)');
  expect(f).not.toContain(C);
}, 60_000);

test('a computer address in a cell reads as its mark, never with its ids', async () => {
  const f = await draw(table([['shop', on('http', 3000)]]), host);
  expect(f).toContain('atlas · port 3000');
  expect(f).not.toContain(C);
}, 60_000);

test('columns stay aligned: the header bold, the rule, the cells padded', async () => {
  const f = await draw(['| Name | Port | State |', '| --- | --- | --- |', '| web | 3000 | running |', '| db | 5432 | stopped |'].join('\n'), null, 60);
  expect(f).toMatch(/Name\s+│ Port │ State/);
  expect(f).toContain('web  │ 3000 │ running');
  expect(f).toContain('db   │ 5432 │ stopped');
  expect(f).toContain('─────┼─');
}, 60_000);

test('a computer address in a header cell never puts its ids into the table\'s name', async () => {
  const text = [`| ${on('http', 3000)} | Where |`, '| --- | --- |', '| shop | here |'].join('\n');
  await draw(text, host);
  const names = queryAllByRole(semanticsOf(t!.renderer), 'table').map((n) => n.name ?? '');
  expect(names.length).toBe(1);
  expect(names[0]).toContain('Where');
  expect(names[0]).not.toContain(C);
}, 60_000);

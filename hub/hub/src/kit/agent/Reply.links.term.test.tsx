// Reply.term's terminal hyperlinks (OSC 8): every link a reply draws carries the WHOLE address the reader checked (md.ts
// parseMd / readLink), on every cell of it, also when the words wrap over lines; never a cut copy, never an address the
// reader refused (an unchecked scheme stays text). Marks (a computer's program or port, "another computer") link to the
// mark's own checked address; a mark that opens nothing in a tab (an https port: Copy only) carries no link.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { setProxyDomain } from '../../core/hosts';
import { LinkHost, type HostComputer, type LinkHostValue } from './linkHost';
import { Prose } from './Reply';

const PROXY = 'computers.hoody.test';
const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const OTHER = 'c'.repeat(24);
const on = (name: string, n: number | string, c = C) => `https://${P}-${c}-${name}-${n}.sg1.${PROXY}`;
const atlas: HostComputer = { id: C, project: P, name: 'atlas' };
const host: LinkHostValue = { realm: 'global', lives: atlas, runs: atlas, computers: { rows: [{ id: C, project_id: P, name: 'atlas', status: 'running' }], complete: true, failed: false }, openHub: () => undefined };

beforeEach(() => setProxyDomain(PROXY));
afterEach(() => setProxyDomain(null));

/** Every OSC 8 link the renderer holds, one entry per span (as Handoff.leak.term.test.tsx reads them): OpenTUI keeps a
 *  text's link on the span nodes under its root text node (`_link`, set from Text href). */
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

async function links(text: string, width = 40): Promise<string[]> {
  const t = await drawTest(<FocusRoot><LinkHost value={host}><Box width={width}><Prose text={text} marks /></Box></LinkHost></FocusRoot>, { width, height: 40 });
  await t.settle();
  const out = linksOf(t.renderer.root);
  t.renderer.destroy();
  return out;
}

const LONG = 'https://example.org/a/very/long/path/that/keeps/going/and/going?x=1&y=two#part';

test('a labelled link and a bare address that wraps link the whole checked address on every cell', async () => {
  const got = await links(`See [the docs](https://example.com/docs?q=1#top) and ${LONG} now.`);
  expect(new Set(got)).toEqual(new Set(['https://example.com/docs?q=1#top', LONG]));
  // The bare address wraps over several lines at 40 columns: more than one span, each with the whole address.
  expect(got.filter((u) => u === LONG).length).toBeGreaterThan(1);
}, 60_000);

test('marks link the mark\'s own whole address (own program, port page, another computer); an https port links nothing', async () => {
  const term = on('terminal', 3);
  const port = `${on('http', 3000)}/orders/list?page=2`;
  const other = on('terminal', 1, OTHER);
  const https = on('https', 8443);
  const got = await links(`Open ${term} or [the shop](${port}), also ${other}, and ${https}.`, 120);
  // The checked form of an origin ends in '/' (readLink's URL); the sentence's own punctuation is not part of it.
  expect(new Set(got)).toEqual(new Set([`${term}/`, port, `${other}/`]));
}, 60_000);

test('an address the reader refuses is never a link, whatever its words say', async () => {
  // Unchecked schemes, and an https address the reader draws as text (an acting one: it would run a command): labelled
  // with its own address, with another web address, and bare.
  const acting = `${on('terminal', 3)}/?cmd=rm`;
  const got = await links(`[javascript:alert(1)](javascript:alert(1)) [ftp://x.test/f](ftp://x.test/f) [data](data:text/html,hi) [${acting}](${acting}) [https://words.test/](${acting}) ${acting} [ok](https://ok.test/)`, 120);
  expect(got).toEqual(['https://ok.test/']);
  for (const u of got) expect(u).toMatch(/^https?:\/\//);
}, 60_000);

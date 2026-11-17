// Reply.term never draws a computer's host whole: the "(host)" after a link's words (the terminal's, when hyperlinks are
// not known to show, and the parser's, after words naming another host) holds the project's and the computer's ids, so
// they are masked as every shown address is (maskAddress). Before, both drew the host as written.
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { setProxyDomain } from '../../core/hosts';
import { LinkHost, type HostComputer, type LinkHostValue } from './linkHost';
import { Prose } from './Reply';

const PROXY = 'computers.hoody.test';
const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const URL_ON = `https://${P}-${C}-http-3000.sg1.${PROXY}/`;
const MASKED = 'aaaa…aaaa-bbbb…bbbb-http-3000';
const atlas: HostComputer = { id: C, project: P, name: 'atlas' };
const host: LinkHostValue = { realm: 'global', lives: atlas, runs: atlas, computers: { rows: [{ id: C, project_id: P, name: 'atlas', status: 'running', server_name: 'sg1' }], complete: true, failed: false }, openHub: () => undefined };

let t: TestTerm | null = null;
beforeEach(() => setProxyDomain(PROXY));
afterEach(() => { t?.renderer.destroy(); t = null; setProxyDomain(null); });

const draw = async (text: string, value: LinkHostValue | null): Promise<string> => {
  t = await drawTest(<FocusRoot><LinkHost value={value}><Box dir="column" width={140}><Prose text={text} marks /></Box></LinkHost></FocusRoot>, { width: 140, height: 8 });
  return t.settle();
};

test('a labelled link to a computer, no host to mark it: the host after the words is masked', async () => {
  const f = await draw(`Open [the shop](${URL_ON}) now.`, null);
  expect(f).toContain('the shop');
  expect(f).toContain(MASKED);
  expect(f).not.toContain(C);
  expect(f).not.toContain(P);
}, 60_000);

test('words naming another host over a computer\'s address: the real host once, masked, beside the mark', async () => {
  const f = await draw(`Open [example.com](${URL_ON}) now.`, host);
  expect(f).toContain('atlas · port 3000');
  expect(f.split(MASKED).length - 1, f).toBe(1);
  expect(f).not.toContain(C);
}, 60_000);

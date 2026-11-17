// Reply.term's link words, by the web's rules (Reply.tsx Prose and Inlines, LinkMark markLabel, the kit Link's id mask):
//   - a reply showing a link on some computer asks the host for the realm's list (`want`); one with none asks nothing. Before,
//     the terminal never asked, so a link to your own computer stayed "another computer" wherever the list was not read yet;
//   - a mark reads as the web's label: the computer's name, the thing on it, its state ("(off)") or "Another computer · …";
//   - words that hold an id are never drawn: a mark stands alone, a plain link shows ••••;
//   - the real host after words naming another host is drawn once (the parser writes it; the terminal added a second).
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { setProxyDomain } from '../../core/hosts';
import { LinkHost, type HostComputer, type HostComputers, type LinkHostValue } from './linkHost';
import { Prose } from './Reply';

const PROXY = 'computers.hoody.test';
const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const OTHER = 'c'.repeat(24);
const ID = '64f0c3a1b2d4e5f60718293a';
const atlas: HostComputer = { id: C, project: P, name: 'atlas' };
const list = (status: string): HostComputers => ({ rows: [{ id: C, project_id: P, name: 'atlas', status, server_name: 'sg1' }], complete: true, failed: false });
const hostOf = (computers: HostComputers | null, more: Partial<LinkHostValue> = {}): LinkHostValue => ({ realm: 'global', lives: atlas, runs: atlas, computers, openHub: () => undefined, ...more });
const port = (n: number, c = C) => `https://${P}-${c}-http-${n}.sg1.${PROXY}`;

let t: TestTerm | null = null;
beforeEach(() => setProxyDomain(PROXY));
afterEach(() => { t?.renderer.destroy(); t = null; setProxyDomain(null); });

const draw = async (text: string, host: LinkHostValue | null, width = 100): Promise<string> => {
  t = await drawTest(<FocusRoot><LinkHost value={host}><Box dir="column" width={width}><Prose text={text} marks /></Box></LinkHost></FocusRoot>, { width, height: 10 });
  return t.settle();
};

test('a link on some computer asks the host for its list, once; a reply without one asks nothing', async () => {
  let asked = 0;
  const host = hostOf(null, { want: () => { asked++; } });
  await draw(`It runs at ${port(3000)} now.`, host);
  expect(asked).toBe(1);
  t!.renderer.destroy();
  t = null;
  asked = 0;
  await draw('See https://example.com/docs for the rest.', host);
  expect(asked).toBe(0);
}, 60_000);

test('a mark reads as the web\'s label: the state of a computer that is not running, another computer named so', async () => {
  let f = await draw(`It ran at ${port(3000)}.`, hostOf(list('stopped')));
  expect(f).toContain('atlas · port 3000 (off)');
  t!.renderer.destroy();
  f = await draw(`It ran at ${port(3000, OTHER)}.`, hostOf(list('running')));
  expect(f).toContain('Another computer · ');
  expect(f).not.toContain(OTHER);
}, 60_000);

test('words that hold an id are not drawn: a mark stands alone, a plain link shows the mask', async () => {
  let f = await draw(`Open [job ${ID}](${port(3000)}) now.`, hostOf(list('running')));
  expect(f).toContain('atlas · port 3000');
  expect(f).not.toContain(ID);
  t!.renderer.destroy();
  f = await draw(`Read [job ${ID}](https://example.com/jobs) now.`, null);
  expect(f).toContain('••••');
  expect(f).not.toContain(ID);
}, 60_000);

test('words naming another host: the real host once', async () => {
  const f = await draw('Go to [example.com](https://example.org/) now.', null);
  expect(f.split('(example.org)').length - 1, f).toBe(1);
}, 60_000);

// SSH key → Replace, in the terminal, with a paste the terminal delivers as typed characters (no bracketed paste), in
// pieces: no piece of a private key stays on screen. The armour line was refused by its words, but the body lines
// that came after it held no such word and stayed in the box, as did a body pasted with no BEGIN line, or a paste cut
// before its END line. Now a long base64 run that is not a public key line is refused too, and once the box has
// refused a private key it takes only what starts as a public key line.
// The key text below is made up: it is no key.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import { sent } from './fixtures';
import keysStrings from './strings.en.json';

const t = makeT(keysStrings);
const HEADER = '-----BEGIN OPENSSH PRIVATE KEY-----';
// Obviously fake body lines, 70 base64 characters each as ssh-keygen writes them; MARK is in every one.
const MARK = 'FAKEnotAkey';
const line = (n: number): string => `${MARK}LINE${n}`.padEnd(70, 'x');
const LAST = `${MARK}LAST==`; // a short last line: no long run of its own
const PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
const roots = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const nodes = (p: PageSession): SemNode[] => {
  const out: SemNode[] = [];
  const walk = (ns: readonly SemNode[]): void => { for (const n of ns) { out.push(n); walk(n.children); } };
  walk(roots(p));
  return out;
};
const field = (p: PageSession): SemNode | undefined => nodes(p).find((n) => n.role === 'textbox' && norm(n.name).startsWith(t('ssh.field')));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** One piece of a typed paste: its characters arrive together, then the screen settles (a refusal answers a task
 *  later). True when the made-up key text shows in the settled frame or the tree. */
async function piece(p: PageSession, text: string): Promise<boolean> {
  await p.keys.type(text);
  await sleep(40);
  const frame = await p.settle();
  return frame.includes(MARK) || semText(roots(p)).includes(MARK);
}

async function openEditor(): Promise<PageSession> {
  s = await renderPage({ page: 'keys', path: '/keys/ssh', cols: 120, rows: 40 });
  await s.settle();
  const replace = nodes(s).find((n) => n.role === 'button' && norm(n.name) === t('ssh.replace'));
  expect(replace).toBeDefined();
  act(replace!, 'press');
  await s.settle();
  const box = field(s);
  expect(box).toBeDefined();
  act(box!, 'focus');
  await s.settle();
  return s;
}

test('a private key typed in pieces and cut before its END line: no piece of its body stays', async () => {
  const p = await openEditor();
  const before = sent.setSsh;
  expect(await piece(p, HEADER + '\n')).toBe(false);
  const seen: boolean[] = [];
  for (const n of [1, 2, 3]) seen.push(await piece(p, line(n) + '\n'));
  // A piece that ends in the middle of a line, then the rest of it, then the short last line. No END line follows.
  seen.push(await piece(p, line(4).slice(0, 25)));
  seen.push(await piece(p, line(4).slice(25) + '\n'));
  seen.push(await piece(p, LAST + '\n'));
  expect(seen).toEqual(seen.map(() => false));
  expect(field(p)?.value ?? '').toBe('');
  expect(norm(await p.settle())).toContain(norm(t('ssh.e.private')));
  expect(sent.setSsh).toBe(before);
  expect(p.failures).toEqual([]);
}, 240_000);

test('a key body typed with no BEGIN line is refused by its long base64 run, and the rest after it', async () => {
  const p = await openEditor();
  const seen: boolean[] = [];
  for (const n of [1, 2]) seen.push(await piece(p, line(n) + '\n'));
  seen.push(await piece(p, LAST + '\n'));
  expect(seen).toEqual(seen.map(() => false));
  expect(field(p)?.value ?? '').toBe('');
  expect(norm(await p.settle())).toContain(norm(t('ssh.e.private')));
  expect(p.failures).toEqual([]);
}, 240_000);

test('controls: other short text stays until a refusal; after one, a public key typed in pieces is still taken', async () => {
  const p = await openEditor();
  // Not a key, not a secret: it stays for Save to refuse, as before.
  await p.keys.type('hello world');
  await p.settle();
  expect(field(p)?.value).toBe('hello world');
  for (let i = 0; i < 'hello world'.length; i++) await p.keys.press('backspace');
  expect(field(p)?.value ?? '').toBe('');
  expect(await piece(p, HEADER + '\n')).toBe(false);
  await p.keys.type(PUB.slice(0, 7));
  await p.settle();
  await p.keys.type(PUB.slice(7));
  const frame = await p.settle();
  expect(field(p)?.value).toBe(PUB);
  expect(norm(frame)).not.toContain(norm(t('ssh.e.private')));
  expect(p.failures).toEqual([]);
}, 240_000);

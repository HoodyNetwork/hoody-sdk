// SSH key → Replace, in the terminal: the box takes ONE public key line. A .pub line with the body of a private key
// under it (no BEGIN line), typed or pasted as typed characters, started like a public key: the body stayed on screen.
// Now a further line is judged like the first. The key text below is made up: it is no key.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import { sent } from './fixtures';
import keysStrings from './strings.en.json';

const t = makeT(keysStrings);
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

test('a private key body under a public key line: no piece of the body stays, and nothing is sent', async () => {
  const p = await openEditor();
  const before = sent.setSsh;
  // The public line itself is taken.
  await p.keys.type(PUB + '\n');
  await p.settle();
  expect((field(p)?.value ?? '').trim()).toBe(PUB);
  const seen: boolean[] = [];
  for (const n of [1, 2]) seen.push(await piece(p, line(n) + '\n'));
  seen.push(await piece(p, LAST + '\n'));
  expect(seen).toEqual(seen.map(() => false));
  expect(field(p)?.value ?? '').toBe('');
  expect(norm(await p.settle())).toContain(norm(t('ssh.e.private')));
  expect(sent.setSsh).toBe(before);
  expect(p.failures).toEqual([]);
}, 240_000);

test('the whole text in one piece (a paste): refused and cleared', async () => {
  const p = await openEditor();
  expect(await piece(p, [PUB, line(1), line(2), LAST].join('\n'))).toBe(false);
  expect(field(p)?.value ?? '').toBe('');
  expect(norm(await p.settle())).toContain(norm(t('ssh.e.private')));
  expect(p.failures).toEqual([]);
}, 240_000);

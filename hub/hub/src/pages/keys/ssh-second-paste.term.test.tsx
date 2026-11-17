// SSH key → Replace, in the terminal: a private key pasted by mistake never stays on screen, however often it is
// pasted. The first paste was refused and cleared; a second paste of a private key changed nothing the tab holds (the
// text was already empty and the error already shown), so nothing drew again and the editor kept the pasted text in
// the frame and in the tree. Every refusal now gives the tab a new editor: the old one, its text and its undo go.
// The key text below is made up: it is no key.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, semText, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import { sent } from './fixtures';
import keysStrings from './strings.en.json';

const t = makeT(keysStrings);
// Obviously fake: the armour words are what the tab refuses; the body is filler.
const BODY_A = 'FAKEFAKEnotAkeyAAAA1111';
const BODY_B = 'FAKEFAKEnotAkeyBBBB2222';
const fakePrivate = (body: string): string => ['-----BEGIN OPENSSH', 'PRIVATE KEY-----', body, '-----END OPENSSH', 'PRIVATE KEY-----'].join(' ');
// A public key line (the fixture style of page.test.ts): accepted text stays in the box.
const PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ana@laptop';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
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
/** The frames settled over the next moments (a refusal answers a task later), the last one last. Counted, not timed:
 *  the fixture clock stands still. */
async function frames(p: PageSession, n = 6): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < n; i++) { out.push(await p.settle()); await sleep(40); }
  out.push(await p.settle());
  return out;
}
/** A bracketed paste, as a terminal sends one: the whole text arrives as one change. */
async function paste(p: PageSession, text: string): Promise<string[]> {
  const stdin = (p.renderer as unknown as { stdin: { emit(ev: 'data', data: Buffer): void } }).stdin;
  stdin.emit('data', Buffer.from(`\x1b[200~${text}\x1b[201~`));
  return frames(p);
}
const shows = (p: PageSession, fs: readonly string[], text: string): boolean =>
  fs.some((f) => f.includes(text)) || semText(roots(p)).includes(text);

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

test('a second pasted private key is refused and cleared like the first: never in a frame, never in the tree', async () => {
  const p = await openEditor();
  const before = sent.setSsh;

  const first = await paste(p, fakePrivate(BODY_A));
  expect(shows(p, [first.at(-1)!], BODY_A)).toBe(false);
  expect(norm(first.at(-1)!)).toContain(norm(t('ssh.e.private')));

  // The second paste: the tab's own state does not change (empty text, same error).
  const second = await paste(p, fakePrivate(BODY_B));
  expect(shows(p, [second.at(-1)!], BODY_B)).toBe(false);
  expect(shows(p, [second.at(-1)!], 'PRIVATE KEY-----')).toBe(false);
  expect(norm(second.at(-1)!)).toContain(norm(t('ssh.e.private')));
  expect(field(p)?.value ?? '').toBe('');

  // A third, and the same text as the first again.
  const third = await paste(p, fakePrivate(BODY_A));
  expect(shows(p, [third.at(-1)!], BODY_A)).toBe(false);
  expect(field(p)?.value ?? '').toBe('');

  // Undo brings no refused text back (the editor that held it is gone).
  await p.keys.press('-', { ctrl: true });
  const undone = await frames(p);
  expect(shows(p, undone, BODY_A)).toBe(false);
  expect(shows(p, undone, BODY_B)).toBe(false);

  expect(sent.setSsh).toBe(before);
  expect(p.failures).toEqual([]);
}, 240_000);

test('after a refusal the field still has the focus and takes a public key', async () => {
  const p = await openEditor();
  await paste(p, fakePrivate(BODY_A));
  await paste(p, fakePrivate(BODY_B));
  // No Tab, no click: the paste lands in the field the person was in.
  const fs = await paste(p, PUB);
  expect(field(p)?.states.focused).toBe(true);
  expect(field(p)?.value).toBe(PUB);
  expect(norm(fs.at(-1)!)).not.toContain(norm(t('ssh.e.private')));
  expect(norm(fs.at(-1)!)).toContain('ana@laptop');
  expect(p.failures).toEqual([]);
}, 240_000);

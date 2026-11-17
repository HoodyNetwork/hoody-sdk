// Keys in the terminal: the copies beside a held secret and the share's token code follow SecretField's screen rules
// (term/app/secret-screen-ctx.ts). "Copy the command", "Copy the text" (HeldField HeldCopy, kit CopyButton `secret`)
// ask the screen at the press and write nothing when it refuses, saying why; the share's code with the token (kit
// QrCode `secret`) is the hatched box where a secret may not show. They used to copy and draw whatever the screen said.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Made key: "Copy the command" refused by the screen writes nothing and says why; allowed, one copy of the command with the key, and the key is never drawn | 'made key: Copy the command asks the screen' |
// | 2 | Made share: "Copy the text" refused writes nothing and says why; the code with the token is hatched with the reason where a secret may not show; allowed, both work | 'made share: the text copy and the token code ask the screen' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { shotCase } from '../../../scripts/term/goldens';
import { rendererHitAt, replay, type Node as SemLike } from '../../../scripts/term/shot-replay';
import { copiesOf } from '../../term/prim/testing';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';
import shots from './shots';

type Screen = { reveal: boolean; copy: boolean };
const COPY_REFUSED = 'Not copied: this terminal has not said it takes copies.';
const SHOW_REFUSED = 'Not shown: this screen could keep it';
const TOKEN_CODES = new Set(['QR code with the sign-in link', 'QR code with the whole message']);

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const flatNodes = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flatNodes(n.children, out); } return out; };
const rootOf = (p: PageSession) => { const r = p.renderer as unknown as { root: unknown; stdin: unknown }; return { root: r.root, stdin: r.stdin } as never; };
const tree = (p: PageSession): SemNode[] => flatNodes(semanticsOf(rootOf(p)));
const flat = (f: string): string => f.replace(/\s+/g, ' ');

/** Presses the first enabled control `is` picks, waiting for it (a fixture answer, a held timer) up to ~40 settles. */
async function press(p: PageSession, is: (name: string) => boolean, what: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const n = tree(p).find((x) => is(x.name) && !x.states.disabled && x.actions.includes('press'));
    if (n) { act(n, 'press'); await p.settle(); return; }
    if (i % 2) await p.releaseHeld(); else await p.settle();
    await new Promise((q) => setTimeout(q, 25));
  }
  throw new Error(`no enabled control "${what}"`);
}
const named = (name: string) => (n: string) => n === name;

test('made key: Copy the command asks the screen', async () => {
  let screen: Screen = { reveal: true, copy: false };
  s = await renderPage({ page: 'keys', fx: 'many', cols: 120, rows: 40, secretScreen: () => screen });
  // Make a key as mint-shown.term.test.tsx does.
  await press(s, named('New key'), 'New key');
  const name = tree(s).find((x) => x.name === 'Name' && x.actions.includes('type'));
  if (!name) throw new Error('no Name field');
  if (!name.states.focused && name.actions.includes('focus')) { act(name, 'focus'); await s.settle(); }
  act(getByRef(semanticsOf(rootOf(s)), name.ref), 'type', 'gate-key');
  await s.settle();
  await press(s, named('Make key'), 'Make key');
  for (let i = 0; i < 3; i++) { await new Promise((q) => setTimeout(q, 50)); await s.settle(); }
  expect(s.frame).toContain('shown once');

  const copied = copiesOf(s.renderer);
  await press(s, named('Copy the command'), 'Copy the command');
  expect(copied).toEqual([]);
  expect(flat(s.frame)).toContain(COPY_REFUSED);

  screen = { reveal: true, copy: true };
  await press(s, named('Copy the command'), 'Copy the command');
  expect(copied.length).toBe(1);
  expect(copied[0]!.startsWith('export HOODY_TOKEN=hdy_')).toBe(true);
  const key = copied[0]!.slice('export HOODY_TOKEN='.length);
  expect(key.length).toBeGreaterThan(12);
  expect(flat(s.frame)).not.toContain(key);
  expect(flat(s.frame)).not.toContain(COPY_REFUSED);
  expect(s.failures).toEqual([]);
}, 240_000);

test('made share: the text copy and the token code ask the screen', async () => {
  let screen: Screen = { reveal: false, copy: false };
  const shot = (shots as readonly { name: string }[]).find((x) => x.name === 'share-review');
  const c = shotCase(shot as never, '/keys');
  if (!c || !c.steps) throw new Error('shot share-review has no steps');
  s = await renderPage({ page: 'keys', path: c.path, fx: c.fx, cols: 120, rows: 70, secretScreen: () => screen });
  await s.settle();
  const p = s;
  const hitAt = rendererHitAt(p.renderer);
  const why = await replay(p, c.steps, { tree: () => semanticsOf(rootOf(p)) as unknown as SemLike[], cols: 120, rows: 70, wheel: async () => { await p.settle(); }, ...(hitAt ? { hitAt } : {}) });
  expect(why).toBeNull();
  await press(s, named('Create share'), 'Create share');

  // The message's own Copy beside its field: refused, nothing written, the reason on its line.
  const copied = copiesOf(s.renderer);
  await press(s, named('Copy the text'), 'Copy the text');
  expect(copied).toEqual([]);
  expect(flat(s.frame)).toContain(COPY_REFUSED);

  // The code with the token: Show draws the hatched box (or, where even that has no room, the room line) and the
  // reason, never the code.
  await press(s, (n) => n.startsWith('QR code and agent prompt'), 'QR code and agent prompt');
  await press(s, named('Include the token'), 'Include the token');
  expect(flat(s.frame)).not.toContain(SHOW_REFUSED);
  await press(s, named('Show code'), 'Show code');
  const codes = () => tree(s!).filter((x) => x.role === 'img' && TOKEN_CODES.has(x.name));
  expect(codes().some((x) => x.value === 'filled')).toBe(false);
  expect(flat(s.frame)).toContain(SHOW_REFUSED);

  // Allowed: Show again draws no refusal (the code, or the line saying it needs more room), and Copy writes the text.
  screen = { reveal: true, copy: true };
  await press(s, named('Hide code'), 'Hide code');
  await press(s, named('Show code'), 'Show code');
  expect(flat(s.frame)).not.toContain(SHOW_REFUSED);
  expect(codes().some((x) => x.value === 'hidden')).toBe(false);
  await press(s, named('Copy the text'), 'Copy the text');
  expect(copied.length).toBe(1);
  const token = /hdy_[0-9a-f_]+/.exec(copied[0]!)?.[0] ?? '';
  expect(token.length).toBeGreaterThan(12);
  expect(flat(s.frame)).not.toContain(token);
  expect(flat(s.frame)).not.toContain(COPY_REFUSED);
  expect(s.failures).toEqual([]);
}, 240_000);

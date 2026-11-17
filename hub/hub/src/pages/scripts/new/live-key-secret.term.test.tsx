// Scripts, a New script made live with a key (shot s13-flow-done-key) in the terminal: the key the deploy made is a kit
// SecretField, so the screen is asked before it is copied (term/app/secret-screen-ctx.ts) and no part of it is drawn
// while it is masked. It was a CopyField: its first and last four characters were on the screen and Copy wrote it
// whatever the screen said.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Copy refused by the screen writes nothing and says why; allowed, one copy of the whole key; the key, whole or as its id mask, is never drawn | 'made key: Copy asks the screen and nothing of the key is drawn' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';
import { shotCase } from '../../../../scripts/term/goldens';
import { rendererHitAt, replay, type Node as SemLike } from '../../../../scripts/term/shot-replay';
import { copiesOf } from '../../../term/prim/testing';
import { act, semanticsOf, type SemNode } from '../../../term/prim/semantics';
import shots from '../shots';

type Screen = { reveal: boolean; copy: boolean };
const COPY_REFUSED = 'Not copied: this terminal has not said it takes copies.';
const COLS = 120;
const ROWS = 60;

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const flatNodes = (ns: readonly SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flatNodes(n.children, out); } return out; };
const rootOf = (p: PageSession) => { const r = p.renderer as unknown as { root: unknown; stdin: unknown }; return { root: r.root, stdin: r.stdin } as never; };
const tree = (p: PageSession): SemNode[] => flatNodes(semanticsOf(rootOf(p)));
const flat = (f: string): string => f.replace(/\s+/g, ' ');

/** Presses the key's own Copy: the last enabled control named exactly "Copy" (the address's Copy carries its name). */
async function pressKeyCopy(p: PageSession): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const n = tree(p).filter((x) => x.name === 'Copy' && !x.states.disabled && x.actions.includes('press')).pop();
    if (n) { act(n, 'press'); await p.settle(); return; }
    await p.settle();
    await new Promise((q) => setTimeout(q, 25));
  }
  throw new Error('no enabled Copy for the key');
}

test('made key: Copy asks the screen and nothing of the key is drawn', async () => {
  let screen: Screen = { reveal: false, copy: false };
  const shot = (shots as readonly { name: string }[]).find((x) => x.name === 's13-flow-done-key');
  const c = shotCase(shot as never, '/scripts');
  if (!c || !c.steps) throw new Error('shot s13-flow-done-key has no steps');
  s = await renderPage({ page: 'scripts', path: c.path, fx: c.fx, cols: COLS, rows: ROWS, secretScreen: () => screen });
  await s.settle();
  const p = s;
  const hitAt = rendererHitAt(p.renderer);
  const why = await replay(p, c.steps, { tree: () => semanticsOf(rootOf(p)) as unknown as SemLike[], cols: COLS, rows: ROWS, wheel: async () => { await p.settle(); }, ...(hitAt ? { hitAt } : {}) });
  expect(why).toBeNull();
  expect(flat(s.frame)).toContain('Save your key now');

  // Refused: nothing written, the reason on the field's note line.
  const copied = copiesOf(s.renderer);
  await pressKeyCopy(s);
  expect(copied).toEqual([]);
  expect(flat(s.frame)).toContain(COPY_REFUSED);

  // Allowed: one copy of the whole key, and the screen holds no part of it.
  screen = { reveal: true, copy: true };
  await pressKeyCopy(s);
  expect(copied.length).toBe(1);
  const key = copied[0]!;
  expect(key.length).toBeGreaterThan(12);
  const frame = flat(s.frame);
  expect(frame).not.toContain(key);
  expect(frame).not.toContain(`${key.slice(0, 4)}…${key.slice(-4)}`);
  expect(frame).not.toContain(COPY_REFUSED);
  expect(s.failures).toEqual([]);
}, 240_000);

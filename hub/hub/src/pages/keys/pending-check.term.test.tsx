// Keys, unknown outcomes in the terminal (C9): Check again is a read, never a second send. Each case replays the shot
// the golden runner draws (key-pending, pause-unknown, delete-key) in a fixture state that COUNTS the change it holds
// (fixtures.ts: pendingCreate counts creates, pauseHeld counts pauses, pendingOps counts deletes), then presses Check
// again and pins both what it says (the page's strings) and that the counter did not move. The replay scrolls with a
// real mouse wheel, as the golden runner does (scripts/term/goldens.ts): delete-key's target sits below the fold at
// 120x40 (term-golden/shot-delete-key.120x40.txt shows the inspector scrolled to its last line).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { shotCase } from '../../../scripts/term/goldens';
import { rendererHitAt, replay, type Node as SemLike } from '../../../scripts/term/shot-replay';
import { act, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import { sent } from './fixtures';
import shots from './shots';
import keysStrings from './strings.en.json';

const t = makeT(keysStrings);
const KEY = 'ci-deploy'; // fixtures.ts: the key at ?sel=hdy_9e37.3779b1, and the name key-pending types ("c", "i")
const COLS = 120;
const ROWS = 40;

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const norm = (x: string): string => x.replace(/\s+/g, ' ').trim();
const nodes = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  const out: SemNode[] = [];
  const walk = (ns: readonly SemNode[]): void => { for (const n of ns) { out.push(n); walk(n.children); } };
  walk(semanticsOf({ root: r.root, stdin: r.stdin }));
  return out;
};
const under = (n: SemNode): SemNode[] => [n, ...n.children.flatMap(under)];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const says = (p: PageSession, frame: string, text: string): boolean =>
  norm(frame).includes(norm(text)) || nodes(p).some((n) => norm(n.name).includes(norm(text)) || norm(n.description ?? '').includes(norm(text)));
async function until(p: PageSession, text: string): Promise<string> {
  let frame = await p.settle();
  for (let i = 0; i < 60 && !says(p, frame, text); i++) { await sleep(100); frame = await p.settle(); }
  return frame;
}
function press(n: SemNode): void {
  if (n.actions.includes('press')) act(n, 'press');
  else act(n, 'click', undefined, { force: true });
}
/** The first enabled button whose name ends with Check again (the drawer's footer draws it after a mark). */
const checkAgain = (pool: SemNode[]): SemNode | undefined =>
  pool.find((n) => n.role === 'button' && norm(n.name).endsWith(t('action.checkAgain')) && !n.states.disabled);

/** Draws the keys shot `name` in fixture state `fx`, as the golden runner draws it (its path, its replayed steps, and
 *  the same mouse wheel: a target drawn below the fold, such as the inspector's Delete…, is scrolled into view first). */
async function drawShot(name: string, fx: string): Promise<string> {
  const shot = (shots as readonly { name: string }[]).find((x) => x.name === name);
  expect(shot).toBeDefined();
  const c = shotCase(shot as never, '/keys');
  expect(c).toBeDefined();
  s = await renderPage({ page: 'keys', path: c!.path, fx, cols: COLS, rows: ROWS });
  await s.settle();
  const p = s;
  const r0 = p.renderer as unknown as { root: unknown; stdin?: { emit(e: 'data', b: Buffer): unknown } };
  // One wheel notch at a cell (SGR mouse: 64 up, 65 down; 1-based cells), then settle.
  const wheel = async (x: number, y: number, dir: 'up' | 'down'): Promise<void> => {
    r0.stdin?.emit('data', Buffer.from(`\x1b[<${dir === 'up' ? 64 : 65};${x + 1};${y + 1}M`));
    await p.settle();
  };
  const hitAt = rendererHitAt(p.renderer);
  const why = await replay(p, c!.steps ?? [], { tree: () => semanticsOf({ root: r0.root as never, stdin: r0.stdin as never }) as unknown as SemLike[], cols: COLS, rows: ROWS, wheel, ...(hitAt ? { hitAt } : {}) });
  expect(why).toBeNull();
  return p.settle();
}

test('key-pending: Check again reads the list only; the create is never sent twice', async () => {
  let frame = await drawShot('key-pending', 'pendingCreate');
  frame = await until(s!, t('pd.title'));
  expect(says(s!, frame, t('pd.title'))).toBe(true);
  expect(says(s!, frame, t('pd.body'))).toBe(true);
  expect(sent.create).toBe(1);
  const drawer = nodes(s!).find((n) => n.role === 'dialog');
  expect(drawer).toBeDefined();
  const check = checkAgain(under(drawer!));
  expect(check).toBeDefined();
  press(check!);
  frame = await until(s!, t('pd.checked'));
  expect(says(s!, frame, t('pd.checked'))).toBe(true);
  // Nothing of this name was listed, so it stays held (never shown as failed, never resent).
  expect(says(s!, frame, t('pd.title'))).toBe(true);
  expect(sent.create).toBe(1);
  // A second Check again: still a read.
  const again = checkAgain(under(nodes(s!).find((n) => n.role === 'dialog')!));
  expect(again).toBeDefined();
  press(again!);
  await until(s!, t('pd.checked'));
  expect(sent.create).toBe(1);
  expect(s!.failures).toEqual([]);
}, 240_000);

test('pause-unknown: Check again reads, says the key has not changed yet, and sends no second pause', async () => {
  let frame = await drawShot('pause-unknown', 'pauseHeld');
  frame = await until(s!, t('insp.unknownTitle'));
  expect(says(s!, frame, t('insp.unknownTitle'))).toBe(true);
  expect(sent.setEnabled).toBe(1);
  const check = checkAgain(nodes(s!));
  expect(check).toBeDefined();
  press(check!);
  frame = await until(s!, t('op.notYet', { name: KEY }));
  expect(says(s!, frame, t('op.notYet', { name: KEY }))).toBe(true);
  // Still unconfirmed, still one pause.
  expect(says(s!, frame, t('insp.unknownTitle'))).toBe(true);
  expect(sent.setEnabled).toBe(1);
  expect(s!.failures).toEqual([]);
}, 240_000);

test('delete-key, answer lost: the confirm names the key; Check again reads, says it is still listed, no second delete', async () => {
  let frame = await drawShot('delete-key', 'pendingOps');
  const title = t('del.title', { name: KEY });
  const confirm = nodes(s!).find((n) => (n.role === 'dialog' || n.role === 'alertdialog') && norm(n.name).includes(title));
  expect(confirm).toBeDefined();
  expect(says(s!, frame, title)).toBe(true);
  expect(sent.remove).toBe(0);
  const go = under(confirm!).find((n) => n.role === 'button' && norm(n.name) === t('del.go') && !n.states.disabled);
  expect(go).toBeDefined();
  press(go!);
  frame = await s!.settle();
  for (let i = 0; i < 60 && sent.remove === 0; i++) { await sleep(50); frame = await s!.settle(); }
  expect(sent.remove).toBe(1);
  // The dialog stays with the unknown outcome and its Check again.
  const open = nodes(s!).find((n) => (n.role === 'dialog' || n.role === 'alertdialog') && norm(n.name).includes(title));
  expect(open).toBeDefined();
  const check = checkAgain(under(open!)) ?? checkAgain(nodes(s!));
  expect(check).toBeDefined();
  press(check!);
  frame = await until(s!, t('del.notYet', { name: KEY }));
  expect(says(s!, frame, t('del.notYet', { name: KEY }))).toBe(true);
  expect(sent.remove).toBe(1);
  expect(s!.failures).toEqual([]);
}, 240_000);

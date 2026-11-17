// The Delete key dialog in the terminal, after the server refused the delete: the reason is the dialog's own outcome line,
// under the question, never a second column beside it (the question and the reason were laid side by side, each wrapping
// in its own half of the dialog).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { shotCase } from '../../../scripts/term/goldens';
import { rendererHitAt, replay, type Node as SemLike } from '../../../scripts/term/shot-replay';
import { act, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { makeT } from '@kit';
import shots from './shots';
import keysStrings from './strings.en.json';
import { outcomeText } from './parts/words.pure';

const t = makeT(keysStrings);
const KEY = 'ci-deploy';
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

async function drawShot(name: string, fx: string): Promise<void> {
  const shot = (shots as readonly { name: string }[]).find((x) => x.name === name);
  const c = shotCase(shot as never, '/keys');
  expect(c).toBeDefined();
  s = await renderPage({ page: 'keys', path: c!.path, fx, cols: COLS, rows: ROWS });
  await s.settle();
  const p = s;
  const r0 = p.renderer as unknown as { root: unknown; stdin?: { emit(e: 'data', b: Buffer): unknown } };
  const wheel = async (x: number, y: number, dir: 'up' | 'down'): Promise<void> => {
    r0.stdin?.emit('data', Buffer.from(`\x1b[<${dir === 'up' ? 64 : 65};${x + 1};${y + 1}M`));
    await p.settle();
  };
  const hitAt = rendererHitAt(p.renderer);
  const why = await replay(p, c!.steps ?? [], { tree: () => semanticsOf({ root: r0.root as never, stdin: r0.stdin as never }) as unknown as SemLike[], cols: COLS, rows: ROWS, wheel, ...(hitAt ? { hitAt } : {}) });
  expect(why).toBeNull();
}

test('a refused delete: the reason is its own line under the question, not a column beside it', async () => {
  await drawShot('delete-key', 'deleteRefused');
  const title = t('del.title', { name: KEY });
  const dialog = () => nodes(s!).find((n) => (n.role === 'dialog' || n.role === 'alertdialog') && norm(n.name).includes(title));
  const go = under(dialog()!).find((n) => n.role === 'button' && norm(n.name) === t('del.go') && !n.states.disabled);
  expect(go).toBeDefined();
  if (go!.actions.includes('press')) act(go!, 'press'); else act(go!, 'click', undefined, { force: true });
  const reason = outcomeText(t, { outcome: 'failed', code: 'CONFLICT' }, KEY, false);
  const head = reason.split(' ').slice(0, 3).join(' ');
  let frame = await s!.settle();
  for (let i = 0; i < 60 && !frame.includes(head); i++) { await sleep(100); frame = await s!.settle(); }
  expect(frame, frame).toContain(head);
  const rows = frame.split('\n');
  const ask = t('del.plain', { name: KEY }).split(' ').slice(0, 3).join(' ');
  const once = rows.findIndex((r) => r.includes(ask));
  const why = rows.findIndex((r) => r.includes(head));
  expect(once, frame).toBeGreaterThanOrEqual(0);
  // Under the question, starting at the dialog's left edge as the question does, not beside it.
  expect(why, frame).toBeGreaterThan(once);
  const left = (r: string, x: string) => r.indexOf(x);
  const qLeft = left(rows.find((r) => r.includes(norm(title).split(' ')[0]!) && r.includes('?')) ?? '', norm(title).split(' ')[0]!);
  expect(Math.abs(left(rows[why]!, head) - qLeft) <= 4, frame).toBe(true);
  expect(dialog()).toBeDefined();
}, 120_000);

// A shot session starts from nothing (billing's twin is pages/billing/held-session.term.test.tsx): the golden
// runner draws every shot of a run in one process. The keys states are built once, at module load: a create answered by
// the default state adds the minted key to that state's list, and the `sent` counters move. The fixture boot forgets both
// (fixtures.ts resetFixtureServer, called for every page by app/fixtures.ts resetFixtureServers), so a shot draws as if
// it were the first of the run. No reset by hand in this file.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { shotCase } from '../../../scripts/term/goldens';
import { rendererHitAt, replay, type Node as SemLike } from '../../../scripts/term/shot-replay';
import { semanticsOf } from '../../term/prim/semantics';
import { sent } from './fixtures';
import shots from './shots';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const COLS = 120;
const ROWS = 40;
const flat = (f: string): string => f.replace(/\s+/g, ' ');

/** Draws the keys shot `name` as the golden runner does: its state and path, then its replayed action. */
async function drawShot(name: string): Promise<string> {
  const shot = (shots as readonly { name: string }[]).find((x) => x.name === name);
  expect(shot).toBeDefined();
  // A shot with no path and no action is the page's own state case (goldens draws it as one): its path and state.
  const c = shotCase(shot as never, '/keys') ?? { path: '/keys', fx: (shot as { state?: string }).state ?? null, steps: undefined };
  s = await renderPage({ page: 'keys', path: c.path, fx: c.fx, cols: COLS, rows: ROWS });
  await s.settle();
  if (c.steps) {
    const p = s;
    const r0 = p.renderer as unknown as { root: unknown; stdin?: never };
    const hitAt = rendererHitAt(p.renderer);
    const why = await replay(p, c.steps, { tree: () => semanticsOf({ root: r0.root as never, stdin: r0.stdin as never }) as unknown as SemLike[], cols: COLS, rows: ROWS, wheel: async () => { await p.settle(); }, ...(hitAt ? { hitAt } : {}) });
    expect(why).toBeNull();
  }
  return flat(await s.settle());
}

test('shots key-shown-once twice, then keys, in the same process: each draws as if first', async () => {
  const before = await drawShot('keys');
  s!.close(); s = null;
  const mint = await drawShot('key-shown-once');
  // The mint reached the fake server (the state's list took the key), so the draws below are judged against a real change.
  expect(sent.create).toBe(1);
  s!.close(); s = null;
  expect(await drawShot('key-shown-once')).toBe(mint);
  s!.close(); s = null;
  expect(await drawShot('keys')).toBe(before);
  // The mints were counted in the sessions that sent them; this session has sent none.
  expect(sent.create).toBe(0);
}, 240_000);

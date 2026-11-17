// A shot session starts from nothing (no billing frame carries an earlier shot's hold): the golden runner
// draws every shot of a run in one process, and a fixture page keeps its unknown checkouts and its held top-up in memory
// (data.ts, the fixture stand-ins for core's records). The fixture boot forgets them (billing fixtures.ts
// resetFixtureServer, called for every page by app/fixtures.ts resetFixtureServers), so shot B never shows shot A's hold.
// A hold surviving between REAL sessions is core's own record, not these: not judged here. No reset by hand in this file.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { shotCase } from '../../../scripts/term/goldens';
import { rendererHitAt, replay, type Node as SemLike } from '../../../scripts/term/shot-replay';
import { semanticsOf } from '../../term/prim/semantics';
import shots from './shots';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const COLS = 120;
const ROWS = 40;
const flat = (f: string): string => f.replace(/\s+/g, ' ');

/** Draws the billing shot `name` as the golden runner does: its state and path, then its replayed action. */
async function drawShot(name: string): Promise<string> {
  const shot = (shots as readonly { name: string }[]).find((x) => x.name === name);
  expect(shot).toBeDefined();
  const c = shotCase(shot as never, '/billing');
  expect(c).not.toBeNull();
  s = await renderPage({ page: 'billing', path: c!.path, fx: c!.fx, cols: COLS, rows: ROWS });
  await s.settle();
  if (c!.steps) {
    const p = s;
    const r0 = p.renderer as unknown as { root: unknown; stdin?: never };
    const hitAt = rendererHitAt(p.renderer);
    const why = await replay(p, c!.steps, { tree: () => semanticsOf({ root: r0.root as never, stdin: r0.stdin as never }) as unknown as SemLike[], cols: COLS, rows: ROWS, wheel: async () => { await p.settle(); }, ...(hitAt ? { hitAt } : {}) });
    expect(why).toBeNull();
  }
  return flat(await s.settle());
}

// Shot A's own proof of its hold: its drawer's "not confirmed" text (the page band behind the drawer is cut by it).
for (const [a, held] of [['funds-unknown', 'Payment page: not confirmed'], ['checkout-reserve-unknown', "couldn't confirm whether your reservation was created"]] as const) {
  test(`shot ${a}, then servers-loading in the same process: the second shot shows no hold of the first`, async () => {
    // Shot A made the hold (its own frame shows it), so shot B below is judged against a real hold.
    expect(await drawShot(a)).toContain(held);
    s!.close(); s = null;
    const b = await drawShot('servers-loading');
    expect(b).not.toContain('may have gone through');
  }, 240_000);
}

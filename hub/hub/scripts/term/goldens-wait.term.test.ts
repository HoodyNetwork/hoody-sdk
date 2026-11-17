// The page gate waits for a shot's waitForText at EVERY size before it takes the frame (wait-text.ts), and a shot
// whose text never comes fails and stores nothing. A page can draw its loading skeleton at 80x24 on
// about 1 first draw in 30 on a loaded host (the page was idle before its late read was asked for) and the gate took that frame.
// Here the same thing on purpose: the first frame of a shot is a loading frame; the page draws on the next settle.
import { afterAll, expect, test } from 'bun:test';
afterAll(async () => { (await import('./clock')).thawClock(); });
import fs from 'node:fs';
import path from 'node:path';

const TMP = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `goldens-wait-${process.pid}`);
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));
const LOADING = ' ░░░░░░░░░░\n ░░░░░░';

test('a late first frame is waited out at 80x24 and 120x40; a text that never comes fails the shot and stores no frame', async () => {
  const { runPageGoldens, casesOf } = await import('./goldens');
  const { renderPage } = await import('./render');
  const { frameShows } = await import('./wait-text');
  const cases = await casesOf('tunnels');
  const late = cases.find((c) => c.name === 'shot-pull-detail')!;
  const never = cases.find((c) => c.name === 'shot-reconnecting-detail')!;
  expect(late.waitForText).toBe('it gets no public address');
  expect(never.waitForText).toBeDefined();
  const dir = path.join(TMP, 'tunnels');
  fs.mkdirSync(dir, { recursive: true });
  const same = (o: { fx: string | null; path?: string }, c: { fx: string | null; path?: string }): boolean => o.fx === c.fx && o.path === c.path;
  // Only these two cases are drawn from their state and path.
  for (const c of [late, never]) expect(cases.filter((x) => same(x, c)).length).toBe(1);
  const render: Parameters<typeof runPageGoldens>[1]['render'] = async (o) => {
    const s = await renderPage(o);
    const mode = same(o, late) ? 'late' : same(o, never) ? 'never' : null;
    if (!mode) return s;
    let loading = true;
    return new Proxy(s, { get(t, k) {
      if (k === 'frame' && loading) return LOADING;
      if (k === 'renderer' && loading) return { root: { getChildren: () => [] } };
      if (k === 'settle') return async () => { if (mode === 'late') loading = false; const f = await t.settle(); return loading ? LOADING : f; };
      return Reflect.get(t, k);
    } });
  };
  const r = await runPageGoldens('tunnels', { update: true, strict: false, render, dir });
  // Waited out: both stored frames of the late shot are the page, with its text.
  for (const size of ['80x24', '120x40']) {
    const f = fs.readFileSync(path.join(dir, `shot-pull-detail.${size}.txt`), 'utf8');
    expect(f).not.toContain('░░░░░░░░░░');
    expect(f).toContain('Inside this computer');
    // At 80x24 the text sits under the fold: there the tree answered the wait.
    if (size === '120x40') expect(frameShows(f, late.waitForText!)).toBe(true);
  }
  // Never came: one problem naming the first size drawn, and no frame of that shot on disk.
  const hits = r.problems.filter((p) => p.rule === 'shot-wait-text');
  expect(hits.map((p) => p.message)).toEqual([expect.stringContaining('shot "shot-reconnecting-detail" at 80x24')]);
  expect(fs.readdirSync(dir).filter((f) => f.startsWith('shot-reconnecting-detail.'))).toEqual([]);
}, 300_000);

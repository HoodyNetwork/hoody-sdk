// Schedules, a Run now still under way: the schedule's note said "… Working…  Working…". OpNote put a
// labelled Spinner before the same words; the web's Spinner keeps its label for assistive tech only, the terminal's draws
// it (kit/states/Spinner.term.tsx), so the terminal said it twice. The spinner is now only the mark and the words are
// the status: "Working…" once, on the line and as the status's name.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = () => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
async function until(ok: (f: string) => boolean, ms = 20_000): Promise<string> {
  const end = performance.now() + ms;
  while (!ok(s!.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}
const times = (line: string, word: string) => line.split(word).length - 1;

for (const [cols, rows] of [[80, 24], [120, 40]] as const) {
  test(`${cols}x${rows}: a run under way says Working… once`, async () => {
    // act-slow: the run's answer is held (fixtures.ts :150, delayMs 4000; the driver holds long timers).
    s = await renderPage({ page: 'schedules', fx: 'act-slow', path: '/schedules?sel=cron%3Auser%2Fa3', cols, rows, settleMs: 2000 });
    await until(() => queryAllByRole(tree(), 'button', { name: 'Run now' }).length > 0);
    const run = queryAllByRole(tree(), 'button', { name: 'Run now' }).at(-1);
    expect(run, s.frame).toBeDefined();
    act(run!, 'press');
    await s.settle();
    const f = await until((x) => x.includes('Working…'));
    const lines = f.split('\n').filter((l) => l.includes('Working…'));
    expect(lines.length, f).toBeGreaterThan(0);
    expect(lines.map((l) => times(l, 'Working…'))).toEqual(lines.map(() => 1));
    expect(queryAllByRole(tree(), 'status', { name: /Working…/ }).length).toBeGreaterThan(0);
    expect(s.trapsAt).toEqual([]);
    expect(s.failures).toEqual([]);
    expect(f).not.toContain('could not be drawn');
  }, 180_000);
}

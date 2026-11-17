// AI Models & keys at 80x24: a default-model change that failed or may have gone through shows its outcome in the setting
// row's value cell, inside the cell (the replayed shot-failed-default was layout-cut: the outcome, which never shrank, stood
// one cell out of the cell's start edge). The row is the kit SettingRow, which draws the result as its Outcome line: the
// failed title is the short one ("Didn't go through"), as on the web.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';
import { layoutFaults } from '../../term/prim/layoutcheck';

type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });
async function until(ok: (f: string) => boolean, ms = 20_000): Promise<string> {
  const end = performance.now() + ms;
  while (!ok(s!.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}
async function press(text: string): Promise<void> {
  await until((f) => f.includes(text));
  const rows = s!.frame.split('\n');
  let y = -1;
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.includes(text)) { y = i; break; }
  expect(y, `"${text}" not on screen:\n${s!.frame}`).toBeGreaterThanOrEqual(0);
  await s!.click(rows[y]!.lastIndexOf(text) + 1, y);
  await s!.settle();
}

for (const [fx, words] of [['failed', "Didn't go through"], ['pending', 'This may have gone through']] as const) {
  test(`80x24, ${fx}: the row's outcome line sits inside its cell (no layout cut)`, async () => {
    s = await renderPage({ page: 'ai', fx, path: '/ai/models?pick=helper', cols: 80, rows: 24, settleMs: 3000 });
    await press('GPT-5');
    await press('Use this model');
    await until((f) => f.includes(words));
    const faults = layoutFaults((s.renderer as unknown as { root: never }).root, { cols: 80, rows: 24 });
    expect(faults.map((f) => `${f.kind} ${f.path} ${f.detail}`)).toEqual([]);
    expect(s.trapsAt).toEqual([]);
    // The outcome's title says it once; its body does not start with the same words again (pending only).
    expect(s.frame.split(words).length - 1).toBe(1);
  }, 180_000);
}

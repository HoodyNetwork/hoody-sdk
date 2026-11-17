// An open chat's Details: Usage draws the chat's figures and its by-model table from the fixture usage answer (the AI
// fixtures answer getSessionUsage; without that answer it is 501 NO_FIXTURE, "Couldn't read this chat's usage"), and Activity
// opens beside it. No stored golden can open Details (Details is component state, the golden runner replays no keys or
// clicks yet), so this test drives the page the way a person does: click [Details], then the tab.
import { afterEach, expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const BOUND_MS = 20_000;
type S = Awaited<ReturnType<typeof renderPage>>;
let s: S | null = null;
afterEach(() => { s?.close(); s = null; });

async function until(ok: (f: string) => boolean): Promise<string> {
  const end = performance.now() + BOUND_MS;
  while (!ok(s!.frame) && performance.now() < end) { await new Promise((r) => setTimeout(r, 250)); await s!.settle(); }
  return s!.frame;
}
/** The cell of the first `text` on screen (column in cells; the fixture strings are single-width). */
function at(frame: string, text: string): { x: number; y: number } | null {
  const rows = frame.split('\n');
  for (let y = 0; y < rows.length; y++) { const x = rows[y]!.indexOf(text); if (x >= 0) return { x: x + 1, y }; }
  return null;
}
async function press(text: string): Promise<void> {
  const p = at(s!.frame, text);
  expect(p, `"${text}" not on screen:\n${s!.frame}`).not.toBeNull();
  await s!.click(p!.x, p!.y);
}

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`${cols}x${rows}: Details -> Usage shows the chat's figures by model; Activity opens`, async () => {
    s = await renderPage({ page: 'ai', path: `/ai/c/s-today?computer=atlas.00a1&realm=${REALM}`, cols, rows, settleMs: 3000 });
    expect(s.failures).toEqual([]);
    await until((f) => f.includes('[Details]'));
    await press('[Details]');
    await until((f) => f.includes('Usage'));
    await press('Usage');
    const f = await until((x) => x.includes('gpt-5') || x.includes("Couldn't read"));
    expect(f).not.toContain("Couldn't read this chat's usage");
    expect(f).toContain('gpt-5');
    // Each call has its outcome row: nothing reads as unfinished.
    expect(f.toLowerCase()).not.toContain('not finished');
    await press('Activity');
    const g = await until((x) => !x.includes('gpt-5'));
    expect(g).not.toContain('gpt-5');
  }, 180_000);
}

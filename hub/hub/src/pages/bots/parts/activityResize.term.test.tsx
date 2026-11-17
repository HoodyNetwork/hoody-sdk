// A Bot's Activity after a resize round trip (120x40 → 80x24 → 200x50 → 120x40) must still follow its
// end: the newest message on screen, "Load older" (the log's start) scrolled away, the waiting card in view with no
// collapsed "Waiting for you" strip, as in the first 120x40 frame.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../../scripts/term/render';

const NEWEST = 'Understood. I will change the limit and ask before any restart.';
const STRIP = '◆ Waiting for you';
let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const steps of [[[80, 24]], [[200, 50]], [[80, 24], [200, 50]]] as const) {
  test(`at the end, then ${steps.map(([c, r]) => `${c}x${r}`).join(' → ')} → 120x40: the log still shows its end`, async () => {
    s = await renderPage({ page: 'bots', cols: 120, rows: 40 });
    await s.settle();
    await s.keys.press('enter');
    // The opened log follows its end a few passes after it is drawn: under a loaded run one settle() can return with
    // the waiting card in view and its collapsed strip not yet withdrawn. Wait for the strip to go, at most 5 s; the
    // asserts below still decide.
    let before = await s.settle();
    for (let i = 0; i < 50 && before.includes(STRIP); i++) { await Bun.sleep(100); before = await s.settle(); }
    expect(before).toContain(NEWEST);
    expect(before).not.toContain('Load older');
    expect(before).not.toContain(STRIP);
    for (const [c, r] of steps) await s.resize(c, r);
    await s.resize(120, 40);
    // The log follows its end again a few passes after the last resize: under a loaded run one settle() can return
    // before that pass (the strip still drawn in 2 of 3 runs; 0 of 5 on a quiet host). Wait for the
    // frame to come back, at most 3 s; the asserts below still decide.
    let after = await s.settle();
    for (let i = 0; i < 30 && after !== before; i++) { await Bun.sleep(100); after = await s.settle(); }
    expect(s.trapsAt).toEqual([]);
    expect(s.failures).toEqual([]);
    expect(after).toContain(NEWEST);
    expect(after).not.toContain('Load older');
    expect(after).not.toContain(STRIP);
    expect(after).toBe(before);
  }, 240_000);
}

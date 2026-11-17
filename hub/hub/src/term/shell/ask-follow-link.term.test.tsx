// A page link followed inside the Agent dock's "Where your agent works" popover: the popover closes, and where
// the dock is the full-screen sheet (below 100
// columns) the dock closes too, so the page it opened shows; a side pane stays open beside that page.
// The web half: src/ask/AskPanel.targetpop.test.tsx.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

const ALT = { meta: true } as never;
let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** Clicks the first place `text` is drawn. */
const clickText = async (p: PageSession, text: string): Promise<void> => {
  const lines = (await p.settle()).split('\n');
  const y = lines.findIndex((l) => l.includes(text));
  expect(y).toBeGreaterThan(-1);
  await p.click(lines[y]!.indexOf(text) + 1, y);
  await p.releaseHeld();
};

for (const [cols, rows, sheet] of [[80, 24, true], [160, 45, false]] as const) {
  test(`${cols}x${rows}: Open computer in the target popover closes it${sheet ? ' and the sheet' : '; the pane stays'}`, async () => {
    s = await renderPage({ page: 'home', cols, rows });
    await s.settle();
    await s.keys.press('j', ALT);
    expect(await s.settle()).toContain('Recent conversations');
    await clickText(s, 'atlas (Running) ▾');
    expect(await s.settle()).toContain('Where your agent works');
    await clickText(s, 'Open computer');
    const frame = await s.settle();
    expect(frame).not.toContain('Where your agent works');
    // The Computers page is what shows (its header is compact while a computer is open, so its action, not its
    // subtitle).
    expect(frame).toContain('Get a computer');
    if (sheet) expect(frame).not.toContain('Recent conversations');
    else expect(frame).toContain('Recent conversations');
    expect(s.trapsAt).toEqual([]);
    // The dock's open state outlives the render: leave it closed for the next test file.
    if (!sheet) { await s.keys.press('j', ALT); await s.settle(); }
    expect(await s.settle()).not.toContain('Recent conversations');
  }, 240_000);
}

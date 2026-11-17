// The security summary's Review brings the sessions section into view every time, also when the address already names
// it (a second press after scrolling back up), as the web scrolls to it on every press.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const at = (frame: string, re: RegExp): { x: number; y: number } | null => {
  const lines = frame.split('\n');
  for (let y = 0; y < lines.length; y++) { const m = re.exec(lines[y]!); if (m) return { x: m.index + 1, y }; }
  return null;
};
const sessionsTop = (frame: string): boolean => {
  const lines = frame.split('\n').slice(0, 12);
  return lines.some((l) => /│ Sign-in sessions\s/.test(l));
};

test('120x40: Review shows the sessions section, and again after scrolling back to the top', async () => {
  s = await renderPage({ page: 'account', cols: 120, rows: 40 });
  let f = await s.settle();
  for (let round = 0; round < 2; round++) {
    const r = at(f, /Review\b/);
    expect(r, `round ${round}: no Review button`).not.toBeNull();
    await s.click(r!.x, r!.y);
    f = await s.settle();
    expect(sessionsTop(f), `round ${round}: sessions not brought up`).toBe(true);
    for (let i = 0; i < 6; i++) { await s.keys.press('pageup'); }
    f = await s.settle();
  }
}, 240_000);

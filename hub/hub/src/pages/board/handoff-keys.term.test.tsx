// The Board page in the terminal is a hand-off (parts/BoardView.term.tsx). Its drawn keys work on the fresh page: the
// hand-off takes the focus when nothing has it, so c copies the address and r shows its QR code with no Tab, F6 or
// click first.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

for (const [cols, rows] of [[120, 40], [80, 24]] as const) {
  test(`fresh Board page: c copies and r shows the QR code with no Tab first (${cols}x${rows})`, async () => {
    s = await renderPage({ page: 'board', cols, rows });
    const copied: string[] = [];
    (s.renderer as unknown as { copyToClipboardOSC52: (t: string) => boolean }).copyToClipboardOSC52 = (t) => { copied.push(t); return true; };
    await s.settle();
    await s.keys.press('c');
    expect(s.frame).toContain('Copied');
    expect(copied.length).toBe(1);
    expect(copied[0]).toMatch(/#\/board$/);
    await s.keys.press('r');
    expect(s.frame).toContain('QR code: the Board on the web');
  }, 180_000);
}

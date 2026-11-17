// The Bot page's say-dock stays a few rows high in a terminal (it took 15 of 40 rows). The Composer box
// (3 rows) plus one action row: the reason Send is held, Talk as one entry, Send. The hand-off address and its keys show
// only when Talk is pressed; a wrapped action row leaves no blank rows between its groups.
import { expect, test } from 'bun:test';
import { renderPage } from '../../../scripts/term/render';

const PATH = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

/** Rows from the composer box's top border to the last non-blank row above the status line. */
function dockRows(frame: string): { rows: number; lines: string[] } {
  const lines = frame.split('\n');
  const box = lines.findIndex((l, i) => /┌/.test(l) && /Message the Bot/.test(lines[i + 1] ?? ''));
  const status = lines.length - 1 - [...lines].reverse().findIndex((l) => /Tab move|Typing ·/.test(l));
  let end = status - 1;
  // A row holding only the pane's scrollbar (its thumb or track at the right edge) is not dock content.
  const blank = (l: string): boolean => l.replace(/[█▀▄▐▌│┃]\s*$/u, '').trim() === '' || /^[^│]*│\s*[█▀▄]?\s*$/u.test(l);
  while (end > box && blank(lines[end]!)) end--;
  return { rows: box < 0 ? -1 : end - box + 1, lines: lines.slice(box, end + 1) };
}

for (const [cols, rows, max] of [[120, 40, 5], [80, 24, 4]] as const) {
  test(`say-dock at ${cols}x${rows} is at most ${max} rows, Talk is one entry`, async () => {
    const s = await renderPage({ page: 'bots', fx: 'idle', path: PATH, cols, rows });
    try {
      const until = performance.now() + 20_000;
      while (!/Message the Bot/.test(s.frame) && performance.now() < until) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
      const d = dockRows(s.frame);
      expect(d.rows, d.lines.join('\n')).toBeGreaterThan(0);
      expect(d.rows, d.lines.join('\n')).toBeLessThanOrEqual(max);
      expect(s.frame).toContain('[⇗ Talk]');
      expect(s.frame).toContain('Send ↵');
      expect(s.frame).not.toContain('https://hub.example.test/');
    } finally { s.close(); }
  }, 120_000);
}

test('pressing Talk opens the hand-off under it (address and Copy link), pressing again closes it', async () => {
  const s = await renderPage({ page: 'bots', fx: 'idle', path: PATH, cols: 120, rows: 40 });
  try {
    const until = performance.now() + 20_000;
    while (!/\[⇗ Talk\]/.test(s.frame) && performance.now() < until) { await new Promise((r) => setTimeout(r, 250)); await s.settle(); }
    const at = () => { const ls = s.frame.split('\n'); const y = ls.findIndex((l) => l.includes('[⇗ Talk]')); return { x: ls[y]!.indexOf('[⇗ Talk]') + 2, y }; };
    let p = at();
    await s.click(p.x, p.y);
    const opened = performance.now() + 10_000;
    while (!s.frame.includes('Copy link') && performance.now() < opened) { await new Promise((r) => setTimeout(r, 100)); await s.settle(); }
    expect(s.frame).toContain('Talking needs a microphone');
    expect(s.frame).toContain('Copy link');
    expect(s.frame).toContain('https://hub.example.test/');
    p = at();
    await s.click(p.x, p.y);
    // A loaded host may draw the closed state a few frames later.
    const shut = performance.now() + 10_000;
    while (s.frame.includes('Copy link') && performance.now() < shut) { await new Promise((r) => setTimeout(r, 100)); await s.settle(); }
    expect(s.frame).not.toContain('Copy link');
  } finally { s.close(); }
}, 120_000);

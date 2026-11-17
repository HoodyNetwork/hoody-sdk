// The Your computer card on the terminal Home (this page's widget.tsx, its strip in parts/ProgramStrip.term.tsx): each
// program is one line, its name then its actions, and every actions row is whole and starts at the same column. The
// web's five cells side by side cut "⧉ copy [QR] [Put Agent on Board]" at both ends at 120 and 200 columns, and its
// narrow rows (80 columns) put each row's actions after its own name: Agent's at another column than Terminal's.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { PROGRAMS } from './logic';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const NAMES = PROGRAMS.map((p) => strings[`program.${p}` as const]);

/** Settles until `ok` holds (page cards load after the first frame), at most 20 s; returns the last frame. */
async function until(p: PageSession, ok: (frame: string) => boolean): Promise<string> {
  const end = performance.now() + 20_000;
  let frame = await p.settle();
  while (!ok(frame) && performance.now() < end) {
    await new Promise((r) => setTimeout(r, 250));
    frame = await p.settle();
  }
  return frame;
}

for (const cols of [80, 120, 200] as const) {
  test(`${cols} columns: one line a program, every actions row whole and at one column`, async () => {
    s = await renderPage({ page: 'home', cols, rows: 60, settleMs: 3000 });
    const frame = await until(s, (f) => f.includes(strings['widget.title']) && f.includes(strings['widget.all']));
    const lines = frame.split('\n');
    // The card's lines: from its title to its foot ("All computers").
    const top = lines.findIndex((l) => l.includes(strings['widget.title']));
    const foot = lines.findIndex((l, i) => i > top && l.includes(strings['widget.all']));
    expect(top).toBeGreaterThan(-1);
    expect(foot).toBeGreaterThan(top);
    const card = lines.slice(top, foot);
    const xs = NAMES.map((name) => {
      const line = card.find((l) => l.includes(`[Put ${name} on Board]`)) ?? '';
      expect(line).toContain(`⧉ copy [QR] [Put ${name} on Board]`);
      // Its name is on the same line, before its actions: the actions are the first copy after the name (a card
      // beside this one may hold a copy button of its own on the same line).
      const at = line.indexOf(`${name} ⇗`);
      expect(at).toBeGreaterThan(-1);
      const x = line.indexOf('⧉ copy', at);
      expect(x).toBeGreaterThan(at);
      return x;
    });
    expect(new Set(xs).size).toBe(1);
    expect(s.trapsAt).toEqual([]);
    expect(s.failures).toEqual([]);
  }, 240_000);
}

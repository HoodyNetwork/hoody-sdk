// Home "Start something" in a terminal (parts/QuickActions.term.tsx).
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | A tile's line of meaning wraps in its column (.tileBody has no clamp); it never ends in an ellipsis ("Assistants that w…" at 80x24) | 'WxH: every tile meaning is whole' |
// | 2 | Two tiles a line (.tiles: two equal tracks) | 'WxH: every tile meaning is whole' |
// | 3 | The tile leads to its page | 'a tile name opens its page' |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });
const BODIES = ['actions.bot.body', 'actions.board.body', 'actions.script.body', 'actions.schedule.body'] as const;
const flat = (f: string): string => f.replace(/[│┃║┌┐└┘─]/g, ' ').replace(/\s+/g, ' ');

// 80 columns on a tall screen: at 80x24 the card's second line of tiles is below the fold.
for (const [cols, rows] of [[80, 50], [120, 40], [160, 45], [240, 67]] as const) {
  test(`${cols}x${rows}: every tile meaning is whole`, async () => {
    s = await renderPage({ page: 'home', cols, rows });
    const frame = s.frame;
    const lines = frame.split('\n');
    const y = lines.findIndex((l) => l.includes('New Bot'));
    expect(y).toBeGreaterThan(-1);
    // .quick's padding under the card title: one empty row between the title and the first tiles.
    expect(lines[y - 2]).toContain('Start something');
    expect(flat(lines[y - 1]!.slice(lines[y]!.indexOf('New Bot'), lines[y]!.indexOf('Open the Board') + 14)).trim()).toBe('');
    // Two tiles a line.
    expect(lines[y]).toContain('Open the Board');
    const x2 = lines[y]!.indexOf('Open the Board');
    const x1 = lines[y]!.indexOf('New Bot');
    // No meaning is cut: no ellipsis inside this card (between its side borders) from the first tile name to the More
    // links. A card beside it on the same lines (Your realms, Notifications) may cut its own rows: not this card's.
    const left = lines[y]!.slice(0, x1).search(/[│┃║][^│┃║]*$/);
    const right = x2 + lines[y]!.slice(x2).search(/[│┃║]/);
    expect(right).toBeGreaterThan(x2);
    const more = lines.findIndex((l, i) => i > y && l.includes('MORE'));
    const block = lines.slice(y, more > y ? more : lines.length - 1);
    for (const l of block) expect(l.slice(left + 1, right)).not.toContain('…');
    // Each column's words, read down its column, are the whole meaning.
    const col = (from: number, to: number, a: number, b: number): string => flat(lines.slice(a, b).map((l) => l.slice(from, to)).join(' ')).trim();
    const y2 = lines.findIndex((l, i) => i > y && l.includes('New script'));
    expect(y2).toBeGreaterThan(y);
    const w = x2 - x1;
    expect(col(x1, x2, y + 1, y2)).toBe(strings[BODIES[0]]);
    expect(col(x2, x2 + w, y + 1, y2)).toBe(strings[BODIES[1]]);
    // The second line of tiles ends at the first row with nothing in either column (the card may be cut by a short screen).
    const blank = lines.findIndex((l, i) => i > y2 && flat(l.slice(x1, x2 + w)).trim() === '');
    const end = blank > y2 ? blank : lines.length - 1;
    expect(col(x1, x2, y2 + 1, end)).toBe(strings[BODIES[2]]);
    expect(col(x2, x2 + w, y2 + 1, end)).toBe(strings[BODIES[3]]);
    expect(s.traps).toEqual([]);
  }, 240_000);
}

// The Home Shortcuts card in the terminal: one key and its label per line. The labels started right after each key, so
// they stood ragged ("[Ctrl+K] Search…", "[?] Show…", "[g] [c] Computers"): the keys now take the widest key's column
// and every label starts on one column. The sidebar's key "[" in its key cap read "[[]": it reads "[ [ ]". Beside another
// card (two cards a line at 80 columns) a long label wraps; its words go on down its own column.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

// Tall frames: Home holds every card the pages give it (page widgets) above this one, so at 80x24 or 120x40 the card is
// far below the first screen. What is checked is the card's own lines, at each width.
for (const [cols, rows] of [[80, 220], [120, 160]] as const) {
  test(`${cols}x${rows}: every shortcut label starts on one column`, async () => {
    s = await renderPage({ page: 'home', cols, rows });
    const frame = await s.settle();
    // The card's rows: the lines between its title and its "All shortcuts" button (the top bar's "Search or jump to…" is
    // not one of them; a card beside it on the same lines names none of these labels).
    const lines = frame.split('\n');
    const end = lines.findIndex((l) => l.includes('All shortcuts'));
    expect(end).toBeGreaterThan(0);
    const top = lines.slice(0, end).findLastIndex((l) => /\bShortcuts\b/.test(l));
    expect(top).toBeGreaterThan(-1);
    const card = lines.slice(top + 1, end);
    const edge = (l: string, x: number): number => { const e = l.slice(x).search(/[│┃║]/); return e < 0 ? l.length : x + e; };
    // Where a label starts; its words, read from there down its column to the card's edge, are the whole label.
    const at = (label: string): number => {
      const head = label.split(' ').slice(0, 2).join(' ');
      const y = card.findIndex((l) => l.includes(head));
      expect(y).toBeGreaterThan(-1);
      const x = card[y]!.indexOf(head);
      let text = card[y]!.slice(x, edge(card[y]!, x)).trim();
      for (let i = y + 1; text.length < label.length && i < card.length; i++) text = `${text} ${card[i]!.slice(x, edge(card[i]!, x)).trim()}`;
      expect(text).toBe(label);
      return x;
    };
    const first = at('Search or jump to anything');
    for (const label of ['Show this list', 'Expand or collapse the sidebar', 'Customize this page']) expect(at(label)).toBe(first);
    expect(frame).not.toContain('[[]');
    expect(card.find((l) => l.includes('Expand or'))).toMatch(/\[ \[ \] +Expand or/);
    expect(s.failures).toEqual([]);
  }, 180_000);
}

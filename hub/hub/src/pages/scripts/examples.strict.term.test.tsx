// New script's examples in a terminal, under the strict globals: pressing the first example (the steps flow,
// /scripts/new) puts the example's words in the description and moves the focus there, with no
// DOM search and no animation frame (describeFocus.term.ts), with the caret after the words. Nothing may stop the Hub
// with a requestAnimationFrame trap.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { EXAMPLES } from './new/examples';
import strings from './strings.en.json';

// The page's own example list, so the case follows it when the examples change.
const FIRST = EXAMPLES[0];

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

/** The cell of the first place `text` is drawn in the frame. */
function at(frame: string, text: string): { x: number; y: number } {
  const lines = frame.split('\n');
  for (let y = 0; y < lines.length; y++) {
    const x = lines[y]!.indexOf(text);
    if (x >= 0) return { x: x + 1, y };
  }
  throw new Error(`"${text}" is not drawn:\n${frame}`);
}

const FILL = strings[`new.ex.${FIRST}.fill`];
const firstWords = FILL.slice(0, 24);

for (const path of ['/scripts/new']) {
  test(`${path}: the first example fills the description and focuses it, with no trap`, async () => {
    s = await renderPage({ page: 'scripts', path, cols: 120, rows: 40 });
    const before = await s.settle();
    expect(before).not.toContain(firstWords);
    const p = at(before, strings[`new.ex.${FIRST}`]);
    await s.click(p.x, p.y);
    const after = await s.settle();
    const traps = s.traps;
    expect(traps).toEqual([]);
    expect(s.failures).toEqual([]);
    expect(after).not.toContain('hoody hub: stopped');
    expect(after).toContain(firstWords);
    // The focus went into the description: its node in the semantics tree is the focused one.
    const focused = focusedNode(semanticsOf(s.renderer as never));
    expect(focused?.role).toBe('textbox');
    expect(focused?.value ?? '').toContain(firstWords);
    // The caret is after the words, as on the web: what the person types next goes at the end.
    await s.keys.type('Q');
    await s.settle();
    const typed = focusedNode(semanticsOf(s.renderer as never))?.value ?? '';
    expect(typed.endsWith('Q')).toBe(true);
    expect(typed.startsWith('Q')).toBe(false);
  }, 120_000);
}

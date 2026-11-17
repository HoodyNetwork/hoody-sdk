// Vitest: the room around the Board strip. Air above the strip row (a box of its own, so the row stays one control row
// high), and under the strip the tile area set in from the page: a gap under the strip's line, and the sides so far in
// that the tiles' visible edge stands on the strip's inline inset. Without the strip (focus mode, phones) the area runs
// edge to edge. jsdom has no layout: the CSS and the two class sites are pinned here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAD } from '../model/geom';

const css = readFileSync(join(import.meta.dirname, 'board.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const view = readFileSync(join(import.meta.dirname, 'BoardView.tsx'), 'utf8');
const strip = readFileSync(join(import.meta.dirname, 'Strip.tsx'), 'utf8');
const rule = (sel: string) => new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]()>*]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

describe('the Board strip\'s room', () => {
  it('air above the strip: its own box, 16 px, never part of the strip row', () => {
    expect(rule('.stripAir')).toMatch(/block-size:\s*var\(--sp-4\)/);
    expect(rule('.stripAir')).toMatch(/flex:\s*none/);
    expect(rule('.stripRow')).not.toMatch(/padding-block|padding-top|padding:/);
  });

  it('under the strip the tile area is set in: 12 px under the line, 16 px at the bottom, the sides on the strip\'s inset', () => {
    const r = rule('.tabsPanel.underStrip');
    expect(r).toMatch(/padding-block:\s*var\(--sp-3\) var\(--sp-4\)/);
    // The area pads its tiles by PAD (one --sp-1): the page inset less that puts the tiles' edge on the strip's inset.
    expect(PAD).toBe(4);
    expect(r).toMatch(/padding-inline:\s*calc\(var\(--pad-page\) - var\(--sp-1\)\)/);
    expect(rule('.stripRow')).toMatch(/padding-inline:\s*var\(--pad-page\)/);
    // Without the class the area keeps the whole page (focus mode, phones).
    expect(rule('.tabsPanel')).not.toMatch(/padding/);
  });

  it('the strip\'s controls end 8 px above its line, the tabs stand on it', () => {
    // The kit bar lifts its own slots (Boards, New Board) and keeps the tabs on the line; the row's end tools take the same lift.
    expect(strip).toMatch(/<Tabs[\s\S]*?\n\s+toolbarRow\n\s+\/>/);
    expect(rule('.stripEnd')).toMatch(/padding-block-end:\s*var\(--sp-2\)/);
    expect(rule('.stripEnd')).toMatch(/align-items:\s*center/);
  });

  it('every control of the strip is toolbar size: one height, so one centre line', () => {
    expect(strip).not.toMatch(/size="sm"/);
    expect(strip.match(/variant="primary" chip=\{false\} size="toolbar"/g)).toHaveLength(2);
  });

  it('both come and go with the strip, and the tile area keeps its one place in the tree', () => {
    expect(view).toContain('{!(phone || focus) && <div className={s.stripAir} aria-hidden="true" />}');
    expect(view).toContain('<div className={cx(s.tabsPanel, !(phone || focus) && s.underStrip)}>{area}</div>');
    expect(view.match(/\{area\}/g)).toHaveLength(1);
  });
});

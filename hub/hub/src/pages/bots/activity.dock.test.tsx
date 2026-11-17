// Vitest: on a Bot's Activity tab the chat box is at the bottom,
// full width. It is not in the log's column (beside the Details panel on a wide pane, when it is open): it has its own dock
// under the log and the panel, spanning both, the tab's last row. The log has no scroll of its own, so the dock is held at the
// bottom of the page's one scroll. The geometry is measured in a
// browser (activity.dock.spec.ts); these pin the structure and the dock's CSS.
import { renderPage, screen } from '@app/testing';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import page from './page';
import S from './strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const css = readFileSync(path.join(__dirname, 'parts/pane.module.css'), 'utf8');
const rule = (sel: string) => css.match(new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[2] ?? '';

describe('the Activity tab: the chat box docks at the bottom, full width', () => {
  it('the box is in its own dock after the log and the Details panel, never inside the log column', async () => {
    await renderPage(page, { state: 'idle', path: `/bots?sel=${encodeURIComponent(CHIEF)}&details=1` });
    const box = await screen.findByRole('textbox', { name: S['say.label'] });
    const dock = box.closest('[data-say-dock]') as HTMLElement;
    expect(dock).not.toBeNull();
    // Not in the log's column: the column holds the Activity heading and the log.
    const heading = screen.getByRole('heading', { name: S['activity.title'] });
    expect(dock.contains(heading)).toBe(false);
    expect(heading.parentElement?.parentElement?.contains(box)).toBe(false);
    // A child of the tab's grid, after the open Details panel (so it spans under it), and its last child.
    const grid = dock.parentElement as HTMLElement;
    const rail = grid.querySelector(`aside[aria-label="${S['rail.details']}"]`);
    expect(rail?.parentElement).toBe(grid);
    expect(rail!.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid.lastElementChild).toBe(dock);
  });

  it('the dock spans every column and is held at the bottom of the one scroll', () => {
    const dock = rule('.sayDock');
    expect(dock).toMatch(/grid-column: 1 \/ -1;/);
    // The log no longer scrolls in its own box, so the dock held at the scroll's bottom covers nothing that cannot scroll
    // out from under it; at the end the newest row sits above it (activity.dock.spec.ts).
    expect(dock).toMatch(/position: sticky;/);
    expect(dock).toMatch(/inset-block-end: 0;/);
    // The log takes the height above the dock (and below the Details panel when it is open on a narrow pane), so a
    // short log still leaves the box at the bottom.
    expect(rule('.activity')).toMatch(/grid-template-rows: minmax\(0, 1fr\) auto;/);
    expect(rule('.activityDetails')).toMatch(/grid-template-rows: auto minmax\(0, 1fr\) auto;/);
  });
});

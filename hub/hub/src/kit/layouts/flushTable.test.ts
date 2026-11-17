// @vitest-environment node
// On the VMs list, a framed DataTable in a flush section body drew its own side lines just
// inside the card's, a frame inside a frame. In a flush body the card is the table's frame at the sides, as in a
// settings card; the table's top and bottom lines and fill stay. A rail's table draws no frame at all (pane.flush).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(import.meta.dirname, 'Layouts.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(sel: string): string | undefined {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
}

describe('a framed table in a flush body', () => {
  it('drops its side lines and corners: the card draws them', () => {
    const body = rule('.flush [data-table-frame]');
    expect(body, 'no rule .flush [data-table-frame]').toBeDefined();
    expect(body).toMatch(/border-inline\s*:\s*0\s*;/);
    expect(body).toMatch(/border-radius\s*:\s*0\s*;/);
    // Top and bottom lines stay: they part the table from the head band and the note.
    expect(body).not.toMatch(/border(-block)?(-start|-end)?\s*:\s*0\s*;|border\s*:\s*0/);
  });

  it('opens the body at the head band: no empty band above its toolbar, and the band\'s rule is its top line', () => {
    // Other flush bodies (rows, a list) keep their 12 px under the head.
    expect(rule('.panelHead + .flush')).toMatch(/margin-block-start\s*:\s*var\(--sp-3\)\s*;/);
    expect(rule('.panelHead + .flush:has(> [data-table-frame]:first-child)')).toMatch(/margin-block-start\s*:\s*0\s*;/);
    expect(rule('.panelHead + .flush > [data-table-frame]:first-child')).toMatch(/border-block-start\s*:\s*0\s*;/);
  });

  it('is the same rule as a settings card gives its table (one look for a table in a card)', () => {
    const settings = rule('.settingsSection [data-table-frame]');
    expect(settings).toMatch(/border-inline\s*:\s*0\s*;/);
  });
});

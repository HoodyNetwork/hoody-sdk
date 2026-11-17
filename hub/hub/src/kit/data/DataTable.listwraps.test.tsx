// Vitest: column meta listWraps marks a list row's line-2 field as one whose words wrap inside it
// (data-meta-wraps on the field, DataTable.module.css .listItem[data-meta-wraps]), never cut. Off by default: every
// other field keeps one line. Both list renderers (the plain list and a rail's) mark it; a table or card presentation has
// no list fields, so nothing is marked there. The layout itself is measured in the browser: kit/data/listwraps.spec.ts (a
// long Link, an unbroken run and a run of Tags under a long label, the link's focus ring; fine and coarse pointer, both
// directions) and pages/programs/partsactions.spec.ts (a port's "Open port N (not running yet)" link at 320 px).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { ListPaneContext } from '../layouts/pane';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  link: string;
  size: string;
}

const ROWS: Row[] = [{ id: 'a', name: 'alpha', link: 'Open port 8002 (not running yet)', size: '2 CPU' }];
const col = createColumnHelper<Row>();
const COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { pinned: true } }),
  col.accessor('link', { header: 'Address', meta: { listWraps: true } }),
  col.accessor('size', { header: 'Size' }),
];

const fieldOf = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll<HTMLElement>('[class*="listItem"]')].find((f) => f.textContent?.includes(text));

describe('DataTable column meta listWraps', () => {
  it('marks only its own list field as wrapping', () => {
    const { container } = render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="list" />);
    const wraps = fieldOf(container, 'Open port 8002');
    expect(wraps).toBeTruthy();
    expect(wraps?.hasAttribute('data-meta-wraps')).toBe(true);
    expect(fieldOf(container, '2 CPU')?.hasAttribute('data-meta-wraps')).toBe(false);
  });

  it('marks only its own field in a rail list too', () => {
    const { container } = render(
      <ListPaneContext.Provider value={{ list: true, rail: true }}>
        <DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="list" />
      </ListPaneContext.Provider>,
    );
    expect(container.querySelector('[data-rail]')).not.toBeNull();
    expect(fieldOf(container, 'Open port 8002')?.hasAttribute('data-meta-wraps')).toBe(true);
    expect(fieldOf(container, '2 CPU')?.hasAttribute('data-meta-wraps')).toBe(false);
  });

  it('marks nothing in a table presentation', () => {
    const { container } = render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" />);
    expect(container.querySelector('[data-meta-wraps]')).toBeNull();
  });

  it('marks only its own card line in a cards presentation', () => {
    const { container } = render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="cards" />);
    const line = (text: string) => [...container.querySelectorAll<HTMLElement>('[class*="cardItem"]')].find((f) => f.textContent?.includes(text));
    expect(line('Open port 8002')?.hasAttribute('data-meta-wraps')).toBe(true);
    expect(line('2 CPU')?.hasAttribute('data-meta-wraps')).toBe(false);
  });

  it('the CSS: a card value that is only text ends in an ellipsis (a block, not a flex box); a marked card line wraps', () => {
    const css = readFileSync(path.join(import.meta.dirname, 'DataTable.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = (sel: string) => new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    // text-overflow applies to a block container, never to a flex one: the base value keeps its one line and clip
    expect(rule('.cardValue')).toMatch(/text-overflow:\s*ellipsis/);
    expect(rule('.cardValue:not(:has(*))')).toMatch(/display:\s*block/);
    const wraps = rule('.cardItem[data-meta-wraps] > .cardValue');
    expect(wraps).toMatch(/display:\s*block/);
    expect(wraps).toMatch(/white-space:\s*normal/);
    expect(wraps).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('the CSS lets a marked field grow and wrap, keeping the hit height on a line with controls', () => {
    const css = readFileSync(path.join(import.meta.dirname, 'DataTable.module.css'), 'utf8');
    const rule = (sel: string) => new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(rule('.listMeta > .listItem[data-meta-wraps]')).toMatch(/height:\s*auto/);
    // A run with no break point breaks anywhere (the browser spec measures it).
    expect(rule('.listMeta > .listItem[data-meta-wraps]')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.listMeta > .listItem[data-meta-wraps]')).toMatch(/white-space:\s*normal/);
    const ctl = rule(".listMeta:has(button, a[href], [role='button']) > .listItem[data-meta-wraps]");
    expect(ctl).toMatch(/min-height:\s*var\(--meta-hit\)/);
    expect(ctl).toMatch(/(^|[^-])height:\s*auto/);
    // The value flows as text (atoms wrap whole between each other); the label wraps instead of being cut.
    expect(rule('.listMeta > .listItem[data-meta-wraps] > .listValue')).toMatch(/display:\s*block/);
    expect(rule('.listMeta > .listItem[data-meta-wraps] > .listLabel')).toMatch(/overflow:\s*visible/);
    // A label that is an InfoTip term wraps in its button too (the browser spec measures it, ring included).
    const term = rule('.listMeta > .listItem[data-meta-wraps] > .listLabel > button');
    expect(term).toMatch(/white-space:\s*normal/);
    expect(term).toMatch(/text-align:\s*start/);
  });
});

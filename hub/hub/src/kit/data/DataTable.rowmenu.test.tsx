// Vitest: a list row's "…" has one look: the plain ghost dots of a page
// header's ⋯ (ActionMenu `plain`), at every width, in a rail or not, selected or not; on a coarse pointer its box is
// --icon-hit (44 px). A table row keeps the small grey plate (d1rows.spec.ts).
import { createColumnHelper } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTable } from './DataTable';

interface Row {
  id: string;
  name: string;
  state: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } }), col.accessor('state', { header: 'State' })];
const DATA: Row[] = [
  { id: 'a', name: 'atlas', state: 'up' },
  { id: 'b', name: 'borealis', state: 'down' },
];
const noop = () => undefined;
const ACTIONS = () => [
  { id: 'rename', label: 'Rename', onAction: noop },
  { id: 'delete', label: 'Delete', tone: 'danger' as const, onAction: noop },
];

async function mount(el: ReactNode) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
const classesOf = (b: HTMLElement) => b.className.split(/\s+/);
const has = (b: HTMLElement, name: string) => classesOf(b).some((c) => c === name || c.startsWith(`${name}_`) || c.startsWith(`_${name}_`));

describe('DataTable: the row "…" look', () => {
  afterEach(cleanup);

  it('list rows: the plain ghost dots (no plate, no three-dot plate class), one per row', async () => {
    await mount(<DataTable label="Keys" presentation="list" columns={COLUMNS} data={DATA} getRowId={(r) => r.id} actions={ACTIONS} />);
    const dots = screen.getAllByRole('button', { name: 'Row actions' });
    expect(dots).toHaveLength(DATA.length);
    for (const b of dots) {
      expect(has(b, 'ghost'), b.className).toBe(true);
      expect(has(b, 'secondary'), b.className).toBe(false);
      expect(has(b, 'more'), b.className).toBe(false);
      expect(b.getAttribute('aria-haspopup')).toBe('true');
    }
  });

  it('table rows keep the small grey plate', async () => {
    await mount(<DataTable label="Keys" presentation="table" columns={COLUMNS} data={DATA} getRowId={(r) => r.id} actions={ACTIONS} />);
    const dots = screen.getAllByRole('button', { name: 'Row actions' });
    expect(dots.length).toBeGreaterThan(0);
    for (const b of dots) {
      expect(has(b, 'secondary'), b.className).toBe(true);
      expect(has(b, 'more'), b.className).toBe(true);
    }
  });

  it('no table CSS paints a box back on a list row\'s ⋯ (rail at rest, selection, hover)', () => {
    const css = readFileSync(join(__dirname, 'DataTable.module.css'), 'utf8');
    const rules = css.split('}').filter((r) => /\.rowMore/.test(r));
    expect(rules.filter((r) => /--plate|border|background|box-shadow/.test(r))).toEqual([]);
  });

  it('a ghost icon button is never under --icon-hit (44 px on a coarse pointer)', () => {
    const css = readFileSync(join(__dirname, '../controls/Button.module.css'), 'utf8');
    expect(css).toMatch(/\.iconOnly\s*\{[^}]*inline-size:\s*max\(var\(--plate-h\),\s*var\(--icon-hit\)\)[^}]*block-size:\s*max\(var\(--plate-h\),\s*var\(--icon-hit\)\)/);
  });
});

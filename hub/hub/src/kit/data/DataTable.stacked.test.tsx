// GroupHeader="stacked" puts a group's extra on its own line under the title (default unchanged) and
// indents only the first content cell of a grouped row; a stacked table is never virtual; every table's row ⋯ is a real
// button (the secondary icon button: border, lift on hover), in the table and the list. DataTable.stacked.spec.ts
// measures the computed padding in a browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable, type TableGroup } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  group: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha', group: 'one' },
  { id: 'b', name: 'bravo', group: 'two' },
  // In no group: drawn before the groups, never indented.
  { id: 'c', name: 'charlie', group: '' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
const GROUPS: TableGroup[] = [
  { id: 'one', label: 'One', extra: <span data-testid="extra-one">Open it</span> },
  { id: 'two', label: 'Two' },
];
const table = (extra: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) =>
  render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} groupBy={(r) => r.group || undefined} groups={GROUPS} {...extra} />);

describe('DataTable groupHeader', () => {
  it('default (inline): the extra sits in the header line itself, no stacked marks', () => {
    table({ presentation: 'table' });
    expect(screen.getByRole('table').getAttribute('data-group-header')).toBeNull();
    expect(screen.getByTestId('extra-one').closest('[data-group-extra]')).toBeNull();
  });

  it('stacked: the table is marked and the extra gets a line of its own beside the header button, not inside it', () => {
    table({ presentation: 'table', groupHeader: 'stacked' });
    expect(screen.getByRole('table').getAttribute('data-group-header')).toBe('stacked');
    const extra = screen.getByTestId('extra-one');
    const line = extra.closest('[data-group-extra]') as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.contains(screen.getByRole('button', { name: /One/ }))).toBe(false);
    // A group with no extra draws no empty line.
    const two = screen.getByRole('button', { name: /Two/ }).closest('tr') as HTMLElement;
    expect(two.querySelector('[data-group-extra]')).toBeNull();
  });

  it('stacked: the header still opens and closes its group', () => {
    table({ presentation: 'table', groupHeader: 'stacked' });
    expect(screen.getByText('alpha')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /One/ }));
    expect(screen.getByRole('button', { name: /One/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('alpha')).toBeNull();
  });

  it('the stacked styles hang on classes the table sets on its own elements (no descendant rule reaches a nested table)', () => {
    const css = readFileSync(join(__dirname, 'DataTable.module.css'), 'utf8');
    expect(css).toMatch(/\.groupInner\.groupInnerStacked \{[^}]*flex-direction: column/);
    // --touch-gap between the title and its second line on a coarse pointer (the spec measures it).
    expect(css).toMatch(/\.groupInner\.groupInnerStacked \{[^}]*gap: max\(var\(--sp-1\), var\(--touch-gap\)\)/);
    // Three classes: wins over `.tr > td:first-child` (DataTable.stacked.spec.ts measures it in a browser); the
    // indent is --group-indent past the cell's own start.
    expect(css).toMatch(/\.tr > \.td\.groupIndent \{[^}]*padding-inline-start: calc\(var\(--sp-3\) \+ var\(--group-indent\)\)/);
    expect(css).toMatch(/\.tr > \.td\.groupIndent:first-child,\s*\.tr > \.listCell\.groupIndent \{[^}]*padding-inline-start: calc\(var\(--sp-4\) \+ var\(--group-indent\)\)/);
    expect(css).toMatch(/\.toolbar\.toolbarStacked \{[^}]*padding-inline: var\(--sp-4\)/);
    expect(css).not.toMatch(/stackedGroups|stackedWrap/);
  });
});

const indented = (root: ParentNode) => [...root.querySelectorAll('[data-group-indent]')];
const rowOf = (id: string) => document.querySelector(`tr[data-row-id="${id}"]`) as HTMLElement;

describe('DataTable stacked: what is indented', () => {
  it('table with checkboxes: the first content cell of a grouped row, never its checkbox cell or a row outside any group', () => {
    table({ presentation: 'table', groupHeader: 'stacked', selectable: true });
    const a = rowOf('a');
    const cells = indented(a);
    expect(cells).toHaveLength(1);
    expect(cells[0]!.textContent).toContain('alpha');
    expect(a.querySelector('td')!.hasAttribute('data-group-indent')).toBe(false);
    expect(within(a.querySelector('td')!).queryByRole('checkbox')).not.toBeNull();
    expect(indented(rowOf('c'))).toHaveLength(0);
  });

  it('list: the grouped row\'s cell, not the loose row\'s', () => {
    table({ presentation: 'list', groupHeader: 'stacked' });
    expect(indented(rowOf('a'))).toHaveLength(1);
    expect(indented(rowOf('c'))).toHaveLength(0);
  });

  for (const presentation of ['cards', 'icons'] as const) {
    it(`${presentation}: tiles are never indented`, () => {
      table({ presentation, groupHeader: 'stacked' });
      expect(rowOf('a')).toBeTruthy();
      expect(indented(document)).toHaveLength(0);
    });
  }

  it('the default (inline) header indents its grouped rows the same, never a loose row', () => {
    table({ presentation: 'table', selectable: true });
    expect(indented(rowOf('a'))).toHaveLength(1);
    expect(rowOf('a').querySelector('td')!.hasAttribute('data-group-indent')).toBe(false);
    expect(indented(rowOf('c'))).toHaveLength(0);
  });

  it('a nested table inside an expanded row takes none of the stacked layout', () => {
    table({
      presentation: 'table',
      groupHeader: 'stacked',
      renderExpanded: (r: Row) => <DataTable label="Inner" data={[r]} columns={COLUMNS} getRowId={(x) => `in-${x.id}`} bare fill={false} />,
    });
    fireEvent.click(within(rowOf('a')).getByRole('button', { name: 'Show details' }));
    const inner = screen.getByRole('table', { name: 'Inner' });
    expect(inner.getAttribute('data-group-header')).toBeNull();
    expect(indented(inner)).toHaveLength(0);
    expect(inner.closest('tr')!.className).not.toMatch(/groupRowStacked/);
  });
});

describe('DataTable stacked is never virtual', () => {
  const many: Row[] = Array.from({ length: 250 }, (_, i) => ({ id: `r${i}`, name: `row ${i}`, group: i % 2 ? 'one' : 'two' }));
  const big = (extra: Partial<Parameters<typeof DataTable<Row>>[0]>) =>
    render(<DataTable label="Many" data={many} columns={COLUMNS} getRowId={(r) => r.id} groupBy={(r) => r.group} groups={GROUPS} presentation="table" pageSize={500} {...extra} />);

  it('above 200 rows every row is drawn, no spacer rows', () => {
    big({ groupHeader: 'stacked' });
    expect(document.querySelectorAll('tr[data-row-id]')).toHaveLength(250);
  });

  it('even when virtual is asked for', () => {
    big({ groupHeader: 'stacked', virtual: true });
    expect(document.querySelectorAll('tr[data-row-id]')).toHaveLength(250);
  });

  it('control: the inline layout above 200 rows is still virtual (draws fewer rows)', () => {
    big({});
    expect(document.querySelectorAll('tr[data-row-id]').length).toBeLessThan(250);
  });
});

// The table row keeps its secondary plate; a
// list row's ⋯ is the plain ghost dots at every width (DataTable.rowmenu.test.tsx).
describe('DataTable row menu ⋯ is a real button', () => {
  const onAction = vi.fn();
  for (const presentation of ['table', 'list'] as const) {
    it(`${presentation}: the row's ⋯ is the ${presentation === 'table' ? 'secondary' : 'ghost'} icon button`, () => {
      render(
        <DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation={presentation}
          actions={() => [{ id: 'open', label: 'Open', onAction }, { id: 'copy', label: 'Copy id', onAction }]} />,
      );
      const buttons = screen.getAllByRole('button', { name: 'Row actions' });
      expect(buttons.length).toBeGreaterThan(0);
      for (const b of buttons) {
        expect(b.tagName).toBe('BUTTON');
        expect(b.className).toMatch(presentation === 'table' ? /secondary/ : /ghost/);
        if (presentation === 'list') expect(b.className).not.toMatch(/secondary/);
      }
    });
  }
});

describe('the selected-row bar is the palette blue', () => {
  it('light: --hx-blue; dark: --hx-blue-text (#2f5fff is under 3:1 over the selected card)', () => {
    const css = readFileSync(join(__dirname, '..', 'tokens.css'), 'utf8');
    const bars = [...css.matchAll(/--hx-selected-bar:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(bars).toEqual(['var(--hx-blue)', 'var(--hx-blue-text)']);
  });
});

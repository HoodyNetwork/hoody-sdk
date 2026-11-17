// Vitest: every toolbar carries its size, the default one too, so a default toolbar
// nested in a 32 scope is out of it. kit/controls/toolbarScope.spec.ts measures what the attribute does in a browser.
import { render } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '../data/DataTable';
import { Toolbar, ToolbarScope, toolbarSizeProps } from './PageHeader';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));

interface Row {
  id: string;
  name: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true, list: 'primary' } })];
const DATA: Row[] = [{ id: 'a', name: 'alpha' }];
const noop = () => undefined;

const sizes = (root: HTMLElement) => [...root.querySelectorAll('[data-tb-size]')].map((n) => n.getAttribute('data-tb-size'));

describe('a toolbar always carries its size', () => {
  it('the helper answers default for no size, and 32 only for 32', () => {
    expect(toolbarSizeProps(undefined)).toEqual({ 'data-tb-size': 'default' });
    expect(toolbarSizeProps('default')).toEqual({ 'data-tb-size': 'default' });
    expect(toolbarSizeProps('32')).toEqual({ 'data-tb-size': '32' });
  });

  it('a Toolbar with no size is the default boundary inside a 32 scope', () => {
    const { container } = render(
      <ToolbarScope size="32">
        <Toolbar start="row" />
      </ToolbarScope>,
    );
    expect(sizes(container)).toEqual(['32', 'default']);
  });

  it('a ToolbarScope set to default is the boundary a panel wraps itself in', () => {
    const { container } = render(
      <ToolbarScope size="32">
        <ToolbarScope size="default">row</ToolbarScope>
      </ToolbarScope>,
    );
    expect(sizes(container)).toEqual(['32', 'default']);
  });

  it("a DataTable's toolbar is the default boundary unless it is asked for 32", () => {
    const table = (size?: '32') => (
      <ToolbarScope size="32">
        <DataTable label="Rows" columns={COLUMNS} data={DATA} getRowId={(r: Row) => r.id} onRefresh={noop} toolbarSize={size} />
      </ToolbarScope>
    );
    const { container, rerender } = render(table());
    expect(sizes(container)).toEqual(['32', 'default']);
    rerender(table('32'));
    expect(sizes(container)).toEqual(['32', '32']);
  });
});

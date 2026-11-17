// Vitest: two kit/data rows from the Keys walk. A failed read shows no result count
// (it is not "0 rows"), and a list-row field can carry its label on a phone when a column opts in.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  ends: string;
  size: string;
}
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];

describe('DataTable count under a failed read', () => {
  for (const data of [undefined, []] as const) {
    it(`no count beside the error state (data ${data === undefined ? 'unread' : 'empty'})`, () => {
      render(<DataTable label="Keys" data={data} columns={COLUMNS} getRowId={(r) => r.id} error={new Error('down')} onRetry={() => undefined} countLabel={(n) => `${n} keys`} />);
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      expect(screen.queryByText(/\bkeys$/)).toBeNull();
    });
  }

  it('no default "rows" count either', () => {
    render(<DataTable label="Keys" data={[]} columns={COLUMNS} getRowId={(r) => r.id} error={new Error('down')} onRetry={() => undefined} />);
    expect(screen.queryByText(/\brows?$/)).toBeNull();
  });

  it('kept rows under a failed refresh still count (the warning band case)', () => {
    const rows: Row[] = [{ id: 'a', name: 'alpha', ends: '', size: '' }];
    render(<DataTable label="Keys" data={rows} columns={COLUMNS} getRowId={(r) => r.id} error={new Error('down')} onRetry={() => undefined} countLabel={(n) => `${n} keys`} />);
    expect(screen.getByText('1 keys')).toBeInTheDocument();
  });
});

describe('DataTable errorBody: the error state\'s sentence', () => {
  it('no prop: the kit\'s sentence, as ever', () => {
    render(<DataTable label="Keys" data={[]} columns={COLUMNS} getRowId={(r) => r.id} error={new Error('down')} onRetry={() => undefined} />);
    expect(screen.getByText(/could.?n.t reach the server/i)).toBeInTheDocument();
  });

  it('the prop replaces the sentence and keeps Try again, with no count', () => {
    render(<DataTable label="Keys" data={[]} columns={COLUMNS} getRowId={(r) => r.id} error={new Error('down')} errorBody="The agent answered without the keys." onRetry={() => undefined} countLabel={(n) => `${n} keys`} />);
    expect(screen.getByText('The agent answered without the keys.')).toBeInTheDocument();
    expect(screen.queryByText(/could.?n.t reach the server/i)).toBeNull();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/\bkeys$/)).toBeNull();
  });

  it('kept rows under a failed refresh show the rows, not the sentence', () => {
    const rows: Row[] = [{ id: 'a', name: 'alpha', ends: '', size: '' }];
    render(<DataTable label="Keys" data={rows} columns={COLUMNS} getRowId={(r) => r.id} error={new Error('down')} errorBody="The agent answered without the keys." onRetry={() => undefined} />);
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.queryByText('The agent answered without the keys.')).toBeNull();
  });
});

const LIST_COLUMNS = [
  col.accessor('name', { header: 'Name', meta: { list: 'primary' } }),
  col.accessor('ends', { header: 'Ends', meta: { list: 'meta', listLabel: true }, cell: (c) => c.getValue() || null }),
  col.accessor('size', { header: 'Size', meta: { list: 'meta', listLabel: 'Uses' } }),
  col.accessor('id', { header: 'Id', meta: { list: 'meta' } }),
];

function itemOf(text: string): HTMLElement {
  const item = screen.getByText(text).closest('[class*="listItem"]');
  if (!(item instanceof HTMLElement)) throw new Error(`no list item for ${text}`);
  return item;
}

describe('DataTable list row labels (phone)', () => {
  it('a column that opts in shows its header (or its own label) before the value on line 2', () => {
    render(<DataTable label="Keys" presentation="list" data={[{ id: 'k1', name: 'ci', ends: 'Oct 30', size: '3' }]} columns={LIST_COLUMNS} getRowId={(r) => r.id} />);
    expect(itemOf('Oct 30')).toHaveTextContent(/^Ends\s*Oct 30$/);
    expect(itemOf('3')).toHaveTextContent(/^Uses\s*3$/);
  });

  it('a column that does not opt in renders exactly as before: the value alone', () => {
    render(<DataTable label="Keys" presentation="list" data={[{ id: 'k1', name: 'ci', ends: 'Oct 30', size: '3' }]} columns={LIST_COLUMNS} getRowId={(r) => r.id} />);
    const item = itemOf('k1');
    expect(item.textContent).toBe('k1');
    expect(item.children).toHaveLength(1);
  });

  it('an empty labelled cell keeps its value wrapper :empty, so the CSS hides the whole field, label too', () => {
    render(<DataTable label="Keys" presentation="list" data={[{ id: 'k1', name: 'ci', ends: '', size: '3' }]} columns={LIST_COLUMNS} getRowId={(r) => r.id} />);
    const label = screen.getByText('Ends');
    const item = label.closest('[class*="listItem"]') as HTMLElement;
    const value = item.querySelector('[class*="listValue"]');
    expect(value?.childNodes.length).toBe(0);
  });

  it('labels show only in list rows: the table header is unchanged', () => {
    render(<DataTable label="Keys" presentation="table" data={[{ id: 'k1', name: 'ci', ends: 'Oct 30', size: '3' }]} columns={LIST_COLUMNS} getRowId={(r) => r.id} />);
    expect(screen.getByRole('cell', { name: 'Oct 30' })).toHaveTextContent(/^Oct 30$/);
  });

  it('a label never shrinks for a long value, and an over-wide label stops at half its field with an ellipsis', () => {
    // jsdom has no layout; the 390 behaviour (short label whole, long value cut, long label at 50 %) was
    // measured in a browser on the kit gallery list. This pins the rule that gives it.
    const css = readFileSync(join(import.meta.dirname, 'DataTable.module.css'), 'utf8');
    const rule = /(?:^|\n)\.listLabel\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/flex:\s*none/);
    expect(rule).toMatch(/max-width:\s*50%/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis/);
  });
});

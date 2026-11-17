// Vitest: a card's fields share two columns. Each field is a row of the card body's grid (label, then value), so the
// values of one card start on one edge whatever their labels' lengths; a field with no label takes the whole row.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { createColumnHelper } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import s from './DataTable.module.css';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

const css = readFileSync(path.join(__dirname, 'DataTable.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel: string) => new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

interface Row {
  id: string;
  what: string;
  free: string;
  bare: string;
  note: string;
}
const ROWS: Row[] = [{ id: 'price', what: 'Price', free: '$0 a month', bare: 'From $30 a month', note: 'Billed monthly' }];
const col = createColumnHelper<Row>();
const columns = [
  col.accessor('what', { header: 'What', meta: { pinned: true, list: 'primary' } }),
  col.accessor('free', { header: 'Free', meta: { listLabel: true } }),
  col.accessor('bare', { header: 'Bare metal', meta: { listLabel: true } }),
  col.accessor('note', { header: 'Note' }),
];

describe('DataTable cards: label and value columns', () => {
  it('draws each field as label then value, direct children of its row; an unlabelled field holds its value alone', () => {
    const { container } = render(<DataTable label="Compare" data={ROWS} columns={columns} getRowId={(r) => r.id} presentation="cards" />);
    const body = container.querySelector<HTMLElement>(`.${s.cardBody}`)!;
    const items = [...body.children] as HTMLElement[];
    expect(items).toHaveLength(3);
    for (const item of items) expect(item.classList.contains(s.cardItem!)).toBe(true);
    const [free, bare, note] = items as [HTMLElement, HTMLElement, HTMLElement];
    expect([...free.children].map((c) => c.className)).toEqual([s.listLabel, s.cardValue]);
    expect([...bare.children].map((c) => c.className)).toEqual([s.listLabel, s.cardValue]);
    expect(bare.firstElementChild!.textContent).toBe('Bare metal');
    expect([...note.children].map((c) => c.className)).toEqual([s.cardValue]);
  });

  it('CSS: the body is a two-column grid and each field takes its columns from it', () => {
    const body = rule('.cardBody');
    expect(body).toMatch(/display:\s*grid/);
    expect(body).toMatch(/grid-template-columns:\s*fit-content\(50%\) minmax\(0, 1fr\)/);
    const item = rule('.cardItem');
    expect(item).toMatch(/display:\s*grid/);
    expect(item).toMatch(/grid-template-columns:\s*subgrid/);
    expect(item).toMatch(/grid-column:\s*1 \/ -1/);
  });

  it('CSS: the label fills its column, and a value with no label takes the whole row', () => {
    expect(rule('.cardItem > .listLabel')).toMatch(/max-width:\s*none/);
    expect(rule('.cardItem > .cardValue:first-child')).toMatch(/grid-column:\s*1 \/ -1/);
  });
});

// Vitest: DataTable maxHeight, rowMark and lines='dashed'. Each is opt-in: without them the markup is the same
// as before (no data-mark, no cap class or --dt-cap, no ledger class); with them the scroll box carries the cap, a marked
// row its tone, and the table the ledger lines. The CSS reads only the tokens, each with a light and a dark value.
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { DataTable } from './DataTable';

vi.mock('../nav', () => ({
  useSearchParam: () => [undefined, () => undefined],
}));

interface Row {
  id: string;
  name: string;
  me?: boolean;
  unread?: boolean;
}
const ROWS: Row[] = [
  { id: 'a', name: 'alpha', me: true },
  { id: 'b', name: 'beta', unread: true },
  { id: 'c', name: 'gamma' },
];
const col = createColumnHelper<Row>();
const COLUMNS = [col.accessor('name', { header: 'Name', meta: { pinned: true } })];
type Props = Partial<Parameters<typeof DataTable<Row>>[0]>;
const table = (extra: Props = {}) => render(<DataTable label="Things" data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} presentation="table" {...extra} />);
const rowOf = (id: string) => document.querySelector<HTMLElement>(`tr[data-row-id="${id}"]`)!;
const box = () => document.querySelector<HTMLElement>('[data-plan-width]') ?? screen.getByRole('table').parentElement!;

describe('DataTable maxHeight, rowMark, lines', () => {
  it('off: the markup is the same as without the props', () => {
    // React Aria numbers its ids per render; the ids are not markup the props could change.
    const html = (r: ReturnType<typeof table>) => r.container.innerHTML.replace(/react-aria-[^"]*/g, 'react-aria');
    const a = html(table());
    const b = html(table({ rowMark: () => false, lines: 'solid' }));
    expect(b).toBe(a);
    expect(document.querySelector('[data-mark]')).toBeNull();
    expect(a).not.toContain('--dt-cap');
  });

  it('maxHeight sets the cap on the scroll box only', () => {
    table({ maxHeight: 432 });
    const b = box();
    expect(b.style.getPropertyValue('--dt-cap')).toBe('432px');
    expect(b.className).toMatch(/capped/);
  });

  it('rowMark marks exactly the rows it names, with their tone', () => {
    table({ rowMark: (r) => (r.me ? 'acc' : r.unread ? 'ink' : false) });
    expect(rowOf('a').dataset.mark).toBe('acc');
    expect(rowOf('b').dataset.mark).toBe('ink');
    expect(rowOf('c').hasAttribute('data-mark')).toBe(false);
  });

  it("lines='dashed' gives the table the ledger class; solid does not", () => {
    table({ lines: 'dashed' });
    expect(screen.getByRole('table').className).toMatch(/ledger/);
  });

  it('the CSS draws the mark and the ledger from tokens that exist in both themes', () => {
    const css = readFileSync(path.join(__dirname, 'DataTable.module.css'), 'utf8');
    const tokens = readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8');
    const dark = tokens.slice(tokens.indexOf(':root[data-hx-theme="dark"] {'));
    const used = new Set([...css.matchAll(/var\((--(?:dt|hx)-[a-z-]+)\)/g)].map((m) => m[1]!));
    for (const t of ['--dt-mark-bar-acc', '--dt-mark-wash-acc', '--dt-mark-bar-ink', '--dt-mark-wash-ink', '--hx-ledger-line', '--hx-ledger-head-line', '--hx-ledger-head-bg', '--dt-mark-w', '--dt-mark-w-ink']) {
      expect(used.has(t), `${t} used`).toBe(true);
      expect(tokens.includes(`${t}:`), `${t} defined`).toBe(true);
      if (!t.startsWith('--dt-mark-w')) expect(dark.includes(`${t}:`), `${t} has a dark value`).toBe(true);
    }
    expect(css).not.toMatch(/data-mark[^{]*\{[^}]*#[0-9a-f]{3,8}/i);
  });

  it('a marked row that is also selected or active shows selected or active, not the mark', () => {
    // The mark's rules must not outweigh .selected > td / .active > td (0,1,1): a selected unread row shows the
    // selection, not the wash. The mark's wash steps aside for both, its bar for active.
    const css = readFileSync(path.join(__dirname, 'DataTable.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
    const markRules = rules.filter((r) => r.sel.includes('[data-mark]'));
    const wash = markRules.filter((r) => /background(-color)?\s*:/.test(r.body));
    const bar = markRules.filter((r) => /box-shadow\s*:/.test(r.body));
    expect(wash.length, 'one wash rule').toBe(1);
    expect(bar.length, 'one bar rule').toBe(1);
    expect(wash[0]!.sel.replace(/\s+/g, ' ')).toBe('.tr[data-mark]:not(.selected, .active) > td');
    expect(bar[0]!.sel.replace(/\s+/g, ' ')).toBe('.tr[data-mark]:not(.active) > td:first-child');
    // The markup carries both, so the CSS above is what decides: a selected marked row keeps its data-mark and its class.
    table({ rowMark: (r) => (r.me ? 'acc' : false), selectedIds: new Set(['a']), selectable: true } as Props);
    expect(rowOf('a').dataset.mark).toBe('acc');
    expect(rowOf('a').className).toMatch(/selected/);
  });
});

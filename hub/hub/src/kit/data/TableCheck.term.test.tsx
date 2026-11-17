// The table gate (term/prim/TableCheck.ts): it finds the kit DataTable's marks in a real frame, passes clean tables at
// every width, and fails each fault kind on a hand-built tree.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { tableFaults, type TableMarkInfo } from '../../term/prim/TableCheck';
import { DataTable } from './DataTable';

interface Row { id: string; name: string; state: string; size: number; note: string }
const data: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: i === 3 ? 'a very long name that will never fit in its column at all, not even on the widest terminal anybody owns, ever, at all' : i === 5 ? '日本語の名前' : `row-${i}`, state: i % 2 ? 'Running' : 'Stopped', size: i * 1234, note: i === 4 ? 'a note far longer than its column could ever be, so it is always cut by the table at every width' : `note ${i}` }));
const columns: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' } },
  { id: 'state', header: 'State', accessorKey: 'state', meta: { width: '120px', priority: 1 } },
  { id: 'size', header: 'Size', accessorKey: 'size', meta: { width: '80px', priority: 3, align: 'end' } },
  { id: 'note', header: 'Note', accessorKey: 'note', meta: { width: '200px', priority: 4 } },
];
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
type N = { __tableMark?: TableMarkInfo; getChildren?: () => N[] };
const count = (n: N, role: string): number => (n.__tableMark?.role === role ? 1 : 0) + (n.getChildren?.() ?? []).reduce((a, k) => a + count(k, role), 0);

for (const [w, h] of [[200, 30], [120, 20], [80, 20], [56, 16]] as const) {
  test(`a real DataTable with row actions at ${w}x${h}: marks found, no table fault`, async () => {
    const t = await drawTest(<FocusRoot><Routed><DataTable label="Things" data={data} columns={columns} getRowId={(r) => r.id}
      actions={(r) => [{ id: 'open', label: 'Open', inline: true, onAction: () => {} }, { id: 'del', label: `Delete ${r.name}`, onAction: () => {} }] as never} /></Routed></FocusRoot>, { width: w, height: h });
    await t.settle();
    const root = (t.renderer as unknown as { root: N }).root;
    const tables = count(root, 'table');
    const heads = count(root, 'head');
    const cells = count(root, 'cell');
    const actions = count(root, 'actions');
    const faults = tableFaults(root, { cols: w, rows: h });
    t.renderer.destroy();
    expect(tables).toBe(1);
    if (w >= 80) { expect(heads).toBeGreaterThan(0); expect(cells).toBeGreaterThan(heads); }
    expect(actions).toBeGreaterThan(0);
    expect(faults).toEqual([]);
  });
}

// Hand-built trees: one per fault kind.
const node = (x: number, y: number, width: number, height: number, mark?: TableMarkInfo, kids: unknown[] = [], extra: object = {}): any => {
  const n: any = { x, y, width, height, __tableMark: mark, _overflow: 'hidden', ...extra };
  const k = kids as any[];
  for (const c of k) c.parent = n;
  n.getChildren = () => k;
  return n;
};
const text = (x: number, y: number, s: string): any => ({ x, y, width: s.length, height: 1, plainText: s, getChildren: () => [] });

test('misaligned: a body cell not under its header', () => {
  const tree = node(0, 0, 80, 5, { role: 'table' }, [node(0, 0, 80, 1, undefined, [node(2, 0, 10, 1, { role: 'head', col: 'a' })]), node(0, 1, 80, 1, undefined, [node(3, 1, 10, 1, { role: 'cell', col: 'a' }, [text(3, 1, 'x')])])]);
  expect(tableFaults(tree, { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-misaligned']);
  const ok = node(0, 0, 80, 5, { role: 'table' }, [node(0, 0, 80, 1, undefined, [node(2, 0, 10, 1, { role: 'head', col: 'a' })]), node(0, 1, 80, 1, undefined, [node(2, 1, 10, 1, { role: 'cell', col: 'a' }, [text(2, 1, 'x')])])]);
  expect(tableFaults(ok, { cols: 80, rows: 24 })).toEqual([]);
});
test('actions clipped: the action column reaches past its row or the screen', () => {
  const tree = node(0, 0, 60, 5, { role: 'table' }, [node(0, 1, 60, 1, undefined, [node(55, 1, 10, 1, { role: 'actions' })])]);
  expect(tableFaults(tree, { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-actions-clipped']);
  const screen = node(0, 0, 100, 5, { role: 'table' }, [node(0, 1, 100, 1, undefined, [node(75, 1, 10, 1, { role: 'actions' })])]);
  expect(tableFaults(screen, { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-actions-clipped']);
});
test('ellipsis: three dots or a mid-text "…" in a cell fail; one "…" at the end passes', () => {
  const mk = (s: string) => node(0, 0, 80, 5, { role: 'table' }, [node(0, 1, 80, 1, undefined, [node(0, 1, 20, 1, { role: 'cell', col: 'a' }, [text(0, 1, s)])])]);
  expect(tableFaults(mk('a long na...'), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-ellipsis']);
  expect(tableFaults(mk('a lo…me'), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-ellipsis']);
  expect(tableFaults(mk('a long na…'), { cols: 80, rows: 24 })).toEqual([]);
  // an id shortened on purpose (one token) passes
  expect(tableFaults(mk('64f0…0001'), { cols: 80, rows: 24 })).toEqual([]);
  expect(tableFaults(mk('…AcctKey1'), { cols: 80, rows: 24 })).toEqual([]);
});
test('cut unmarked: a cell text wider than its cell, clipped with no "…", fails; the same text cut with "…" passes', () => {
  const mk = (s: string, w: number) => node(0, 0, 80, 5, { role: 'table' }, [node(0, 1, 80, 1, undefined, [node(0, 1, 20, 1, { role: 'cell', col: 'a' }, [{ ...text(0, 1, s), width: w }])])]);
  expect(tableFaults(mk('POST hooks.example.com/deploy', 29), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-cut-unmarked']);
  expect(tableFaults(mk('POST hooks.example.…', 20), { cols: 80, rows: 24 })).toEqual([]);
  expect(tableFaults(mk('short', 5), { cols: 80, rows: 24 })).toEqual([]);
});
test('wrap cut: a cell text laid out on more lines than its one-line cell fails; a truncating one passes', () => {
  const mk = (s: string, extra: object) => node(0, 0, 80, 5, { role: 'table' }, [node(0, 1, 80, 1, undefined, [node(0, 1, 6, 1, { role: 'cell', col: 'a' }, [{ ...text(0, 1, s), width: 6, ...extra }])])]);
  expect(tableFaults(mk('ping-health-check', { wrapMode: 'word', virtualLineCount: 3 }), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-wrap-cut']);
  expect(tableFaults(mk('ping-…', { wrapMode: 'none', virtualLineCount: 1 }), { cols: 80, rows: 24 })).toEqual([]);
});
test('no gap: two cells of a row whose words touch fail; one blank cell between them passes', () => {
  const mk = (aw: number, bx: number, as: string) => node(0, 0, 80, 5, { role: 'table' }, [node(0, 1, 80, 1, undefined, [
    node(0, 1, aw, 1, { role: 'cell', col: 'a' }, [text(0, 1, as)]),
    node(bx, 1, 12, 1, { role: 'cell', col: 'b' }, [text(bx, 1, '● Not run')]),
  ])]);
  // Words fill the cell and the next one starts right after: "startsNot".
  expect(tableFaults(mk(24, 24, 'When the computer starts'), { cols: 80, rows: 24 }).map((f) => f.kind)).toEqual(['table-no-gap']);
  // The column gap kept (the cells one apart), or a shorter text: passes.
  expect(tableFaults(mk(24, 25, 'When the computer starts'), { cols: 80, rows: 24 })).toEqual([]);
  expect(tableFaults(mk(24, 24, 'When the computer'), { cols: 80, rows: 24 })).toEqual([]);
});

// A table cell that stacks a name over a RowNote (Account > SSH keys: the key, then its comment) draws the note on the
// lines under it: the row takes its tallest cell's lines. A long note wraps whole, `cut` too (a terminal has no hover,
// the web's `(hover: none)` rule). Before, a table row was one line: the note was dropped behind a "…"
// and could not be read anywhere. A row whose cell gets short again goes back to one line.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { DataTable } from './DataTable';
import { RowNote } from './Display';

interface Row { id: string; name: string; key: string; note?: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const cols: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Computer', accessorKey: 'name', meta: { list: 'primary' } },
  { id: 'key', header: 'Key', cell: (c) => (
    <Box dir="column">
      <Text>{c.row.original.key}</Text>
      {c.row.original.note && <RowNote cut>{c.row.original.note}</RowNote>}
    </Box>
  ) },
];
const LONG = 'ci-deploy@build-runner-07.acme.example (rotated 2026-11-01, owner platform team, read-only)';
let setRows: (r: Row[]) => void = () => {};
// The rows live inside the routed tree (the router keeps its first children: state above it would never reach the table).
function Rows({ first }: { first: Row[] }) {
  const [rows, set] = useState(first);
  setRows = set;
  return <DataTable label="Keys" presentation="table" bare data={rows} columns={cols} getRowId={(r) => r.id} />;
}
function Table({ first }: { first: Row[] }) {
  return <FocusRoot><Routed><Rows first={first} /></Routed></FocusRoot>;
}
const lineOf = (frame: string, re: RegExp) => frame.split('\n').findIndex((l) => re.test(l));

test('a stacked note is drawn under its key, wrapped whole, and its row grows to hold it', async () => {
  const t = await drawTest(<Table first={[
    { id: 'a', name: 'atlas', key: 'ED25519 …AcctKey1', note: 'ada@laptop' },
    { id: 'b', name: 'borealis', key: 'No key' },
    { id: 'g', name: 'granite', key: 'ED25519 …Granite7', note: LONG },
    { id: 'z', name: 'zephyr', key: 'RSA …Zephyr00' },
  ]} />, { width: 80, height: 20 });
  try {
    await t.settle(); await t.settle();
    const f = t.captureCharFrame();
    const atlas = lineOf(f, /atlas/);
    expect(f.split('\n')[atlas + 1]).toContain('ada@laptop');
    expect(lineOf(f, /borealis/)).toBe(atlas + 2);
    // The long note is whole over its lines: its last words show, and no "…" stands in for it.
    expect(f).toContain('read-only)');
    expect(f).not.toMatch(/AcctKey1…|Granite7…/);
    const granite = lineOf(f, /granite/);
    expect(lineOf(f, /zephyr/)).toBeGreaterThan(granite + 2);
    // The note's cell gets short again: the row is one line again.
    setRows([
      { id: 'a', name: 'atlas', key: 'ED25519 …AcctKey1' },
      { id: 'b', name: 'borealis', key: 'No key' },
    ]);
    await t.settle(); await t.settle();
    const g = t.captureCharFrame();
    expect(lineOf(g, /borealis/)).toBe(lineOf(g, /atlas/) + 1);
  } finally { t.renderer.destroy(); }
}, 30_000);

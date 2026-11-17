// One list, one frame: the scrollbar says where the rows in view are in the list, whatever order the rows and the
// list's own height arrived in. A row not drawn yet counts as a short one, so a total length that depended
// on how many rows had ever been drawn would differ by arrival order: a list that knows its rows before its height
// draws other rows first than one that knows its height before its rows, and the same list would end with thumbs of
// different lengths (one tree, two or three frames by timing: Bots, Servers).
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string }
const all: Row[] = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, name: `fact-${i}` }));
// Five named fields that wrap: at 44 columns a row is its name and four or more lines of values.
const field = (id: string): ColumnDef<Row, any> => ({ id, header: id, accessorKey: 'name', meta: { listLabel: true, listWraps: true }, cell: (c) => `${c.getValue()} value of ${id}` });
const columns: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Fact', accessorKey: 'name', meta: { pinned: true, list: 'primary' } },
  ...['Free', 'Small', 'Medium', 'Large', 'Bare'].map(field),
];
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' }));
  return <RouterProvider router={router} />;
}

const track = (frame: string): string => frame.split('\n').map((l) => l.trimEnd().slice(-1)).filter((c) => c === '█' || c === '░').join('');

test('the thumb starts the track at the first row and ends it at the last', async () => {
  const t = await drawTest(<FocusRoot><Routed><DataTable bare fill label="Facts" data={all} columns={columns} getRowId={(r) => r.id} presentation="cards" onRowAction={false} sortParam={false} noViewMenu /></Routed></FocusRoot>, { width: 44, height: 40 });
  let f = await t.settle();
  expect(track(f)).toMatch(/^█+░+$/);
  const y = f.split('\n').findIndex((l) => l.includes('fact-0'));
  await t.mockMouse.click(4, y);
  await t.settle();
  t.mockInput.pressKey('END');
  f = await t.settle();
  expect(f).toMatch(/▌ fact-39/);
  expect(f).toContain('fact-39 value of Bare');
  expect(track(f)).toMatch(/^░+█+$/);
  // Forty rows of seven lines in a window of forty lines: the thumb is about a seventh of the track at both ends.
  expect(track(f).replace(/░/g, '').length).toBeGreaterThanOrEqual(5);
  expect(track(f).replace(/░/g, '').length).toBeLessThanOrEqual(7);
  t.renderer.destroy();
}, 120_000);

/** The list after its rows arrived in the given steps (each step is the rows known so far), settled after each. */
async function frameAfter(steps: readonly number[]): Promise<string> {
  let show: (n: number) => void = () => {};
  function List() {
    const [n, setN] = useState(steps[0]!);
    show = setN;
    return <DataTable bare fill label="Facts" data={all.slice(0, n)} columns={columns} getRowId={(r) => r.id} presentation="cards" onRowAction={false} sortParam={false} noViewMenu />;
  }
  const t = await drawTest(<FocusRoot><Routed><List /></Routed></FocusRoot>, { width: 44, height: 40 });
  for (const n of steps.slice(1)) { await t.settle(); show(n); }
  const f = await t.settle();
  t.renderer.destroy();
  return f;
}

test('the same list draws the same frame whether its rows or its height came first', async () => {
  // All rows at once: the list draws for a guessed height before it knows its own.
  const atOnce = await frameAfter([all.length]);
  // One row first: the list knows its height when the rest arrive.
  const heightFirst = await frameAfter([1, all.length]);
  // In three steps.
  const inSteps = await frameAfter([1, 12, all.length]);
  // Positive control: the list is longer than its window (a thumb on a track), and starts at its first row.
  const lastCells = atOnce.split('\n').map((l) => l.trimEnd().slice(-1));
  expect(lastCells.filter((c) => c === '█').length).toBeGreaterThan(0);
  expect(lastCells.filter((c) => c === '░').length).toBeGreaterThan(0);
  expect(atOnce).toMatch(/fact-0\s/);
  expect(atOnce).not.toContain('fact-39');
  expect(heightFirst).toBe(atOnce);
  expect(inSteps).toBe(atOnce);
}, 120_000);

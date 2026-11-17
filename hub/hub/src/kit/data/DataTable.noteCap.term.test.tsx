// The toolbar note is capped at about 30% of the terminal's rows and scrolls on its own past that, so a stack of notices
// cannot push the rows away (the web's `.toolbarNote:has([data-band-flush])`: max-block-size 30dvh, overflow-y auto).
// The terminal drew the note whole: eight notices at 24 rows left the table two rows.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { DataTable } from './DataTable';

interface Row { id: string; name: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const cols: ColumnDef<Row, any>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true } }];
const data: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: `row-${i}` }));
const notes = (n: number) => <Box dir="column" shrink={0}>{Array.from({ length: n }, (_, i) => <Box key={i} shrink={0}><Text>{`notice ${i + 1} of ${n}`}</Text></Box>)}</Box>;

async function frame(n: number): Promise<string[]> {
  const t = await drawTest(<FocusRoot><Routed><Box dir="column" height={24}><DataTable label="Bots" data={data} columns={cols} getRowId={(r) => r.id} presentation="table" search={false} toolbarNote={notes(n)} /></Box></Routed></FocusRoot>, { width: 60, height: 24 });
  let f = await t.settle();
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 30)); f = await t.settle(); }
  t.renderer.destroy();
  return f.split('\n').map((l) => l.trimEnd());
}
const count = (ls: string[], re: RegExp) => ls.filter((l) => re.test(l)).length;

test('a note taller than 30% of the rows is capped (7 of 24) and the rows keep their room', async () => {
  const ls = await frame(12);
  expect(count(ls, /notice \d+ of 12/)).toBe(7);
  expect(ls.join('\n')).toContain('notice 1 of 12');
  // The table still shows its first rows, many of them.
  expect(count(ls, /row-\d+/)).toBeGreaterThanOrEqual(10);
}, 30_000);

test('a note within the cap is drawn whole, as before', async () => {
  const ls = await frame(3);
  expect(count(ls, /notice \d+ of 3/)).toBe(3);
  expect(count(ls, /row-\d+/)).toBe(12);
}, 30_000);

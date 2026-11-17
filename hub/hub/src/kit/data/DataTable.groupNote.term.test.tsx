// A group note that is plain content is one calm notice: a grey bar on its start side, inset from the rows (the web's
// `.groupNote:not(:has(> [data-band-flush]))`: notice border, calm bar, calm fill). A note made of flush Bands
// (GroupNotes) draws each Band as its own callout and gets no second frame. Before, a plain note was indented text
// that read like one more row.
import { expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { DataTable, type TableGroup } from './DataTable';
import { GroupNotes } from './GroupNotes';

interface Row { id: string; name: string; g: string }
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
const cols: ColumnDef<Row, any>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', meta: { list: 'primary' } }];
const data: Row[] = [{ id: 'a', name: 'alpha', g: 'one' }, { id: 'b', name: 'bravo', g: 'two' }];
const groups: TableGroup[] = [
  { id: 'one', label: 'One', note: 'Plain words about group one.' },
  { id: 'two', label: 'Two', note: <GroupNotes notes={[{ id: 'n', text: 'A band about group two.' }]} /> },
];
const BAR = /[│┃▏▎▍▌]/;

for (const presentation of ['table', 'list'] as const) {
  test(`${presentation}: a plain group note has a notice bar; a flush-Band note none`, async () => {
    const t = await drawTest(
      <FocusRoot><Routed><DataTable label="Things" presentation={presentation} data={data} columns={cols} getRowId={(r) => r.id} groups={groups} groupBy={(r) => r.g} /></Routed></FocusRoot>,
      { width: 80, height: 20 },
    );
    try {
      await t.settle();
      await new Promise((r) => setTimeout(r, 120));
      const lines = (await t.settle()).split('\n');
      const plain = lines.find((l) => l.includes('Plain words')) ?? '';
      const band = lines.find((l) => l.includes('A band about')) ?? '';
      expect(plain.slice(0, plain.indexOf('Plain words'))).toMatch(BAR);
      expect(band.slice(0, band.indexOf('A band about'))).not.toMatch(BAR);
      expect(lines.findIndex((l) => l.includes('Plain words'))).toBeLessThan(lines.findIndex((l) => l.includes('alpha')));
    } finally { t.renderer.destroy(); }
  }, 30_000);
}

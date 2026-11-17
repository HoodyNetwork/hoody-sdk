// DataTable's rowMark in the terminal: a marked row (an unread notice, the browser in use) draws a dot in its tone's
// colour in the cell after the cursor bar, as the web draws a tinted edge. The cursor and the open row's bar never
// cover it, a list row draws it too, and an unmarked row draws none.
import { afterEach, expect, test } from 'bun:test';
import type { ColumnDef } from '@tanstack/react-table';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { setColourTier, themeMode, TRUECOLOR } from '../../term/prim/tokens';
import { getAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { DataTable, type DataTableProps } from './DataTable';

interface Row { id: string; name: string; state: string; tone?: 'acc' | 'ink' }
const rows: Row[] = [
  { id: 'b', name: 'bravo', state: 'Stopped', tone: 'ink' },
  { id: 'a', name: 'alpha', state: 'Running' },
  { id: 'c', name: 'charlie', state: 'Stopped', tone: 'acc' },
];
const columns: ColumnDef<Row, any>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' } },
  { id: 'state', header: 'State', accessorKey: 'state', meta: { width: '120px', list: 'status' } },
];

/** A memory router around the table (the table keeps sort and page in the URL, as on the web). */
function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createRouter({ routeTree: createRootRoute({ component: () => <>{children}</> }), history: createMemoryHistory({ initialEntries: ['/'] }), origin: 'http://localhost' } as never));
  return <RouterProvider router={router} />;
}
function Table(p: Partial<DataTableProps<Row>>) {
  return <DataTable label="Things" data={rows} columns={columns} getRowId={(r) => r.id} rowMark={(r) => r.tone} {...p} />;
}

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const draw = async (node: ReactNode, width = 60, height = 10): Promise<string> => {
  t = await drawTest(<FocusRoot><Routed>{node}</Routed></FocusRoot>, { width, height });
  return t.settle();
};
const line = (f: string, word: string) => f.split('\n').find((l) => l.includes(word)) ?? '';
/** The colour the dot on the line holding `word` is drawn in, as [r, g, b]. */
function dotColour(f: string, word: string): number[] {
  const y = f.split('\n').findIndex((l) => l.includes(word));
  const span = t!.captureSpans().lines[y]!.spans.find((s) => s.text.includes('•'));
  expect(span).toBeDefined();
  return span!.fg.toInts().slice(0, 3);
}
const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Catches rowMark ignored in the terminal: no row carried any mark (the scenario listed it as look only).
test('table rows: a marked row draws • after the cursor bar, in its tone colour; an unmarked row none', async () => {
  setColourTier('truecolor');
  const f = await draw(<Table />);
  expect(f).toMatch(/Name\s+State/); // drawn as a table, not as list rows
  expect(line(f, 'bravo')).toContain('▌•bravo'); // the cursor row (the first) keeps its mark
  expect(line(f, 'alpha')).not.toContain('•');
  expect(line(f, 'charlie')).toContain('•charlie');
  expect(dotColour(f, 'bravo')).toEqual(rgb(TRUECOLOR[themeMode()].ink));
  expect(dotColour(f, 'charlie')).toEqual(rgb(TRUECOLOR[themeMode()].accText));
  // Decoration, as the web's edge: the rows' names carry no dot.
  const names = getAllByRole(semanticsOf(t!.renderer as unknown as SemRoot), 'row').map((r) => r.name);
  expect(names.some((n) => n.includes('bravo'))).toBe(true);
  expect(names.filter((n) => n.includes('•'))).toEqual([]);
});

// Catches the mark put in the cursor bar's own cell: the cursor (or the open row's bar) would hide it on that row.
test('the cursor and the open row keep the mark beside their bar', async () => {
  let f = await draw(<Table activeId="c" />);
  expect(line(f, 'charlie')).toContain('▌•charlie'); // the cursor starts on the open row
  t!.mockInput.pressKey('k');
  f = await t!.settle();
  expect(line(f, 'alpha')).toContain('▌ alpha');
  expect(line(f, 'charlie')).toContain('│•charlie'); // the open row's bar, then its mark
  expect(line(f, 'bravo')).toContain('•bravo');
  expect(line(f, 'bravo')).not.toContain('▌');
});

test('list rows draw the mark the same way', async () => {
  const f = await draw(<Table presentation="list" />, 40, 12);
  expect(f).not.toMatch(/Name\s+State/); // no column header: list rows
  expect(line(f, 'bravo')).toContain('▌•bravo');
  expect(line(f, 'alpha')).not.toContain('•');
  expect(line(f, 'charlie')).toContain('•charlie');
});

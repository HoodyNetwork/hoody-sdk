// Behaviour contract of DataTable (web and terminal). What a table must do on both, whatever it looks
// like:
// - Row identity: a row is its `getRowId`; selection is a set of ids (`selectedIds` / `onSelectionChange`), never
//   indexes, so a sort, a filter or a streamed update keeps what was picked.
// - Cursor vs selection: the cursor (keyboard focus row) is not the selection; only the row checkbox, Space / x or
//   select-all change the selection. The open row is `activeId` (aria-selected when rows are not pickable).
// - A control inside a row does its own thing and never opens the row.
// - States: error with a retry that calls `onRetry`; empty with the page's own words.
// Terminal-only rules (no web counterpart to assert through roles) are in DataTable.term.test.tsx: the cursor stays on
// the same row id across streamed updates, row heights (1 line, 2 in list rows, an open inline menu adds 1), the
// virtual window (engine nodes do not grow with rows), wheel scrolling moves the cursor into view, "/" focuses search,
// a first click puts the cursor and a second opens (the web opens on one click), focus returns to a closed detail's row
// (ListPane.returnTo), row-menu group separators. Filter chips are FilterChips.scenario.ts.
import { createElement as h, useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { scenarios, ANY } from '../scenario-types';
import { atRoute } from '../layouts/scenarioRoute';
import { DataTable } from './DataTable';
import { Button } from '../controls/Button';

interface Row { id: string; name: string; state: string }
const data: Row[] = [
  { id: 'a', name: 'alpha', state: 'Running' },
  { id: 'b', name: 'bravo', state: 'Stopped' },
  { id: 'c', name: 'charlie', state: 'Running' },
];
const columns: ColumnDef<Row, unknown>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', meta: { pinned: true, list: 'primary' } },
  { id: 'state', header: 'State', accessorKey: 'state', meta: { width: '120px', list: 'status' } },
];
const base = { label: 'Things', data, columns, getRowId: (r: Row) => r.id, sortParam: false as const, pageParam: false as const };
// One router for the life of the case: a controlled case re-mounts with new props on every change, and a new router
// each time would start empty. The route's component draws the latest props.
function Routed({ draw }: { draw: () => ReactElement }): ReactElement {
  const [store] = useState(() => {
    let cur = draw;
    const subs = new Set<() => void>();
    return { get: () => cur, set: (d: () => ReactElement) => { cur = d; subs.forEach((f) => f()); }, sub: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; } };
  });
  useEffect(() => { if (store.get() !== draw) store.set(draw); });
  const [tree] = useState(() => atRoute(() => h(Latest, { store })));
  return tree;
}
function Latest({ store }: { store: { get: () => () => ReactElement; sub: (f: () => void) => () => void } }): ReactElement {
  return useSyncExternalStore(store.sub, store.get)();
}
const routed = (C: unknown, p: unknown) => h(Routed, { draw: () => h(C as never, p as never) });

export default scenarios('DataTable', DataTable as never, {
  ignored: {
    className: 'no CSS classes in a terminal',
    density: 'look only: a terminal row is one line',
    stickyHeader: 'the terminal header never scrolls away (rows scroll under it)',
    maxHeight: 'the terminal table takes the room its parent gives',
    rowClassName: 'no CSS classes in a terminal',
    cardRender: 'cards are drawn as two-line list rows in a terminal (justified in DataTable.term.tsx)',
    rowMark: "read: look only: a marked row draws a dot in the tone's colour after the cursor bar (the web: a tinted edge); the row's words carry the meaning",
    filterBar: "look only: the web toolbar's filter layout (one row or a tier); the terminal toolbar has one layout",
    railTextWord: 'look only: a rail row\'s inline word drawn as text, not a plate; the terminal draws the same words',
    pagerNamed: 'the terminal toolbar already names the count ("23 Bots"); its pager keeps the numbers',
  },
  unsupported: {
    onReorder: 'drag and drop: the terminal moves rows through the row menu (drag.term.tsx), covered in drag tests',
    renderExpanded: 'expanded rows: terminal-covered in DataTable.term.test.tsx (Right/Left); web roles differ (button)',
    onActiveChange: 'follows the cursor after a pause (timer): terminal-covered in DataTable.term.test.tsx',
  },
  cases: [
    {
      name: 'a table named by its label, one row per item',
      props: base,
      mount: routed as never,
      steps: [],
      expect: { nodes: [{ target: { role: 'table', name: 'Things' } }, { target: { role: 'row', name: 'alpha', exact: false } }, { target: { role: 'row', name: 'charlie', exact: false } }] },
    },
    {
      name: 'the row checkbox picks that row by id; the cursor is not the selection',
      props: (s) => ({ ...base, selectable: true, selectedIds: new Set<string>(), onSelectionChange: s.fn('onSelectionChange') }),
      mount: routed as never,
      control: { value: 'selectedIds', onChange: 'onSelectionChange' },
      steps: [{ click: { role: 'checkbox', name: 'Select row', nth: 1 } }],
      expect: {
        calls: { onSelectionChange: [[new Set(['b'])]] },
        nodes: [{ target: { role: 'row', name: 'bravo', exact: false }, states: { selected: true } }, { target: { role: 'row', name: 'alpha', exact: false }, states: { selected: false } }],
      },
    },
    {
      name: 'select all picks every row shown',
      props: (s) => ({ ...base, selectable: true, selectedIds: new Set<string>(), onSelectionChange: s.fn('onSelectionChange') }),
      mount: routed as never,
      control: { value: 'selectedIds', onChange: 'onSelectionChange' },
      steps: [{ click: { role: 'checkbox', name: 'Select all rows' } }],
      expect: { calls: { onSelectionChange: [[new Set(['a', 'b', 'c'])]] }, nodes: [{ target: { role: 'checkbox', name: 'Select all rows' }, states: { checked: true } }] },
    },
    {
      name: 'a control inside a row presses itself and never opens the row',
      props: (s) => ({
        ...base,
        onRowAction: s.fn('onRowAction'),
        columns: [...columns, { id: 'go', header: 'Go', meta: { width: '80px' }, cell: () => h(Button, { onPress: s.fn('go') }, 'Go') }],
      }),
      mount: routed as never,
      steps: [{ click: { role: 'button', name: 'Go', nth: 0 } }],
      expect: { calls: { go: 1, onRowAction: 0 } },
    },
    {
      name: 'Enter on the focused row opens it',
      props: (s) => ({ ...base, onRowAction: s.fn('onRowAction') }),
      mount: routed as never,
      steps: [{ press: { role: 'row', name: 'alpha', exact: false } }],
      expect: { calls: { onRowAction: [[data[0]]] } },
    },
    {
      name: 'a header press sorts by that column; rows keep their ids',
      props: base,
      mount: routed as never,
      steps: [{ click: { role: 'button', name: 'State' } }],
      expect: { nodes: [
        { target: { role: 'row', nth: 1 }, name: /alpha/ },
        { target: { role: 'row', nth: 2 }, name: /charlie/ },
        { target: { role: 'row', nth: 3 }, name: /bravo/ },
      ] },
    },
    {
      name: 'search narrows the rows to the matches',
      props: { ...base, search: true },
      mount: routed as never,
      steps: [{ type: [{ role: 'searchbox', name: 'Search' }, 'char'] }],
      expect: { nodes: [{ target: { role: 'row', name: 'charlie', exact: false } }, { target: { role: 'row', name: 'bravo', exact: false }, absent: true }] },
    },
    {
      name: 'picking rows shows the bulk bar with their actions',
      props: (s) => ({ ...base, selectable: true, selectedIds: new Set<string>(), onSelectionChange: s.fn('onSelectionChange'), bulkActions: (rows: Row[]) => h(Button, { onPress: s.fn('bulk') }, `Stop ${rows.length}`) }),
      mount: routed as never,
      control: { value: 'selectedIds', onChange: 'onSelectionChange' },
      steps: [
        { expect: { nodes: [{ target: { role: 'button', name: /^Stop/ }, absent: true }] } },
        { click: { role: 'checkbox', name: 'Select all rows' } },
        { click: { role: 'button', name: 'Stop 3' } },
      ],
      expect: { calls: { bulk: 1 } },
    },
    {
      name: 'more on the server: Load more calls onLoadMore',
      props: (s) => ({ ...base, total: 10, onLoadMore: s.fn('onLoadMore') }),
      mount: routed as never,
      steps: [{ click: { role: 'button', name: 'Load more' } }],
      expect: { calls: { onLoadMore: 1 } },
    },
    {
      name: 'an error offers Try again, which calls onRetry',
      props: (s) => ({ ...base, data: undefined, error: new Error('down'), onRetry: s.fn('onRetry') }),
      mount: routed as never,
      steps: [{ click: { role: 'button', name: 'Try again' } }],
      expect: { calls: { onRetry: 1 } },
    },
    {
      name: 'nothing yet: the page\'s own empty words',
      props: { ...base, data: [], empty: 'No things yet' },
      mount: routed as never,
      steps: [],
      expect: { nodes: [{ target: { text: 'No things yet' } }] },
    },
  ],
});

void ANY;

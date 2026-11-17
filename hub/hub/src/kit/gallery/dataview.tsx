// /_kit "Data view" tab: useDataView in server mode against a fake
// server with latency, and the URL state the view keys its fetch on. Client mode lives in Tables.
import { fixtureWorld } from '@core/world';
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { DataTable } from '../data/DataTable';
import { useDataView } from '../data/DataTableView';
import { StatusPill, type Tone } from '../data/Display';
import { statusPillMetrics } from '../data/pillMetrics';
import { CodeBlock } from '../data/Ids';
import { Panel } from '../layouts/Layouts';
import { Stack } from '../layouts/Stack';
import { useStrings } from '../strings';
import strings from './dataview.strings.en.json';

interface Item {
  id: string;
  name: string;
  state: string;
  ram: number;
}

const TONE: Record<string, Tone> = { running: 'ok', failed: 'danger' };
const ALL: Item[] = fixtureWorld.computers.map((c) => ({ id: c.name, name: c.name, state: c.status, ram: c.size.ram }));
const PAGE = 5;
const LATENCY = 700;
const col = createColumnHelper<Item>();

/** A stand-in server: search on name, one state filter, sort, page; answers after LATENCY ms. */
function answer(q: string, state: string | undefined, sort: string | undefined, page: number): { rows: Item[]; total: number } {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let rows = ALL.filter((r) => words.every((w) => r.name.toLowerCase().includes(w)) && (!state || state.split(',').includes(r.state)));
  if (sort) {
    const desc = sort.startsWith('-');
    const key = (desc ? sort.slice(1) : sort) as keyof Item;
    rows = [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (desc ? -1 : 1));
  }
  return { rows: rows.slice((page - 1) * PAGE, page * PAGE), total: rows.length };
}

export function DataViewGallery() {
  const t = useStrings(strings);
  const columns = [
    col.accessor('name', { header: t('col.name') }),
    // A pill column sized to its pills: measured in the pill's own type and box.
    col.accessor('state', {
      header: t('col.state'),
      meta: { size: 'fit', fitText: (r) => r.state, fitMetrics: statusPillMetrics() },
      cell: (c) => <StatusPill tone={TONE[c.getValue()] ?? 'neutral'}>{c.getValue()}</StatusPill>,
    }),
    col.accessor('ram', { header: t('col.ram'), cell: (c) => t('gb', { n: c.getValue() }) }),
  ];
  const [data, setData] = useState<{ rows: Item[]; total: number } | undefined>(undefined);
  const view = useDataView<Item>({
    rows: data?.rows,
    columns,
    getRowId: (r) => r.id,
    filters: [{ id: 'state', label: t('filter.state'), kind: 'multi', value: (r) => r.state, options: [...new Set(ALL.map((r) => r.state))].map((v) => ({ value: v, label: v })) }],
    sort: 'name',
    pageSize: PAGE,
    param: 'dv',
    server: { total: data?.total, debounce: 300 },
  });
  const { q, filters, sort, page } = view.query;
  useEffect(() => {
    setData(undefined);
    const timer = setTimeout(() => setData(answer(q, filters.state, sort, page)), LATENCY);
    return () => clearTimeout(timer);
  }, [q, filters.state, sort, page]);

  return (
    <Stack gap={5}>
      <Panel title={t('sec.server')} description={t('sec.serverDesc')} flush>
        <DataTable label={t('sec.server')} columns={columns} view={view} search={t('search')} countLabel={(count) => t('count', { count })} presentation="table" />
      </Panel>
      <Panel title={t('sec.query')} description={t('sec.queryDesc')}>
        <CodeBlock label={t('sec.query')} code={JSON.stringify(view.query, null, 2)} lang="json" />
      </Panel>
    </Stack>
  );
}

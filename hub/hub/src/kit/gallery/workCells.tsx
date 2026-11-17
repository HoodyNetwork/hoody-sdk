// The kit's work-on-its-way cells (kit/data/cells) in the gallery (/_kit?tab=pieces): one
// Transfers table with a download that knows its size (a Meter beside its words), one that does not (words alone), one
// before its first byte, one whose outcome the Hub cannot tell (the kit pill, with Check again as the row's inline
// action; pressing it shows Checking… for a moment), and one done. kit3.tsx mounts it; kit/data/cells.spec.ts reads it.
// The item cell is CellLines: a name with a RowNote under it, a name with a Tag, a long sub-line that
// cuts on its own (a RowNote with cut), and a sub-line part that renders nothing (a ComputerMark with no colour: no line,
// no gap).
import { createColumnHelper } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { ComputerMark } from '../data/ComputerMark';
import { CellLines, checkAgainAction, ProgressCell, progressFit, UnknownCell, type Progress } from '../data/cells';
import { DataTable } from '../data/DataTable';
import { RowNote, StatusPill, Tag } from '../data/Display';
import { AnatomySection } from '../layouts/anatomy/Section';
import { useStrings } from '../strings';
import strings from './workCells.strings.en.json';

interface Row {
  id: string;
  item: 'row.photos' | 'row.backup' | 'row.notes' | 'row.video' | 'row.report';
  progress: Progress | null;
  state: 'running' | 'unknown' | 'done';
}

const MB = 1024 * 1024;
const ROWS: Row[] = [
  { id: 'photos', item: 'row.photos', progress: { done: 38 * MB, total: 50 * MB }, state: 'running' },
  { id: 'video', item: 'row.video', progress: { done: 1200 * MB, total: null }, state: 'running' },
  { id: 'backup', item: 'row.backup', progress: { done: null, total: 900 * MB }, state: 'running' },
  { id: 'notes', item: 'row.notes', progress: null, state: 'unknown' },
];
const DONE: Row = { id: 'done', item: 'row.report', progress: null, state: 'done' };
const col = createColumnHelper<Row>();

export function WorkCellsPieces() {
  const t = useStrings(strings);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!checking) return;
    const id = window.setTimeout(() => setChecking(false), 1500);
    return () => window.clearTimeout(id);
  }, [checking]);
  const columns = [
    col.display({
      id: 'item',
      header: t('col.item'),
      meta: { pinned: true, list: 'primary', listWraps: true, label: t('col.item') },
      cell: (x) => {
        const id = x.row.original.id;
        return (
          <CellLines>
            {t(x.row.original.item)}
            {id === 'photos' && <RowNote>{t('sub.photos')}</RowNote>}
            {id === 'video' && <RowNote cut>{t('sub.video')}</RowNote>}
            {id === 'notes' && <Tag>{t('sub.notes')}</Tag>}
            {id === 'backup' && <ComputerMark color={null} />}
          </CellLines>
        );
      },
    }),
    col.display({
      id: 'progress',
      header: t('col.progress'),
      meta: { list: 'meta', label: t('col.progress'), size: 'fit', ...progressFit((r: Row) => r.progress ?? { done: null }) },
      cell: (x) => (x.row.original.progress ? <ProgressCell name={t(x.row.original.item)} {...x.row.original.progress} /> : null),
    }),
    col.display({
      id: 'state',
      header: t('col.state'),
      meta: { list: 'status', label: t('col.state') },
      cell: (x) => (x.row.original.state === 'unknown' ? <UnknownCell /> : <StatusPill tone={x.row.original.state === 'done' ? 'ok' : 'neutral'}>{t(`state.${x.row.original.state}`)}</StatusPill>),
    }),
  ];
  return (
    <AnatomySection id="work-cells" title={t('title')} state={{ kind: 'ready' }}>
      <div data-gallery="work-cells">
        <DataTable
          label={t('label')}
          data={[...ROWS, DONE]}
          columns={columns}
          getRowId={(r) => r.id}
          actions={(r) => (r.state === 'unknown' ? [checkAgainAction({ onCheck: () => setChecking(true), busy: checking })] : [])}
        />
      </div>
    </AnatomySection>
  );
}

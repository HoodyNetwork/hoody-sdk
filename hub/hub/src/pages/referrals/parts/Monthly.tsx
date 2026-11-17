// The months with earnings in the last 12, newest first, as the API lists them (a month without earnings is not a
// row). Earned includes credit still on hold. The amounts are the kit table's mono cells (tabular numerals); the table
// keeps its own empty state.
import { AnatomySection, createColumnHelper, DataTable, EmptyState, useDataView } from '@kit';
import { commerceRules } from '@core';
import { useMemo } from 'react';
import { monthLabel, type Month } from '../logic';
import type { T } from './types';

const col = createColumnHelper<Month>();

export function Monthly({ t, rows, onRefresh }: { t: T; rows: Month[]; onRefresh: () => void }) {
  const columns = useMemo(
    () => [
      col.accessor('month', { header: t('monthly.month'), meta: { pinned: true }, cell: (c) => monthLabel(c.getValue()) }),
      col.accessor('earned', { header: t('monthly.earned'), meta: { priority: 1, mono: true }, cell: (c) => commerceRules.usdText(c.getValue()) }),
      col.accessor('reversed', { header: t('monthly.reversed'), meta: { priority: 2, mono: true }, cell: (c) => commerceRules.usdText(c.getValue()) }),
    ],
    [t],
  );
  const view = useDataView({ rows, columns, getRowId: (r: Month) => r.month, search: false, param: 'month' });
  return (
    <AnatomySection id="referral-monthly" title={t('monthly.title')} description={t('monthly.caption')} state={{ kind: 'ready' }} flush>
      <DataTable
        label={t('monthly.title')}
        columns={columns}
        view={view}
        search={false}
        noViewMenu
        onRefresh={onRefresh}
        onRowAction={false}
        countLabel={(n) => t('monthly.count', { count: n })}
        empty={<EmptyState size="compact" icon="wallet" title={t('monthly.empty')} />}
      />
    </AnatomySection>
  );
}

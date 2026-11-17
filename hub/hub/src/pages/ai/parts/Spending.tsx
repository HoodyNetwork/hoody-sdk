// Spending: a period, the AI credit line and what each model cost. A cost is shown only when recorded:
// "No cost recorded", never $0.00. The provider's own bill is the final word.
import { createColumnHelper, DataTable, EmptyState, SegmentedControl, Toolbar, useDataView, useSearchParam, useStrings } from '@kit';
import { useMemo } from 'react';
import { useCredit, useSpend } from '../data';
import { creditText, money, spendTable, type Period, type SpendRow } from '../logic';
import strings from '../strings.en.json';
import { useAi } from './ctx';
import s from './parts.module.css';

const col = createColumnHelper<SpendRow>();
const PERIODS: Array<{ id: '7d' | '30d' | 'all'; key: Period }> = [
  { id: '7d', key: 'd7' },
  { id: '30d', key: 'd30' },
  { id: 'all', key: 'all' },
];

export function SpendingSection() {
  const t = useStrings(strings);
  const { m } = useAi();
  // The period is kept in the URL (?period=30d): a reload keeps it; 7 days is the default.
  const [param] = useSearchParam('period');
  const period: Period = PERIODS.find((p) => p.id === param)?.key ?? 'd7';
  const spend = useSpend(period);
  const credit = useCredit();
  const table = useMemo(() => (spend.data ? spendTable(spend.data, m.models) : undefined), [spend.data, m.models]);
  const columns = useMemo(
    () => [
      col.accessor('label', { header: t('spend.model'), meta: { pinned: true }, cell: (c) => <span className={s.truncate}>{c.getValue()}</span> }),
      col.accessor('provider', { header: t('spend.provider'), meta: { priority: 3 }, cell: (c) => <span className={s.truncate}>{c.getValue()}</span> }),
      col.accessor('calls', { header: t('spend.calls'), meta: { priority: 2 }, cell: (c) => <span className={s.num}>{c.getValue()}</span> }),
      col.accessor('rate', { header: t('spend.success'), meta: { priority: 4 }, cell: (c) => <span className={s.num}>{c.getValue() || t('spend.dash')}</span> }),
      col.accessor('cost', { header: t('spend.cost'), meta: { priority: 1 }, cell: (c) => <span className={s.num}>{c.getValue()}</span> }),
    ],
    [t],
  );
  const view = useDataView({ rows: table?.rows, columns, getRowId: (r: SpendRow) => r.id, search: ['label', 'provider'], param: 'spend', isLoading: spend.isPending, error: spend.error ?? undefined });
  return (
    <div className={s.stack}>
      {/* The period on the controls line; the credit note has its own line under it, so loading or an unknown
          balance never moves the controls. AI credit is not on sale yet: the allowance section says so, and nothing here buys it. */}
      <Toolbar
        start={<SegmentedControl label={t('spend.period')} param="period" items={PERIODS.map((p) => ({ id: p.id, label: t(`spend.p.${p.key}` as never) }))} />}
        notice={credit.isPending ? t('spend.creditLoading') : creditText(credit.data)}
      />
      <DataTable
        label={t('spend.title')}
        columns={columns}
        view={view}
        onRefresh={() => void spend.refetch()}
        countLabel={(n) => t('count.model', { count: n })}
        onRetry={() => void spend.refetch()}
        empty={<EmptyState size="compact" icon="wallet" title={t("spend.empty")} />}
        noViewMenu
        presentation="auto"
        groupBy={(r) => (r.other ? 'other' : undefined)}
        groups={[{ id: 'other', label: t('spend.other') }]}
      />
      <p className={`${s.muted} ${s.small}`}>{t('spend.note', { total: money(table?.total) })}</p>
    </div>
  );
}

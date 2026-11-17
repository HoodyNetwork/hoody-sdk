// Security history: the account's sign-ins (GET /users/me/security-history), newest first; Everything adds the refused
// attempts and the other security events. Read only: the server keeps this trail and nobody edits it. A country the
// server could not place says so, never a guessed place.
import { DataTable, EmptyState, ErrorState, StatusPill, When, createColumnHelper, useDataView, useSearchParam, useStrings } from '@kit';
import { useMemo } from 'react';
import { type HistoryEntry, useHistoryPages } from '../data';
import { cleanLabel, historyChannel, historyEventKey } from '../logic';
import strings from '../strings.en.json';
import m from './Mono.module.css';

const col = createColumnHelper<HistoryEntry>();

export function HistorySection() {
  const t = useStrings(strings);
  // The view's own URL key for the required Sign-ins | Everything filter; it picks which list is loaded.
  const [which] = useSearchParam('history');
  const everything = which === 'all';
  const q = useHistoryPages(everything);

  const columns = useMemo(
    () => [
      col.accessor((r) => r.event, {
        id: 'event',
        header: t('h.col.event'),
        meta: { pinned: true },
        cell: (c) => {
          const r = c.row.original;
          const key = historyEventKey(r.event);
          return (
            <span className={m.line}>
              <bdi>{key ? t(key) : cleanLabel(r.event.replace(/_/g, ' '), 40)}</bdi>
              {r.failed && <StatusPill tone="warn">{t('h.refused')}</StatusPill>}
            </span>
          );
        },
      }),
      col.accessor((r) => r.at ?? '', {
        id: 'when',
        header: t('h.col.when'),
        meta: { width: '130px' },
        cell: (c) => {
          const v = c.getValue();
          return v ? <When at={v} /> : '';
        },
      }),
      col.accessor((r) => r.ip ?? '', {
        id: 'where',
        header: t('h.col.where'),
        meta: { width: '200px', mono: true, priority: 2 },
        cell: (c) => {
          const r = c.row.original;
          return [cleanLabel(r.ip, 45), r.country ? cleanLabel(r.country, 8) : t('h.noCountry')].filter(Boolean).join(' · ');
        },
      }),
      // The sessions table's words, which the column also sorts by; a channel the server did not know ("unknown",
      // empty) is the no-value dash. The search still matches the raw channel too.
      col.accessor((r) => historyChannel(r.client, t) ?? '', {
        id: 'client',
        header: t('h.col.client'),
        meta: { width: '110px', priority: 3 },
        cell: (c) => c.getValue() || '—',
      }),
    ],
    [t],
  );

  const view = useDataView<HistoryEntry>({
    rows: q.entries,
    columns,
    getRowId: (r) => r.id,
    search: (r) => [r.event, r.ip ?? '', r.country ?? '', r.client ?? '', historyChannel(r.client, t) ?? ''],
    param: 'hist',
    sort: '-when',
    pageSize: 50,
    more: true,
    filters: [
      {
        id: 'history',
        label: t('h.which'),
        display: 'segmented',
        required: true,
        defaultValue: 'signins',
        // Which list to load; the rows are not filtered by it.
        apply: false,
        options: [
          { value: 'signins', label: t('h.signins') },
          { value: 'all', label: t('h.all') },
        ],
        value: () => '',
      },
    ],
    isLoading: q.isPending,
    error: q.error,
  });

  return (
    <>
      <DataTable
        label={t('h.title')}
        view={view}
        columns={columns}
        onRetry={() => void q.refetch()}
        onRefresh={() => void q.refetch()}
        countLabel={(n) => t('count.events', { count: n })}
        fill={false}
        noViewMenu
        empty={<EmptyState icon="lock" size="sm" title={t('h.none')} />}
      />
      {q.moreError && <ErrorState size="sm" title={t('h.moreFailed')} error={q.moreError} onRetry={() => void q.refetch()} />}
      {q.capped && <p className={m.help}>{t('h.capped')}</p>}
    </>
  );
}

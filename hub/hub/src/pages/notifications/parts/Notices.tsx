// The Notices view of the notifications page: the notices Hoody sent
// this account about one of its servers. A table (useDataView + DataTable: search, a status filter, sort, paging and
// the open row live in the URL) and, for the open row, a drawer with the notice, its messages and the reply box
// (NoticeDrawer). It shows only what the owner answer carries.
import {
  AnatomySection,
  DataTable,
  EmptyState,
  ListDetailPage,
  NoAccessState,
  createColumnHelper,
  formatRelative,
  useDataView,
  useSelection,
  useStrings,
  type DataView,
} from '@kit';
import { useMemo } from 'react';
import { useAbuseAccount, useAbuseNotices, type NoticeList } from '../abuse';
import { useUnreadCount } from '../data';
import type { AbuseNotice } from '../abuseLogic';
import strings from '../strings.en.json';
import { NoticeDrawer, NoticeStatus } from './NoticeDrawer';
import { usePageViews } from './PageTabs';
import { SignOutAction } from './SignOutAction';

const col = createColumnHelper<AbuseNotice>();

function useNoticeColumns() {
  const t = useStrings(strings);
  return useMemo(
    () => [
      col.accessor('title', {
        header: t('an.col.title'),
        meta: { pinned: true, minWidth: 220, size: 'fill', list: 'primary' },
      }),
      // Server outranks Updated: the same notice title repeats, and the server is what tells those rows apart.
      col.accessor((n) => n.serverLabel ?? t('an.serverUnknown'), {
        id: 'server',
        header: t('an.col.server'),
        meta: { width: '160px', size: 'fit', fitText: (n: AbuseNotice) => n.serverLabel ?? t('an.serverUnknown'), priority: 1, list: 'meta' },
      }),
      col.accessor('status', {
        header: t('an.col.status'),
        meta: { width: '112px', size: 'fit', fitText: (n: AbuseNotice) => t(n.status === 'open' ? 'an.status.open' : 'an.status.resolved'), fitPad: 32, priority: 1, list: 'status' },
        cell: (c) => <NoticeStatus status={c.getValue()} />,
      }),
      col.accessor('updatedAt', {
        id: 'updated',
        header: t('an.col.updated'),
        meta: { width: '112px', size: 'fit', fitText: (n: AbuseNotice) => (n.updatedAt ? formatRelative(n.updatedAt) : t('an.timeUnknown')), priority: 2, list: 'meta' },
        cell: (c) => {
          const v = c.getValue();
          return v ? formatRelative(v) : t('an.timeUnknown');
        },
      }),
    ],
    [t],
  );
}

export function Notices() {
  const t = useStrings(strings);
  const account = useAbuseAccount();
  const list = useAbuseNotices();
  const [selected, select] = useSelection();
  const unread = useUnreadCount();

  const columns = useNoticeColumns();

  const rows = list.data?.rows;
  const view = useDataView<AbuseNotice>({
    rows: rows as AbuseNotice[] | undefined,
    columns,
    getRowId: (n) => n.id,
    search: (n) => [n.title, n.serverLabel ?? ''],
    filters: [
      {
        id: 'status',
        label: t('an.filter.status'),
        value: (n) => n.status,
        options: [
          { value: 'open', label: t('an.status.open') },
          { value: 'resolved', label: t('an.status.resolved') },
        ],
      },
    ],
    sort: '-updated',
    pageSize: 25,
    isLoading: account && list.isPending,
    error: list.error,
  });

  const total = list.data?.total;
  // Only when the list stopped at its page cap (MAX_PAGES) with more left: every notice is read otherwise.
  const capped = list.data?.capped ? list.data : undefined;
  const shown = rows?.find((n) => n.id === selected);
  const views = usePageViews('notices', unread);

  return (
    <>
      <ListDetailPage
        mode="side"
        header={{ title: t('title'), subtitle: t('an.lead') }}
        views={views}
        // A shared-access session: where the notices are, and the way out (Inbox's own control; Leave in the terminal).
        list={account ? <NoticesTable view={view} columns={columns} total={total} capped={capped} onReload={() => void list.refetch()} /> : <NoAccessState title={t('an.noTokenTitle')} body={t('an.noToken')} action={<SignOutAction />} />}
        detail={null}
      />
      {account && <NoticeDrawer id={selected} title={shown?.title} onClose={() => select(undefined)} />}
    </>
  );
}

function NoticesTable({ view, columns, total, capped, onReload }: { view: DataView<AbuseNotice>; columns: ReturnType<typeof useNoticeColumns>; total: number | undefined; capped: NoticeList | undefined; onReload: () => void }) {
  const t = useStrings(strings);
  return (
    <AnatomySection id="notices-list" title={t('an.s.list')} state={{ kind: 'ready' }} flush>
      <DataTable
        // No total yet (loading, or the list did not load): name the list without a count, never "0 in all".
        label={total === undefined ? t('an.listName') : t('an.list', { n: total })}
        view={view}
        columns={columns}
        countLabel={(n) => (capped ? t('an.countOf', { n, total: capped.total }) : t('an.count', { count: n }))}
        onRetry={onReload}
        onRefresh={onReload}
        noMatch={t('an.noMatch')}
        storageKey="notifications-notices"
        fill
        {...(capped ? { toolbarNote: t('an.showing', { n: capped.rows.length, total: capped.total }) } : {})}
        empty={<EmptyState icon="check-circle" title={t('an.none')} body={t('an.noneBody')} />}
      />
    </AnatomySection>
  );
}

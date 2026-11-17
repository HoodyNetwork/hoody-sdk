// The Support page: your tickets with support, a thread per ticket and
// a New ticket drawer. The list: one exact API filter per segment (a filter change reads page one again,
// the cursor is bound to its filter), search over the loaded subjects only, Load more while a cursor comes back and no
// total (the API sends none). The thread is parts/Thread.tsx, the drawer parts/NewTicket.tsx.
// Account-wide and member-only: a token session, a realm sign-in or a staff account sees why instead.
import {
  Band,
  Button,
  DataTable,
  ErrorState,
  FirstUseState,
  ListDetailPage,
  NoAccessState,
  Stack,
  StatusPill,
  TextButton,
  createColumnHelper,
  followPageLink,
  formatRelative,
  useDataView,
  useDrawerParam,
  useGo,
  usePageLink,
  useSearchParam,
  useStrings,
  type ViewFilter,
} from '@kit';
import { useEffect, useMemo, useState } from 'react';
import { useUnreadCount } from './count';
import { pageFaq } from './faq';
import { useTickets } from './data';
import { categoryKey, noAccessOf, type Ticket, type TicketStatus } from './logic';
import { NewTicket } from './parts/NewTicket';
import s from './parts/parts.module.css';
import { TicketStatus as StatusOf } from './parts/Status';
import { Thread } from './parts/Thread';
import strings from './strings.en.json';

type Filter = 'all' | TicketStatus;
const FILTERS: readonly Filter[] = ['all', 'waiting_user', 'open', 'closed'];
const FILTER_KEY = { all: 'filter.all', waiting_user: 'filter.waitingYou', open: 'filter.waitingSupport', closed: 'filter.closed' } as const;
const col = createColumnHelper<Ticket>();

export default function SupportPage() {
  const t = useStrings(strings);
  const [raw, setRaw] = useSearchParam('status');
  const filter: Filter = FILTERS.includes(raw as Filter) ? (raw as Filter) : 'all';
  const status = filter === 'all' ? null : filter;
  const list = useTickets(status);
  const unread = useUnreadCount();
  const [newOpen, openNew, closeNew] = useDrawerParam('new');
  const [followUp, setFollowUp] = useState<Ticket | undefined>(undefined);
  // A created ticket to open once the drawer has closed: the close may step back in history, which lands later, so
  // opening it at once would race the close, and the drawer's guard would ask to discard what was just sent.
  const [openAfterClose, setOpenAfterClose] = useState<string | null>(null);
  const guideLink = usePageLink('guide');
  const go = useGo();

  // A Load more cursor the server no longer takes (INVALID_CURSOR): start again from page one, on its own once per
  // visit to a filter (any filter change, back to an earlier one too, gives the next visit its own). A refusal after
  // that is the partial band's error, whose Try again starts again from page one too (reading the refused cursor
  // again cannot help).
  const [restartedFor, setRestartedFor] = useState<Filter | null>(null);
  const [visiting, setVisiting] = useState<Filter>(filter);
  if (visiting !== filter) {
    setVisiting(filter);
    setRestartedFor(null);
  }
  const refused = list.cursorRefused;
  const { restart } = list;
  useEffect(() => {
    if (refused && restartedFor !== filter) {
      setRestartedFor(filter);
      restart();
    }
  }, [refused, restartedFor, filter, restart]);

  const unreadDot = useMemo(() => <span className={s.unreadDot} role="img" aria-label={t('unread')} />, [t]);
  const columns = useMemo(
    () => [
      col.display({
        id: 'lead',
        header: t('col.subject'),
        enableSorting: false,
        meta: { list: 'lead', table: false },
        cell: (c) => (c.row.original.unread ? unreadDot : null),
      }),
      col.accessor('subject', {
        header: t('col.subject'),
        meta: { pinned: true },
        // The dot's slot is drawn on every row (empty on a read one, as wide as the dot), so every subject starts in
        // one column; the list presentation hides the slot (its lead column draws the dot).
        cell: (c) => (
          <span className={c.row.original.unread ? `${s.subject} ${s.unread}` : s.subject}>
            <span data-lead-dup="" className={c.row.original.unread ? undefined : s.dotSlot}>
              {c.row.original.unread ? unreadDot : null}
            </span>
            {c.getValue()}
          </span>
        ),
      }),
      col.accessor('category', {
        header: t('col.category'),
        meta: { width: '140px', priority: 3 },
        cell: (c) => <StatusPill tone="neutral">{t(categoryKey(c.getValue()))}</StatusPill>,
      }),
      col.accessor('status', { header: t('col.status'), meta: { width: '180px', priority: 1 }, cell: (c) => <StatusOf ticket={c.row.original} /> }),
      col.accessor('lastMessageAt', { header: t('col.last'), meta: { width: '140px', priority: 2 }, cell: (c) => formatRelative(c.getValue()) }),
    ],
    [t, unreadDot],
  );

  // The status filter is the table's own segmented filter (it folds into Filters when the list pane is narrow, as on
  // every list page). It only picks what to load: each value is one exact API filter, read from ?status above.
  const filters = useMemo<ViewFilter<Ticket>[]>(
    () => [
      {
        id: 'status',
        label: t('filter.status'),
        display: 'segmented',
        required: true,
        defaultValue: 'all',
        apply: false,
        value: () => filter,
        options: FILTERS.map((f) => ({ value: f, label: t(FILTER_KEY[f]) })),
      },
    ],
    [t, filter],
  );
  const view = useDataView<Ticket>({
    rows: list.rows,
    columns,
    getRowId: (r) => r.id,
    search: ['subject'],
    filters,
    isLoading: list.isPending,
    error: list.error,
  });

  useEffect(() => {
    if (openAfterClose === null || newOpen !== undefined) return;
    setOpenAfterClose(null);
    view.open(openAfterClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the close has landed, not on every view change
  }, [openAfterClose, newOpen]);

  const created = (ticket: Ticket | undefined) => {
    if (ticket) setOpenAfterClose(ticket.id);
    closeNew();
    setFollowUp(undefined);
  };
  const startNew = (from?: Ticket) => {
    setFollowUp(from);
    openNew('1');
  };

  if (!list.account) return <NoAccessState body={t('access.signIn')} />;
  const err = list.error as { code?: string | null; status?: number | null } | null;
  const no = err ? noAccessOf(err.code, err.status) : null;
  if (no) return <NoAccessState body={t(`access.${no}`)} />;

  const isEmpty = filter === 'all' && list.rows?.length === 0 && !list.nextCursor;
  const loadedNote = list.rows ? t('loaded', { count: list.rows.length }) : null;
  return (
    <>
      <ListDetailPage
        mode="fill"
        storageKey="support"
        faq={{ items: pageFaq(t).items }}
        header={{
          title: t('title'),
          subtitle: t('subtitle'),
          primary: isEmpty ? undefined : { label: t('action.new'), icon: 'plus', onPress: () => startNew() },
          // An open ticket's reply box owns the one filled button (Send); New ticket stays, quiet.
          primaryQuiet: view.activeId !== undefined,
        }}
        toolbar={
          // The list's own notes are its notices, above it (not loose lines over both panes).
          list.dropped > 0 || (unread === null && list.rows) ? (
            <Stack gap={2}>
              {list.dropped > 0 && <Band tone="neutral">{t('list.dropped')}</Band>}
              {unread === null && list.rows && <Band tone="neutral">{t('list.badgePartial')}</Band>}
            </Stack>
          ) : undefined
        }
        banner={list.partial ? <ErrorState size="compact" title={t('list.partial')} error={list.partialError} onRetry={list.retryPartial} /> : undefined}
        list={
          <div className={s.listWrap}>
            <DataTable
              label={t('title')}
              columns={columns}
              view={view}
              onRetry={list.refetch}
              onRefresh={list.refetch}
              noMatch={t('noMatch')}
              countLabel={(n) => t('count', { count: n })}
              onRowAction={(r) => view.open(r.id)}
              storageKey="support"
              search={t('search')}
              empty={
                <FirstUseState
                  icon="mail"
                  title={filter === 'all' ? t('empty.title') : t(`empty.${filter}`)}
                  body={filter === 'all' ? t('empty.body') : t('empty.filteredBody')}
                  action={
                    // No ticket at all: the first step. An empty status only: the way back to every ticket (New ticket
                    // stays the header's one filled button).
                    filter === 'all' ? (
                      <Button variant="primary" icon="plus" onPress={() => startNew()}>
                        {t('action.new')}
                      </Button>
                    ) : (
                      <Button onPress={() => setRaw(undefined)}>{t('empty.showAll')}</Button>
                    )
                  }
                  {...(guideLink && filter === 'all'
                    ? {
                        learn: <TextButton onPress={() => followPageLink(guideLink, go)}>{t('empty.learn')}</TextButton>,
                      }
                    : {})}
                />
              }
            />
            {list.rows && list.rows.length > 0 && (
              <div className={s.listFoot}>
                <span className={s.note}>
                  {loadedNote}
                  {view.query.q ? ` · ${t('search.note', { count: list.rows.length })}` : ''}
                </span>
                {list.nextCursor && (
                  <Button size="sm" onPress={list.loadMore} busy={list.loadingMore}>
                    {t('action.loadMore')}
                  </Button>
                )}
              </div>
            )}
          </div>
        }
        detail={view.activeId === undefined ? null : <Thread key={view.activeId} id={view.activeId} onBack={() => view.open(undefined)} onNewTicket={startNew} />}
      />
      {newOpen !== undefined && <NewTicket key={followUp?.id ?? 'new'} onClose={() => (closeNew(), setFollowUp(undefined))} onCreated={created} {...(followUp ? { followUp } : {})} />}
    </>
  );
}

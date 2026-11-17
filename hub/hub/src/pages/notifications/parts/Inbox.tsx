// The Inbox: a table of notices (unread or archive) with search, a type filter and "needs a look", and the
// kit's side inspector for the selected one (ListDetailPage mode side). The selection, box
// and filters live in the URL, so Back and deep links work. Opening an unread notice marks it read; a mark-read
// whose outcome is unknown says so wherever the page shows it, from core's lock (a read-back settles it; it is
// never resent blindly).
import {
  Button,
  DataTable,
  SR_ONLY,
  DetailHeader,
  EmptyState,
  FaqLink,
  Icon,
  Link,
  ListDetailPage,
  NoAccessState,
  OutcomeSlot,
  Stack,
  StatusPill,
  When,
  createColumnHelper,
  formatDateTime,
  formatRelative,
  NotifyHint,
  useDataView,
  useGo,
  usePageLink,
  useSearchParam,
  useSelection,
  usePendingToast,
  useStrings,
  type PageLink,
  type RowActionEntry,
  type ViewFilter,
} from '@kit';
import { hubSiteOrigin } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Box,
  type Change,
  type Notice,
  useAccountId,
  useMarkAllRead,
  useMarkRead,
  useNotices,
  usePendingReadAll,
  usePendingReads,
  useReadAllHolds,
  useReadHolds,
} from '../data';
import { pageFaq } from '../faq';
import { ForgetHold, ForgetReadAll } from './ForgetReadAll';
import { GROUPS, groupOf, needsLook, noticePlainText, readAllShown } from '../logic';
import strings from '../strings.en.json';
import { links } from '../links';
import { PageTabs } from './PageTabs';
import { SignOutAction } from './SignOutAction';
import s from './Inbox.module.css';
import { hintRow, noticeMessage } from './noticeBits';

const col = createColumnHelper<Notice>();
const SEV_ICON = {
  ERROR: 'error',
  WARNING: 'warn',
  SUCCESS: 'check-circle',
  INFO: 'info',
} as const;

// The severity icon's colour is the kit Icon's own tone.
const SEV_TONE = {
  ERROR: 'danger',
  WARNING: 'warn',
  SUCCESS: 'ok',
  INFO: 'muted',
} as const;
/** On a read row the error and warning marks step down to the kit's quiet tones (still 3:1 on the card): the row is
 *  quiet, the severity still shows. */
const READ_SEV_TONE = { ...SEV_TONE, ERROR: 'dangerQuiet', WARNING: 'warnQuiet' } as const;

/** A page link as a kit Link href: Hub paths go through the router. Any other link is resolved against the origin
 *  whose /auth/ pages are this Hub (core hubSiteOrigin); '' while none is chosen: link nothing. (A PageLink is a Hub
 *  link only now, so the other branch is not taken today.) */
export function linkHref(l: PageLink): string {
  if (l.kind === 'hub') return l.href;
  const origin = hubSiteOrigin();
  return origin ? new URL((l as { href: string }).href, origin).href : '';
}

/** Each notice's last acknowledgement, shown where it was pressed (C9). Pending ones are core's (its lock per
 * notice outlives this page: a tab or realm switch, a press still in flight when the page was left); this page
 * keeps only the answers it saw, done or failed, one per row (insertion order = newest last). */
type AckKind = 'done' | 'pending' | 'failed';
type Seen = Readonly<Record<string, 'done' | 'failed'>>;
const PENDING = { kind: 'pending' } as const;
// The text of a stopped-computer notice names the Computers page and the logs: link exactly what it names.
const NAMES_COMPUTERS = /\bComputers\b/;
const NAMES_LOGS = /\blogs\b/i;

export function Inbox() {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const go = useGo();
  const [boxParam, setBox] = useSearchParam('box');
  const box: Box = boxParam === 'archive' ? 'archive' : 'unread';
  const [selected, select] = useSelection();

  const unread = useNotices('unread');
  const archive = useNotices('archive');
  const list = box === 'unread' ? unread : archive;
  // A notice read in this view keeps its row (as read) until the box changes, so the inspector and j/k
  // never lose their place; the server's list (and every count) already says it is read.
  const [kept, setKept] = useState<Notice[]>([]);
  // Another box closes the open notice and forgets the kept rows (not on the first render: a deep link keeps ?sel).
  const shownBox = useRef(box);
  useEffect(() => {
    if (shownBox.current === box) return;
    shownBox.current = box;
    setKept([]);
    select(undefined, { replace: true });
  }, [box, select]);
  const rows = useMemo(() => {
    const live = list.data?.rows;
    if (!live || box !== 'unread' || kept.length === 0) return live;
    const ids = new Set(live.map((n) => n.id));
    return [...live, ...kept.filter((n) => !ids.has(n.id))];
  }, [list.data?.rows, kept, box]);
  const keptShown = rows && list.data ? rows.length - list.data.rows.length : 0;
  // The text of a stopped-computer notice points at Computers and the logs: link each one this load serves; no
  // link for a hidden page.
  const computersLink = usePageLink('computers');
  const logsLink = usePageLink('logs');
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const account = useAccountId().data?.id ?? '';
  const pendingIds = usePendingReads();
  const readHolds = useReadHolds();
  const allHolds = useReadAllHolds();
  const [seen, setSeen] = useState<Seen>({});
  const setAck = (id: string, kind: 'done' | 'failed' | null) =>
    setSeen((a) => {
      const { [id]: _drop, ...rest } = a;
      return kind ? { ...rest, [id]: kind } : rest;
    });
  const ackOf = (id: string): AckKind | undefined => (pendingIds.includes(id) ? 'pending' : seen[id]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [allState, setAll] = useState<'done' | 'pending' | 'failed' | null>(null);
  const asked = useRef(new Set<string>());

  const current = selected
    ? [...(rows ?? []), ...(unread.data?.rows ?? []), ...(archive.data?.rows ?? [])].find((n) => n.id === selected)
    : undefined;
  const unreadTotal = unread.data?.total;

  const typeLabel = (n: Notice) => {
    const g = groupOf(n);
    return g === 'other' ? t('h.group.other') : t(`h.group.${g}.short`);
  };

  const titleOf = (id: string) => {
    const n = [...(unread.data?.rows ?? []), ...(archive.data?.rows ?? [])].find((x) => x.id === id);
    return n?.title || t('untitled');
  };
  // One request per press; a pending one locks that notice's button until a fresh list proves it (core refuses a
  // resend).
  // Records one answer for notice `id`; the kind it shows, or null when nothing changed (BUSY: the earlier press
  // of the same change is still in flight, and its own answer will be recorded).
  const record = (id: string, r: Change): AckKind | null => {
    if (r.outcome === 'done') {
      setAck(id, 'done');
      const n = unread.data?.rows.find((x) => x.id === id);
      if (n) setKept((k) => [...k.filter((x) => x.id !== id), { ...n, read: true }]);
      return 'done';
    }
    if (r.code === 'BUSY') return null;
    // Pending: core holds the lock and shows it (usePendingReads); an older answer of this row gives way.
    if (r.outcome === 'pending' || r.code === 'READ_BACK_FIRST') {
      setAck(id, null);
      return 'pending';
    }
    setAck(id, 'failed');
    return 'failed';
  };
  // `opened`: the mark that opening an unread notice sends on its own. Core may refuse it before anything is sent (a page
  // shown inside another page, a session without the right): the person asked for nothing, so it draws nothing and the
  // Mark read button stays. A press of that button still says what became of it.
  const ack = async (id: string, opened = false) => {
    asked.current.add(id); // every press counts as the ask: opening the row afterwards must not send a second one
    const r = await markRead.run(id);
    if (opened && r.outcome === 'not_sent' && r.code !== 'READ_BACK_FIRST') return;
    record(id, r);
  };
  // A fresh read frees (in core) each mark that was pending when it began and that the list proves
  // (markReadProves); one that went pending meanwhile, or that the list cannot prove, stays. True only when every
  // pending mark was proved.
  const checkAck = () => markRead.readBack();
  const checkAll = async () => {
    const proved = await markAll.readBack();
    if (proved) setAll(null);
    return proved;
  };
  // The hold is core's, shared with the Home widget: a Mark all read pressed there shows here too.
  const allHeld = usePendingReadAll();
  const allShown = allHeld ? 'pending' : allState === 'pending' ? null : allState;
  // Leaving the page while one may have gone through moves it to the sticky Check again toast (the row slots
  // themselves move between the list and the inspector, which is no leaving).
  usePendingToast(pendingIds.length > 0 ? PENDING : null, checkAck);
  // What this page saw belongs to the account it was shown for.
  useEffect(() => {
    setSeen({});
    setKept([]);
    setAll(null);
    asked.current.clear();
  }, [account]);
  const currentAck = current ? ackOf(current.id) : undefined;
  // Rows not open in the inspector: every one that may have gone through (pending outranks failed), and the
  // newest failure.
  const rowPending = pendingIds.filter((id) => id !== current?.id);
  const rowFailed = Object.entries(seen)
    .filter(([id, k]) => k === 'failed' && id !== current?.id && !pendingIds.includes(id))
    .pop()?.[0];

  // Opening an unread notice marks it read, once.
  useEffect(() => {
    if (!current || current.read || asked.current.has(current.id)) return;
    asked.current.add(current.id);
    void ack(current.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one ask per notice id
  }, [current?.id, current?.read]);

  const readAll = async () => {
    const shown = readAllShown(await markAll.run());
    if (shown) setAll(shown);
  };

  const columns = useMemo(
    () => [
      col.accessor('severity', {
        header: t('col.severity'),
        meta: {
          width: '56px',
          label: t('col.severity'),
          priority: 1,
          list: 'lead',
        },
        cell: (c) => (
          <span className={s.sev}>
            {/* The row's edge bar (rowMark) is the visible unread mark; this names it for a screen reader. */}
            {!c.row.original.read && <span className={SR_ONLY} role="img" aria-label={t('unreadDot')} />}
            <Icon name={SEV_ICON[c.getValue()]} tone={(c.row.original.read ? READ_SEV_TONE : SEV_TONE)[c.getValue()]} size="sm" label={t(`sev.${c.getValue()}`)} />
          </span>
        ),
      }),
      col.accessor('title', {
        header: t('col.title'),
        // Measured columns: Title, Type and When take their words' width (their declared
        // widths stay their floors), Message takes the rest. An unread title is bold: fitPad allows for the heavier face.
        meta: { pinned: true, minWidth: 240, size: 'fit', fitText: (n: Notice) => n.title || t('untitled'), fitPad: 8, list: 'primary' },
        cell: (c) => (
          <span className={c.row.original.read ? `${s.ellipsis} ${s.readText}` : `${s.ellipsis} ${s.unreadTitle}`} data-read-text={c.row.original.read || undefined}>
            <bdi>{c.getValue() || t('untitled')}</bdi>
          </span>
        ),
      }),
      col.accessor('message', {
        header: t('col.message'),
        // A floor for the message: where the row cannot give it 192 px, Kind (priority 3) leaves first,
        // then the message itself (it is in the notice's detail), rather than cutting every message after two words.
        meta: { priority: 2, size: 'fill', minWidth: 192, list: 'meta' },
        cell: (c) => (
          <span className={c.row.original.read ? `${s.ellipsis} ${s.readText}` : s.ellipsis} data-read-text={c.row.original.read || undefined}>
            <bdi>{noticePlainText(c.getValue())}</bdi>
          </span>
        ),
      }),
      col.accessor((n) => groupOf(n), {
        id: 'type',
        header: t('col.type'),
        meta: { width: '100px', size: 'fit', fitText: (n: Notice) => typeLabel(n), priority: 3, list: 'meta' },
        cell: (c) => typeLabel(c.row.original),
      }),
      col.accessor((n) => n.at ?? '', {
        id: 'when',
        header: t('col.when'),
        meta: { width: '112px', size: 'fit', fitText: (n: Notice) => (n.at ? formatRelative(n.at) : ''), priority: 1, list: 'status' },
        cell: (c) => {
          const v = c.getValue();
          return v ? <When at={v} /> : '';
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- typeLabel reads only t
    [t],
  );

  const noneAtAll = unread.data?.total === 0 && archive.data?.total === 0;
  const view = useDataView<Notice>({
    rows,
    columns,
    getRowId: (n) => n.id,
    search: (n) => [n.title, noticePlainText(n.message), typeLabel(n)],
    filters: [
      // Unread | Archive picks the list read (?box, default unread): a required choice the rows are not filtered by.
      // With no notice in either box there is nothing to switch: without it the kit shows the page-area empty
      // state with no toolbar.
      ...(noneAtAll
        ? []
        : ([
            {
              id: 'box',
              label: t('which'),
              display: 'segmented',
              required: true,
              defaultValue: 'unread',
              apply: false,
              value: () => box,
              options: [
                { value: 'unread', label: t('unread') },
                { value: 'archive', label: t('archive') },
              ],
            },
          ] satisfies ViewFilter<Notice>[])),
      {
        id: 'type',
        label: t('h.filter.type'),
        value: (n) => groupOf(n),
        options: GROUPS.map((g) => ({
          value: g.id,
          label: t(`h.group.${g.id}.short`),
        })),
      },
      {
        id: 'look',
        label: t('h.filter.look'),
        value: (n) => (needsLook(n) ? '1' : '0'),
        options: [{ value: '1', label: t('h.filter.lookOnly') }],
      },
    ],
    sort: '-when',
    pageSize: 25,
    isLoading: list.isPending,
    error: list.error,
  });

  // A row action that may or did not go through, for a row that is not open in the inspector.
  const rowNotice =
    rowPending.length > 0 || rowFailed ? (
      <>
        {rowPending.length > 0 && (
          <OutcomeSlot
            outcome="pending"
            detail={
              rowPending.length === 1
                ? t('pendingNamed', { title: titleOf(rowPending[0] as string) })
                : t('pendingMany', { count: rowPending.length })
            }
            toastOnLeave={false}
            wrap
            onCheck={checkAck}
          >
            {null}
          </OutcomeSlot>
        )}
        {rowPending.length === 1 && <ForgetHold key={rowPending[0]} what="forgetOne" overlayId="notifications-forget-row" holds={readHolds.has(rowPending[0] as string) ? [readHolds.get(rowPending[0] as string) as string] : []} onForget={([hold]) => markRead.forget({ id: rowPending[0] as string, hold: hold as string })} />}
        {rowFailed && (
          <OutcomeSlot
            outcome="failed"
            detail={t('failedNamed', { title: titleOf(rowFailed) })}
            toastOnLeave={false}
            wrap
            onRetry={() => void ack(rowFailed)}
          >
            {null}
          </OutcomeSlot>
        )}
      </>
    ) : null;

  const showComputers = !!computersLink && !!current && NAMES_COMPUTERS.test(current.message);
  const showLogs = !!logsLink && !!current && NAMES_LOGS.test(current.message);
  const detail = current ? (
    <>
      <DetailHeader
        title={<bdi>{current.title || t('untitled')}</bdi>}
        status={
          <StatusPill
            tone={current.severity === 'ERROR' ? 'danger' : current.severity === 'WARNING' ? 'warn' : current.severity === 'SUCCESS' ? 'ok' : 'info'}
          >
            {t(`sev.${current.severity}`)}
          </StatusPill>
        }
        meta={
          <>
            <span>{typeLabel(current)}</span>
            {current.at && <time dateTime={current.at}>{formatDateTime(current.at)}</time>}
          </>
        }
        actions={
          // One place per answer: once the mark-read has one (pending: Check again, failed: Try again), it is
          // the line below, not a second button here.
          !current.read &&
          !currentAck && (
            <Button size="sm" busy={markRead.running} onPress={() => void ack(current.id)}>
              {t('read')}
            </Button>
          )
        }
      />
      <Stack gap={4} padding="page">
        {currentAck && (
          // The mark-read's answer, under the header that holds its button (details have no footer).
          <OutcomeSlot
            className={s.ackSlot}
            outcome={currentAck}
            detail={
              currentAck === 'pending'
                ? t('pendingNamed', { title: titleOf(current.id) })
                : currentAck === 'failed'
                  ? t('failedNamed', { title: titleOf(current.id) })
                  : undefined
            }
            doneText={t('ack.readDone')}
            // Stays for as long as the notice is open: a line that left after its flash pulled the message up by 48 px mid-read.
            doneFor={Infinity}
            toastOnLeave={false}
            wrap
            onCheck={checkAck}
            onRetry={() => void ack(current.id)}
          >
            {null}
          </OutcomeSlot>
        )}
        {currentAck === 'pending' && <ForgetHold key={current.id} what="forgetOne" overlayId="notifications-forget-detail" holds={readHolds.has(current.id) ? [readHolds.get(current.id) as string] : []} onForget={([hold]) => markRead.forget({ id: current.id, hold: hold as string })} />}
        {needsLook(current) && <span className={s.metaRow}>{t('inspector.needsLook')}</span>}
        {noticeMessage(current.message)}
        {groupOf(current) === 'machines' && needsLook(current) && (showComputers || showLogs) && (
          <p className={s.metaRow}>
            {showComputers && computersLink && linkHref(computersLink) && (
              <Link variant="nav" href={linkHref(computersLink)}>
                {t('inspector.openComputers')}
              </Link>
            )}
            {showLogs && logsLink && linkHref(logsLink) && (
              <Link variant="nav" href={linkHref(logsLink)}>
                {t('inspector.openLogs')}
              </Link>
            )}
          </p>
        )}
      </Stack>
    </>
  ) : null;
  const rowEntries = (n: Notice): RowActionEntry[] =>
    n.read
      ? []
      : [
          {
            id: 'read',
            label: t('read'),
            icon: 'check',
            hover: true,
            key: 'm',
            isDisabled: ackOf(n.id) === 'pending',
            ...(ackOf(n.id) === 'pending' ? { disabledReason: t('readHeld') } : {}),
            onAction: () => void ack(n.id),
          },
        ];

  // A shared-access (token) session: core refuses the account's notices unsent, so Try again could never work; say
  // where they are instead, as Keys and Vault do. The page keeps its frame (title, subtitle); the notice is the list.
  const refused = list.error?.code;
  // The tabs stay (one toolbar for both states): Learn reads nothing of the account, and Notices says the same as this.
  const noAccess = refused === 'TOKEN_SESSION_REFUSED' || refused === 'TOKEN_LACKS';

  const total = box === 'unread' ? unreadTotal : list.data?.total;
  const capped = list.data !== undefined && list.data.total > list.data.rows.length && box === 'unread' ? list.data : undefined;

  return (
    <ListDetailPage
      mode="side"
      inspectorWidth={440}
      storageKey="notifications"
      header={{
        title: t('title'),
        subtitle: t('lead'),
        // The Inbox / Learn tabs open the list pane, directly under the header: their line closes it.
        tabsFollow: true,
        actions:
          !noAccess && (allHeld || (box === 'unread' && ((unreadTotal ?? 0) > 0 || allShown !== null))) ? (
            <>
              {/* wrap: once the header gives its actions a line of their own, a long outcome sentence wraps there
                  instead of running past the edge; the slot still swaps the button for its line (KN4). */}
              <OutcomeSlot
                wrap
                outcome={allShown}
                detail={allShown === 'pending' ? t('ack.allPendingDetail') : allShown === 'failed' ? t('ack.allFailed') : undefined}
                doneText={t('allRead')}
                onCheck={checkAll}
                onRetry={() => void readAll()}
              >
                {(unreadTotal ?? 0) > 0 && (
                  // Housekeeping, so a secondary header button at every width, never the accent or a FAB.
                  <Button icon="check" busy={markAll.running} onPress={() => void readAll()}>
                    {t('readAll')}
                  </Button>
                )}
              </OutcomeSlot>
              {allHeld && <ForgetReadAll holds={allHolds} onForget={markAll.forget} overlayId="notifications-forget-all" />}
            </>
          ) : undefined,
      }}
      toolbar={
        <div className={s.toolbar}>
          <PageTabs current="inbox" unread={noAccess ? undefined : unreadTotal} />
          {noAccess ? null : rowNotice}
        </div>
      }
      list={
        noAccess ? (
          <NoAccessState title={t('token.title')} body={t('token.body')} action={<SignOutAction />} />
        ) : (
        <>
          <DataTable
            label={
              // No total yet (loading, or the list did not load): name the list without a count, never "0 in all".
              total === undefined
                ? t(box === 'unread' ? 'unreadListName' : 'archiveListName')
                : t(box === 'unread' ? 'unreadList' : 'archiveList', { n: total })
            }
            view={view}
            columns={columns}
            countLabel={(n) =>
              capped
                ? t('count.unreadOf', { n, total: capped.total })
                : t(box === 'unread' ? 'count.unread' : 'count.archive', {
                    count: box === 'unread' ? Math.max(0, n - keptShown) : n,
                  })
            }
            onRetry={() => void list.refetch()}
            onRefresh={() => {
              void unread.refetch();
              void archive.refetch();
            }}
            rowMark={(n) => (n.read ? false : 'ink')}
            selectable={box === 'unread'}
            bulkActions={(picked) => (
              <Button
                size="sm"
                busy={bulkRunning}
                isDisabled={bulkRunning}
                onPress={() => {
                  void (async () => {
                    setBulkRunning(true);
                    try {
                      for (const n of picked) {
                        // Already read (kept in the list), done here, or locked until read back: nothing to send.
                        if (n.read || ackOf(n.id) === 'pending' || ackOf(n.id) === 'done') continue;
                        asked.current.add(n.id);
                        const kind = record(n.id, await markRead.run(n.id));
                        if (kind === 'pending' || kind === 'failed') {
                          select(n.id);
                          break;
                        }
                      }
                    } finally {
                      setBulkRunning(false);
                    }
                  })();
                }}
              >
                {t('read')}
              </Button>
            )}
            actions={rowEntries}
            storageKey="notifications"
            fill
            empty={
              noneAtAll ? (
                <EmptyState
                  icon="bell"
                  title={t('noneAtAll')}
                  body={t('noneAtAllHint')}
                  secondary={<FaqLink item={byId.kinds}>{t('h.kinds.more')}</FaqLink>}
                  action={<Button onPress={() => go(links.learn)}>{t('h.tab.learn')}</Button>}
                />
              ) : (
                <EmptyState
                  icon={box === 'unread' ? 'check-circle' : 'bell'}
                  title={t(box === 'unread' ? 'noneUnread' : 'noneArchive')}
                  action={box === 'unread' ? <Button onPress={() => setBox('archive', { replace: true })}>{t('openArchive')}</Button> : undefined}
                />
              )
            }
          />
          {capped && <p className={s.note}>{t('showing', { n: capped.rows.length, total: capped.total })}</p>}
          {/* The tip sits 8 px under the table's frame, never flush on it. */}
          {hintRow(<NotifyHint kind="inbox" />)}
        </>
        )
      }
      detail={noAccess ? null : detail}
    />
  );
}

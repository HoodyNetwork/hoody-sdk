// Sign-in sessions: one row per browser or device signed in to the account. End one you do not recognise, or
// all but this one. This browser's own session is never ended from here (signing out does that). The block opens
// with this browser's address as the Hoody API sees it, the address IP allow lists take.
import { Button, DataTable, EmptyState, ErrorState, IpInfo, SettingRow, Spinner, Tag, When, createColumnHelper, formatRelative, useDataView, useSearchParam, useStrings } from '@kit';
import { useEffect, useMemo } from 'react';
import { type Session, useMyAddress, useSessionPages } from '../data';
import { type SessionRow, cleanLabel, knownEndReason, knownMethod, otherActiveCount, sessionRows } from '../logic';
import strings from '../strings.en.json';
import m from './Mono.module.css';

const col = createColumnHelper<SessionRow>();
const MAX_PAGES = 20;
/** The table's most height (a ledger with a marker row), about ten rows; past it the rows
 * scroll inside the frame under the pinned header, and Show more stays below it. */
const SESSIONS_MAX_H = 432;
/** A 'fit' column's widest ask: the Where column holds a full IPv6 address and its country without a cut. */
const WHERE_MAX_W = 360;
/** The device column's least width: at 1350 the table is 718 px and Keys made must still show (the device column takes 146 px). */
const DEVICE_MIN_W = 140;

export interface SessionsSectionProps {
  onEnd: (row: Session) => void;
  onEndOthers: () => void;
}

/** This browser's address: kit IpInfo (flag, address, place, its own Copy of the exact address, details). While it
 *  loads, a labelled Spinner; a failed read (also one over an earlier answer: the address shown must be the current
 *  one), or an answer naming no address, says so with Try again, never a blank row. No Skeleton or ErrorState here:
 *  data states belong to a Section's state renderer (anatomy layout.state), and this is one row of the sessions block. */
function MyAddress() {
  const t = useStrings(strings);
  const q = useMyAddress();
  const d = q.error ? null : q.data;
  if (d) {
    return (
      <SettingRow label={t('s.ip.label')} info={t('s.ip.info')} wide>
        <IpInfo details={d} />
      </SettingRow>
    );
  }
  if (q.isPending) {
    return (
      <SettingRow label={t('s.ip.label')} info={t('s.ip.info')} wide>
        <Spinner label={t('s.ip.reading')} />
      </SettingRow>
    );
  }
  return (
    <SettingRow
      label={t('s.ip.label')}
      info={t('s.ip.info')}
      help={t('s.ip.failed')}
      wide
      actions={
        <Button size="sm" busy={q.isFetching} onPress={() => void q.refetch()}>
          {t('sum.tryAgain')}
        </Button>
      }
    />
  );
}

export function SessionsSection({ onEnd, onEndOthers }: SessionsSectionProps) {
  const t = useStrings(strings);
  // The view's own URL key for the required Active | Ended filter; it picks which list is loaded.
  const [stateParam] = useSearchParam('state');
  const kind = stateParam === 'ended' ? 'ended' : 'active';
  const q = useSessionPages(kind);
  const rows = useMemo(() => (q.sessions ? sessionRows(q.sessions, t) : undefined), [q.sessions, t]);
  // The server has no search or sort on this list, so the view works on the rows held and every page is fetched
  // as soon as the one before it arrived (capped: the server also caps how many sessions an account keeps).
  const { more, hasMore, loadingMore, loaded } = q;
  useEffect(() => {
    if (hasMore && !loadingMore && loaded < MAX_PAGES) more();
  }, [hasMore, loadingMore, loaded, more]);
  const others = q.sessions ? otherActiveCount(q.sessions) : 0;

  const columns = useMemo(() => {
    // The words a cell draws, shared by the cell and its 'fit' measure.
    const methodText = (r: SessionRow) => {
      const known = knownMethod(r.session.method);
      return known ? t(`s.m.${known}`) : cleanLabel(r.session.method, 24);
    };
    const whereText = (r: SessionRow) => [cleanLabel(r.session.lastIp, 45), cleanLabel(r.session.lastCountry, 8)].filter(Boolean).join(' · ');
    return [
      col.accessor('device', {
        header: t('s.col.device'),
        meta: { pinned: true, minWidth: DEVICE_MIN_W },
        cell: (c) => (
          <span className={m.line}>
            <bdi>{c.getValue()}</bdi>
            {c.row.original.tag && <Tag>{c.row.original.tag}</Tag>}
            {c.row.original.session.current && <Tag tone="mark">{t('s.this')}</Tag>}
          </span>
        ),
      }),
      col.accessor((r) => r.session.method, {
        id: 'method',
        header: t('s.col.method'),
        meta: { size: 'fit', fitText: (r: SessionRow) => methodText(r), priority: 2 },
        cell: (c) => {
          const known = knownMethod(c.getValue());
          return known ? t(`s.m.${known}`) : cleanLabel(c.getValue(), 24);
        },
      }),
      col.accessor((r) => r.when ?? '', {
        id: 'when',
        header: t(kind === 'active' ? 's.col.lastSeen' : 's.col.endedOn'),
        meta: { size: 'fit', fitText: (r: SessionRow) => (r.when ? formatRelative(r.when) : '') },
        cell: (c) => {
          const v = c.getValue();
          return v ? <When at={v} /> : '';
        },
      }),
      col.accessor((r) => r.session.lastIp ?? '', {
        id: 'where',
        header: t('s.col.where'),
        meta: { size: 'fit', fitText: (r: SessionRow) => whereText(r), maxWidth: WHERE_MAX_W, mono: true, priority: 4 },
        cell: (c) => whereText(c.row.original),
      }),
      // Keys made outranks IP / country: the planner sheds the address first, so Keys made, once drawn,
      // stays drawn at every wider frame (no gap at the sidebar breakpoint).
      col.accessor((r) => r.session.keysMade, {
        id: 'keys',
        header: t('s.col.keys'),
        meta: { size: 'fit', fitText: (r: SessionRow) => String(r.session.keysMade), align: 'end', mono: true, priority: 3 },
      }),
      ...(kind === 'ended'
        ? [
            col.accessor((r) => r.session.endReason ?? '', {
              id: 'reason',
              header: t('s.col.ended'),
              meta: { width: '220px', priority: 4 },
              cell: (c) => {
                const known = knownEndReason(c.getValue() || null);
                return known ? t(`s.r.${known}`) : '';
              },
            }),
          ]
        : []),
    ];
  }, [t, kind]);

  const view = useDataView<SessionRow>({
    rows,
    columns,
    getRowId: (r) => r.session.id,
    search: (r) => [r.device, r.tag ?? '', r.session.lastIp ?? '', r.session.lastCountry ?? ''],
    sort: '-when',
    pageSize: 50,
    more: true,
    filters: [
      {
        id: 'state',
        label: t('s.which'),
        display: 'segmented',
        required: true,
        defaultValue: 'active',
        // Which list to load; the rows are not filtered by it.
        apply: false,
        options: [
          { value: 'active', label: t('s.active') },
          { value: 'ended', label: t('s.ended') },
        ],
        value: () => '',
      },
    ],
    isLoading: q.isPending,
    error: q.error,
  });

  return (
    <>
    <MyAddress />
    <DataTable
      label={t('s.title')}
      view={view}
      columns={columns}
      onRetry={() => void q.refetch()}
      onRefresh={() => void q.refetch()}
      countLabel={(n) => t('count.sessions', { count: n })}
      fill={false}
      maxHeight={SESSIONS_MAX_H}
      // The dashed ledger: this browser's row marked with the highlight bar and wash.
      lines="dashed"
      rowMark={(r) => (r.session.current ? 'acc' : undefined)}
      noViewMenu
      onRowAction={(r) => {
        if (r.canEnd) onEnd(r.session);
      }}
      toolbarEnd={
        kind === 'active' && others > 0 ? (
          <Button tone="danger" onPress={onEndOthers}>
            {t('s.endOthers')}
          </Button>
        ) : undefined
      }
      actions={(r) =>
        r.canEnd
          ? [
              {
                id: 'end',
                label: t('s.endNamed', { device: r.device }),
                icon: 'logout',
                tone: 'danger',
                hover: true,
                onAction: () => onEnd(r.session),
              },
            ]
          : []
      }
      empty={<EmptyState icon="lock" size="sm" title={t(kind === 'active' ? 's.noneActive' : 's.noneEnded')} />}
    />
    {q.moreError && <ErrorState size="sm" title={t('s.moreFailed')} onRetry={() => void q.refetch()} />}
    </>
  );
}

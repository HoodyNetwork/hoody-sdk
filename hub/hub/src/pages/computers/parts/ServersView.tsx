// Servers: paid subscriptions first (read only here; Pay now goes to billing), then the servers
// computers can live on with their capacity. A server with no room says so; full ones link to upgrade. The whole
// row opens the server panel; its "N computers" link stays its own way to the computers list.
import { Meter, formatStorage, statusPillMetrics, Button, DataTable, EmptyState, Link, Panel, StatusPill, UpgradeLink, useDataView, createColumnHelper, useSearchParam, useStrings, useContainerNarrow, type RowActionEntry, type TableGroup } from '@kit';
import { links as billingLinks } from '../../billing/links';
import { useMachinesView } from './machinesView';
import { useEffect, useMemo, useState } from 'react';
import { serverFull, subView } from '../logic';
import { useOut } from './useOut';
import { useServersAi } from '../data';
import { ServerAiFoot } from './ServerAi';
import { roomUpgrade } from './upgrade';
import strings from '../strings.en.json';
import type { Computer, Server, Subscription } from '../types';
import { Flag } from './Bits';
import { ServerDetailDrawer } from './ServerDetail';
import s from './parts.module.css';

const col = createColumnHelper<Server>();
const subCol = createColumnHelper<Subscription>();

const date = (iso: string | null | undefined): string | null => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
};

const rowKey = (x: Server): string => x.rentalId ?? x.id;

export function ServersView({
  servers,
  subs,
  computers,
  known,
  loading,
  error,
  onRetry,
}: {
  servers: Server[] | undefined;
  subs: { items: Subscription[]; more: boolean } | undefined;
  computers: Computer[] | undefined;
  /** Whether the computers and subscriptions reads answered last time (a failed re-read keeps older rows). */
  known: { computers: boolean; subs: boolean };
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const t = useStrings(strings);
  const narrow = useContainerNarrow(600);
  const out = useOut();
  // Cards or List, shared with the other machine lists (useMachinesView).
  const [present, setPresent] = useMachinesView();
  // The AI footer's read: made only once cards show (a card draws first, its footer fills in), and once per visit.
  // Turned on the first time and left on: switching to List and back never reads again, after a good or a failed
  // read (re-enabling would refetch, since the source's queries are stale at once). Opening the page again reads anew.
  const [aiOn, setAiOn] = useState(false);
  if (!aiOn && present === 'cards' && (servers?.length ?? 0) > 0) setAiOn(true);
  const ai = useServersAi(aiOn);
  const aiRead = useMemo(() => ({ data: ai.data, error: ai.error }), [ai.data, ai.error]);
  // The open row, in this view only: an id never goes into the URL. The list keeps rental history, so one server can
  // have several rows: a row is its rental (the server id only when the answer gives no rental id).
  const [openId, setOpenId] = useState<string | null>(null);
  // links.server (`?server=<name>`): a computer's Overview asks for its server's panel. Read once the list has answered
  // (or failed); the key is dropped either way. Of the rows with that name (a server's rentals), the one with the most
  // days left opens (no days given = a current free slice, before any count; an ended rental shows 0); a name the list
  // lacks opens nothing and leaves the list.
  const [wantServer, setWantServer] = useSearchParam('server');
  useEffect(() => {
    if (wantServer === undefined || (servers === undefined && !error)) return;
    setWantServer(undefined, { replace: true });
    const pick = (servers ?? []).filter((r) => r.name !== '' && r.name === wantServer).sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity))[0];
    if (pick) setOpenId(rowKey(pick));
  }, [wantServer, setWantServer, servers, error]);
  const counts = useMemo(() => {
    const n: Record<string, number> = {};
    for (const c of computers ?? []) if (c.server_id) n[c.server_id] = (n[c.server_id] ?? 0) + 1;
    return n;
  }, [computers]);

  const columns = useMemo(
    () => [
      col.accessor('name', { header: t('srv.col.name'), meta: { pinned: true, label: t('srv.col.name') }, cell: (x) => (
          <span className={s.row}>
            <strong>{x.getValue()}</strong>
            {narrow && serverFull(x.row.original) ? <StatusPill tone="warn">{t('srv.full')}</StatusPill> : null}
          </span>
        ),
      }),
      col.display({
        id: 'place',
        header: t('srv.col.place'),
        meta: { label: t('srv.col.place') },
        cell: (x) => (
          <span className={s.serverLabel}>
            <Flag cc={x.row.original.cc} />
            <span>{x.row.original.place}</span>
          </span>
        ),
      }),
      col.display({
        id: 'plan',
        header: t('srv.col.plan'),
        meta: { width: '132px', label: t('srv.col.plan') },
        cell: (x) => {
          const r = x.row.original;
          if (r.free) return <StatusPill tone="info">{t('srv.free')}</StatusPill>;
          return r.days !== null ? <span>{t('srv.days', { count: r.days })}</span> : <StatusPill>{t('srv.paid')}</StatusPill>;
        },
      }),
      col.display({
        id: 'specs',
        header: t('srv.col.specs'),
        meta: { width: '280px', priority: 4, label: t('srv.col.specs') },
        cell: (x) => {
          const r = x.row.original;
          const parts = [r.cpu !== null ? t('srv.cpu', { count: r.cpu }) : null, r.ram !== null ? t('srv.ram', { size: formatStorage(r.ram) }) : null, r.disk !== null ? t('srv.disk', { size: formatStorage(r.disk) }) : null].filter(Boolean);
          return <span>{parts.join(' · ') || '—'}</span>;
        },
      }),
      col.display({
        id: 'capacity',
        header: t('srv.col.capacity'),
        // Labelled on a card or list row, where no header names a bare "—" or "3 of 8".
        meta: { width: '180px', label: t('srv.col.capacity'), listLabel: true },
        cell: (x) => {
          const r = x.row.original;
          if (!r.cap) return <span className={s.faint}>—</span>;
          const left = Math.max(0, r.cap.max - r.cap.used);
          const full = serverFull(r);
          const near = !full && r.cap.max > 0 && r.cap.used / r.cap.max >= 0.75;
          const why = full ? t('srv.capFull') : near ? t('srv.capNear', { count: left }) : undefined;
          return (
            <span className={s.usageBars} title={why}>
              <Meter value={(r.cap.used / Math.max(1, r.cap.max)) * 100} label={t('srv.capOf', { used: r.cap.used, max: r.cap.max })} />
              <span className={`${s.mono} ${full || near ? s.warnText : ''}`}>{t('srv.capOf', { used: r.cap.used, max: r.cap.max })}</span>
            </span>
          );
        },
      }),
      col.display({
        id: 'computers',
        header: t('srv.col.computers'),
        meta: { width: '120px', align: 'end', label: t('srv.col.computers') },
        cell: (x) => (
          <Link variant="nav" href={`/computers?server=${encodeURIComponent(x.row.original.id)}`}>{t('srv.computers', { count: counts[x.row.original.id] ?? 0 })} {t('nav.more')}</Link>
        ),
      }),
      col.display({
        id: 'action',
        header: t('srv.col.action'),
        // Quiet on a free slice, near from 75 % of its room, full when full. On a card it is
        // the AI footer's last cell, so not a kit foot cell. 152: the near/full chip (112 px, 122 on a coarse
        // pointer) and the cell's padding.
        meta: { width: '152px', align: 'end', list: false, card: false, label: t('srv.col.action') },
        cell: (x) => {
          const u = roomUpgrade(x.row.original, serverFull(x.row.original));
          return <UpgradeLink available={u.available} prominence={u.prominence} href={billingLinks.plans} label={t('srv.upgrade')} />;
        },
      }),
      col.display({
        id: 'ai',
        header: t('srv.col.ai'),
        // Cards only: the server's AI lanes in the card footer.
        meta: { list: false, table: false, card: 'foot', label: t('srv.col.ai') },
        // One upgrade per card: the AI one only where the room one does not show.
        cell: (x) => <ServerAiFoot id={x.row.original.id} read={aiRead} room={roomUpgrade(x.row.original, serverFull(x.row.original))} />,
      }),
    ],
    [t, counts, narrow, aiRead],
  );

  const subColumns = useMemo(
    () => [
      subCol.display({ id: 'plan', header: t('srv.sub.plan'), meta: { pinned: true, label: t('srv.sub.plan') }, cell: (x) => <strong>{x.row.original.plan?.title ?? x.row.original.server_name ?? ''}</strong> }),
      subCol.display({
        id: 'state',
        header: t('srv.sub.state'),
        // State and Renews are as wide as their words (not 220 + 200 px), so Renews stays beside Plan on a small screen.
        meta: { size: 'fit', fitMetrics: statusPillMetrics(true), fitText: (r: Subscription) => t(`sub.${subView(r).key}`, { date: date(r.delete_at) ?? '' }), label: t('srv.sub.state') },
        cell: (x) => {
          const v = subView(x.row.original);
          return <StatusPill tone={v.tone} dot>{t(`sub.${v.key}`, { date: date(x.row.original.delete_at) ?? '' })}</StatusPill>;
        },
      }),
      subCol.display({
        id: 'renews',
        header: t('srv.sub.renews'),
        meta: {
          size: 'fit',
          priority: 3,
          fitText: (r: Subscription) => {
            const d = date(r.paid_through);
            return d ? t(r.auto_renew === false ? 'sub.stops' : 'sub.renews', { date: d }) : '—';
          },
          label: t('srv.sub.renews'),
        },
        cell: (x) => {
          const r = x.row.original;
          const d = date(r.paid_through);
          return d ? <span>{t(r.auto_renew === false ? 'sub.stops' : 'sub.renews', { date: d })}</span> : <span className={s.faint}>—</span>;
        },
      }),
    ],
    [t],
  );
  // Pay now is the owed subscription's own row action: the kit draws it inline in every presentation, phone
  // list included, instead of a column of its own that the list left out.
  const subActions = useMemo(
    () =>
      (x: Subscription): RowActionEntry[] =>
        subView(x).pay && out.has.buy ? [{ id: 'pay', label: t('sub.payNow'), inline: true, onAction: () => out.billing() }] : [],
    [t, out],
  );

  const groups = useMemo<TableGroup[]>(
    () => [
      { id: 'free', label: t('srv.group.free') },
      { id: 'subserver', label: t('srv.group.subserver') },
      { id: 'metal', label: t('srv.group.metal') },
      { id: 'other', label: t('srv.group.other') },
    ],
    [t],
  );

  const view = useDataView<Server>({
    rows: servers,
    columns,
    getRowId: rowKey,
    isLoading: loading,
    error,
    search: ['name', 'place'],
    sort: 'name',
    param: 's',
  });

  return (
    <div className={s.stack}>
      {subs && subs.items.length ? (
        <Panel title={t('srv.subs')} flush notice={subs.more ? t('srv.subsMore') : undefined}>
          <DataTable
            label={t('srv.subs')}
            data={subs.items}
            columns={subColumns}
            getRowId={(x) => x.id}
            actions={subActions}
            fill={false}
            bare
            noViewMenu
          />
        </Panel>
      ) : null}
      <DataTable
        label={t('srv.title')}
        countLabel={(n) => t('count.servers', { count: n })}
        view={view}
        columns={columns}
        onRetry={onRetry}
        onRefresh={onRetry}
        search={t('srv.search')}
        onRowAction={(r) => setOpenId(rowKey(r))}
        presentation={present === 'cards' ? 'cards' : 'auto'}
        cardShape="rail"
        groupBy={(r) => r.kind ?? 'other'}
        groups={groups}
        presentChoice={{ value: present, onChange: setPresent }}
        fill={false}
        empty={<EmptyState icon="server" title={t('srv.empty')} body={t('srv.emptyBody')} action={out.has.market ? <Button onPress={() => out.market()}>{t('srv.browse')}</Button> : undefined} />}
        noViewMenu
      />
      {(servers ?? []).filter((r) => rowKey(r) === openId).slice(0, 1).map((r) => (
        <ServerDetailDrawer
          key={rowKey(r)}
          server={r}
          {...(r.rentalId ? { rentalId: r.rentalId } : {})}
          computers={known.computers ? computers : undefined}
          subs={known.subs ? subs?.items : undefined}
          isOpen
          onOpenChange={(o) => !o && setOpenId(null)}
        />
      ))}
    </div>
  );
}

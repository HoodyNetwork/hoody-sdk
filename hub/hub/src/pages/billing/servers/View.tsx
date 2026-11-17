// The Bare metal view of Plans & billing: the servers for rent and pre-order (table, inspector in side mode) and your
// reservations. Browse and detail only; the buy button in the inspector opens the page's checkout drawer. The page owns the header (Add funds) and this view adds the balance as its
// meta; the page's view bar comes in as `views`, and the banner (the money notices) is drawn here as ../view.tsx draws it
// for the other views.
import {
  Band,
  Button,
  DataTable,
  DetailHeader,
  EmptyState,
  ErrorState,
  ListDetailPage,
  type PageHeaderProps,
  type PageViews,
  RowNote,
  SegmentedControl,
  Skeleton,
  StatusPill,
  TextButton,
  countryFlag,
  createColumnHelper,
  formatDateTime,
  fitWidth,
  formatStorage,
  useDataView,
  useGo,
  followPageLink,
  usePageLink,
  useSearchParam,
  useStrings,
  type Tone,
} from '@kit';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { listingRules } from '@core';
import { links as billing } from '../links';
import { refusedHere } from '../logic';
import { useIdentity, useUnknownCheckouts } from '../data';
import { HeldServerBands, BannedBand, ReturnBand, UnknownBands } from '../parts/Bands';
import { HeldTopUpSlot } from '../parts/HeldTopUp';
import { OpenNotice } from '../parts/OpenNotice';
import billingStrings from '../strings.en.json';
import { type Finding, type Suspension, cleanAt, suspendedState, useAccount, useBalance, useListings, useReservations } from './data';
import {
  BANDWIDTH_RANGE,
  CORES_RANGE,
  DISK_RANGE,
  DISK_TYPES,
  PRICE_RANGE,
  RAM_RANGE,
  TRAFFIC_RANGE,
  canonList,
  diskTypeKey,
  ramTypeKey,
  trafficValue,
  type Listing,
  type Reservation,
  bareFromCents,
  buyable,
  countries,
  featuredOrder,
  delivery,
  fromDollars,
  fromTerm,
  money,
  overdue,
  searchWords,
  termFor,
  factsOf,
} from './logic';
import { Detail, OrderFooter, placeLine } from './parts/Detail';
import { nameCell } from './parts/NameCell';
import { ReservationDetail, ReservationFooter } from './parts/ReservationDetail';
import { countryName, deliveryText, priceText, readyText } from './parts/words';
import strings from './strings.en.json';
import css from './View.module.css';

const col = createColumnHelper<Listing>();
const rcol = createColumnHelper<Reservation>();
const RES_TONE: Record<Reservation['state'], Tone> = { pending: 'warn', fulfilled: 'ok', refunded: 'neutral' };

const FROM = billing.servers();
const NOT_LISTED_TEXT = listingRules.factText(listingRules.NOT_LISTED);
// What a listings cell shows, also what its column is measured by.
const placeText = (l: Listing): string => `${countryFlag(l.country)} ${l.city || countryName(l.country)}`.trim();
const ramText = (l: Listing): string => listingRules.ramLine(factsOf(l)) || NOT_LISTED_TEXT;
const diskText = (l: Listing): string => listingRules.disksLine(factsOf(l)) || NOT_LISTED_TEXT;

export interface ServersViewProps {
  /** The page header: its title and its primary (Add funds). This view only quiets the primary while the inspector shows its own. */
  header: PageHeaderProps;
  /** The page's view bar (../view.tsx), drawn by the layout under the header. */
  views: PageViews;
  /** Told what this view finds whenever it changes (its suspension now, and when its reads last all answered clean):
   * the page holds a suspension found until a full recheck clears it, and keeps it after this view unmounts (Check
   * again opens the checkout without view=servers). */
  onSuspension?: (f: Finding) => void;
  /** The suspension the page holds for this account, realm and generation: it suspends this view too, while a recheck
   * or a return visit reads again. */
  held?: Suspension | null;
}

export function ServersView({ header: pageHeader, views, onSuspension, held = null }: ServersViewProps) {
  const t = useStrings(strings);
  const bt = useStrings(billingStrings);
  const identity = useIdentity();
  const unknown = useUnknownCheckouts();
  const go = useGo();
  const billingLink = usePageLink('billing');
  const computersLink = usePageLink('computers');
  const accountLink = usePageLink('account');
  const toAccount = accountLink ? () => followPageLink(accountLink, go) : null;
  const account = useAccount();
  const list = useListings();
  const balance = useBalance();
  const res = useReservations();
  const [tabParam] = useSearchParam('tab');
  const tab = tabParam === 'reservations' ? 'reservations' : 'listings';
  const [days, setDays] = useSearchParam('days');
  const [now] = useState(() => Date.now());

  // One suspension for the view: Billing's identity or this view's account read saying banned, or any of its reads
  // refused 403 ACCOUNT_BANNED (that refusal is the band's details; an account state alone has none), or the one the
  // page holds (found earlier and not yet cleared by a full recheck: the reservations walk forgets its refusal as soon
  // as it reads again).
  const { banned: seen, rejection: seenRejection } = suspendedState([identity.data?.banned, account.data?.banned], [identity.error, account.error, list.suspension, balance.error, res.error, res.moreError, res.pollError]);
  const answeredAt = Math.min(cleanAt(identity), cleanAt(account), list.answeredAt, cleanAt(balance), res.answeredAt);
  useEffect(() => onSuspension?.({ banned: seen, rejection: seenRejection, answeredAt }), [seen, seenRejection, answeredAt, onSuspension]);
  const banned = seen || !!held?.banned;
  const suspension = seenRejection ?? (held?.banned ? held.rejection : null);
  // The classic market's Featured order is the list's order until a column header sorts it.
  const all = useMemo(() => (list.data ? featuredOrder(list.data.listings) : undefined), [list.data]);

  // The one line over the table: bare metal's "from", read from the live listings alone.
  const bareFrom = useMemo(() => (list.data ? bareFromCents(list.data.listings) : null), [list.data]);

  // Column widths (the segmented bar design): the server name takes the room the others leave and ends in an ellipsis
  // when it is long; its tags sit on a line of their own under it, so they never squeeze the name. Every other column
  // is sized to its own text (kit 'fit'). Priority-1 floors are the widest text they show; Disk and Delivery floor at
  // their widest text over the loaded listings, so a narrower table drops them (and Processor first) instead of
  // cutting their words.
  const diskFloor = useMemo(() => Math.max(119, fitWidth((all ?? []).map(diskText))), [all]);
  const deliveryFloor = useMemo(() => Math.max(104, fitWidth((all ?? []).map((l) => deliveryText(t, delivery(l.deliveryHours))))), [all, t]);
  const columns = useMemo(
    () => [
      col.accessor((l) => l.name, {
        id: 'name',
        header: t('col.name'),
        meta: { pinned: true, priority: 1, list: 'primary', size: 'fill', minWidth: 160 },
        cell: (c) => {
          const l = c.row.original;
          const tags = [
            l.kind === 'offer' ? <StatusPill key="offer" tone="neutral">{t('kind.offer')}</StatusPill> : null,
            l.featured ? <StatusPill key="featured" tone="ok">{t('chip.featured')}</StatusPill> : null,
            l.kind === 'stock' && l.stockLeft !== null && l.stockLeft > 0 && l.stockLeft <= 3 ? <StatusPill key="left" tone="warn">{t('chip.left', { n: l.stockLeft })}</StatusPill> : null,
          ].filter(Boolean);
          return nameCell({ name: l.name, tags });
        },
      }),
      col.accessor((l) => `${l.city} ${l.country}`, {
        id: 'location',
        header: t('col.location'),
        meta: { size: 'fit', fitText: placeText, minWidth: 124, priority: 1, list: 'meta' },
        cell: (c) => placeText(c.row.original),
      }),
      col.accessor('cpu', { header: t('col.cpu'), meta: { size: 'fit', minWidth: 150, priority: 4, list: false } }),
      col.accessor((l) => l.cores, { id: 'cores', header: t('col.cores'), meta: { align: 'end', size: 'fit', fitText: (l: Listing) => String(l.cores ?? ''), minWidth: 82, mono: true, priority: 3, list: 'meta' }, cell: (c) => c.row.original.cores ?? '' }),
      // Memory and disks carry their kinds on the row and the card ("128 GB DDR4 ECC", "2 × 1 TB NVMe").
      // The price outlasts every spec: among equal priorities the column furthest right drops first (planColumns), so
      // with Memory at 1 the From column went before it and a narrow list showed machines with no price. Memory is 2
      // and Cores 3, which keeps the order the specs give way in (delivery, disks, cores, memory); the price goes after
      // them. Location is priority 1 too and sits left of From, so of the two the price is the first to give way.
      col.accessor((l) => l.ramGb, { id: 'ram', header: t('col.ram'), meta: { size: 'fit', fitText: ramText, minWidth: 132, priority: 2, list: 'meta' }, cell: (c) => ramText(c.row.original) }),
      col.accessor((l) => l.diskGb, { id: 'disk', header: t('col.disk'), meta: { size: 'fit', fitText: diskText, minWidth: diskFloor, priority: 3, list: 'meta' }, cell: (c) => diskText(c.row.original) }),
      col.accessor((l) => l.deliveryHours, {
        id: 'delivery',
        header: t('col.delivery'),
        meta: { size: 'fit', fitText: (l: Listing) => deliveryText(t, delivery(l.deliveryHours)), minWidth: deliveryFloor, priority: 3, list: false },
        cell: (c) => deliveryText(t, delivery(c.row.original.deliveryHours)),
      }),
      col.accessor((l) => fromTerm(l)?.totalCents ?? null, {
        id: 'from',
        header: t('col.from'),
        meta: { align: 'end', size: 'fit', fitText: (l: Listing) => (buyable(l) ? priceText(t, fromTerm(l)) : t('price.none')), minWidth: 112, mono: true, priority: 1, list: 'status', cut: 'never' },
        cell: (c) => {
          const l = c.row.original;
          return buyable(l) ? priceText(t, fromTerm(l)) : <RowNote cut>{t('price.none')}</RowNote>;
        },
      }),
    ],
    [t, diskFloor, deliveryFloor],
  );

  const view = useDataView<Listing>({
    rows: all,
    columns,
    getRowId: (l) => l.id,
    pageSize: 50,
    search: (l) => searchWords(l, countryName(l.country)),
    filters: [
      {
        id: 'kind',
        label: t('filter.kind'),
        display: 'segmented',
        value: (l) => l.kind,
        options: [
          { value: 'stock', label: listingRules.instantPromise.label },
          { value: 'offer', label: t('kind.offer') },
        ],
      },
      {
        id: 'country',
        label: t('filter.country'),
        value: (l) => l.country,
        options: countries(all ?? [], countryName).map((c) => ({ value: c.code, label: `${countryFlag(c.code)} ${c.name}`.trim() })),
      },
      { id: 'cores', label: t('filter.cores'), kind: 'range', value: (l) => l.cores, range: { ...CORES_RANGE, format: (n) => t('cores.n', { n }) } },
      { id: 'ram', label: t('filter.ram'), kind: 'range', value: (l) => l.ramGb, range: { ...RAM_RANGE, format: (n) => t('ram.n', { size: formatStorage(n) }) } },
      { id: 'disk', label: t('filter.disk'), kind: 'range', value: (l) => l.diskGb, range: { ...DISK_RANGE, format: (n) => t('disk.n', { size: formatStorage(n) }) } },
      // The API's other spec filters. A row that does not say is left out once one is set.
      { id: 'ramType', label: t('filter.ramType'), kind: 'multi', value: (l) => (l.ramType ? ramTypeKey(l.ramType) : null) },
      { id: 'diskType', label: t('filter.diskType'), kind: 'multi', value: (l) => l.diskTypes, options: DISK_TYPES.map((d) => ({ value: d, label: d })) },
      { id: 'bandwidth', label: t('filter.bandwidth'), kind: 'range', value: (l) => l.bandwidthMbps, range: { ...BANDWIDTH_RANGE, format: (n) => t('bandwidth.n', { n }) } },
      { id: 'traffic', label: t('filter.traffic'), kind: 'range', value: trafficValue, range: { ...TRAFFIC_RANGE, format: (n) => t('traffic.n', { n }) } },
      { id: 'unlimited', label: t('filter.unlimited'), value: (l) => (l.trafficUnlimited ? 'yes' : 'no'), options: [{ value: 'yes', label: t('filter.unlimited.yes') }] },
      { id: 'price', label: t('filter.price'), kind: 'range', value: (l) => fromDollars(l) ?? Number.MAX_SAFE_INTEGER, range: { ...PRICE_RANGE, format: (n) => t('price.n', { n }) } },
    ],
    isLoading: list.isPending,
    error: list.error,
  });
  const current = all?.find((l) => l.id === view.activeId);
  // Type filters match case-insensitively: a typed or old link's value is rewritten in the keys' own spelling.
  const [ramParam, setRamParam] = useSearchParam('ramType');
  const [diskParam, setDiskParam] = useSearchParam('diskType');
  useEffect(() => {
    const ram = canonList(ramParam, ramTypeKey);
    if (ram !== ramParam) setRamParam(ram, { replace: true });
    const disk = canonList(diskParam, diskTypeKey);
    if (disk !== diskParam) setDiskParam(disk, { replace: true });
  }, [ramParam, diskParam, setRamParam, setDiskParam]);

  // The header balance: the General balance, a line while it reads (a first read, a refetch or a stale answer read
  // again), and a failed read with its details and Retry, never an amount read earlier.
  const balanceMeta = balance.error ? (
    <ErrorState size="compact" title={t('balance.failed')} error={balance.error} onRetry={() => void balance.refetch()} />
  ) : balance.data ? (
    <span>
      <span className={css.muted}>{t('balance.label')} </span>
      <span className={css.mono}>{money(balance.data.general)}</span>
    </span>
  ) : (
    <Skeleton variant="text" rows={1} />
  );
  // One primary per screen: while the inspector shows its own primary (Rent or Reserve) the header's
  // Add funds is quiet. With no selection, a listing not for sale, or a suspended account, Add funds stays the primary.
  // A suspended account has no Add funds at all.
  const { primary, ...headerText } = pageHeader;
  const inspectorBuys = tab === 'listings' && !!current && buyable(current) && !!billingLink;
  const header: PageHeaderProps = { ...headerText, meta: balanceMeta, ...(banned || !primary ? {} : { primary, primaryQuiet: inspectorBuys }) };

  const resColumns = useMemo(
    () => [
      rcol.accessor((r) => r.name, { id: 'name', header: t('col.res.name'), meta: { pinned: true, priority: 1, list: 'primary' }, cell: (c) => c.row.original.name || t('res.unnamed') }),
      rcol.accessor('state', {
        header: t('col.res.state'),
        meta: { width: '140px', priority: 1, list: 'status' },
        cell: (c) => {
          const r = c.row.original;
          return (
            <StatusPill tone={RES_TONE[r.state]} dot>
              {t(`res.state.${r.state}` as 'res.state.pending')}
            </StatusPill>
          );
        },
      }),
      rcol.accessor((r) => r.readyBy, {
        id: 'ready',
        header: t('col.res.ready'),
        meta: { width: '160px', priority: 1, list: 'meta' },
        cell: (c) => {
          const r = c.row.original;
          const w = r.state === 'pending' ? readyText(t, r.readyBy, now) : { text: t('res.dash'), late: false };
          return (
            <span title={r.readyBy === null ? undefined : formatDateTime(new Date(r.readyBy).toISOString())} className={w.late && overdue(r, now) ? css.late : undefined}>
              {w.text}
            </span>
          );
        },
      }),
      rcol.accessor((r) => r.days, { id: 'term', header: t('col.res.term'), meta: { width: '96px', priority: 3, list: false }, cell: (c) => (c.row.original.days === null ? t('res.dash') : t('res.days', { n: c.row.original.days })) }),
      rcol.accessor((r) => r.paidCents, { id: 'paid', header: t('col.res.paid'), meta: { align: 'end', width: '104px', mono: true, priority: 2, list: 'meta' }, cell: (c) => (c.row.original.paidCents === null ? t('res.dash') : money(c.row.original.paidCents)) }),
      rcol.accessor((r) => `${r.cores ?? ''} ${r.ramGb ?? ''} ${r.diskGb ?? ''}`, {
        id: 'specs',
        header: t('col.res.specs'),
        meta: { width: '240px', priority: 4, list: false },
        cell: (c) => {
          const r = c.row.original;
          return r.cores === null || r.ramGb === null || r.diskGb === null ? t('res.dash') : t('res.specs', { cores: r.cores, ram: formatStorage(r.ramGb), disk: formatStorage(r.diskGb) });
        },
      }),
    ],
    [t, now],
  );

  const resView = useDataView<Reservation>({
    rows: res.data?.rows,
    columns: resColumns,
    getRowId: (r) => r.id,
    search: (r) => [r.name, r.state, r.id],
    filters: [
      {
        id: 'state',
        label: t('res.filter.state'),
        display: 'segmented',
        value: (r) => r.state,
        options: (['pending', 'fulfilled', 'refunded'] as const).map((v) => ({ value: v, label: t(`res.state.${v}`) })),
      },
    ],
    param: 'r',
    sort: '-ready',
    isLoading: res.isPending,
    error: res.error,
  });

  const currentRes = res.data?.rows.find((r) => r.id === resView.activeId);

  const lists = (
    // Folder tabs: Listings | Reservations switch between views of this page.
    <SegmentedControl
      label={t('tabs')}
      param="tab"
      variant="folder"
      items={[
        { id: 'rent', label: t('tab.listings') },
        // No count here: the list's Pending filter chip carries it, beside the total.
        { id: 'reservations', label: t('tab.reservations') },
      ]}
    />
  );

  const failedNote =
    list.data && list.data.failed.length > 0 ? (
      <Band tone="warn" size="table" error={list.railError} actions={<TextButton onPress={() => void list.refetch()}>{t('band.retry')}</TextButton>}>
        {list.data.failed.includes('stock') ? t('band.stock') : t('band.offers')}
      </Band>
    ) : null;
  // Check status reads again every source that can say suspended.
  const recheck = () => {
    void identity.refetch();
    void account.refetch();
    void list.refetch();
    void balance.refetch();
    void res.refetch();
  };

  // The page banner, the same as ../view.tsx's for the other views: the money notices (the view bar is `views`). One
  // suspended band from the view's one suspension, carrying the refusal behind it when a read was refused (no details
  // when only an account state says so). C9: a rent or reserve core never heard back on shows once, here, in
  // Billing's one UnknownBands list.
  const banner = (
    <>
      <OpenNotice t={bt} />
      {banned ? <BannedBand t={bt} error={suspension} checking={identity.isFetching || account.isFetching || res.isPending} onCheck={recheck} /> : null}
      <HeldServerBands t={bt} banned={banned} />
      <ReturnBand t={bt} />
      <HeldTopUpSlot t={bt} banned={banned} />
      <UnknownBands t={bt} items={unknown} />
    </>
  );

  // A later page of reservations failed: the rows read so far stay, and Load more reads it again.
  const moreNote = res.moreError ? (
    <Band tone="warn" size="table" error={res.moreError} actions={<TextButton onPress={res.more}>{t('band.retry')}</TextButton>}>
      {t('res.moreFailed')}
    </Band>
  ) : null;

  const toolbar = (
    <>
      {lists}
      {tab === 'listings' && !banned ? failedNote : null}
      {tab === 'reservations' && !banned ? moreNote : null}
    </>
  );

  // The instant footnote over the listings. It scrolls with the list (never in the fixed toolbar); the table keeps a
  // usable height of its own below it.
  const withOverview = (body: ReactNode) => (
    <div className={css.withOverview}>
      {/* Only when a row shown now (after search, filters and paging) carries the asterisk. */}
      {view.rows.some(listingRules.isInstant) ? <p className={css.footnote}>{listingRules.instantPromise.footnote}</p> : null}
      <div className={css.tableArea}>{body}</div>
    </div>
  );

  // A suspended account (on either tab), or a first read of the listings that failed, shows its state in the list pane
  // with no inspector. One page element for every state, so the banner and the toolbar are drawn once.
  const blockedList = banned ? (
    <EmptyState icon="lock" title={t('banned.title')} body={t('banned.body')} action={toAccount ? <Button onPress={toAccount}>{t('banned.check')}</Button> : undefined} />
  ) : tab !== 'listings' ? null : list.error && !all ? (
      // A refusal sent nowhere (an access-key session) says why and offers no retry; the page's own "try again" line
      // is for a read that failed.
      withOverview(<ErrorState title={t('error.title')} body={refusedHere(list.error) ? undefined : t('error.body')} error={list.error} onRetry={refusedHere(list.error) ? undefined : () => void list.refetch()} />)
    ) : null;

  const listings = (
    <DataTable
      label={t('tab.listings')}
      columns={columns}
      view={view}
      search={t('search')}
      /* The chip filters in one bar under the search row; the kind switch stays in it. */
      filterBar="tier"
      countLabel={(count) => t('count', { count })}
      onRetry={() => void list.refetch()}
      onRefresh={() => void list.refetch()}
      /* One line over the listings: bare metal's "from". */
      toolbarNote={bareFrom !== null ? t('servers.from', { amount: money(bareFrom) }) : undefined}
      empty={
        <EmptyState
          icon="market"
          title={t('empty.title')}
          body={t('empty.body')}
          size="sm"
          action={
            <Button variant="secondary" onPress={() => go(billing.servers({ tab: 'reservations' }))}>
              {t('empty.reservations')}
            </Button>
          }
        />
      }
      noViewMenu
    />
  );

  const reservations = (
    <DataTable
      label={t('res.title')}
      columns={resColumns}
      view={resView}
      search={t('res.search')}
      countLabel={(count) => t('res.count', { count })}
      {...(res.data && res.data.total > res.data.rows.length ? { total: res.data.total } : {})}
      {...(res.hasMore || res.loadingMore ? { onLoadMore: res.more, loadingMore: res.loadingMore } : {})}
      onRetry={() => void res.refetch()}
      actions={(r) => (r.state === 'fulfilled' && computersLink ? [{ id: 'view', label: t('res.viewRow'), icon: 'external', inline: true, onAction: () => followPageLink(computersLink, go) }] : [])}
      onRefresh={() => void res.refetch()}
      empty={
        <EmptyState
          icon="market"
          title={t('res.empty.title')}
          body={t('res.empty.body')}
          size="sm"
          action={
            <Button onPress={() => go(billing.servers())}>{t('res.empty.action')}</Button>
          }
        />
      }
      noViewMenu
    />
  );

  const term = current ? termFor(current, days) : null;
  const sel = current ? billing.servers({ sel: current.id }) : FROM;

  return (
    <ListDetailPage
      mode="side"
      inspectorWidth={480}
      storageKey="market"
      header={header}
      views={views}
      banner={banner}
      toolbar={toolbar}
      list={blockedList ?? (tab === 'listings' ? withOverview(listings) : reservations)}
      // Each tab's table keeps its own selection key: closing or following moves that one only.
      selectionParam={tab === 'reservations' ? 'rsel' : 'sel'}
      {...(tab === 'listings' && current && !blockedList
        ? {
            detailFooter: (
              <OrderFooter
                listing={current}
                term={term}
                balance={balance.data?.cents ?? null}
                referral={balance.data?.referral ?? 0}
                general={balance.data?.general ?? null}
                balanceFailed={!!balance.error}
                banned={banned}
                from={sel}
                onSimilar={() => go(billing.servers({ country: current.country }))}
              />
            ),
          }
        : tab === 'reservations' && currentRes?.serverId && computersLink && !blockedList
          ? { detailFooter: <ReservationFooter reservation={currentRes} /> }
          : {})}
      detail={
        blockedList ? null : tab === 'reservations' ? (
          !resView.activeId ? null : currentRes ? (
            <>
              <DetailHeader
                title={currentRes.name || t('res.unnamed')}
                status={<StatusPill tone={RES_TONE[currentRes.state]}>{t(`res.state.${currentRes.state}` as 'res.state.pending')}</StatusPill>}
              />
              <ReservationDetail reservation={currentRes} now={now} />
            </>
          ) : res.data ? (
            <EmptyState icon="market" title={t('res.notFound')} size="sm" />
          ) : null
        ) : tab !== 'listings' || !view.activeId ? null : current ? (
          <>
            <DetailHeader
              title={current.name}
              status={
                !buyable(current) ? (
                  <StatusPill tone="neutral">{t('chip.unbuyable')}</StatusPill>
                ) : current.kind === 'offer' ? (
                  <StatusPill tone="neutral">{t('kind.offer')}</StatusPill>
                ) : (
                  <StatusPill tone="ok" dot>
                    {listingRules.instantPromise.label}
                  </StatusPill>
                )
              }
              meta={placeLine(t, current)}
            />
            <Detail listing={current} term={term} onDays={(d) => setDays(d, { replace: true })} />
          </>
        ) : (
          <EmptyState icon="market" title={t('detail.notFound')} size="sm" />
        )
      }
    />
  );
}

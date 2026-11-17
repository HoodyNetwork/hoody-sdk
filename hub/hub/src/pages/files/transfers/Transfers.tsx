// Transfers (tab=transfers): what is moving on the
// computers, as the Backups and Storage tabs show their collections. "At a glance" counts what is moving, what may
// have gone through and what did not finish; one Transfers table lists, with a row each: the Files changes on their
// way (core sendingChanges, any tab), the link downloads this tab sent, follows or a hold keeps (link/LinkBand's
// useLinkLines, the same reads the folder band uses), and the downloads running on the shown computers that this tab
// does not follow (GET /api/v1/downloads), each with its progress and state. Cancel or Check again is on the row;
// Stop tracking (warned) and Clear are in its menu. Downloads show their file name and folder only, never the link or
// the program's error text. Held Files changes and uploads keep their own lines with Check again (changes.tsx
// HeldBand, as in Browse), in the table's notices under their computer. Computers listed: the panes' computers, then
// any computer something is on its way, held or followed on, in any realm (transfers stay listed under their
// computer after a realm switch).
import { AnatomySection, Band, createColumnHelper, DataTable, Facts, Meter, Stack, StatusPill, TextButton, useSearch, useStrings, type Fact, type SectionState } from '@kit';
import { sendingChanges, useAttemptsVersion, useChangesVersion } from '@core';
import { useState } from 'react';
import { HeldBand } from '../changes';
import { FILES_LOCK, stateOf, useHeldOn, useUploadsOn, type ChangeIdentity, type FilesComputer, type FilesComputers } from '../data';
import { paneComputer, panesOf } from '../logic';
import { RestDialog } from '../Rest';
import { useBatches } from '../uploadRun';
import { busyComputers, useRoutes } from './routes';
import { useHeldLinks, useLinkEntries, useRunning } from '../link/data';
import { useLinkLines } from '../link/LinkBand';
import { GLANCE_OF, HeldLinkRow, KeyedStore, LinkEntryRow, RowStore, RunningRow, STATE_TONE, orderOf, sendingRow, useStore, usePut, type TransferRow } from './rows';
import strings from './transfers.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The Files changes on their way to a computer now (any tab), newest identity shape only. */
const sendingOn = (computer: string) => sendingChanges(FILES_LOCK).filter((x) => x.attributed && text(obj(x.identity).computer) === computer && typeof obj(x.identity).kind === 'string');

/** The computers the panel lists: the panes' computers first, then those with something on its way, held or
 *  followed here. One outside the shown realm is addressed by the route kept while it was shown (routes.ts); with
 *  none kept it is named from what its transfer recorded (its reads then fail and nothing it holds is freed). */
export function useTransferComputers(computers: FilesComputers, single: boolean): { readonly list: readonly FilesComputer[]; readonly shown: ReadonlySet<string> } {
  useAttemptsVersion();
  useChangesVersion();
  const entries = useLinkEntries();
  const routed = useRoutes();
  const search = useSearch();
  const rows = computers.rows ?? [];
  const panes = panesOf(search);
  const shown = new Set([panes.a, ...(single ? [] : [panes.b])].flatMap((u) => { const c = paneComputer(rows, u); return c ? [c.id] : []; }));
  const busy = busyComputers(entries);
  const first = rows.filter((c) => shown.has(c.id));
  const rest = [...busy].filter(([id]) => !shown.has(id))
    .map(([id, name]): FilesComputer => rows.find((c) => c.id === id) ?? routed(id) ?? { id, name: name || id.slice(-4), project_id: '', server_name: '', status: '', rules: 'unknown' });
  return { list: [...first, ...rest.sort((a, b) => a.name.localeCompare(b.name))], shown };
}

/** One computer's read of its running downloads, and what its held changes and uploads add to the glance. */
interface ComputerState {
  readonly key: string;
  readonly order: string;
  readonly name: string;
  /** Shown and running: its running downloads are read. */
  readonly on: boolean;
  readonly reading: boolean;
  /** The last read failed; `stale`: an earlier answer is still shown. */
  readonly failed: boolean;
  readonly stale: boolean;
  readonly error: unknown;
  readonly retry: () => void;
  /** Something is on its way, held or followed here (the rows, the held changes, the uploads). */
  readonly busy: boolean;
  /** Uploads running here, and held changes and uploads that may have gone through (they keep their own lines). */
  readonly moving: number;
  readonly unknown: number;
}

const COL = createColumnHelper<TransferRow>();

export function Transfers({ computers, single }: { computers: FilesComputers; single: boolean }) {
  const t = useStrings(strings);
  const { list, shown } = useTransferComputers(computers, single);
  const [rest, setRest] = useState<{ c: FilesComputer; id: ChangeIdentity } | null>(null);
  const [rowStore] = useState(() => new RowStore());
  const [stateStore] = useState(() => new KeyedStore<ComputerState>());
  const rows = useStore(rowStore);
  const states = useStore(stateStore).filter((x) => list.some((c) => c.id === x.key));
  useChangesVersion();
  // A change core cannot attribute is on no computer: its notice says so, and it still counts as moving.
  const unattributed = sendingChanges(FILES_LOCK).filter((x) => !x.attributed).length;
  if (list.length === 0 && unattributed === 0) return <AnatomySection id="files-transfers-none" title={t('empty.title')} description={t('empty.body')} />;

  const reading = states.filter((x) => x.reading);
  const failed = states.filter((x) => x.failed);
  // Each quiet computer still says it is quiet beside an unattributed change.
  const busy = states.some((x) => x.busy);
  const quiet = rows.length === 0 && !busy && reading.length === 0 && failed.length === 0 && states.length === list.length;
  const quietOn = list.filter((c) => shown.has(c.id));
  // With no row yet and one computer, its failed read is the table's own state; otherwise every failed read is a notice
  // that names its computer, each with its own Check again.
  const ownFailed = rows.length === 0 && list.length === 1 ? failed[0] : undefined;
  const state: SectionState = rows.length > 0 ? { kind: 'ready' }
    : ownFailed ? { kind: 'failed', error: ownFailed.error, onRetry: () => void ownFailed.retry() }
      : reading.length > 0 ? { kind: 'loading', variant: 'table', rows: 1 }
        : { kind: 'ready' };
  const itemText = (r: TransferRow) => (r.to === null ? r.item : `${r.item} → ${r.to}`);
  const columns = [
    // A list row's line 2 holds three fields: "computer · what", the progress and the details (never cut off).
    COL.display({ id: 'onWhat', header: t('col.computer'), meta: { list: 'meta', table: false, label: t('col.computer') }, cell: (x) => t('list.onWhat', { computer: x.row.original.computer, what: t(`what.${x.row.original.what}`) }) }),
    COL.display({ id: 'on', header: t('col.computer'), meta: { list: false, label: t('col.computer'), priority: 2, size: 'fit', fitText: (r) => r.computer, maxWidth: 200 }, cell: (x) => x.row.original.computer }),
    COL.display({ id: 'what', header: t('col.what'), meta: { list: false, label: t('col.what'), priority: 3, size: 'fit', fitText: (r) => t(`what.${r.what}`) }, cell: (x) => t(`what.${x.row.original.what}`) }),
    COL.display({ id: 'item', header: t('col.item'), meta: { pinned: true, list: 'primary', label: t('col.item'), size: 'fit', fitText: itemText, maxWidth: 360 }, cell: (x) => itemText(x.row.original) }),
    COL.display({
      id: 'progress',
      header: t('col.progress'),
      // The meter (60 px) and its gap beside the words.
      meta: { list: 'meta', label: t('col.progress'), priority: 2, size: 'fit', fitText: (r) => r.progress?.words ?? '', fitPad: 72, maxWidth: 280 },
      cell: (x) => {
        const p = x.row.original.progress;
        if (!p) return null;
        return <>{p.pct === null ? null : <Meter value={p.pct} tone="neutral" label={t('progress.meter', { name: x.row.original.item, done: p.words })} />} {p.words}</>;
      },
    }),
    COL.display({
      id: 'state',
      header: t('col.state'),
      meta: { list: 'status', label: t('col.state'), size: 'fit', fitText: (r) => t(`state.${r.state}`), fitPad: 24 },
      cell: (x) => <StatusPill tone={STATE_TONE[x.row.original.state]}>{t(`state.${x.row.original.state}`)}</StatusPill>,
    }),
    // What the state alone does not say (a failed Cancel, what Check again found, a row that may have finished): cut with
    // its tooltip when the row is narrow, kept at every table width (priority 1, as State) and on a list row's line 2.
    COL.display({ id: 'detail', header: t('col.detail'), meta: { list: 'meta', label: t('col.detail'), priority: 1, size: 'fill' }, cell: (x) => x.row.original.detail }),
  ];

  // Every notice of the table: a change on no computer, a failed read beside rows, then each computer's held Files
  // changes and uploads (changes.tsx HeldBand, the lines Browse shows above the folder).
  const notices = (
    <>
      {unattributed > 0 ? <Band tone="neutral" size="table">{t('sending.unknown')}</Band> : null}
      {(ownFailed ? [] : failed).map((x) => (
        <Band key={`failed:${x.key}`} tone="warn" size="table" error={x.error} actions={<TextButton onPress={() => void x.retry()}>{t('running.retry')}</TextButton>}>
          {x.stale ? t('running.stale', { computer: x.name }) : t('running.failed', { computer: x.name })}
        </Band>
      ))}
      {list.map((c) => <HeldBand key={`held:${c.id}`} c={c} onRest={(id) => setRest({ c, id })} />)}
    </>
  );

  return (
    <Stack>
      {list.map((c, i) => <OnComputer key={c.id} c={c} index={i} shown={shown.has(c.id)} rowStore={rowStore} stateStore={stateStore} />)}
      <Glance t={t} rows={rows} states={states} unattributed={unattributed} />
      <AnatomySection
        id="files-transfers"
        title={t('title')}
        description={t('lede')}
        state={state}
        note={reading[0] ? t('running.reading', { computer: reading[0].name }) : rows.length > 0 || failed.length > 0 ? undefined : !quiet ? t('empty.others') : quietOn.length === 1 ? t('quiet', { computer: quietOn[0]!.name }) : t('empty.title')}
        notices={notices}
        flush
      >
        {rows.length > 0 ? (
        <DataTable
          label={t('title')}
          data={rows}
          columns={columns}
          getRowId={(r) => r.key}
          fill={false}
          bare
          noViewMenu
          sortParam={false}
          onRowAction={false}
          actions={rowStore.actionsOf}
        />
        ) : null}
      </AnatomySection>
      {rest ? <RestDialog c={rest.c} id={rest.id} onClose={() => setRest(null)} /> : null}
    </Stack>
  );
}

/** Moving, outcome unknown, didn't finish. Moving is a floor while a computer's running downloads are read or their
 *  read failed (they may add to it); an unknown outcome is counted as unknown, never as not finished. */
function Glance({ t, rows, states, unattributed }: { t: T; rows: readonly TransferRow[]; states: readonly ComputerState[]; unattributed: number }) {
  // A row from an answer a failed read could not renew may have finished: it is not counted (its read is open).
  const count = (k: 'moving' | 'unknown' | 'failed') => rows.filter((r) => GLANCE_OF[r.state] === k && !r.stale).length;
  const moving = count('moving') + unattributed + states.reduce((n, x) => n + x.moving, 0);
  const stale = rows.some((r) => r.stale);
  const open = stale || states.some((x) => x.reading || x.failed);
  const items: Fact[] = [
    { label: t('glance.moving'), value: !open ? String(moving) : moving > 0 ? t('glance.atLeast', { count: moving }) : stale || states.some((x) => x.failed) ? t('glance.cantTell') : t('glance.reading') },
    { label: t('glance.unknown'), value: String(count('unknown') + states.reduce((n, x) => n + x.unknown, 0)) },
    { label: t('glance.failed'), value: String(count('failed')) },
  ];
  return (
    <AnatomySection id="files-transfers-glance" title={t('glance.title')} state={{ kind: 'ready' }}>
      <Facts items={items} columns={3} label={t('glance.title')} />
    </AnatomySection>
  );
}

/** One computer's rows and read state: its changes on their way, its link downloads, and (shown computers only) the
 *  downloads running there that this tab is not following (another tab, a reload, another client). Draws only its
 *  rows' dialogs. A shown computer is quiet only after its running downloads were read, and never while the last
 *  read failed. */
function OnComputer({ c, index, shown, rowStore, stateStore }: { c: FilesComputer; index: number; shown: boolean; rowStore: RowStore; stateStore: KeyedStore<ComputerState> }) {
  const t = useStrings(strings);
  useChangesVersion();
  const on = shown && stateOf(c) === 'running';
  const q = useRunning(c, on);
  const entries = useLinkEntries(c.id);
  const lines = useLinkLines(c);
  const sending = sendingOn(c.id);
  const heldChanges = useHeldOn(c.id);
  const uploads = useUploadsOn(c.id);
  const batches = useBatches(c.id);
  const mine = new Set(entries.map((e) => e.id));
  const busy = sending.length + heldChanges.length + uploads.length + useHeldLinks(c.id).length + entries.length > 0;
  const running = on ? (q.data ?? []).filter((r) => r.status === 'downloading' && !mine.has(r.id)) : [];
  const failed = on && q.isError;
  // Uploads: this tab's running batches move; a held batch with files that may have gone through is unknown (one sent
  // from another tab moves; one with only files never sent is neither).
  const moving = batches.filter((b) => b.phase === 'running').length + uploads.filter((h) => h.hold.inFlight === 'elsewhere').length;
  const unknown = heldChanges.length + uploads.filter((h) => !h.hold.inFlight && (!h.meta || h.meta.files.length > 0)).length;
  usePut(stateStore.put, c.id, {
    key: c.id, order: orderOf(index, 0, 0), name: c.name, on, reading: on && q.data === undefined && !failed, failed, stale: failed && q.data !== undefined,
    error: failed ? q.error : null, retry: () => void q.refetch(), busy, moving, unknown,
  });
  const put = rowStore.put;
  const sendRows = sending.map((x, i) => sendingRow(t, c, obj(x.identity), `send:${c.id}:${i}`, orderOf(index, 1, i)));
  return (
    <>
      {sendRows.map((r) => <Put key={r.key} put={put} row={r} />)}
      {lines.mine.map(({ e, rec, retry }, i) => <LinkEntryRow key={e.id} c={c} e={e} rec={rec} retry={retry} put={put} order={orderOf(index, 2, i)} />)}
      {lines.held.map((h, i) => <HeldLinkRow key={h.hold.id} c={c} held={h} put={put} order={orderOf(index, 3, i)} />)}
      {running.map((r, i) => <RunningRow key={r.id} c={c} r={r} put={put} order={orderOf(index, 4, i)} stale={failed} />)}
    </>
  );
}

function Put({ put, row }: { put: RowStore['put']; row: TransferRow }) {
  usePut(put, row.key, row);
  return null;
}

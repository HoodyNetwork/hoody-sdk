// Shared folders: the storage shares of the computer the Storage tab shows, read only. Files' StoragePanel
// mounts it under the Storage tab while the sharesUi flag is on (flag.ts); links.ts hands it to the computer page for
// its own Storage tab. storage/ itself never imports it (storage/imports.test.ts). Two lists: the folders this computer shares and the folders shared with it;
// in Files a switch shows every computer's shares as one list instead (section.ts allRows). Shares live in the Hoody
// API, not on the computer, so they read while it is stopped too.
// Each row shows one state (state.ts shareState) as a pill and one line in the Hub's words, never the API's own
// instruction text, and links into Files: the shared folder on its computer, and where it appears on the other. A
// computer the realm view does not list has no link and is named as such. With `canWrite` (an account session) the
// section also shares a folder and changes or stops a share (ShareDialog.tsx, manage.ts); without it, it only reads.
import { refusal } from '@core';
import { AnatomySection, Band, CellLines, ConfirmDialog, HeldBand, Outcome, createColumnHelper, DataTable, EmptyState, formatDate, RowNote, SegmentedControl, StatusPill, statusPillMetrics, SubSection, useGo, useNow, useStrings, type RowActionEntry, type SectionState } from '@kit';
import { useEffect, useMemo, useState } from 'react';
import { useFilesComputers } from '../data';
import { links } from '../hrefs';
import { useShares } from './data';
import { ShareDialog } from './ShareDialog';
import { refusalOf } from './changes';
import { lastOn, useShareWrites, type ShareWrites } from './manage';
import { allRows, linkHandle, listKind, runningOf, SHARE_PILL, type ShareComputer, type ShareScope } from './section';
import { shareState, type ShareState } from './state';
import strings from './strings.en.json';
import { mountPathOk, type ShareList, type ShareRow } from './wire';

type T = ReturnType<typeof useStrings<typeof strings>>;
interface Shown { row: ShareRow; state: ShareState; from: ShareComputer | undefined; to: ShareComputer | undefined; fromHandle: string | null; toHandle: string | null }
type Side = 'given' | 'received' | 'all';
const COL = createColumnHelper<Shown>();

/** `scopes`: offer the switch to every computer's shares (Files only; the computer page shows its own computer).
 *  `canWrite`: the session may change shares (an account session); `sharePath`: open Share a folder for that folder. */
export function SharesSection({ computer, scopes = false, canWrite = false, sharePath, onShareClosed }: { computer: { id: string }; scopes?: boolean; canWrite?: boolean; sharePath?: string; onShareClosed?: () => void }) {
  const t = useStrings(strings);
  const [scope, setScope] = useState<ShareScope>('this');
  const shown = scopes ? scope : 'this';
  const [fast, setFast] = useState(false);
  const given = useShares('given', shown, computer.id, fast);
  const received = useShares('received', shown, computer.id, fast);
  const computers = useFilesComputers();
  const byId = useMemo(() => new Map((computers.rows ?? []).map((c) => [c.id, c] as const)), [computers.rows]);
  // Unix seconds for shareState: ticks each minute, so an end that passes while shown says so.
  const now = Math.floor(useNow(true, 60_000) / 1000);
  const regiven = () => void given.refetch();
  const rereceived = () => void received.refetch();
  const reboth = () => { regiven(); rereceived(); };
  // Share a folder's read just before its send: what the list shown gives (this computer's, or every computer's), now.
  const readGiven = async () => {
    const r = await given.refetch();
    return r.status === 'success' && r.data ? { list: r.data } : { error: r.error ?? undefined };
  };
  const onScreen = useMemo(() => [...(given.data?.rows ?? []), ...(received.data?.rows ?? [])], [given.data, received.data]);
  const writes = useShareWrites({ rows: onScreen, computers: computers.rows ?? [], onChanged: reboth });
  const w = writes;
  const [sharing, setSharing] = useState(false);
  const enabledWhy = refusalOf(w.enabled.outcome), modeWhy = refusalOf(w.mode.outcome), retryWhy = refusalOf(w.retry.outcome), stopWhy = refusalOf(w.stop.outcome);
  // The open question's words: about the share it was opened for, by its folder and its two computers.
  const asked = w.ask ? { path: w.ask.row.sourcePath, from: w.ask.from, to: w.ask.to } : { path: '', from: '', to: '' };
  const askKind = w.ask?.kind ?? 'off';
  const askTitle = askKind === 'stop' ? t('stop.title', asked) : askKind === 'rw' ? t('rw.title', asked) : askKind === 'ro' ? t('ro.title', asked) : t('off.title', asked);
  const askBody = askKind === 'stop' ? (w.ask?.row.mode === 'readwrite' ? t('stop.bodyRw', asked) : t('stop.body', asked)) : askKind === 'rw' ? t('rw.body', asked) : askKind === 'ro' ? t('ro.body', asked) : t('off.body', asked);
  const askGo = askKind === 'stop' ? t('stop.go') : askKind === 'rw' ? t('rw.go') : askKind === 'ro' ? t('ro.go') : t('off.go');
  const source = byId.get(computer.id);
  const view = (l: ShareList | undefined): Shown[] => (l?.rows ?? []).map((row) => {
    const from = byId.get(row.sourceComputerId);
    const to = row.targetComputerId ? byId.get(row.targetComputerId) : undefined;
    const listed = computers.rows ?? [];
    const whole = computers.complete === true;
    return {
      row, from, to,
      fromHandle: linkHandle(from, listed, whole),
      toHandle: linkHandle(to, listed, whole),
      state: shareState(row, { now, sourceRunning: runningOf(from), targetRunning: runningOf(to), ...(canWrite ? writes.contextOf(row) : {}) }),
    };
  });
  const givenRows = view(given.data);
  const receivedRows = view(received.data);
  const allShown = given.data && received.data ? view({ rows: allRows(given.data, received.data), dropped: 0 }) : [];
  const anyFast = [...givenRows, ...receivedRows].some((r) => r.state.poll === 'fast');
  useEffect(() => setFast(anyFast), [anyFast]);
  const dropped = (given.data?.dropped ?? 0) + (received.data?.dropped ?? 0);

  // Each list's state, as the kit draws it (section.ts listKind): an unreadable list fails with Retry, never "empty".
  const gk = listKind([given]);
  const rk = listKind([received]);
  const ak = listKind([given, received]);
  const givenState: SectionState = gk === 'failed'
    ? { kind: 'failed', error: given.error, onRetry: regiven, busy: given.isFetching }
    : gk === 'loading' ? { kind: 'loading', variant: 'table', rows: 2 }
      : gk === 'stale' ? { kind: 'stale', shown: givenRows.length, error: given.error, onRetry: regiven, busy: given.isFetching } : { kind: 'ready' };
  const receivedState: SectionState = rk === 'failed'
    ? { kind: 'failed', error: received.error, onRetry: rereceived, busy: received.isFetching }
    : rk === 'loading' ? { kind: 'loading', variant: 'table', rows: 2 }
      : rk === 'stale' ? { kind: 'stale', shown: receivedRows.length, error: received.error, onRetry: rereceived, busy: received.isFetching } : { kind: 'ready' };
  const allState: SectionState = ak === 'failed'
    ? { kind: 'failed', error: given.isError ? given.error : received.error, onRetry: reboth, busy: given.isFetching || received.isFetching }
    : ak === 'loading' ? { kind: 'loading', variant: 'table', rows: 2 }
      : ak === 'stale' ? { kind: 'stale', shown: allShown.length, error: given.isError ? given.error : received.error, onRetry: reboth, busy: given.isFetching || received.isFetching } : { kind: 'ready' };

  return (
    <AnatomySection
      id="storage-shares"
      title={t('title')}
      description={shown === 'all' ? t('ledeAll') : t('lede')}
      {...(canWrite && source ? { actions: { primary: { id: 'share', label: t('act.share'), icon: 'plus' as const, opens: 'dialog' as const, onPress: () => setSharing(true), ...(writes.wait && !writes.create.held ? { disabledReason: writes.wait } : {}) } } } : {})}
      notices={dropped > 0 || canWrite ? (
        <>
          {dropped > 0 ? <Band tone="warn" size="table" /* noDetails: the answers came; some rows in them could not be read */>{t('dropped', { count: dropped })}</Band> : null}
          {canWrite && w.create.held ? <HeldBand overlayId="files-shares-held-dismiss-create" text={t('held.create', { path: w.heldPath(w.create.held), to: w.heldTo(w.create.held) })} readOnly={w.create.elsewhere !== null} onCheck={async () => { if (await w.create.check()) reboth(); }} onDismiss={w.create.dismiss} /> : null}
          {!canWrite ? null : w.enabled.held
            ? <HeldBand overlayId="files-shares-held-dismiss-enabled" text={w.enabled.held.enabled === true ? t('held.setEnabled.on', { path: w.heldPath(w.enabled.held) }) : t('held.setEnabled.off', { path: w.heldPath(w.enabled.held) })} readOnly={w.enabled.elsewhere !== null} onCheck={async () => { if (await w.enabled.check()) reboth(); }} onDismiss={w.enabled.dismiss} />
            : <Outcome outcome={w.enabled.outcome} doneText={lastOn(w.enabled.outcome) ? t('done.setEnabled.on') : t('done.setEnabled.off')} wrap {...(enabledWhy ? { detail: t(`err.${enabledWhy}`) } : {})} error={refusal(w.enabled.outcome)} />}
          {!canWrite ? null : w.mode.held
            ? <HeldBand overlayId="files-shares-held-dismiss-mode" text={t('held.setMode', { path: w.heldPath(w.mode.held) })} readOnly={w.mode.elsewhere !== null} onCheck={async () => { if (await w.mode.check()) reboth(); }} onDismiss={w.mode.dismiss} />
            : <Outcome outcome={w.mode.outcome} doneText={t('done.setMode')} wrap {...(modeWhy ? { detail: t(`err.${modeWhy}`) } : {})} error={refusal(w.mode.outcome)} />}
          {!canWrite ? null : w.retry.held
            ? <HeldBand overlayId="files-shares-held-dismiss-retry" text={t('held.retry', { path: w.heldPath(w.retry.held) })} readOnly={w.retry.elsewhere !== null} onCheck={async () => { if (await w.retry.check()) reboth(); }} onDismiss={w.retry.dismiss} />
            : <Outcome outcome={w.retry.outcome} doneText={t('done.retry')} wrap {...(retryWhy ? { detail: t(`err.${retryWhy}`) } : {})} error={refusal(w.retry.outcome)} />}
          {!canWrite ? null : w.stop.held
            ? <HeldBand overlayId="files-shares-held-dismiss-stop" text={t('held.stop', { path: w.heldPath(w.stop.held) })} readOnly={w.stop.elsewhere !== null} onCheck={async () => { if (await w.stop.check()) reboth(); }} onDismiss={w.stop.dismiss} />
            : <Outcome outcome={w.stop.outcome} doneText={t('done.stop')} wrap {...(stopWhy ? { detail: t(`err.${stopWhy}`) } : {})} error={refusal(w.stop.outcome)} />}
        </>
      ) : undefined}
    >
      {scopes ? (
        <SegmentedControl<ShareScope>
          label={t('scope.label')}
          value={scope}
          onChange={setScope}
          items={[{ id: 'this', label: t('scope.this') }, { id: 'all', label: t('scope.all') }]}
        />
      ) : null}
      {shown === 'all' ? (
        <SubSection id="storage-shares-all" title={t('all.title')} state={allState}>
          <ShareTable side="all" writes={canWrite ? writes : null} rows={allShown} emptyTitle={t('all.empty')} emptyBody={t('all.emptyBody')} />
        </SubSection>
      ) : (
        <>
          <SubSection id="storage-shares-given" title={t('given.title')} state={givenState}>
            <ShareTable side="given" writes={canWrite ? writes : null} rows={givenRows} emptyTitle={t('given.empty')} emptyBody={t('given.emptyBody')} />
          </SubSection>
          <SubSection id="storage-shares-received" title={t('received.title')} state={receivedState}>
            <ShareTable side="received" writes={canWrite ? writes : null} rows={receivedRows} emptyTitle={t('received.empty')} emptyBody={t('received.emptyBody')} />
          </SubSection>
        </>
      )}
      {canWrite && source ? (
        <ShareDialog
          isOpen={sharing || sharePath !== undefined}
          onClose={() => { setSharing(false); onShareClosed?.(); }}
          source={source}
          path={sharePath ?? ''}
          computers={computers.rows ?? []}
          given={given.data?.rows ?? []}
          readGiven={readGiven}
          create={writes.create}
          wait={writes.wait}
          own={writes.create.elsewhere === null}
          onShared={reboth}
        />
      ) : null}
      {canWrite ? (
        <ConfirmDialog
          overlayId="files-shares-ask"
          isOpen={w.ask !== null}
          onOpenChange={(o) => { if (!o) w.closeAsk(); }}
          title={askTitle}
          body={askBody}
          confirmLabel={askGo}
          tone={w.ask?.kind === 'stop' || w.ask?.kind === 'rw' ? 'danger' : 'default'}
          busy={w.busy}
          onConfirm={w.confirm}
        />
      ) : null}
    </AnatomySection>
  );
}

const nameOf = (t: T, c: ShareComputer | undefined): string => c?.name ?? t('computer.unknown');
const toName = (t: T, s: Shown): string => (s.row.targetType === 'project' ? t('with.project') : nameOf(t, s.to));


/** One list as a table; the render site gives its empty words (the list's own). */
function ShareTable({ side, rows, emptyTitle, emptyBody, writes }: { side: Side; rows: readonly Shown[]; emptyTitle: string; emptyBody: string; writes: ShareWrites | null }) {
  const t = useStrings(strings);
  const go = useGo();
  const fromCell = (s: Shown) => (
    <CellLines>
      {s.row.sourcePath}
      {side !== 'given' ? <RowNote cut>{nameOf(t, s.from)}</RowNote> : null}
    </CellLines>
  );
  const atText = (s: Shown): string => s.row.mountPath ?? t('at.unknown');
  const endsText = (s: Shown): string => (!s.row.expiryKnown ? t('ends.unknown') : s.row.expiresAt === null ? t('ends.never') : formatDate(s.row.expiresAt * 1000));
  const columns = [
    COL.display({ id: 'folder', header: side === 'given' ? t('col.folder') : t('col.from'), meta: { pinned: true, list: 'primary', label: side === 'given' ? t('col.folder') : t('col.from') }, cell: (x) => fromCell(x.row.original) }),
    ...(side !== 'received' ? [COL.display({ id: 'with', header: t('col.with'), meta: { list: 'meta', label: t('col.with'), size: 'fit', fitText: (s: Shown) => toName(t, s) }, cell: (x) => toName(t, x.row.original) })] : []),
    COL.display({ id: 'access', header: t('col.access'), meta: { list: 'meta', label: t('col.access'), size: 'fit', fitText: (s: Shown) => t(`access.${s.row.mode}`) }, cell: (x) => t(`access.${x.row.original.row.mode}`) }),
    // As wide as the longest pill on the list, so a pill is never cut; its line wraps under it.
    COL.display({ id: 'status', header: t('col.status'), meta: { list: 'status', label: t('col.status'), size: 'fit', fitText: (s: Shown) => t(`pill.${s.state.kind}`), fitMetrics: statusPillMetrics(true), minWidth: 180 }, cell: (x) => <ShareStatus s={x.row.original} /> }),
    COL.display({ id: 'at', header: t('col.at'), meta: { list: 'meta', label: t('col.at') }, cell: (x) => atText(x.row.original) }),
    ...(side === 'given' ? [COL.display({ id: 'ends', header: t('col.ends'), meta: { list: 'meta', label: t('col.ends'), size: 'fit', fitText: endsText }, cell: (x) => endsText(x.row.original) })] : []),
  ];
  const rowActions = (s: Shown): RowActionEntry[] => {
    const original = s.fromHandle ? links.at(s.fromHandle, s.row.sourcePath) : null;
    // Where the folder appears, only when the answer says it and the servers mount that path (an older share's never).
    const at = s.row.mountPath !== null && mountPathOk(s.row.mountPath) && s.toHandle ? links.at(s.toHandle, s.row.mountPath) : null;
    const name = toName(t, s);
    const fromName = nameOf(t, s.from);
    const change = writes ? writes.actionsOf(s.row, s.state, { from: fromName, to: name }, s.from !== undefined) : [];
    return side === 'received'
      ? [
          ...(at ? [{ id: 'open', label: t('act.open'), inline: true, onAction: () => go(at) }] : []),
          ...(original ? [{ id: 'original', label: t('act.openOriginal', { name: fromName }), onAction: () => go(original) }] : []),
          // The person owns both ends: the receiving side can stop the share too, nothing else.
          ...change.slice(-2),
        ]
      : [
          ...(original ? [{ id: 'open', label: t('act.open'), inline: true, onAction: () => go(original) }] : []),
          ...(at ? [{ id: 'openOn', label: t('act.openOn', { name }), onAction: () => go(at) }] : []),
          ...(s.row.mountPath !== null ? [{ id: 'copyAt', label: t('act.copyAt', { name }), copy: s.row.mountPath, onAction: () => undefined }] : []),
          ...change,
        ];
  };
  return (
    <DataTable
      label={side === 'given' ? t('given.title') : side === 'received' ? t('received.title') : t('all.title')}
      data={[...rows]}
      columns={columns}
      getRowId={(s) => s.row.id}
      fill={false}
      bare
      noViewMenu
      sortParam={false}
      onRowAction={false}
      countLabel={(n) => t('rows.count', { count: n })}
      empty={<EmptyState icon="share" size="sm" title={emptyTitle} body={emptyBody} />}
      actions={rowActions}
    />
  );
}

/** The state's pill and its line; a share whose writes may have been lost says so on every state. */
export function ShareStatus({ s }: { s: Shown }) {
  const t = useStrings(strings);
  const k = s.state.kind;
  const pill = SHARE_PILL[k];
  const words = { from: nameOf(t, s.from), to: toName(t, s) };
  return (
    <CellLines>
      <StatusPill tone={pill.tone} {...(pill.dot ? { dot: true } : {})}>{t(`pill.${k}`)}</StatusPill>
      <RowNote>{t(`line.${k}`, words)}</RowNote>
      {s.state.mayHaveLost ? <RowNote>{t('line.lost', words)}</RowNote> : null}
    </CellLines>
  );
}

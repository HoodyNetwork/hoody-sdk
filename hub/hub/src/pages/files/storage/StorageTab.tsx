// The computer's remote storage: connect key-based storage (S3, SFTP, WebDAV, MEGA, SMB, FTP) or sign-in
// storage with a token made by rclone on the person's own machine (Drive, Dropbox, OneDrive, pCloud, Box) to the
// computer's files program, test it, open it as a folder, close the folder, remove it. Each change is sent once
// (C9): a lost answer holds the change until a fresh list proves it, or its sender dismisses exactly that hold
// after a warning. Keys and passwords live only in the add form's state while it is open: never prefilled, cleared
// when sent, when the form closes, when the send fails and when another computer is shown; they go once to the
// computer's own files-program address and are never kept by the Hub (data.ts). A private key or a token is masked
// like a password until the person shows it. Another sender's hold is shown read-only here (only Check again).
// Storage is write-back: each open folder says whether what was written there reached the storage,
// and what waits on the computer (pending uploads) is listed, to deliver, stop, download or discard. A pending upload
// gone from the list is never called delivered: it was delivered or discarded, and the page says it cannot tell.
// Layout: At a glance (counts from the reads above, and the computer's own
// disk when the host page gives it), Waiting to upload first and only while something waits, then one table with a row
// per storage and the folder it is open as, so the same folder never shows twice.
// This folder imports nothing from the computers page (only @core, @kit and the Files page's questions), so both
// Files and a computer's Storage tab can show it.
// Every other type the files program can connect has a form generated from its openapi (providers.gen.json),
// picked from one searchable list with the S3-compatible services as their own choices.
import { portAddress, refusal, routingNode, subjectOf, useHeldChangeOf, useRunner, type HeldChange } from '@core';
import { AnatomySection, Band, Button, Checkbox, CodeBlock, CodeLine, Combobox, ConfirmDialog, createColumnHelper, DangerConfirm, DataTable, Disclosure, Drawer, EmptyState, ErrorState, Facts, formatBytes, formatDate, formatRelative, FormFooter, HeldBand, Meter, Outcome, Row, RowNote, SecretInput, Select, Skeleton, StatusPill, StepList, TextField, Track, TrackStep, useNow, useStrings, useWipeOn, Verdict, VerdictMark, type ActionSpec, type Fact, type OutcomeLike, type RowActionEntry, type SectionState, type Tone } from '@kit';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CONNECT_LOCK, DELIVER_LOCK, DISCARD_LOCK, MOUNT_LOCK, REMOVE_LOCK, STOP_LOCK, UNMOUNT_LOCK, downloadHeld, placed, storageHeldBy, type ConnectVars, type HeldVars, type MountVars, useBackendTest, useBackends, useConnect, useDeliver, useDiscard, useHeld, useHeldFiles, useMount, useMounts, useRemove, useStopHeld, useUnmount } from './data';
import { HELD_REASONS, LABEL_MAX, STALE_MS, addressHasCredentials, boolShown, connectBody, folderLeaf, heldGone, isMounted, portOk, staleRead, suggestLabel, syncOf, tokenText, validLabel, validName, type Backend, type Held, type HeldFile, type Listed, type Mount, type WriteSync } from './logic';
import { EmptyBody } from './EmptyBody';
import { BEST_KNOWN, CHOICES, SECRET_KEYS, STORAGE_KINDS, choiceOf, providerOf, type Choice, type Field, type ProviderId } from './providers';
import strings from './strings.en.json';
import s from './storage.module.css';

type T = ReturnType<typeof useStrings<typeof strings>>;
type Key = keyof typeof strings;
const PROV_LABEL = {
  s3: 'prov.s3', sftp: 'prov.sftp', webdav: 'prov.webdav', mega: 'prov.mega', smb: 'prov.smb', ftp: 'prov.ftp',
  drive: 'prov.drive', dropbox: 'prov.dropbox', onedrive: 'prov.onedrive', pcloud: 'prov.pcloud', box: 'prov.box',
} as const satisfies Record<string, Key>;
type HandId = keyof typeof PROV_LABEL;
/** A generated field (f.label) speaks the openapi's words: the page's strings name only the hand-made fields. */
const fieldLabel = (t: T, f: Field): string => f.label ?? t(`f.${f.key}` as Key);
function fieldHelp(t: T, f: Field): string | undefined {
  if (f.label === undefined) return `f.${f.key}.help` in strings ? t(`f.${f.key}.help` as Key) : undefined;
  const parts = [f.hint ?? ''];
  if (f.default !== undefined && f.kind !== 'boolean') parts.push(t('f.default', { value: String(f.default) }));
  if (f.suggest?.length) parts.push(t('f.examples', { list: f.suggest.slice(0, 6).join(', ') }));
  return parts.filter(Boolean).join(' ') || undefined;
}
/** A provider's name: the page's words, a generated type's own name, or (connected elsewhere, unknown here) as it is. */
const provName = (t: T, type: string): string => (type in PROV_LABEL ? t(PROV_LABEL[type as HandId]) : providerOf(type)?.label ?? type);
const choiceLabel = (t: T, c: Choice): string => c.label ?? provName(t, c.type);
const backendName = (t: T, type: string, user: string): string => (user ? t('row.name', { provider: provName(t, type), user }) : provName(t, type));
/** The name with the end of the id, where one entry must be told from another of the same kind (removal). */
const backendNameId = (t: T, b: Backend): string => t('row.nameId', { name: backendName(t, b.type, b.user), id: b.id.slice(-6) });
/** A choice's starting values: the fields' own (never a secret's), and an S3-compatible service's provider. */
function initialValues(value: string): Record<string, string> {
  const c = choiceOf(value);
  const v: Record<string, string> = Object.fromEntries((providerOf(c?.type ?? value)?.fields ?? []).filter((f) => f.initial !== undefined && !SECRET_KEYS.includes(f.key)).map((f) => [f.key, f.initial as string]));
  if (c?.provider) v.provider = c.provider;
  return v;
}
/** What to read before dismissing a lost connect. Sign-in storage names no account, so the program tells it apart by
 *  its refresh token (the files program's identity rule): adding it again with a new token makes a second entry. Other
 *  storage, sent again with the same details, keeps one. */
// A removal refused after it closed some of the storage's folders (the files program's removal: a folder opened
// elsewhere meanwhile refuses, the ones closed before stay closed, the storage stays): failed, worded as such.
const REMOVE_PARTIAL = new Set(['MOUNT_PATH_CHANGED', 'MOUNT_PATH_IN_USE']);
const removedInPart = (o: { outcome?: string; kind?: string; code?: string } | null | undefined): boolean =>
  !!o && (o.outcome ?? o.kind) === 'failed' && typeof o.code === 'string' && REMOVE_PARTIAL.has(o.code);
const dismissBodyFor = (t: T, type: string): string =>
  providerOf(type)?.token ? t('held.dismissBodyToken', { name: provName(t, type) }) : t('held.dismissBodyConnect');
const withoutSecrets = (v: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET_KEYS.includes(k)));
/** Whether a hold may be dismissed here: not one core says another sender made (that sender settles it). */
const ownHold = (key: string, h: HeldChange | null): boolean => !h || storageHeldBy(key, h) !== 'other';

/** What Storage reads of a computer (the API's computer row has these fields, and more). */
export interface StorageComputer { id: string; status: string; project_id: string; server_name?: string }
type Computer = StorageComputer;

/** A file written into a storage folder, in words (Files shows it beside the file; logic.ts writeSync). `storage`:
 *  the storage's name. */
export function SyncWords({ state, storage }: { state: WriteSync; storage: string }) {
  const t = useStrings(strings);
  return <>{state === 'held' ? t('write.held') : state === 'unknown' ? t('write.unknown') : t(`write.${state}`, { name: storage })}</>;
}

/** What the host page adds. `disk`: the computer's own disk use in bytes (Files: its stats read while it runs; the
 *  computer page: its usage read while usage is on), 'reading' before it answers, null when it cannot say; `onStart`:
 *  Start for a stopped computer, given only when the person can start it. */
export interface StorageExtras {
  disk?: { used: number; total: number } | null | 'reading';
  onStart?: () => void;
}

/** One row of the storage list: a connected storage with one folder it is open as (or none), or a folder whose
 *  storage is no longer listed. A storage open as two folders is two rows, each with its own folder. */
interface Row { key: string; b: Backend | null; m: Mount | null }

const STORAGE_COL = createColumnHelper<Row>();
const HELD_COL = createColumnHelper<Held>();

export function StorageTab({ computer: c, canWrite, disk, onStart }: { computer: Computer; canWrite: boolean } & StorageExtras) {
  const t = useStrings(strings);
  const id = c.id;
  const subject = subjectOf(c);
  // The files program's own address (the computers page's programUrl for 'files'): '' when it is not known.
  const base = portAddress({ id: c.project_id }, { id: c.id, server_name: routingNode(c) }, 1, 'files');
  const running = c.status === 'running';
  const live = running && !!base && placed(c);
  const backends = useBackends(c, live);
  // Read again every few seconds while something on the computer is moving: an upload or delivery of a pending
  // upload, or a folder syncing. Files held for a person (pending) move only when someone acts: the 30 s read.
  const [moving, setMoving] = useState(false);
  const mounts = useMounts(c, live, moving);
  // The clock the "last checked" words read: ticks while shown, so old words say they are old without a new read.
  const now = useNow(true, STALE_MS / 6);
  const held = useHeld(c, live, moving);
  const nowMoving = !!held.data?.items.some((h) => h.state !== 'pending') || !!mounts.data?.items.some((m) => { const st = syncOf(m); return st === 'syncing'; });
  useEffect(() => setMoving(nowMoving), [nowMoving]);
  const pick = (i: Record<string, unknown>) => i.computer === id;
  // core's coreSource mutation keeps its last variables (the keys, in the connect body) until it is reset or the
  // hook unmounts: the add form resets it as soon as the send settles (ConnectDrawer `forget`).
  const connectM = useConnect();
  const connect = useRunner(connectM, { lock: CONNECT_LOCK, pick, vars: (i): ConnectVars => ({ ...subject, type: String(i.type ?? '') as ProviderId, body: {} }) });
  const mount = useRunner(useMount(), { lock: MOUNT_LOCK, pick, vars: (i) => ({ ...subject, backend: String(i.backend ?? ''), label: String(i.label ?? ''), leaf: String(i.leaf ?? '') }) });
  const unmount = useRunner(useUnmount(), { lock: UNMOUNT_LOCK, pick, vars: (i) => ({ ...subject, mount: String(i.mount ?? ''), label: String(i.label ?? '') }) });
  const remove = useRunner(useRemove(), { lock: REMOVE_LOCK, pick, vars: (i) => ({ ...subject, backend: String(i.backend ?? ''), name: String(i.name ?? '') }) });
  const own = {
    connect: ownHold('connect', useHeldChangeOf(CONNECT_LOCK, pick)),
    mount: ownHold('mount', useHeldChangeOf(MOUNT_LOCK, pick)),
    unmount: ownHold('unmount', useHeldChangeOf(UNMOUNT_LOCK, pick)),
    remove: ownHold('remove', useHeldChangeOf(REMOVE_LOCK, pick)),
  };

  const [adding, setAdding] = useState(false);
  const [opening, setOpening] = useState<Backend | null>(null);
  const [closing, setClosing] = useState<Mount | null>(null);
  const [removing, setRemoving] = useState<Backend | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  // The one storage being tested (a read: no write right needed); its rows show the answer.
  const test = useBackendTest(c, testing ?? '', testing !== null);
  // Nothing kept from another computer: open forms, questions, tests and the last outcomes.
  useEffect(() => {
    setAdding(false);
    setOpening(null);
    setClosing(null);
    setRemoving(null);
    setTesting(null);
    setUnread(false);
    connectM.reset();
    connect.reset();
    mount.reset();
    unmount.reset();
    remove.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const bItems = useMemo(() => backends.data?.items ?? [], [backends.data]);
  const mItems = useMemo(() => mounts.data?.items ?? [], [mounts.data]);
  const refresh = () => {
    void backends.refetch();
    void mounts.refetch();
    // Closing a folder keeps what it could not upload (uploads=keep): it shows as waiting.
    void held.refetch();
  };
  const busyRows = !canWrite || !live;
  // Opening and removing wait for each other, and for both lists read whole: whether a folder is open decides
  // whether a removal is offered.
  // A list whose last read failed counts as unread, even with an older copy still shown.
  const backendsWhole = !backends.isError && !!backends.data?.complete;
  const listsWhole = backendsWhole && !mounts.isError && !!mounts.data?.complete;
  // A removal holds this from its confirmation, through its fresh reads, until its send settles.
  const [removeChecking, setRemoveChecking] = useState(false);
  const removeGate = useRef(false);
  const mountLocked = mount.busy || mount.held !== null;
  const unmountLocked = unmount.busy || unmount.held !== null;
  const removeLocked = removeChecking || remove.busy || remove.held !== null;
  const rowLocked = mountLocked || removeLocked || !listsWhole;
  // What the locks are now, for a removal that resumes after its reads (its own render's values are old by then).
  const mountNow = useRef(mountLocked);
  mountNow.current = mountLocked;
  const [unread, setUnread] = useState(false);

  // The row's Close rule, also for a confirmation opened before it changed (a fresh read failing meanwhile).
  const closeBlocked = busyRows || unmountLocked || mounts.isError;
  const closeNow = (m: Mount) => {
    setClosing(null);
    if (closeBlocked) return;
    void unmount.run({ ...subject, mount: m.id, label: m.label || m.path }).then((r) => { if (r.outcome === 'done') refresh(); });
  };
  const removeNow = async (b: Backend) => {
    setRemoving(null);
    setUnread(false);
    if (rowLocked || removeGate.current) return;
    removeGate.current = true;
    setRemoveChecking(true);
    try {
      // Never a removal of storage with a folder open: both lists are read again first, and it goes only if both
      // reads succeeded, whole, and neither shows a folder of it, and no folder of this page is being opened.
      const [fb, fm] = await Promise.all([backends.refetch(), mounts.refetch()]);
      if (fb.isError || fm.isError || !fb.data?.complete || !fm.data?.complete) {
        setUnread(true);
        return;
      }
      const cur = fb.data.items.find((x) => x.id === b.id);
      if (!cur || isMounted(cur, fm.data.items) || mountNow.current) return;
      const r = await remove.run({ ...subject, backend: cur.id, name: backendNameId(t, cur) });
      if (r.outcome === 'done' || removedInPart(r)) refresh();
    } finally {
      removeGate.current = false;
      setRemoveChecking(false);
    }
  };

  // One row per storage and the folder it is open as: the same mount is never listed twice.
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const b of bItems) {
      const ms = mItems.filter((m) => m.backend === b.id);
      if (ms.length === 0) out.push({ key: `b:${b.id}`, b, m: null });
      for (const m of ms) out.push({ key: `m:${m.id}`, b, m });
    }
    for (const m of mItems) if (!bItems.some((b) => b.id === m.backend)) out.push({ key: `m:${m.id}`, b: null, m });
    return out;
  }, [bItems, mItems]);
  // The provider and account do not tell entries apart (two servers, one user name; sign-in storage): where two
  // read the same, the end of the id does.
  const nameOf = (b: Backend): string => {
    const n = backendName(t, b.type, b.user);
    return bItems.some((x) => x.id !== b.id && backendName(t, x.type, x.user) === n) ? backendNameId(t, b) : n;
  };

  // A row says a storage is not open, or a folder's storage is gone, only from a list read whole.
  const foldersWhole = !!mounts.data?.complete;
  const storageWhole = !!backends.data?.complete;

  if (!running || !base || !placed(c)) {
    const start: ActionSpec | undefined = !running && onStart ? { id: 'start', label: t('start'), icon: 'play', onPress: onStart } : undefined;
    return (
      <AnatomySection
        id="storage"
        title={t('backends.title')}
        state={{ kind: 'notHere', icon: !running ? 'stop' : 'link', title: !running ? t('notRunning.title') : t('noAddress.title'), body: !running ? t('notRunning') : t('noAddress'), ...(start ? { action: start } : {}) }}
      />
    );
  }

  const writeWhy = !canWrite ? t('noWrite') : !listsWhole ? t('why.unread') : mountLocked || removeLocked ? t('why.busy') : undefined;
  const closeWhy = !canWrite ? t('noWrite') : unmountLocked ? t('why.busy') : mounts.isError ? t('why.unread') : undefined;
  const off = (why: string | undefined) => (why ? { isDisabled: true, disabledReason: why } : {});
  const rowActions = (r: Row): RowActionEntry[] => {
    const { b, m } = r;
    const name = b ? nameOf(b) : '';
    const unknownSync = !!m && syncOf(m) === 'unknown' && !(m.status === 'mounting' && m.delivery.waitsOn);
    return [
      ...(b ? [{ id: 'open', label: t('row.mountName', { name }), short: t('row.mount'), inline: !m, opens: true, onAction: () => { mount.reset(); setOpening(b); }, ...off(writeWhy) }] : []),
      // Reads only: the folder list again.
      ...(unknownSync ? [{ id: 'check', label: t('held.check'), inline: true, onAction: () => void mounts.refetch(), ...off(mounts.isFetching ? t('why.reading') : undefined) }] : []),
      ...(b ? [{ id: 'test', label: t('row.test'), onAction: () => (testing === b.id ? void test.refetch() : setTesting(b.id)), ...off(testing === b.id && test.isFetching ? t('test.checking') : undefined) }] : []),
      ...(m ? ['-' as const, { id: 'close', label: t('m.unmount'), tone: 'danger' as const, opens: true, onAction: () => setClosing(m), ...off(closeWhy) }] : []),
      ...(b ? [...(m ? [] : ['-' as const]), { id: 'remove', label: t('row.remove'), tone: 'danger' as const, opens: true, onAction: () => setRemoving(b), ...off(isMounted(b, mItems) ? t('row.removeBlocked') : writeWhy) }] : []),
    ];
  };
  const testWord = !testing ? null : test.isFetching ? 'checking' : test.isError ? 'unknown' : test.data ?? null;
  /** The folder column's words: the folder's own name (chosen when it was opened) where it says more than the path. */
  const folderText = ({ b, m }: Row): string =>
    m ? (m.label && m.label !== m.path ? t('row.folder', { label: m.label, path: m.path }) : m.path) : b && b.mountPaths.length ? b.mountPaths.join(', ') : foldersWhole ? t('row.notMounted') : t('row.folderUnread');
  /** The state column's words, for its width (RowState draws them). */
  const stateText = ({ b, m }: Row): string => {
    const f = m ? FOLDER_PILL[m.status as keyof typeof FOLDER_PILL] : undefined;
    const tw = b && b.id === testing && testWord ? t(`test.pill.${testWord}`) : '';
    return [f ? t(f.key) : '', m && (m.status === 'active' || m.status === 'mounting') ? syncShort(t, m) : '', tw].filter(Boolean).join(' ');
  };
  const columns = [
    STORAGE_COL.display({ id: 'storage', header: t('col.storage'), meta: { pinned: true, list: 'primary', label: t('col.storage') }, cell: (x) => (x.row.original.b ? nameOf(x.row.original.b) : storageWhole ? t('pu.noStorage') : t('row.storageUnread')) }),
    STORAGE_COL.display({
      id: 'folder',
      header: t('col.folder'),
      // As wide as its words ask, at most 280 px: a longer one is cut and keeps its tooltip.
      meta: { list: 'meta', label: t('col.folder'), size: 'fit', fitText: folderText, maxWidth: 280 },
      cell: (x) => folderText(x.row.original),
    }),
    // The folder's state with its sync in a word or two (the row names the storage), and a test's answer.
    STORAGE_COL.display({
      id: 'state',
      header: t('col.state'),
      meta: { list: 'status', label: t('col.state'), size: 'fit', fitText: stateText, fitPad: 32 },
      cell: (x) => <RowState m={x.row.original.m} test={x.row.original.b && x.row.original.b.id === testing ? testWord : null} />,
    }),
  ];

  const unreadB = (backends.isError && !backends.data?.listed) || (!!backends.data && !backends.data.listed);
  const unreadM = (mounts.isError && !mounts.data?.listed) || (!!mounts.data && !mounts.data.listed);
  const fetching = backends.isFetching || mounts.isFetching;
  const reread = () => { void backends.refetch(); void mounts.refetch(); };
  // Both lists make one table: it is whole only when both are; an older copy still shown says so (Add, Open and
  // Remove wait for a whole fresh read: backendsWhole, listsWhole).
  const state: SectionState = unreadB || unreadM
    ? { kind: 'failed', error: unreadB ? backends.error : mounts.error, onRetry: reread, busy: fetching }
    : !backends.data || !mounts.data
      ? { kind: 'loading', variant: 'table', rows: 2 }
      : backends.isError || mounts.isError
        ? { kind: 'stale', shown: rows.length, error: backends.isError ? backends.error : mounts.error, onRetry: reread, busy: fetching }
        : !backends.data.complete || !mounts.data.complete
          ? { kind: 'partial', shown: rows.length, onRecheck: reread, busy: fetching }
          : { kind: 'ready' };
  // The empty list names the best-known storage kinds the picker connects, by the picker's own names.
  const known = BEST_KNOWN.map((v) => { const k = choiceOf(v); return k ? choiceLabel(t, k) : v; });
  const addAction: ActionSpec = { id: 'add', label: t('add'), icon: 'plus', opens: 'dialog', onPress: () => { connect.reset(); setAdding(true); }, ...(!canWrite ? { disabledReason: t('noWrite') } : !backendsWhole ? { disabledReason: backends.data || backends.isError ? t('why.unread') : t('why.reading') } : {}) };

  return (
    <div className={s.stack}>
      <StorageGlance backends={backends.data} mounts={mounts.data} unreadB={unreadB || backends.isError} unreadM={unreadM || mounts.isError} held={held} disk={disk} />
      <PendingSection c={c} canWrite={canWrite} live={live} held={held} backends={bItems} mounts={mItems} storageWhole={backendsWhole} foldersWhole={!mounts.isError && !!mounts.data?.complete} />
      <AnatomySection
        id="storage"
        title={t('backends.title')}
        description={t('lede')}
        promise={t('where')}
        actions={{ primary: addAction }}
        notices={
          <>
            {!canWrite ? <Band size="table">{t('noWrite')}</Band> : null}
            {connect.held && !adding ? (
              <HeldBand overlayId="files-storage-dismiss-confirm-connect"
                text={t('held.connect', { name: backendName(t, String(connect.held.type ?? ''), String(connect.held.user ?? '')) })}
                readOnly={!own.connect}
                dismissBody={dismissBodyFor(t, String(connect.held.type ?? ''))}
                onCheck={async () => { if (await connect.check()) refresh(); }}
                onDismiss={connect.dismiss}
              />
            ) : null}
            {unread ? (
              <Band tone="warn" size="table" /* noDetails: the reads failed, and the table's own state shows their error */>
                {t('remove.unread')}
              </Band>
            ) : null}
            {remove.held ? (
              <HeldBand overlayId="files-storage-dismiss-confirm-remove" text={t('held.remove', { name: String(remove.held.name ?? '') })} readOnly={!own.remove} onCheck={async () => { if (await remove.check()) refresh(); }} onDismiss={remove.dismiss} />
            ) : (
              <Outcome outcome={remove.outcome} doneText={t('remove.done')} detail={removedInPart(remove.outcome) ? t('remove.partial') : undefined} />
            )}
            {mount.held && opening === null ? (
              <HeldBand overlayId="files-storage-dismiss-confirm-mount" text={t('held.mount', { name: String(mount.held.label ?? '') })} readOnly={!own.mount} onCheck={async () => { if (await mount.check()) refresh(); }} onDismiss={mount.dismiss} />
            ) : null}
            {unmount.held ? (
              <HeldBand overlayId="files-storage-dismiss-confirm-unmount" text={t('held.unmount', { name: String(unmount.held.label ?? '') })} readOnly={!own.unmount} onCheck={async () => { if (await unmount.check()) refresh(); }} onDismiss={unmount.dismiss} />
            ) : (
              <Outcome outcome={unmount.outcome} doneText={t('unmount.done')} />
            )}
          </>
        }
        state={state}
        note={mounts.data && staleRead(mounts.dataUpdatedAt, now) ? t('mounts.checked', { time: formatRelative(mounts.dataUpdatedAt, now) }) : undefined}
        flush
      >
        <DataTable
          label={t('backends.title')}
          data={rows}
          columns={columns}
          getRowId={(r) => r.key}
          fill={false}
          bare
          noViewMenu
          sortParam={false}
          onRowAction={false}
          countLabel={(n) => t('rows.count', { count: n })}
          empty={<EmptyState icon="link" size="sm" title={t('backends.empty')} body={<EmptyBody names={known} more={STORAGE_KINDS - known.length} />} />}
          actions={rowActions}
        />
      </AnatomySection>

      <ConnectDrawer
        key={id}
        c={c}
        isOpen={adding}
        onClose={() => setAdding(false)}
        runner={connect}
        ownHold={own.connect}
        forget={connectM.reset}
        canSend={canWrite && live && backendsWhole}
        onDone={() => { refresh(); setAdding(false); }}
        onCheck={async () => { if (await connect.check()) refresh(); }}
      />
      <MountDrawer
        c={c}
        backend={opening}
        mounts={mItems}
        onClose={() => setOpening(null)}
        runner={mount}
        ownHold={own.mount}
        canSend={canWrite && live && listsWhole && !removeLocked}
        onDone={() => { refresh(); setOpening(null); }}
        onCheck={async () => { if (await mount.check()) refresh(); }}
      />
      <ConfirmDialog
        overlayId="files-storage-close-confirm"
        isOpen={closing !== null}
        onOpenChange={(o) => !o && setClosing(null)}
        title={t('unmount.title', { name: closing?.label || closing?.path || '' })}
        body={t('unmount.body', { path: closing?.path ?? '' })}
        confirmLabel={t('unmount.go')}
        tone="danger"
        confirmDisabled={closeBlocked}
        onConfirm={() => { if (closing) closeNow(closing); }}
      />
      <ConfirmDialog
        overlayId="files-storage-remove-confirm"
        isOpen={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('remove.title', { name: removing ? backendNameId(t, removing) : '' })}
        body={t('remove.body', { name: removing ? backendNameId(t, removing) : '' })}
        confirmLabel={t('remove.go')}
        tone="danger"
        onConfirm={() => { if (removing) void removeNow(removing); }}
      />
    </div>
  );
}

/** "At a glance": counts from the reads the tab already makes, and the computer's own disk when the host gives it.
 *  A list not read says "Can't tell"; one read in part says "At least". */
function StorageGlance({ backends, mounts, unreadB, unreadM, held, disk }: {
  backends: Listed<Backend> | undefined; mounts: Listed<Mount> | undefined; unreadB: boolean; unreadM: boolean; held: HeldQuery; disk: StorageExtras['disk'];
}) {
  const t = useStrings(strings);
  const count = (l: Listed<unknown> | undefined, unreadL: boolean, words: (n: number) => string): string =>
    unreadL ? t('glance.cantTell') : !l ? t('glance.reading') : l.complete ? (l.items.length ? words(l.items.length) : t('glance.none')) : t('glance.atLeast', { value: words(l.items.length) });
  const h = held.data;
  const files = h ? h.items.reduce((a, x) => a + x.files, 0) : 0;
  const bytes = h ? h.items.reduce((a, x) => a + x.bytes, 0) : 0;
  const waiting = held.isError || (h && !h.listed) ? t('glance.cantTell')
    : !h ? t('glance.reading')
    : h.items.length === 0 ? (h.complete ? t('glance.nothing') : t('glance.cantTell'))
    : (h.complete ? (x: string) => x : (x: string) => t('glance.atLeast', { value: x }))(files === 1 ? t('pu.count.one', { size: formatBytes(bytes) }) : t('pu.count.many', { files, size: formatBytes(bytes) }));
  const items: Fact[] = [
    { label: t('glance.storage'), value: count(backends, unreadB, (n) => t('glance.storage.n', { count: n })) },
    // Only a folder the list says is open counts as open (opening, closing or failed ones do not).
    { label: t('glance.folders'), value: count(mounts && { ...mounts, items: mounts.items.filter((m) => m.status === 'active') }, unreadM, (n) => t('glance.folders.n', { count: n })) },
    { label: t('pu.title'), value: waiting },
    ...(disk === undefined ? [] : [{ label: t('glance.disk'), value: <DiskUse disk={disk} /> }]),
  ];
  return (
    <AnatomySection id="storage-glance" title={t('glance.title')} state={{ kind: 'ready' }}>
      <Facts items={items} columns={2} label={t('glance.title')} />
    </AnatomySection>
  );
}

function DiskUse({ disk }: { disk: NonNullable<StorageExtras['disk']> | null }) {
  const t = useStrings(strings);
  if (disk === 'reading') return t('glance.reading');
  if (!disk || disk.total <= 0) return t('glance.cantTell');
  const words = t('glance.disk.n', { used: formatBytes(disk.used), total: formatBytes(disk.total) });
  return (
    <span className={s.inline}>
      {words}
      <Meter value={(disk.used / disk.total) * 100} label={words} />
    </span>
  );
}

/** A row's state: its folder's (open, opening, not working, closing) and, while its storage is tested, the answer. */
function RowState({ m, test }: { m: Mount | null; test: 'checking' | 'unknown' | 'connected' | 'disconnected' | null }) {
  const t = useStrings(strings);
  const folder = m ? FOLDER_PILL[m.status as keyof typeof FOLDER_PILL] : undefined;
  const sync = m && (m.status === 'active' || m.status === 'mounting') ? syncShort(t, m) : '';
  return (
    <>
      {folder ? <StatusPill tone={folder.tone} {...(m?.status === 'mounting' || m?.status === 'unmounting' ? { dot: true } : {})}>{t(folder.key)}</StatusPill> : null}
      {sync ? ` ${sync} ` : null}
      {test ? <StatusPill tone={TEST_TONE[test]}>{t(`test.pill.${test}`)}</StatusPill> : null}
    </>
  );
}
const FOLDER_PILL = {
  active: { tone: 'ok', key: 'm.active' },
  mounting: { tone: 'info', key: 'm.mounting' },
  error: { tone: 'danger', key: 'm.error' },
  unmounting: { tone: 'neutral', key: 'm.closing' },
  unmounted: { tone: 'neutral', key: 'm.closing' },
} as const satisfies Record<string, { tone: Tone; key: Key }>;
const TEST_TONE = { checking: 'info', unknown: 'neutral', connected: 'ok', disconnected: 'warn' } as const satisfies Record<string, Tone>;

/** A folder's sync state in a word or two; the row it stands in names the storage. */
function syncShort(t: T, m: Mount): string {
  if (m.status === 'mounting' && m.delivery.waitsOn) return t('sync.opening');
  return t(`sync.${syncOf(m)}`);
}

type Runner<V> = ReturnType<typeof useRunner<V>>;

type HeldQuery = ReturnType<typeof useHeld>;
type HeldKind = 'deliver' | 'stop' | 'discard';
const HELD_LOCK = { deliver: DELIVER_LOCK, stop: STOP_LOCK, discard: DISCARD_LOCK } as const satisfies Record<HeldKind, string>;
const HELD_PILL = { pending: 'warn', uploading: 'info', delivering: 'info' } as const satisfies Record<Held['state'], Tone>;

/** What waits on the computer (pending uploads). Deliver, stop and discard are each sent once; a lost answer holds
 *  them all (one change at a time here) until a fresh list proves it or its sender dismisses exactly that hold. A
 *  deliver or stop whose item is gone from the list is not proved: the band then says it was delivered or discarded
 *  and that this page cannot tell which, and only Dismiss ends it. Shown first, and only while
 *  something waits, the list could not be read whole, or one of its changes has something to say; proven empty, the
 *  glance says "Nothing" and the card is not drawn (its runners stay, so a hold is never lost). */
function PendingSection({ c, canWrite, live, held, backends, mounts, storageWhole, foldersWhole }: {
  c: Computer; canWrite: boolean; live: boolean; held: HeldQuery; backends: readonly Backend[]; mounts: readonly Mount[]; storageWhole: boolean; foldersWhole: boolean;
}) {
  const t = useStrings(strings);
  const id = c.id;
  const subject = subjectOf(c);
  const pick = (i: Record<string, unknown>) => i.computer === id;
  const vars = (i: Record<string, unknown>): HeldVars => ({ ...subject, item: String(i.item ?? ''), name: String(i.name ?? ''), storage: String(i.storage ?? '') });
  const opts = (k: HeldKind) => ({ lock: HELD_LOCK[k], pick, vars, heldBy: (h: HeldChange) => storageHeldBy(k, h) });
  const run = { deliver: useRunner(useDeliver(), opts('deliver')), stop: useRunner(useStopHeld(), opts('stop')), discard: useRunner(useDiscard(), opts('discard')) };
  const [asking, setAsking] = useState<{ kind: HeldKind; item: Held; name: string } | null>(null);
  const [files, setFiles] = useState<{ item: Held; name: string } | null>(null);
  useEffect(() => {
    setAsking(null);
    setFiles(null);
    run.deliver.reset();
    run.stop.reset();
    run.discard.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const locked = (['deliver', 'stop', 'discard'] as const).some((k) => run[k].busy || run[k].held !== null);
  const items = held.data?.items ?? [];
  /** An item's storage by name ('' when it is no longer listed). */
  const storageOf = (h: Held): string => {
    const b = backends.find((x) => x.id === h.backend);
    return b ? backendName(t, b.type, b.user) : '';
  };
  /** An item by its folder, else its storage; neither found: "no longer connected" only when the storage list was read
   *  whole (else the storage is said not read; never an id). A folder not shown by a whole folder list is closed. */
  const nameOf = (h: Held): string => {
    const m = mounts.find((x) => x.id === h.mount);
    const storage = storageOf(h) || (storageWhole ? t('pu.noStorage') : t('row.storageUnread'));
    // A folder the item names that a folder list read in part (or not at all) did not show: never its storage's name
    // as though it were the folder.
    if (!m && h.mount && !foldersWhole) return t('pu.folderUnread', { storage });
    return m ? m.label || m.path : storage;
  };
  const send = (k: HeldKind, h: Held, name: string) => {
    setAsking(null);
    if (locked) return;
    void run[k].run({ ...subject, item: h.id, name, storage: storageOf(h) });
  };
  const band = (k: HeldKind) => {
    const r = run[k];
    if (!r.held) return <Outcome outcome={r.outcome} doneText={t(`pu.${k}.done`)} error={refusal(r.outcome)} />;
    const name = String(r.held.name ?? '');
    // Gone from the list: not delivered, not discarded, as far as this page can tell.
    const gone = heldGone(String(r.held.item ?? ''), held.data as Listed<Held> | undefined);
    const shown = { text: gone ? t('pu.gone', { storage: String(r.held.storage ?? '') || t('storage.unnamed') }) : t(`pu.held.${k}`, { name }), readOnly: r.elsewhere !== null, onCheck: () => r.check(), onDismiss: r.dismiss };
    // One overlay id per kind: a deliver, a stop and a discard can each be held at once.
    return k === 'deliver' ? <HeldBand overlayId="files-storage-dismiss-confirm-deliver" {...shown} />
      : k === 'stop' ? <HeldBand overlayId="files-storage-dismiss-confirm-stop" {...shown} />
      : <HeldBand overlayId="files-storage-dismiss-confirm-discard" {...shown} />;
  };
  const why = !live ? t('notRunning') : !canWrite ? t('noWrite') : locked ? t('why.busy') : undefined;
  const off = (w: string | undefined) => (w ? { isDisabled: true, disabledReason: w } : {});
  const rowActions = (h: Held): RowActionEntry[] => {
    const name = nameOf(h);
    return [
      ...(h.state === 'pending' && h.deliverable ? [{ id: 'deliver', label: t('pu.deliverName', { name }), short: t('pu.deliver'), inline: true, opens: true, onAction: () => setAsking({ kind: 'deliver', item: h, name }), ...off(why) }] : []),
      { id: 'files', label: t('pu.files'), opens: true, onAction: () => setFiles({ item: h, name }), ...off(!live ? t('notRunning') : undefined) },
      ...(h.state !== 'pending' ? ['-' as const, { id: 'stop', label: t('pu.stop'), tone: 'danger' as const, opens: true, onAction: () => setAsking({ kind: 'stop', item: h, name }), ...off(why) }] : []),
      ...(h.state === 'pending' ? ['-' as const, { id: 'discard', label: t('pu.discard'), tone: 'danger' as const, opens: true, onAction: () => setAsking({ kind: 'discard', item: h, name }), ...off(why) }] : []),
    ];
  };
  const columns = [
    HELD_COL.display({ id: 'name', header: t('pu.col.name'), meta: { pinned: true, list: 'primary', label: t('pu.col.name') }, cell: (x) => nameOf(x.row.original) }),
    HELD_COL.display({ id: 'state', header: t('pu.col.state'), meta: { list: 'status', label: t('pu.col.state') }, cell: (x) => <StatusPill tone={HELD_PILL[x.row.original.state]}>{t(`pu.pill.${x.row.original.state}`)}</StatusPill> }),
    HELD_COL.display({
      id: 'files',
      header: t('pu.col.files'),
      meta: { list: 'meta', label: t('pu.col.files'), align: 'end' },
      cell: (x) => (x.row.original.files === 1 ? t('pu.count.one', { size: formatBytes(x.row.original.bytes) }) : t('pu.count.many', { files: x.row.original.files, size: formatBytes(x.row.original.bytes) })),
    }),
    HELD_COL.display({ id: 'since', header: t('pu.col.since'), meta: { list: 'meta', label: t('pu.col.since'), priority: 2 }, cell: (x) => formatDate(x.row.original.since * 1000) }),
    HELD_COL.display({
      id: 'why',
      header: t('pu.col.why'),
      meta: { list: 'meta', label: t('pu.col.why'), priority: 2, grow: 2 },
      cell: (x) => {
        const h = x.row.original;
        const reasons = HELD_REASONS.filter((r) => h.reasons[r]).map((r) => t(`pu.reason.${r}`));
        return [reasons.length ? reasons.join('; ') : '', h.incomplete > 0 ? t('pu.incomplete', { n: h.incomplete }) : '', h.lastFailed ? t('pu.lastFailed') : ''].filter(Boolean).join(' ');
      },
    }),
  ];
  const unreadH = held.isError || (!!held.data && !held.data.listed);
  const state: SectionState = unreadH
    ? { kind: 'failed', error: held.error, onRetry: () => void held.refetch(), busy: held.isFetching }
    : !held.data
      ? { kind: 'loading', variant: 'table', rows: 1 }
      : !held.data.complete
        ? { kind: 'partial', shown: items.length, onRecheck: () => void held.refetch(), busy: held.isFetching }
        : { kind: 'ready' };
  // Proven empty, with nothing of its own to say: the card is not drawn (the glance says "Nothing").
  const says = (['deliver', 'stop', 'discard'] as const).some((k) => run[k].held !== null || !!run[k].outcome);
  const quiet = !!held.data && held.data.listed && held.data.complete && !held.isError && items.length === 0 && !says;
  return (
    <>
      {quiet ? null : (
        <AnatomySection
          id="storage-waiting"
          title={t('pu.title')}
          description={t('pu.lede')}
          notices={says ? <>{band('deliver')}{band('stop')}{band('discard')}</> : undefined}
          state={state}
          flush
        >
          <DataTable
            label={t('pu.title')}
            data={items}
            columns={columns}
            getRowId={(h) => h.id}
            fill={false}
            bare
            noViewMenu
            sortParam={false}
            onRowAction={false}
            countLabel={(n) => t('pu.rows', { count: n })}
            empty={<EmptyState icon="check" size="sm" title={t('pu.empty')} />}
            actions={rowActions}
          />
        </AnatomySection>
      )}
      <ConfirmDialog
        overlayId="files-storage-pending-confirm"
        isOpen={asking?.kind === 'deliver' || asking?.kind === 'stop'}
        onOpenChange={(o) => !o && setAsking(null)}
        title={asking?.kind === 'stop' ? t('pu.stop.title') : t('pu.deliver.title')}
        body={asking?.kind === 'stop' ? t('pu.stop.body') : t('pu.deliver.body')}
        confirmLabel={asking?.kind === 'stop' ? t('pu.stop.go') : t('pu.deliver.go')}
        tone={asking?.kind === 'stop' ? 'danger' : 'default'}
        onConfirm={() => { if (asking) send(asking.kind, asking.item, asking.name); }}
      />
      <DangerConfirm
        overlayId="files-storage-discard-confirm"
        isOpen={asking?.kind === 'discard'}
        onOpenChange={(o) => !o && setAsking(null)}
        title={t('pu.discard.title', { name: asking?.name ?? '' })}
        body={t('pu.discard.c1')}
        consequences={[t('pu.discard.c2')]}
        confirmText={asking?.name ?? ''}
        confirmLabel={t('pu.discard.go')}
        onConfirm={() => { if (asking) send('discard', asking.item, asking.name); }}
      />
      <HeldFilesDrawer c={c} open={files} onClose={() => setFiles(null)} />
    </>
  );
}

/** The files of one pending upload, a page at a time, each downloadable as it is held (reads only). */
function HeldFilesDrawer({ c, open, onClose }: { c: Computer; open: { item: Held; name: string } | null; onClose: () => void }) {
  const t = useStrings(strings);
  const [pages, setPages] = useState<string[]>(['']);
  const item = open?.item.id ?? '';
  useEffect(() => setPages(['']), [item, c.id]);
  return (
    <Drawer overlayId="files-storage-pending-files" resizeKey="computers-held-files" isOpen={open !== null} onOpenChange={(o) => !o && onClose()} title={t('pu.files.title', { name: open?.name ?? '' })}>
      {open ? (
        <>
          <HeldVerdict held={open.item} />
          <ul className={s.rows} aria-label={t('pu.files.title', { name: open.name })}>
            {pages.map((cursor, i) => (
              <HeldFilesPage key={cursor || '-'} c={c} item={item} cursor={cursor} last={i === pages.length - 1} onMore={(next) => setPages((p) => (p.includes(next) ? p : [...p, next]))} />
            ))}
          </ul>
        </>
      ) : null}
    </Drawer>
  );
}

/** The batch at the drawer's top: a calm Verdict whose one marked phrase is the files that may be incomplete,
 *  with its facts (how many, how large, why held) in the plate's `facts` slot. */
function HeldVerdict({ held }: { held: Held }) {
  const t = useStrings(strings);
  const why = HELD_REASONS.filter((r) => (held.reasons[r] ?? 0) > 0).map((r) => t('pu.files.why', { reason: t(`pu.reason.${r}`), n: held.reasons[r] ?? 0 }));
  const facts: Fact[] = [
    { label: t('pu.files.f.files'), value: String(held.files) },
    { label: t('pu.files.f.size'), value: formatBytes(held.bytes) },
    ...(why.length ? [{ label: t('pu.files.f.why'), value: why.join(' · ') }] : []),
  ];
  return (
    <Verdict label={t('pu.files.verdict')} facts={<Facts layout="spec" columns={1} label={t('pu.files.verdict')} items={facts} />}>
      {held.incomplete > 0 ? (
        <>
          {t('pu.files.s.some')}
          <VerdictMark tone="warn">{t('pu.files.s.mark', { n: held.incomplete })}</VerdictMark>
          {t('pu.files.s.end')}
        </>
      ) : t('pu.files.s.all')}
    </Verdict>
  );
}

function HeldFilesPage({ c, item, cursor, last, onMore }: { c: Computer; item: string; cursor: string; last: boolean; onMore: (next: string) => void }) {
  const t = useStrings(strings);
  const q = useHeldFiles(c, item, cursor, true);
  if (q.isError || (q.data && !q.data.listed)) return <li><ErrorState size="compact" title={t('pu.files.error')} error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} /></li>;
  if (!q.data) return <li><Skeleton rows={2} /></li>;
  if (!cursor && q.data.complete && !q.data.more && q.data.files.length === 0) return <li><EmptyState size="compact" title={t('pu.files.empty')} /></li>;
  return (
    <>
      {q.data.files.map((f) => <HeldFileRow key={f.key} c={c} item={item} f={f} />)}
      {!q.data.complete ? (
        <li>
          <Band tone="warn" size="table" actions={<Button size="sm" busy={q.isFetching} onPress={() => void q.refetch()}>{t('held.check')}</Button>} /* noDetails: rows the page could not read, not a rejection; no error to show */>
            {t('pu.files.partial')}
          </Band>
        </li>
      ) : null}
      {last && q.data.more ? (
        <li className={s.actions}>
          <Button size="sm" variant="ghost" onPress={() => onMore(q.data!.cursor)}>{t('pu.files.more')}</Button>
        </li>
      ) : null}
    </>
  );
}

function HeldFileRow({ c, item, f }: { c: Computer; item: string; f: HeldFile }) {
  const t = useStrings(strings);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<'' | 'big' | 'failed'>('');
  const get = async () => {
    setBusy(true);
    setNote('');
    const r = await downloadHeld(c, item, f);
    setBusy(false);
    if (r !== 'saved') setNote(r);
  };
  return (
    <li className={s.row}>
      <div>
        <Row gap={2} align="center" wrap>
          <span className={s.name}>{f.name}</span>
          {!f.complete ? <StatusPill tone="warn">{t('pu.files.pill.incomplete')}</StatusPill> : null}
          {!f.exact ? <StatusPill>{t('pu.files.pill.inexact')}</StatusPill> : null}
        </Row>
        <RowNote>{[formatBytes(f.size), f.reason ? t(`pu.reason.${f.reason}`) : ''].filter(Boolean).join(' · ')}</RowNote>
        {!f.exact ? <RowNote>{t('pu.files.inexact')}</RowNote> : null}
        {note ? <RowNote>{note === 'big' ? t('pu.files.tooBig') : t('pu.files.failed')}</RowNote> : null}
      </div>
      <div className={s.actions}>
        <Button size="sm" variant="ghost" busy={busy} onPress={() => void get()}>{t('pu.files.download')}</Button>
      </div>
    </li>
  );
}

/** The add form. Order: where the keys go (the verdict), the storage's type, then its fields; a sign-in storage puts
 *  them in the one open step that says how to get its token. Rarely needed fields are folded under More options. Its
 *  secret fields are never prefilled and are cleared on send, close, failure and computer change. */
function ConnectDrawer({ c, isOpen, onClose, runner, ownHold: mine, forget, canSend, onDone, onCheck }: {
  c: Computer; isOpen: boolean; onClose: () => void; runner: Runner<ConnectVars>; ownHold: boolean; forget: () => void; canSend: boolean; onDone: () => void; onCheck: () => Promise<void>;
}) {
  const t = useStrings(strings);
  const [choice, setChoice] = useState('s3');
  const type: ProviderId = choiceOf(choice)?.type ?? 's3';
  const [values, setValues] = useState<Record<string, string>>(() => initialValues('s3'));
  const [edited, setEdited] = useState(false);
  const [more, setMore] = useState(false);
  const p = providerOf(type) ?? providerOf('s3')!;
  const body = connectBody(type, values);
  const reset = (next: string = choice) => {
    setChoice(next);
    setValues(initialValues(next));
    setEdited(false);
    setMore(false);
  };
  const choices = useMemo(() => CHOICES.map((c) => ({ value: c.value, label: choiceLabel(t, c), ...(c.s3 ? { group: t('pick.s3') } : {}) })), [t]);
  const field = (f: Field) => (
    <FieldInput
      key={`${type}.${f.key}`}
      t={t}
      f={f}
      value={values[f.key] ?? ''}
      onChange={(v) => set(f.key, v)}
      resetKey={c.id}
      needsMissing={!!f.needs && !(values[f.needs] ?? '').trim()}
      locked={runner.busy}
    />
  );
  const main = p.fields.filter((f) => !f.more);
  const extra = p.fields.filter((f) => f.more);
  // Closed: nothing typed survives, secrets least of all (another computer remounts the form: key={id}).
  useEffect(() => {
    if (!isOpen) reset('s3');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  // The typed values live here, so their wipe does too: a hold band unmounts the fields and their own wipe with them.
  const dropSecrets = () => setValues((x) => (SECRET_KEYS.some((k) => x[k]) ? withoutSecrets(x) : x));
  useWipeOn(dropSecrets);
  // A hold (this form's send or another) replaces the form: secrets typed and not sent leave with it.
  const heldNow = runner.held !== null;
  useEffect(() => {
    if (heldNow) dropSecrets();
  }, [heldNow]);
  const set = (k: string, v: string) => {
    setEdited(true);
    setValues((x) => ({ ...x, [k]: v }));
  };
  const send = () => {
    if (!body || !canSend || runner.busy || runner.held) return;
    // The secrets leave the form now: the body below is the only copy, handed to the one send.
    setValues((x) => withoutSecrets(x));
    void runner.run({ ...subjectOf(c), type, body }).then((r) => {
      // Settled, whatever the outcome: the send's variables (the keys) leave the mutation cache now, and nothing
      // secret is left in the form (the fields are locked while the send is out; this holds even if one was not).
      forget();
      setValues((x) => withoutSecrets(x));
      if (r.outcome === 'done') onDone();
    });
  };
  const outcome: OutcomeLike | undefined = runner.outcome?.kind === 'failed' ? { ...runner.outcome, message: t('connect.failed') } : runner.outcome;
  return (
    <Drawer overlayId="files-storage-connect" resizeKey="computers-storage-connect"
      isOpen={isOpen}
      onOpenChange={(o) => !o && !runner.busy && onClose()}
      title={t('add')}
      subtitle={t('connect.lede')}
      size="md"
      dirty={edited && !runner.held && !runner.busy}
      footer={
        runner.held ? undefined : (
          <FormFooter
            dirty={!!body}
            requireDirty={false}
            submitDisabled={!body || !canSend}
            busy={runner.busy}
            busyLabel={t('connect.busy')}
            doneText={t('connect.done')}
            outcome={outcome}
            onCheck={onCheck}
            submitLabel={t('connect.go')}
            onSubmit={send}
          />
        )
      }
    >
      {runner.held ? (
        <HeldBand overlayId="files-storage-dismiss-confirm-connect-form"
          text={t('held.connect', { name: backendName(t, String(runner.held.type ?? ''), String(runner.held.user ?? '')) })}
          readOnly={!mine}
          dismissBody={dismissBodyFor(t, String(runner.held.type ?? ''))}
          onCheck={onCheck}
          onDismiss={runner.dismiss}
        />
      ) : (
        <div className={s.stack}>
          <Verdict label={t('connect.kept')} next={t('connect.nothingSent')}>{t('where')}</Verdict>
          <Combobox<string>
            label={t('f.type')}
            value={choice}
            onChange={(v) => { if (choiceOf(v)) { reset(v); setEdited(true); } }}
            options={choices}
            emptyText={t('pick.none')}
            isDisabled={runner.busy}
            {...(type === 'box' || type === 'onedrive' ? { description: t('token.box') } : {})}
          />
          <FieldsCard token={p.token ? { type, clientId: validName((values.client_id ?? '').trim()) ? (values.client_id ?? '').trim() : '' } : null}>
            {main.map(field)}
          </FieldsCard>
          {p.oneOf ? <Band tone="neutral">{t('f.oneOf')}</Band> : null}
          {extra.length ? (
            <Disclosure title={t('f.more', { count: extra.length })} isExpanded={more} onExpandedChange={setMore}>
              {more ? <div className={s.stack}>{extra.map(field)}</div> : null}
            </Disclosure>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}

/** The storage's main fields: inside the token step for a sign-in storage, as they are for a key storage. */
function FieldsCard({ token, children }: { token: { type: ProviderId; clientId: string } | null; children: ReactNode }) {
  return token ? <TokenStep type={token.type} clientId={token.clientId}>{children}</TokenStep> : <>{children}</>;
}

/** The one open step of a sign-in storage: how to make its token with rclone on the person's own machine, then the
 *  fields the token goes into (children), last in the card. The command carries the person's own client id when typed
 *  and a plain name (validName: it is pasted into a shell); their secret only as a placeholder, never echoed. OneDrive
 *  also needs its drive, so its steps go through an rclone config. Drive's step is in the warn state: rclone's shared
 *  app is being retired. The form's Verdict says nothing leaves before Connect, for every storage. */
function TokenStep({ type, clientId, children }: { type: ProviderId; clientId: string; children: ReactNode }) {
  const t = useStrings(strings);
  const ownClient = `${t('token.ownClient')}${type === 'drive' ? ` ${t('token.retiring.fix')}` : ''}`;
  // rclone's own type name: "google-cloud-storage" is "google cloud storage" (as the files program reads it).
  const cmd = `rclone authorize "${type.replace(/-/g, ' ')}"${clientId ? ` "${clientId}" "${t('token.secretPlaceholder')}"` : ''}`;
  const oneDrive = type === 'onedrive';
  return (
    <Track label={t('token.track')}>
      <TrackStep
        id="token"
        state="now"
        name={t('token.title')}
        {...(type === 'drive' ? { tone: 'warn' as const, why: t('token.retiring') } : oneDrive ? { why: t('token.od.why') } : {})}
      >
        {oneDrive ? (
          <StepList
            label={t('token.title')}
            groups={[{
              where: t('token.where'),
              items: [
                { id: 'install', text: t('token.step.install') },
                { id: 'add', text: <>{t('token.od.add.a')} <CodeLine value="rclone config" /> {t('token.od.add.b')}</> },
                { id: 'show', text: <>{t('token.od.show')} <CodeLine value="rclone config show" /></>, note: t('token.od.show.note') },
                { id: 'delete', text: <>{t('token.od.delete')} <CodeLine value="rclone config delete" /></>, note: t('token.od.delete.note') },
              ],
            }]}
          />
        ) : (
          <StepList
            label={t('token.title')}
            groups={[{
              where: t('token.where'),
              items: [
                { id: 'install', text: t('token.step.install') },
                { id: 'run', text: t('token.step.run') },
                { id: 'paste', text: t('token.step.paste') },
              ],
            }]}
          />
        )}
        {oneDrive ? null : <CodeBlock code={cmd} lang="shell" label={t('token.cmdLabel')} wrap />}
        {children}
        {oneDrive ? null : <Disclosure title={t('token.ownClient.q')}>{ownClient}</Disclosure>}
      </TrackStep>
    </Track>
  );
}

function FieldInput({ t, f, value, onChange, resetKey, needsMissing, locked }: {
  t: T; f: Field; value: string; onChange: (v: string) => void; resetKey: unknown; needsMissing: boolean; locked: boolean;
}) {
  const label = fieldLabel(t, f);
  const help = fieldHelp(t, f);
  const missing = needsMissing && value.trim() !== '' && f.needs ? t(`f.${f.key}.needs` as Key) : undefined;
  if (f.kind === 'secret') {
    return <SecretInput label={label} description={help} value={value} onChange={onChange} isRequired={f.required} resetKey={resetKey} errorMessage={missing} isDisabled={locked} />;
  }
  if (f.kind === 'pem' || f.kind === 'token') {
    const bad = f.kind === 'token' && value.trim() !== '' && tokenText(value) === null;
    // A private key or a token spans lines: the kit's multiline secret field, masked until the person shows it.
    return <SecretInput multiline label={label} description={help} value={value} onChange={onChange} isRequired={f.required} resetKey={resetKey} errorMessage={bad ? t('f.token.bad') : undefined} isDisabled={locked} />;
  }
  if (f.kind === 'select') return <Select label={label} description={help} value={value || undefined} onChange={onChange} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} isDisabled={locked} />;
  if (f.kind === 'boolean') return <Checkbox label={label} description={help} isSelected={boolShown(value, f.default)} onChange={(on) => onChange(on ? 'true' : 'false')} isDisabled={locked} />;
  const bad = (f.kind === 'number' && value.trim() !== '' && !portOk(value.trim())) || (f.kind === 'int' && value.trim() !== '' && !/^\d{1,15}$/.test(value.trim()));
  const creds = !!f.address && addressHasCredentials(value);
  const notName = !!f.name && value.trim() !== '' && !validName(value.trim());
  return (
    <TextField
      label={label}
      description={help}
      value={value}
      onChange={onChange}
      isRequired={f.required}
      inputMode={f.kind === 'number' || f.kind === 'int' ? 'numeric' : undefined}
      errorMessage={bad ? t(f.kind === 'int' ? 'f.int.bad' : 'f.port.help') : creds ? t('f.address.creds') : notName ? t('f.client_id.bad') : missing}
      isDisabled={locked}
    />
  );
}

/** Open a backend as a folder: one name, unique on the computer, so a lost answer can be found again. */
function MountDrawer({ c, backend, mounts, onClose, runner, ownHold: mine, canSend, onDone, onCheck }: {
  c: Computer; backend: Backend | null; mounts: readonly Mount[]; onClose: () => void; runner: Runner<MountVars>; ownHold: boolean; canSend: boolean; onDone: () => void; onCheck: () => Promise<void>;
}) {
  const t = useStrings(strings);
  const [label, setLabel] = useState('');
  const [edited, setEdited] = useState(false);
  const name = backend ? backendName(t, backend.type, backend.user) : '';
  useEffect(() => {
    setLabel(backend ? suggestLabel(name, mounts) : '');
    setEdited(false);
    // A new list read never replaces what the person typed: only a new backend or computer does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend?.id, c.id]);
  const clean = label.trim();
  const ok = !!backend && validLabel(clean, mounts);
  return (
    <Drawer overlayId="files-storage-open-folder" resizeKey="computers-storage-mount"
      isOpen={backend !== null}
      onOpenChange={(o) => !o && !runner.busy && onClose()}
      title={t('mount.title', { name })}
      subtitle={t('mount.lede')}
      size="sm"
      dirty={edited && !runner.held && !runner.busy}
      footer={
        runner.held ? undefined : (
          <FormFooter
            dirty={ok}
            requireDirty={false}
            submitDisabled={!ok || !canSend}
            busy={runner.busy}
            busyLabel={t('mount.busy')}
            doneText={t('mount.done')}
            outcome={runner.outcome}
            onCheck={onCheck}
            submitLabel={t('mount.go')}
            onSubmit={() => {
              if (!backend || !ok || !canSend || runner.busy || runner.held) return;
              // Its folder is made now, once: a lost answer is found again by it (logic.ts mountProved).
              void runner.run({ ...subjectOf(c), backend: backend.id, label: clean, leaf: folderLeaf(clean) }).then((r) => {
                if (r.outcome === 'done') onDone();
              });
            }}
          />
        )
      }
    >
      {runner.held ? (
        <HeldBand overlayId="files-storage-dismiss-confirm-mount-form" text={t('held.mount', { name: String(runner.held.label ?? '') })} readOnly={!mine} onCheck={onCheck} onDismiss={runner.dismiss} />
      ) : (
        <TextField
          label={t('mount.label')}
          value={label}
          onChange={(v) => { setEdited(true); setLabel(v); }}
          maxLength={LABEL_MAX}
          description={t('mount.labelHelp')}
          errorMessage={label && !validLabel(clean, mounts) ? t('mount.labelHelp') : undefined}
        />
      )}
    </Drawer>
  );
}

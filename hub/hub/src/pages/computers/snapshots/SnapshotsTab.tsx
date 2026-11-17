// The Backups tab of one computer (snapshots and folder downloads): At a glance first
// (SnapshotsGlance), then the kept snapshots as a table (Take snapshot in the card head opens a drawer; Restore is the
// one button of each row and the rest is in its ⋯ menu; every held change and outcome shows in the card's notices),
// then Download folders (ZipBackup): chosen folders downloaded through the files program as .zip files. The computer
// menu's "Take a snapshot…" opens this tab with `take=1`: once the list is read the Take drawer opens (when Take is on),
// and the key is dropped so a reload does not reopen it.
//
// Contract, in plain words:
//   - Take sends one POST with the typed name as the alias (a valid name is kept whole), never twice. A lost answer
//     holds the change under its lock (computer.snapshot): the form is replaced by the held band until a fresh
//     snapshots read shows that name (Check again, reads only) or the person dismisses exactly the shown hold.
//   - "New computer from this" opens the copy form for that snapshot in a drawer (the API's copy with
//     source_snapshot). Its lost answer is held the same way (computer.copy_snapshot) and proved only by the sent
//     name in the sent project in a fresh computers list. The tab shows a held copy above the list, and the drawer,
//     opened again or remounted, shows the held change, never a fresh form.
//   - Delete asks first, naming the snapshot, then sends one DELETE (computer.snapshot_delete). A lost answer is held
//     the same way and proved only by a fresh list without that name. At the cap Take is off, with the reason and a
//     pointer to Delete.
//   - Restore asks first, saying what is lost, then sends one PATCH (computer.snapshot_restore). A lost answer is held
//     the same way and proved only by the snapshot's last_used_at having moved since the send.
//   - Rename opens a small form for the snapshot's label (the API's alias; empty removes it) and sends one PATCH
//     (computer.snapshot_rename); held and proved by the new label in a fresh list.
//   - Take can name how many days to keep the snapshot (optional, 1 to 3650).
//   - Refusals keep their code's sentence; an unknown outcome is never shown as failed (core's runner, C9).
//   - A session without the snapshots permission sees why, and nothing is read or sent. `canWrite` (the page's
//     account right) gates making a computer.
import { AnatomySection, Band, ConfirmDialog, countryFlag, createColumnHelper, DataTable, Drawer, EmptyState, formatBytes, formatDateTime, FormFooter, HeldBand, Outcome, Select, Tag, TextField, useSearchParam, useStrings, type ActionSpec, type OutcomeLike, type RowActionEntry, type SectionState } from '@kit';
import { useCan } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pressBefore, pressRealm, useComputers, useHostRealm, useProjects, useServers, useShownRealm } from '../data';
import { offered, validName } from '../logic';
import { ProjectPick, RealmRefusedNote, realmProject, realmRefused } from '../parts/ProjectPick';
import { refusal, useRunner } from '../parts/runner';
import type { Computer } from '../types';
import { COPY_FROM_LOCK, DROP_LOCK, RENAME_LOCK, RESTORE_LOCK, SNAP_LOCK, type CopyFromVars, type TakeVars, useCopyFromSnapshot, useDropSnapshot, useRenameSnapshot, useRestoreSnapshot, useSnapshots, useTakeSnapshot } from './data';
import { MAX_LABEL, canTakeNow, cleanExpiry, cleanLabel, copyNameFrom, defaultSnapName, freeName, validSnapName, type Snapshot } from './logic';
import { SnapshotsGlance } from './Glance';
import { ZipBackup } from './ZipBackup';
import strings from './strings.en.json';
import s from './snapshots.module.css';

const CODES = [
  'COMPUTER_SNAPSHOT_LIMIT', 'SNAPSHOT_OPERATION_IN_PROGRESS', 'SNAPSHOT_INVENTORY_UNAVAILABLE', 'COMPUTER_NAME_IN_USE',
  'COMPUTER_NETWORK_POLICY_MISSING', 'COMPUTER_OPERATION_IN_PROGRESS', 'COMPUTER_QUARANTINED',
] as const;
type Code = (typeof CODES)[number];
const isCode = (c: unknown): c is Code => (CODES as readonly unknown[]).includes(c);
type Shown = (OutcomeLike & { data?: unknown }) | undefined;
const col = createColumnHelper<Snapshot>();
// A time the server sent that is not a time is shown as it came, never thrown on.
const when = (at: string) => (Number.isNaN(Date.parse(at)) ? at : formatDateTime(at));

export function SnapshotsTab({ computer: c, canWrite }: { computer: Computer; canWrite: boolean }) {
  const t = useStrings(strings);
  const canSnap = useCan('computers.features.snapshots');
  const canCopy = canWrite && canSnap;
  const id = c.id;
  const list = useSnapshots(id, canSnap);
  const computers = useComputers();
  const projects = useProjects();
  const shownRealm = useShownRealm();
  // The realm a new computer lands in, as the page's own create and copy (data.ts useHostRealm): a token session's
  // pinned realm, else the realm shown; undefined is the base host ('all' in the held change).
  const hostRealm = useHostRealm();
  const servers = useServers().data;
  const take = useRunner(useTakeSnapshot(), {
    lock: SNAP_LOCK,
    change: 'take',
    pick: (i) => i.computer === id,
    vars: (i): TakeVars => ({ id: String(i.computer ?? ''), name: String(i.name ?? '') }),
  });
  // Typed by the copy's own variables: inferred from `vars` alone it would take only the five sent keys, and the press
  // passes `before` and `realm` too (CopyFromVars, never sent).
  const copy = useRunner<CopyFromVars>(useCopyFromSnapshot(), {
    lock: COPY_FROM_LOCK,
    change: 'copyFrom',
    pick: (i) => i.computer === id,
    vars: (i) => ({ id: String(i.computer ?? ''), snapshot: String(i.snapshot ?? ''), name: String(i.name ?? ''), project: String(i.project ?? ''), server: '' }),
  });
  const drop = useRunner(useDropSnapshot(), {
    lock: DROP_LOCK,
    change: 'drop',
    pick: (i) => i.computer === id,
    vars: (i) => ({ id: String(i.computer ?? ''), name: String(i.name ?? '') }),
  });
  const restore = useRunner(useRestoreSnapshot(), {
    lock: RESTORE_LOCK,
    change: 'restore',
    pick: (i) => i.computer === id,
    vars: (i) => ({ id: String(i.computer ?? ''), name: String(i.name ?? ''), before: typeof i.before === 'string' ? i.before : null }),
  });
  const rename = useRunner(useRenameSnapshot(), {
    lock: RENAME_LOCK,
    change: 'rename',
    pick: (i) => i.computer === id,
    vars: (i) => ({ id: String(i.computer ?? ''), name: String(i.name ?? ''), alias: typeof i.alias === 'string' ? i.alias : null }),
  });
  // The snapshot the delete or restore question names: confirming acts on exactly it, never a row that moved under it.
  const [asking, setAsking] = useState<Snapshot | null>(null);
  const [restoring, setRestoring] = useState<Snapshot | null>(null);
  // The snapshot whose label is being edited, the typed label, and whether it was changed from the current one.
  const [renaming, setRenaming] = useState<Snapshot | null>(null);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState('');
  // The Take drawer is open. It closes on a proved snapshot; a held one keeps its band in the drawer and in the card.
  const [taking, setTaking] = useState(false);
  // A delete that failed because another session had already removed the snapshot: named only once a fresh, complete
  // list confirms it is gone.
  const [gone, setGone] = useState<string | null>(null);
  // A delete asks the server's list first, as a restore does: what stopped it, in words (nothing was sent).
  const [dropStop, setDropStop] = useState<{ kind: 'changed' | 'unread'; name: string } | null>(null);
  // A restore asks the server's list first: what stopped it, in words (nothing was sent), and the read in flight.
  const [stopped, setStopped] = useState<{ kind: 'missing' | 'changed' | 'unread'; name: string } | null>(null);
  // Take reads the list first: what stopped it, in words (nothing was sent), and the read in flight.
  const [takeStop, setTakeStop] = useState<{ kind: 'taken' | 'unread'; name: string } | null>(null);
  const [takeReading, setTakeReading] = useState(false);
  // The list read before a restore or a delete, while it is in flight: its band names which one waits on it.
  const [checking, setChecking] = useState<'restore' | 'drop' | null>(null);
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const [name, setName] = useState('');
  // A typed name is the person's: a list read that moves (refetch, a new snapshot) never replaces it.
  const [typed, setTyped] = useState(false);
  const [from, setFrom] = useState<Snapshot | null>(null);
  const [copyName, setCopyName] = useState('');
  const [project, setProject] = useState('');
  const [server, setServer] = useState('');
  // The copy form was changed from its suggestion: closing it asks before the change is lost.
  const [edited, setEdited] = useState(false);
  const room = useMemo(() => offered(servers), [servers]);
  // A proved change moves the page's computers list (a count, a new row): read it again.
  const done = () => void computers.refetch();

  // Nothing kept from another computer: the suggested name, the closed copy form, the last outcome.
  useEffect(() => {
    setFrom(null);
    setTyped(false);
    take.reset();
    copy.reset();
    drop.reset();
    restore.reset();
    rename.reset();
    setAsking(null);
    setRestoring(null);
    setRenaming(null);
    setDays('');
    setTaking(false);
    setGone(null);
    setDropStop(null);
    setStopped(null);
    setTakeStop(null);
    setChecking(null);
    setTakeReading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // The computer the tab shows now (null once it is gone): a list read that answers after the tab moved to another
  // computer sends nothing and sets nothing.
  const shownId = useRef<string | null>(id);
  useEffect(() => {
    shownId.current = id;
    return () => {
      shownId.current = null;
    };
  }, [id]);
  useEffect(() => {
    if (!typed && !take.busy && !take.held) setName(freeName(defaultSnapName(), items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, items, typed]);
  const pickFrom = (snap: Snapshot) => {
    const sug = copyNameFrom(c.name, snap.name);
    setCopyName(validName(sug) ? sug : '');
    setProject(c.project_id);
    setServer(room.find((x) => x.id === c.server_id)?.id ?? room[0]?.id ?? '');
    copy.reset();
    setEdited(false);
    setFrom(snap);
  };

  // A take or copy proved by Check again ends as a sent one does: its drawer closes, a later one opens on a fresh form.
  const closeTakeProved = () => {
    setTyped(false);
    setDays('');
    setTaking(false);
    done();
  };
  const closeCopyProved = () => {
    done();
    setFrom(null);
  };

  const shown = (o: Shown): Shown => (o && o.kind === 'failed' && isCode(o.code) ? { ...o, message: t(`err.${o.code}`) } : o);
  // The new computer is made in this realm, which refuses a project it does not hold (ProjectPick); a realm's refusal
  // also gets the note naming its possible rules. A refusal without the tab's own sentence keeps the kit's words.
  const pick = realmProject(projects.data, projects.isError ? (projects.error ?? true) : undefined, projects.isFetching, project, shownRealm, c.project_id);
  const copyRealm = realmRefused(copy.outcome, shownRealm);
  const copyError = copy.outcome?.kind === 'failed' && isCode(copy.outcome.code) ? undefined : refusal(copy.outcome);


  const snapAllowed = canTakeNow(c.status);
  const full = !!list.data && list.data.max !== null && list.data.count >= list.data.max;
  const expiry = cleanExpiry(days);
  const takeValid = validSnapName(name) && snapAllowed && !full && expiry !== undefined;
  const copyValid = from !== null && validName(copyName) && pick.state === 'ok' && server !== '';
  const heldSnap = copy.held ? String(copy.held.snapshot ?? '') : (from?.name ?? '');
  const copyBand = copy.held ? (
    <HeldBand overlayId="computers-snapshots-tab-held-dismiss-copy" elsewhere={null} text={t('held.copyFrom', { name: String(copy.held.name ?? '') })} readOnly={copy.elsewhere !== null} onCheck={async () => { if (await copy.check()) closeCopyProved(); }} onDismiss={copy.dismiss} />
  ) : null;
  const canRestore = canWrite && canSnap;
  const rowsBusy = copy.held !== null || drop.held !== null || drop.busy || restore.held !== null || restore.busy || rename.held !== null || rename.busy || checking !== null;
  const newLabel = cleanLabel(label);
  const labelChanged = renaming !== null && newLabel !== undefined && newLabel !== (renaming.alias ?? null);
  const openRename = (snap: Snapshot) => {
    rename.reset();
    setLabel(snap.alias ?? '');
    setRenaming(snap);
  };
  const restoreNow = (snap: Snapshot) => {
    setRestoring(null);
    if (restore.held || restore.busy || checking) return;
    setStopped(null);
    setChecking('restore');
    // The question was opened on a list that may be older than the server's: send only for a snapshot a fresh, complete read
    // still shows as the one asked about, and take the baseline from that read, never from the older row.
    const since = Date.now();
    void list.refetch().then(
      (res) => {
        if (shownId.current !== id) return;
        const fresh = res.status === 'success' && res.dataUpdatedAt >= since && res.data?.complete ? res.data : undefined;
        const cur = fresh?.items.find((x) => x.name === snap.name);
        if (!fresh) {
          setStopped({ kind: 'unread', name: snap.name });
          setChecking(null);
        } else if (!cur) {
          setStopped({ kind: 'missing', name: snap.name });
          setChecking(null);
        } else if (cur.createdAt !== snap.createdAt) {
          setStopped({ kind: 'changed', name: snap.name });
          setChecking(null);
        } else {
          setChecking(null);
          void restore.run({ id, name: cur.name, before: cur.lastUsedAt }).then((r) => {
            if (r.outcome === 'done') {
              done();
              void list.refetch();
            }
          });
        }
      },
      () => {
        if (shownId.current !== id) return;
        setStopped({ kind: 'unread', name: snap.name });
        setChecking(null);
      },
    );
  };
  const dropNow = (snap: Snapshot) => {
    setAsking(null);
    if (drop.held || drop.busy || checking) return;
    setGone(null);
    setDropStop(null);
    setChecking('drop');
    // The question was opened on a list that may be older than the server's, and a delete goes by name: send only for a
    // snapshot a fresh, complete read still shows as the one asked about (same created time), never for one replaced
    // under that name since.
    const since = Date.now();
    void list.refetch().then(
      (res) => {
        if (shownId.current !== id) return;
        setChecking(null);
        const fresh = res.status === 'success' && res.dataUpdatedAt >= since && res.data?.complete ? res.data : undefined;
        const cur = fresh?.items.find((x) => x.name === snap.name);
        if (!fresh) return setDropStop({ kind: 'unread', name: snap.name });
        if (!cur) return setGone(snap.name);
        if (cur.createdAt !== snap.createdAt) return setDropStop({ kind: 'changed', name: snap.name });
        void drop.run({ id, name: cur.name }).then(async (r) => {
          if (r.outcome === 'done') {
            done();
            void list.refetch();
          } else if (r.outcome === 'failed') {
            // The list may have moved since the read above: read it again, and say "already deleted" only if that read
            // succeeded just now, is whole and lacks the name (a failed read keeps the older list in the cache: it proves nothing).
            const again = Date.now();
            const res2 = await list.refetch();
            const fresh2 = res2.status === 'success' && res2.dataUpdatedAt >= again ? res2.data : undefined;
            if (fresh2 && fresh2.complete && !fresh2.items.some((x) => x.name === snap.name)) {
              drop.reset();
              setGone(snap.name);
            }
          }
        });
      },
      () => {
        if (shownId.current !== id) return;
        setChecking(null);
        setDropStop({ kind: 'unread', name: snap.name });
      },
    );
  };


  // Take is a drawer from the card head. The head button is off, with its reason, while a take is held, while the
  // computer is in a state that cannot take one, and at the most snapshots it can hold (the kit also keeps it off
  // until the list is read).
  const takeReason = take.held ? t('take.heldReason') : !snapAllowed ? t('take.state') : full ? t('take.fullReason') : undefined;
  const takeAction: ActionSpec = { id: 'take', label: t('take.go'), icon: 'plus', opens: 'dialog', busy: take.busy, onPress: () => setTaking(true), ...(takeReason ? { disabledReason: takeReason } : {}) };
  // The menu's ask (`take=1`) waits for the list, as the head button does; then it opens the drawer only when Take is
  // on (a held take, a full list or the computer's state shows in the card instead) and the list is whole and fresh:
  // "full" judged from a partial or older list proves nothing, and the head button is off there too. Read once, then dropped.
  const listWhole = !!list.data && list.data.listed && list.data.complete && !list.isError;
  const [wantTake, setWantTake] = useSearchParam('take');
  const listRead = list.data !== undefined || list.isError;
  useEffect(() => {
    if (wantTake === undefined || (canSnap && !listRead)) return;
    setWantTake(undefined, { replace: true });
    if (canSnap && listWhole && !takeReason) setTaking(true);
  }, [wantTake, setWantTake, canSnap, listRead, listWhole, takeReason]);
  const failed = list.isError && !list.data;
  const state: SectionState = failed
      ? { kind: 'failed', error: list.error, onRetry: () => void list.refetch(), busy: list.isFetching }
      : !list.data
        ? { kind: 'loading', rows: 3, variant: 'table' }
        : !list.data.listed
          ? { kind: 'unknown', text: t('snap.error'), onRecheck: () => void list.refetch(), busy: list.isFetching }
          : list.isError
            ? { kind: 'stale', shown: items.length, error: list.error, onRetry: () => void list.refetch(), busy: list.isFetching }
            // Rows the read could not take (or another computer's answer): never "No snapshots yet" or a whole count.
            : !list.data.complete
              ? { kind: 'partial', shown: items.length, onRecheck: () => void list.refetch(), busy: list.isFetching }
              : { kind: 'ready' };
  const nameOf = (x: Snapshot) => x.alias ?? x.name;
  const busyReason = rowsBusy ? t('row.busy') : undefined;
  const rowActions = (x: Snapshot): RowActionEntry[] => {
    const off = rowsBusy ? { isDisabled: true, disabledReason: busyReason } : {};
    return [
      ...(canRestore ? [{ id: 'restore', label: t('snap.row.restoreName', { name: nameOf(x) }), short: t('snap.row.restore'), inline: true, opens: true, onAction: () => setRestoring(x), ...off }] : []),
      // Offered with its reason when this session cannot make computers, never a drawer with no footer.
      { id: 'new', label: t('snap.row.new'), opens: true, onAction: () => pickFrom(x), ...(canCopy ? off : { isDisabled: true, disabledReason: t('from.noAccess') }) },
      { id: 'rename', label: t('snap.row.rename'), opens: true, onAction: () => openRename(x), ...off },
      '-',
      { id: 'delete', label: t('snap.row.delete'), opens: true, tone: 'danger', onAction: () => setAsking(x), ...off },
    ];
  };
  const columns = [
    col.display({
      id: 'name',
      header: t('col.name'),
      meta: { pinned: true, mono: true, list: 'primary', label: t('col.name') },
      cell: (x) => {
        const r = x.row.original;
        return r.alias && r.alias !== r.name ? `${r.alias} (${r.name})` : r.name;
      },
    }),
    col.display({
      id: 'kind',
      header: t('col.kind'),
      meta: { size: 'fit', fitText: (r) => t(r.stateful ? 'kind.memory' : 'kind.disk'), list: 'status', label: t('col.kind') },
      cell: (x) => (x.row.original.stateful ? <Tag tip={t('kind.memory.tip')}>{t('kind.memory')}</Tag> : <Tag>{t('kind.disk')}</Tag>),
    }),
    col.display({
      id: 'taken',
      header: t('col.taken'),
      meta: { size: 'fit', fitText: (r) => (r.createdAt ? when(r.createdAt) : '—'), listLabel: true, label: t('col.taken') },
      cell: (x) => (x.row.original.createdAt ? when(x.row.original.createdAt) : '—'),
    }),
    col.display({
      id: 'size',
      header: t('col.size'),
      meta: { size: 'fit', align: 'end', mono: true, fitText: (r) => (r.size !== null ? formatBytes(r.size) : '—'), listLabel: true, label: t('col.size') },
      cell: (x) => (x.row.original.size !== null ? formatBytes(x.row.original.size) : '—'),
    }),
    col.display({
      id: 'expires',
      header: t('col.expires'),
      meta: { size: 'fit', priority: 3, fitText: (r) => (r.expiresAt ? when(r.expiresAt) : t('expires.never')), listLabel: true, label: t('col.expires') },
      cell: (x) => (x.row.original.expiresAt ? when(x.row.original.expiresAt) : t('expires.never')),
    }),
  ];

  // Every notice of the card, in one place: held changes first, then what a restore's check found, then outcomes.
  const notices = !canSnap ? (
    <Band size="table">{t('snap.noAccess')}</Band>
  ) : (
    <>
      {take.held && !taking ? <HeldBand overlayId="computers-snapshots-tab-held-dismiss-take" elsewhere={null} text={t('held.take', { name: String(take.held.name ?? '') })} readOnly={take.elsewhere !== null} onCheck={async () => { if (await take.check()) done(); }} onDismiss={take.dismiss} /> : null}
      {from === null ? copyBand : null}
      {restore.held ? <HeldBand overlayId="computers-snapshots-tab-held-dismiss-restore" elsewhere={null} dismissBody={t('held.dismissBodyChange')} text={t('held.restore', { name: String(restore.held.name ?? '') })} readOnly={restore.elsewhere !== null} onCheck={async () => { if (await restore.check()) { done(); void list.refetch(); } }} onDismiss={restore.dismiss} /> : null}
      {drop.held ? <HeldBand overlayId="computers-snapshots-tab-held-dismiss-drop" elsewhere={null} dismissBody={t('held.dismissBodyChange')} text={t('held.drop', { name: String(drop.held.name ?? '') })} readOnly={drop.elsewhere !== null} onCheck={async () => { if (await drop.check()) done(); }} onDismiss={drop.dismiss} /> : null}
      {rename.held && renaming === null ? <HeldBand overlayId="computers-snapshots-tab-held-dismiss-rename" elsewhere={null} dismissBody={t('held.dismissBodyChange')} text={t('held.rename', { name: String(rename.held.name ?? '') })} readOnly={rename.elsewhere !== null} onCheck={async () => { if (await rename.check()) void list.refetch(); }} onDismiss={rename.dismiss} /> : null}
      {checking ? <Band size="table">{t(`${checking}.checking`)}</Band> : null}
      {stopped ? <Band size="table" onDismiss={() => setStopped(null)}>{t(`restore.${stopped.kind}`, { name: stopped.name })}</Band> : null}
      {list.data?.listed && !list.data.complete && list.isError ? <Band tone="warn" size="table" /* noDetails: rows the older read could not take, not a rejection; the stale state shows the newest read's error */>{t('snap.partialOld')}</Band> : null}
      {full && !take.held ? <Band tone="warn" size="table" /* noDetails: a count the list read, not a rejection */>{t('snap.full', { max: list.data?.max ?? 0 })}</Band> : null}
      {!taking && !take.held ? <Outcome outcome={shown(take.outcome)} doneText={t('take.done')} /* noDetails: the runner keeps only the outcome and its code; the send's mutation, with its error, is reset at settle */ /> : null}
      {restore.held ? null : <Outcome outcome={shown(restore.outcome)} doneText={t('restore.done')} /* noDetails: the runner keeps only the outcome and its code; the send's mutation, with its error, is reset at settle */ />}
      {drop.held ? null : gone ? <Band size="table" onDismiss={() => setGone(null)}>{t('drop.gone', { name: gone })}</Band> : dropStop ? <Band size="table" onDismiss={() => setDropStop(null)}>{t(`drop.${dropStop.kind}`, { name: dropStop.name })}</Band> : <Outcome outcome={shown(drop.outcome)} doneText={t('drop.done')} /* noDetails: the runner keeps only the outcome and its code; the send's mutation, with its error, is reset at settle */ />}
      {rename.held || renaming !== null ? null : <Outcome outcome={shown(rename.outcome)} doneText={t('rename.done')} /* noDetails: the runner keeps only the outcome and its code; the send's mutation, with its error, is reset at settle */ />}
    </>
  );

  return (
    <div className={s.stack}>
      <SnapshotsGlance list={canSnap ? list.data : undefined} failed={!canSnap || failed} />
      {canSnap ? (
      <AnatomySection id="snapshots" title={t('snap.list')} description={t('snap.lede')} actions={{ primary: takeAction }} notices={notices} state={state} flush>
        <DataTable
          label={t('snap.list')}
          data={items}
          columns={columns}
          getRowId={(x) => x.name}
          fill={false}
          bare
          noViewMenu
          sortParam={false}
          onRowAction={false}
          countLabel={(n) => t('snap.countRows', { count: n })}
          empty={<EmptyState icon="clock" size="sm" title={t('snap.empty')} body={t('snap.emptyBody')} />}
          actions={rowActions}
        />
      </AnatomySection>
      ) : (
        <AnatomySection id="snapshots" title={t('snap.list')} description={t('snap.lede')} notices={notices} />
      )}
      <Drawer overlayId="computers-snapshots-tab-take" resizeKey="computers-snapshot-take"
        isOpen={taking && canSnap}
        onOpenChange={(o) => !o && !take.busy && setTaking(false)}
        title={t('take.title')}
        size="sm"
        dirty={(typed || days.trim() !== '') && !take.held && !take.busy}
        footer={
          take.held ? undefined : (
            <FormFooter
              dirty={typed || days.trim() !== ''}
              requireDirty={false}
              submitDisabled={!takeValid}
              busy={take.busy || takeReading}
              busyLabel={t('take.busy')}
              outcome={shown(take.outcome)}
              /* noDetails: the runner keeps only the outcome and its code; the send's mutation, with its error, is reset at settle */
              onCheck={async () => { if (await take.check()) closeTakeProved(); }}
              submitLabel={t('take.go')}
              onSubmit={() => {
                if (!takeValid || take.held || takeReading) return;
                setTakeStop(null);
                setTakeReading(true);
                // The take is proved by the list showing its name, so a name the list already holds could never prove
                // it: send only after a fresh, complete read lacks the name (an older one the API would refuse).
                const sent = name;
                const sentExpiry = expiry;
                const since = Date.now();
                void list.refetch().then(
                  (res) => {
                    if (shownId.current !== id) return;
                    setTakeReading(false);
                    const fresh = res.status === 'success' && res.dataUpdatedAt >= since && res.data?.complete ? res.data : undefined;
                    if (!fresh) return setTakeStop({ kind: 'unread', name: sent });
                    if (fresh.items.some((x) => x.name === sent || x.alias === sent)) return setTakeStop({ kind: 'taken', name: sent });
                    const vars: TakeVars = sentExpiry === null || sentExpiry === undefined ? { id, name: sent, fresh: true } : { id, name: sent, expiry: sentExpiry, fresh: true };
                    void take.run(vars).then((r) => {
                      if (r.outcome === 'done') {
                        setTyped(false);
                        setDays('');
                        setTaking(false);
                        done();
                        void list.refetch();
                      }
                    });
                  },
                  () => {
                    if (shownId.current !== id) return;
                    setTakeReading(false);
                    setTakeStop({ kind: 'unread', name: sent });
                  },
                );
              }}
            />
          )
        }
      >
        {take.held ? (
          <HeldBand overlayId="computers-snapshots-tab-held-dismiss-take-form" elsewhere={null} text={t('held.take', { name: String(take.held.name ?? '') })} readOnly={take.elsewhere !== null} onCheck={async () => { if (await take.check()) closeTakeProved(); }} onDismiss={take.dismiss} />
        ) : (
          <div className={s.stack}>
            <TextField label={t('field.snapName')} value={name} onChange={(v) => { setTyped(true); setName(v); }} description={t('field.snapRule')} errorMessage={(name ? !validSnapName(name) : typed) ? t('field.snapRule') : undefined} />
            <TextField label={t('take.expiry')} value={days} onChange={setDays} inputMode="numeric" description={t('take.expiryHelp')} errorMessage={expiry === undefined ? t('take.expiryHelp') : undefined} />
            {/* One Band: a full list is the stronger stop, then the computer's state, then what stopped the last press. */}
            {full ? (
              <Band tone="warn" size="table" /* noDetails: a count the list read, not a rejection */>{t('snap.full', { max: list.data?.max ?? 0 })}</Band>
            ) : !snapAllowed ? (
              <Band size="table">{t('take.state')}</Band>
            ) : takeStop ? (
              <Band size="table" onDismiss={() => setTakeStop(null)}>{t(`take.${takeStop.kind}`, { name: takeStop.name })}</Band>
            ) : null}
          </div>
        )}
      </Drawer>
      <ConfirmDialog overlayId="computers-snapshots-tab-drop"
        isOpen={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
        title={t('drop.title', { name: asking?.name ?? '' })}
        body={t('drop.body', { name: asking?.name ?? '' })}
        confirmLabel={t('drop.go')}
        tone="danger"
        onConfirm={() => { if (asking) dropNow(asking); }}
      />
      <ConfirmDialog overlayId="computers-snapshots-tab-restore"
        isOpen={restoring !== null}
        onOpenChange={(o) => !o && setRestoring(null)}
        title={t('restore.title', { name: restoring?.name ?? '' })}
        body={t('restore.body', { name: restoring?.name ?? '', computer: c.name })}
        confirmLabel={t('restore.go')}
        tone="danger"
        onConfirm={() => { if (restoring) restoreNow(restoring); }}
      />
      <Drawer overlayId="computers-snapshots-tab-rename" resizeKey="computers-snapshot-rename"
        isOpen={renaming !== null}
        onOpenChange={(o) => !o && !rename.busy && setRenaming(null)}
        title={t('rename.title', { name: renaming?.name ?? '' })}
        subtitle={t('rename.lede', { name: renaming?.name ?? '' })}
        size="sm"
        dirty={labelChanged && !rename.held && !rename.busy}
        footer={
          rename.held ? undefined : (
            <FormFooter
              dirty={labelChanged}
              requireDirty={false}
              submitDisabled={!labelChanged}
              busy={rename.busy}
              busyLabel={t('rename.busy')}
              outcome={shown(rename.outcome)}
              /* noDetails: the runner keeps only the outcome and its code; the send's mutation, with its error, is reset at settle */
              onCheck={async () => { if (await rename.check()) void list.refetch(); }}
              submitLabel={t('rename.go')}
              onSubmit={() => {
                if (!renaming || !labelChanged || newLabel === undefined || rename.held) return;
                void rename.run({ id, name: renaming.name, alias: newLabel }).then((r) => {
                  if (r.outcome === 'done') {
                    void list.refetch();
                    setRenaming(null);
                  }
                });
              }}
            />
          )
        }
      >
        {rename.held ? (
          <HeldBand overlayId="computers-snapshots-tab-held-dismiss-rename-form" elsewhere={null} text={t('held.rename', { name: String(rename.held.name ?? '') })} readOnly={rename.elsewhere !== null} onCheck={async () => { if (await rename.check()) { void list.refetch(); setRenaming(null); } }} onDismiss={rename.dismiss} />
        ) : (
          <div className={s.stack}>
            <TextField label={t('field.label')} value={label} onChange={setLabel} maxLength={MAX_LABEL * 2} description={t('field.labelRule')} errorMessage={newLabel === undefined ? t('field.labelRule') : undefined} />
          </div>
        )}
      </Drawer>
      <Drawer overlayId="computers-snapshots-tab-from" resizeKey="computers-snapshot-from"
        isOpen={from !== null && (canCopy || copy.held !== null)}
        onOpenChange={(o) => !o && !copy.busy && setFrom(null)}
        title={t('from.title', { snap: heldSnap })}
        subtitle={t('from.lede', { snap: heldSnap, name: c.name })}
        size="sm"
        dirty={edited && !copy.held && !copy.busy}
        footer={
          canCopy && !copy.held ? (
            <FormFooter
              dirty={copyValid}
              requireDirty={false}
              submitDisabled={!copyValid}
              busy={copy.busy}
              busyLabel={t('from.busy')}
              outcome={shown(copy.outcome)}
              /* noDetails: the tab's own coded refusals show their sentence (the code); every other refusal passes error= */
              error={copyError}
              onCheck={async () => { if (await copy.check()) closeCopyProved(); }}
              submitLabel={t('from.go')}
              onSubmit={() => {
                if (!from || !copyValid || copy.held) return;
                // Every computer the page's list shows now: a read-back proves the new computer only by a row not among
                // them (data.ts listMadeNew), so a copy to a taken name, refused, is never read as made, nor is one whose
                // name a listed computer takes later. With no list read yet, or a list that may not be the whole list (a
                // full page: data.ts pressBefore), there is none, and no read proves it. The realm: pressRealm ('all'
                // when the page names no realm API domain, as core then sends the copy to the base host).
                const before = pressBefore(computers.data);
                void copy.run({ id, snapshot: from.name, name: copyName, project: pick.dest, server, realm: pressRealm(hostRealm), ...(before ? { before } : {}) }).then((r) => {
                  if (r.outcome === 'done') {
                    done();
                    setFrom(null);
                  }
                });
              }}
            />
          ) : undefined
        }
      >
        {copy.held ? (
          copyBand
        ) : (
          <div className={s.stack}>
            <TextField label={t('field.name')} value={copyName} onChange={(v) => { setEdited(true); setCopyName(v); }} description={t('field.nameRule')} errorMessage={copyName && !validName(copyName) ? t('field.nameRule') : undefined} />
            <Select label={t('field.server')} value={server || undefined} onChange={(v) => { setEdited(true); setServer(v); }} options={room.map((x) => ({ value: x.id, label: `${countryFlag(x.cc)} ${x.name}`.trim(), description: x.place }))} description={room.length ? undefined : t('field.noRoom')} />
            <ProjectPick pick={pick} onChange={(v) => { setEdited(true); setProject(v); }} onRetry={() => void projects.refetch()} error={projects.error} outsideText={t('from.projectOutside')} noneText={t('from.noProject')} sameText={t('from.sameProject', { name: c.name })} />
            {copyRealm ? <RealmRefusedNote text={t('from.realmRefused')} /> : null}
          </div>
        )}
      </Drawer>
      <ZipBackup computer={c} />
    </div>
  );
}

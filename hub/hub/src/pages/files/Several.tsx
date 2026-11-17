// Copy / Move several selected items to the other side, on one computer.
//
// One plan before the press (several.ts planSeveral): each item's whole destination, a name taken when Files checked
// under its Keep-both name (or left out with Skip); every send is create-only (a name taken later is the program's
// 409). A copy takes its name atomically; a move is the program's check then rename, so a name created in between
// can still be replaced (the single Move is the same). A move is judged per item where it resolves, read fresh,
// exactly as a single move: an item holding an open storage, an item on another place than the destination, or a
// system path (either end) is left out with its reason and "move it on its own", where the single dialog types its
// name or offers Copy instead. A folder copy is walked first (useTreeWalk), as a single one is.
//
// The press sends the items one at a time through the same change hooks (data.ts useFilesChange: core's C9 lock, one
// change at a time on the computer), each with its own op, never twice. The run stops at the first item that is not
// done: an unknown outcome stays "may have gone through" in the held band, with Check again, and nothing after it is
// sent; a refusal says why; the rest are not sent. "Stop after this one" ends the run after the item being sent.
// Leaving the dialog sends nothing more.
//
// Copy the rest (`rest`): the rows are a held folder copy's missing items (Rest.tsx plans them), each
// going to its own place in that copy, no Keep both. That held copy does not refuse the run; the press lets it go first
// (core dismissOne: only that copy, warned before the press), then sends. A name made meanwhile (the program's 409)
// is kept and skipped, and the run goes on past it; any other outcome stops it as above.
//
// Layout, all kit: From and To as one spec sheet (Facts); one Verdict plate for where the run stands (reading, checking,
// the run's summary) with its one next line (the release warning, Stopping, what the read after the run found); a
// refusal or the destination's failed read as the one Band; the items as an ItemList (each item's state its meta line)
// in an "Items" section; Copy the rest's different items as a section of their own.
import { errorInfo, newKey, reachOf } from '@core';
import { Band, Dialog, errorSentence, Facts, ItemList, RadioGroup, SubSection, TextButton, UnreachableState, useStrings, Verdict } from '@kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { shownOutcome } from './changes';
import { readBackShown, useCanChange, useFilesChange, useFolder, useHeldOn, usePlanReads, useTreeWalk, verdictOf, type ChangeIdentity, type FilesComputer } from './data';
import { displayName } from './logic';
import { placeOf, renameTyped, storageIn } from './plan';
import { folderOf, planSeveral, SEVERAL_FOLDERS_MAX, SEVERAL_MAX, sizeRefusal, tallyOf, type SevItem, type SevOutcome, type SevRow } from './several';
import { SKIP_LIST_MAX, skippedOf, verdictWords, type TransferKind } from './Transfer';
import { WALK_MAX_ENTRIES, WALK_MAX_FOLDERS, type Walk } from './tree';
import fileStrings from './strings.en.json';
import strings from './Transfer.strings.en.json';

type MoveWhy = 'holdsMount' | 'mountsUnknown' | 'places' | 'protected';
type T = ReturnType<typeof useStrings<typeof strings>>;

/** Why a walked folder is left out, in words, or null (done, or still reading). */
function walkWhy(t: T, w: Walk | undefined, name: string): string | null {
  if (!w) return null;
  if (w.state === 'failed') return t('walk.failed', { name });
  if (w.state !== 'refused') return null;
  return t(`walk.${w.why}`, { name, entries: WALK_MAX_ENTRIES.toLocaleString('en-US'), folders: String(WALK_MAX_FOLDERS) });
}

/** One folder copy's walk, reported up (a hook per folder needs a component per folder). */
function Walker({ c, src, dest, onWalk }: { c: FilesComputer; src: string; dest: string; onWalk: (key: string, w: Walk) => void }) {
  const w = useTreeWalk(c, src, dest, true);
  const sig = w.state === 'refused' ? `refused:${w.why}` : w.state;
  useEffect(() => { onWalk(`${src}>${dest}`, w); }, [src, dest, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Copy the rest (Rest.tsx): the held copy it finishes, the rows one press takes (several.ts planRest + capRest; null
 *  while it is checked again, with `note` saying so), how many wait for the next press, the items that are different
 *  (listed, never sent), and what the copy read again after the run finds, in words (null before the run). `final`: the
 *  check ended with nothing to send (whole, or it could not tell): the note stays, with Close only. */
export interface RestPlan {
  readonly held: ChangeIdentity;
  readonly rows: readonly SevRow[] | null;
  readonly more: number;
  readonly different: readonly string[];
  readonly after: string | null;
  /** The copy, read again after the run, is found whole: only then does the dialog close by itself. */
  readonly whole: boolean;
  /** The next press, offered after the run while the read since still finds items missing. */
  readonly again?: () => void;
  readonly note: string | null;
  readonly final: boolean;
}

/** The held change `id` names this very send (its op), or the same copy where no op was recorded. */
const sameHeld = (a: ChangeIdentity, b: ChangeIdentity): boolean => a.kind === b.kind && a.computer === b.computer && a.path === b.path && a.dest === b.dest && a.op === b.op;
const relOf = (path: string, root: string) => (path.startsWith(root + '/') ? path.slice(root.length + 1) : path);

export interface SeveralProps {
  readonly kind: TransferKind;
  readonly c: FilesComputer;
  readonly items: readonly SevItem[];
  /** The other side's folder, on the same computer. */
  readonly destFolder: string;
  /** Why the other side can't take anything from this folder (view.tsx sideBlock, in words), or null. */
  readonly blocked?: string | null;
  /** Copy the rest of a held folder copy (kind copy; destFolder is that copy's destination). */
  readonly rest?: RestPlan;
  /** Called once when a run that sent something has ended (Copy the rest reads the copy again then). */
  readonly onRunEnd?: () => void;
  readonly onClose: () => void;
}

export function SeveralDialog({ kind, c, items, destFolder, blocked = null, rest, onRunEnd, onClose }: SeveralProps) {
  const t = useStrings(strings);
  const tf = useStrings(fileStrings);
  const copy = useFilesChange('copy');
  const move = useFilesChange('move');
  const change = kind === 'copy' ? copy : move;
  const canChange = useCanChange();
  const held = useHeldOn(c.id);
  const [onTaken, setOnTaken] = useState<'keep' | 'skip'>('keep');

  // The other side's names, read now: a taken name gets the Keep-both name, or is left out.
  // Copy the rest goes by its own plan: each item to its own place, never a Keep-both name.
  const dest = useFolder(c, destFolder, !blocked && !rest);
  const taken = dest.data && !dest.isError ? dest.data.entries.map((e) => e.name) : null;
  const planned = rest ? rest.rows : taken ? planSeveral(items, destFolder, taken, onTaken) : null;
  const [releaseFailed, setReleaseFailed] = useState(false);

  // A move: where every item and the destination resolve, and which storages are open, read fresh.
  const realPaths = kind === 'move' ? [...items.map((i) => i.path), ...(destFolder === '/' ? [] : [destFolder])] : [];
  const plan = usePlanReads(c, realPaths, kind === 'move' && !blocked);
  const realDest = destFolder === '/' ? '/' : plan.real?.get(destFolder);
  const mounts = plan.mounts;
  const moveWhy = (it: SevItem): MoveWhy | null => {
    if (kind !== 'move') return null;
    const real = plan.real?.get(it.path);
    if (real === undefined || realDest === undefined || mounts === undefined) return null;
    const list = mounts ? mounts.items : [];
    if (it.dir && mounts && storageIn(it.path, real, list)) return 'holdsMount';
    if (it.dir && (mounts === null || !mounts.complete)) return 'mountsUnknown';
    if (renameTyped(real) || (destFolder !== '/' && renameTyped(realDest))) return 'protected';
    if (mounts && placeOf(real, list).key !== placeOf(realDest, list).key) return 'places';
    return null;
  };

  // Frozen at the press: the rows and what each is left out for, then each item's outcome as it is sent.
  // `known`: a folder copy's items its walk found the files program leaves out (pipes, sockets, devices), so a copy
  // proved made by a read later still says them.
  const [frozen, setFrozen] = useState<readonly { row: SevRow; why: string | null; known: number }[] | null>(null);
  const [outcomes, setOutcomes] = useState<ReadonlyMap<number, SevOutcome>>(new Map());
  const [running, setRunning] = useState(false);
  const once = useRef(false);
  const ops = useRef(new Map<number, string>());
  const stop = useRef(false);
  const [stopping, setStopping] = useState(false);
  const alive = useRef(true);
  // Set on every mount (a dev remount runs the cleanup once first), cleared when the dialog goes.
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Folder copies: each walked, as a single folder copy is.
  const [walks, setWalks] = useState<ReadonlyMap<string, Walk>>(new Map());
  // Keyed by source and destination: a walk judged towards another name (the Keep-both choice changed) never counts.
  const onWalk = useCallback((key: string, w: Walk) => setWalks((m) => new Map(m).set(key, w)), []);
  const folderCopies = kind === 'copy' && planned && !frozen ? planned.filter((r) => r.item.dir && r.dest) : [];

  const whyOf = (r: SevRow): string | null => {
    const name = displayName(r.item.name);
    if (r.skip === 'taken') return t('several.skipTaken', { name });
    if (r.skip === 'noName') return t('several.noName', { name });
    if (r.skip === 'badName' || r.skip === 'deep') return t('several.badName', { name });
    if (r.skip === 'intoItself') return t('several.intoItself', { name });
    const mw = moveWhy(r.item);
    if (mw) return t(`several.move.${mw}`, { name });
    return kind === 'copy' && r.item.dir && r.dest ? walkWhy(t, walks.get(`${r.item.path}>${r.dest}`), name) : null;
  };
  const knownOf = (r: SevRow): number => { const w = kind === 'copy' && r.item.dir && r.dest ? walks.get(`${r.item.path}>${r.dest}`) : undefined; return w?.state === 'done' ? w.left.length : 0; };
  const rows = frozen ?? (planned ? planned.map((row) => ({ row, why: whyOf(row), known: knownOf(row) })) : null);
  const sendable = rows ? rows.filter((x) => !x.why) : [];

  // Copy the rest: one press takes what capRest gave it, and the held copy it finishes refuses nothing.
  const size = rest ? null : sizeRefusal(items.length, folderCopies.length);
  const heldOthers = rest ? held.filter((h) => !sameHeld(h.identity, rest.held)) : held;
  let refusal: string | null = null;
  if (!frozen) {
    if (blocked) refusal = blocked;
    else if (heldOthers.length > 0) refusal = tf('changes.overlap');
    else if (size) refusal = t(`several.${size}`, { max: String(size === 'tooMany' ? SEVERAL_MAX : SEVERAL_FOLDERS_MAX) });
    else if (kind === 'move' && plan.failed) refusal = t('move.checkFailed');
    // Copy the rest: nothing missing (only different items left), or missing items none of which can be sent.
    else if (rows && sendable.length === 0) refusal = rest ? t(rows.length ? 'rest.noneSendable' : 'rest.nothing', { dest: displayName(destFolder) }) : t('several.nothing');
  }
  const moveReady = kind !== 'move' || (plan.real !== null && realDest !== undefined && mounts !== undefined);
  const walksReady = folderCopies.every((r) => { const w = walks.get(`${r.item.path}>${r.dest}`); return !!w && w.state !== 'reading'; });
  const ready = !frozen && canChange && !!rows && !refusal && moveReady && walksReady && sendable.length > 0;

  const send = async () => {
    // Single use: a second press or a re-render never starts this again; each item is sent at most once.
    if (once.current || !ready || !rows) return;
    once.current = true;
    setRunning(true);
    // Copy the rest lets its held copy go first (only that one, the person was told before the press); nothing is
    // sent unless that free was stored. Already let go (a read proved it since): nothing to free.
    if (rest && held.some((h) => sameHeld(h.identity, rest.held))) {
      setReleaseFailed(false);
      const freed = await copy.dismissOne(rest.held);
      if (!alive.current) return;
      if (!freed) { once.current = false; setRunning(false); setReleaseFailed(true); return; }
    }
    setFrozen(rows);
    for (let i = 0; i < rows.length; i++) {
      const { row, why } = rows[i]!;
      if (why || !row.dest) continue;
      if (stop.current || !alive.current) break;
      const op = newKey();
      ops.current.set(i, op);
      const r = await change.run({ c, path: row.item.path, dest: row.dest, op, dir: row.item.dir, size: row.item.size, modified: row.item.modified });
      const left = r.outcome === 'done' && kind === 'copy' ? skippedOf(r.data)?.count : undefined;
      // A refusal keeps its facts (code, status, route) for the kit's shared words.
      // Copy the rest: a name made meanwhile (the program's create-only 409) is kept, and the run goes on.
      const o: SevOutcome = r.outcome === 'done' ? { kind: 'done', ...(left ? { left } : {}) } : r.outcome === 'pending' ? { kind: 'pending' }
        : rest && r.outcome === 'failed' && r.code === 'DESTINATION_EXISTS' ? { kind: 'taken' }
        : { kind: r.outcome === 'not_sent' ? 'not_sent' : 'failed', ...(r.code ? { code: r.code } : {}), ...(r.status !== undefined ? { status: r.status } : {}), ...(r.route ? { route: r.route } : {}) };
      if (!alive.current) return;
      setOutcomes((m) => new Map(m).set(i, o));
      // Stop at the first item not done: an unknown outcome is never followed by another send.
      if (o.kind !== 'done' && o.kind !== 'taken') break;
    }
    if (alive.current) { setRunning(false); onRunEnd?.(); }
  };

  const tally = frozen ? tallyOf(frozen.map((x) => x.row), outcomes, new Set(frozen.flatMap((x, i) => (x.why ? [i] : [])))) : null;
  const leftOut = rows ? rows.filter((x) => x.why).length : 0;
  // Everything went and nothing was left out: the listings show it, so the dialog closes, as a single copy's does.
  // Copy the rest closes only once the copy, read again after the run, is found whole; otherwise it stays to say what
  // that read found (and offers the next press while items are missing).
  const allDone = !!frozen && !running && !!tally && tally.done === sendable.length && !tally.pending && !tally.failed && tally.left === 0 && leftOut === 0
    && (!rest || rest.whole);
  useEffect(() => { if (allDone) onClose(); }, [allDone, onClose]);

  // The held item: settled later by a read (the band's Check again), say what was proved for that very send.
  const pendingIndex = frozen ? [...outcomes].find(([, o]) => o.kind === 'pending')?.[0] : undefined;
  const pendingRow = pendingIndex !== undefined ? frozen![pendingIndex]!.row : null;
  const heldRow = pendingRow ? held.find((h) => (h.identity.kind === kind && h.identity.path === pendingRow.item.path && h.identity.dest === pendingRow.dest)) : undefined;
  const heldNow = !!heldRow;
  const verb = kind === 'copy' ? 'copied' : 'moved';
  const leftWords = (n: number) => (n > 0 ? t(`several.${verb}Left`, { count: String(n) }) : t(`several.${verb}`));
  const statusOf = (i: number, x: { row: SevRow; why: string | null; known: number }): string => {
    if (x.why) return x.why;
    const o = outcomes.get(i);
    if (!o) return frozen ? (running ? t('several.waiting') : t('several.notSent')) : x.known > 0 ? t('several.willLeave', { count: x.known }) : '';
    if (o.kind === 'done') return leftWords(o.left ?? 0);
    if (o.kind === 'taken') return t('several.madeMeanwhile');
    if (o.kind === 'pending') {
      if (heldNow) return t('several.pending');
      const v = pendingRow?.dest ? verdictOf(heldId(pendingRow)) : undefined;
      // Proved made: the answer that would have named what was left out is lost, so the walk's count says it.
      if (v?.verdict === 'applied') return leftWords(x.known);
      return v && pendingRow ? verdictWords(t, { kind, path: pendingRow.item.path, dest: pendingRow.dest ?? '' }, v) : t('verdict.elsewhere', { folder: displayName(destFolder) });
    }
    if (o.code === 'DESTINATION_EXISTS') return t('exists', { name: displayName(x.row.name ?? x.row.item.name), folder: displayName(destFolder) });
    if (o.code === 'FILE_MOVE_CROSSES_DEVICES') return t('move.crosses');
    // The page's own words for its lock and switch (changes.tsx), else the kit's shared sentence for the code/status.
    return shownOutcome(o.kind, o.code, tf)?.message ?? errorSentence(errorInfo({ outcome: o.kind, ...(o.code ? { code: o.code } : {}), ...(o.status !== undefined ? { status: o.status } : {}), ...(o.route ? { route: o.route } : {}) }), { program: true });
  };
  // The held send's identity, as data.ts filed it, with this run's op for that item (verdictOf reads by op).
  function heldId(row: SevRow) {
    const i = frozen ? frozen.findIndex((x) => x.row === row) : -1;
    return { kind, computer: c.id, path: row.item.path, dest: row.dest ?? '', op: ops.current.get(i) ?? '' };
  }

  // Settled by a read since: proved made counts as done; either way the run stopped there.
  const settledMade = !!tally?.pending && !heldNow && verdictOf(heldId(tally.pending))?.verdict === 'applied';
  const summary = tally ? [
    t(kind === 'copy' ? 'several.sumCopied' : 'several.sumMoved', { count: String(tally.done + (settledMade ? 1 : 0)) }),
    ...(tally.taken ? [t('several.sumTaken', { count: String(tally.taken) })] : []),
    ...(tally.pending ? [t(heldNow ? 'several.sumPending' : 'several.sumStopped', { name: displayName(tally.pending.item.name) })] : []),
    ...(tally.failed ? [t('several.sumFailed', { name: displayName(tally.failed.row.item.name) })] : []),
    // While the run goes on, the items after the one being sent are waiting (their lines say so), not "not sent".
    ...(tally.notSent && !running ? [t('several.sumNotSent', { count: String(tally.notSent) })] : []),
    ...(leftOut ? [t('several.sumLeftOut', { count: String(leftOut) })] : []),
  ].join(' ') : null;
  const anyTaken = !rest && !!taken && items.some((i) => taken.includes(i.name));
  const folder = rest ? rest.held.path : folderOf(items);
  const shownDifferent = rest ? rest.different.slice(0, SKIP_LIST_MAX) : [];
  const destFailed = !rows && !blocked && !rest && dest.isError;
  // Where the run stands, one sentence: before the press what is still being read; after it the run's summary.
  const progress = !rows && !blocked && !rest && !dest.isError ? t('several.reading', { folder: displayName(destFolder) })
    : !frozen && kind === 'move' && !refusal && !moveReady ? t('move.checking')
      : !frozen && !refusal && !walksReady ? t('several.walking') : null;
  const standing = frozen ? summary : rest?.note ?? progress ?? (rest?.rows ? t('rest.release') : null);
  const standingNext = frozen ? (running && stopping ? t('several.stopping') : rest && !running ? rest.after : null)
    : progress && rest?.rows ? t('rest.release') : null;
  // The one Band: the destination's failed read, else why nothing can be sent now.
  const bandText = refusal ?? (!frozen && !canChange ? tf('changes.off') : releaseFailed && !frozen ? t('rest.releaseFailed') : null);

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={rest ? t('rest.title', { name: displayName(rest.held.path.split('/').at(-1) ?? '') }) : t(kind === 'copy' ? 'several.copyTitle' : 'several.moveTitle', { count: String(items.length) })}
      size="lg"
      {...(frozen && !running && rest?.again ? { cancelLabel: t('close'), primaryLabel: t('rest.action'), onPrimary: rest.again }
        : frozen || rest?.final ? { cancelLabel: t('close') } : { primaryLabel: t(kind === 'copy' ? 'copy.primary' : 'move.primary'), onPrimary: () => void send(), primaryDisabled: !ready })}
      busy={running}
      // The held item: Check again only reads (core's read-back); what it proves shows on that item's line.
      {...(heldNow ? { outcome: { kind: 'pending' as const }, onCheck: () => readBackShown(change.readBack, heldRow ? [heldRow.hold] : []) } : {})}
    >
      <Facts layout="spec" columns={1} label={t('ends')} items={[
        { label: t('from'), value: t('where', { computer: c.name, path: displayName(folder) }), mono: true },
        { label: t('to'), value: t('where', { computer: c.name, path: displayName(destFolder) }), mono: true },
      ]} />
      {!frozen && anyTaken ? (
        <RadioGroup
          label={t('several.takenLabel', { folder: displayName(destFolder) })}
          options={[{ value: 'keep', label: t('several.keepBoth') }, { value: 'skip', label: t('several.skip') }]}
          value={onTaken}
          onChange={setOnTaken}
        />
      ) : null}
      {standing ? <Verdict label={t(kind === 'copy' ? 'plate.copy' : 'plate.move')} next={standingNext}>{standing}</Verdict> : null}
      {destFailed ? (
        // A failed read of the destination is not "reading" forever, kept names or not (a failed read
        // plans nothing): core's reachOf says whether the computer answered; both read the same folder again.
        reachOf(dest.error) === 'unreachable'
          ? <UnreachableState size="compact" computer={c.name} error={dest.error} onRetry={() => void dest.refetch()} retrying={dest.isFetching} />
          : (
            <Band tone="warn" size="table" error={dest.error} actions={<TextButton onPress={() => void dest.refetch()} isDisabled={dest.isFetching}>{t('several.readAgain')}</TextButton>}>
              {t('several.readFailed', { folder: displayName(destFolder) })}
            </Band>
          )
      ) : bandText ? <Band tone="warn" size="table" /* noDetails: a refusal the page decided (no rejection to show) */>{bandText}</Band> : null}
      {/* Above the list: up to 100 rows under it would push it out of sight while the dialog is busy. */}
      {running && !stopping ? <TextButton onPress={() => { stop.current = true; setStopping(true); }}>{t('several.stop')}</TextButton> : null}
      {rows ? (
        <SubSection title={t('several.listLabel')} state={{ kind: 'ready' }} description={rest && rest.more > 0 ? t('rest.more', { count: rest.more }) : undefined}>
          <ItemList label={t('several.listLabel')} items={rows.map((x, i) => {
            const status = statusOf(i, x);
            const title = `${rest ? displayName(relOf(x.row.item.path, rest.held.path)) : displayName(x.row.item.name)}${x.row.name && x.row.name !== x.row.item.name ? ` → ${displayName(x.row.name)}` : ''}`;
            return { id: x.row.item.path, title, mono: true, ...(status ? { meta: [status] as const } : {}) };
          })} />
        </SubSection>
      ) : null}
      {rest && rest.different.length ? (
        <SubSection title={t('rest.differentTitle')} state={{ kind: 'ready' }} description={t('rest.different', { dest: displayName(destFolder) })}>
          <ItemList label={t('rest.differentTitle')} items={shownDifferent.map((rel) => ({ id: rel, title: displayName(rel), mono: true }))} />
          {rest.different.length > shownDifferent.length ? t('skipped.more', { count: String(rest.different.length - shownDifferent.length) }) : null}
        </SubSection>
      ) : null}
      {size ? null : folderCopies.map((r) => <Walker key={`${r.item.path}>${r.dest}`} c={c} src={r.item.path} dest={r.dest!} onWalk={onWalk} />)}
    </Dialog>
  );
}

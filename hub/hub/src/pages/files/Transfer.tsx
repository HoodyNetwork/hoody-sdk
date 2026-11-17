// Copy / Move to the other side, both sides on ONE computer.
//
// The dialog shows From and To in full (computer and whole path) and sends one change through data.ts
// useFilesChange (core's C9 lock, one change at a time on the computer): never twice, a lost answer is "may have gone through" with
// Check again, which only reads. A name taken when Files checked is never the target: the item goes under the
// Keep-both name, shown in full before the press, and Cancel is Skip; there is no Replace.
// The send is create-only; a copy takes its name atomically, a move is the program's
// check then rename.
//
// A move is refused before it is sent when the two folders are on different places (a storage, a shared folder,
// this computer's own disk), with plain words and Copy instead; the files program's own 409
// FILE_MOVE_CROSSES_DEVICES gets the same offer. A system path (either end) is moved only after its name is typed,
// and a folder holding an open storage is never moved; both are judged where the paths resolve, read fresh.
//
// One press sends once: it freezes the destination, and from then on the dialog shows only that and its outcome.
// A lost answer settled by a read says what this tab's read proved for this very send: done closes; not copied,
// another item at the name, or not moved stays shown (verdictWords); settled elsewhere (another tab's Check again)
// says only that, never done. A file that became a folder before the copy reached it is copied whole by the files
// program: a done answer that left items out lists them (fixed words) and stays shown.
//
// A folder copy first walks the folder, read fresh (data.ts useTreeWalk, tree.ts): the press is armed
// only once the whole tree is read and fits what the Hub can check (at most 2,000 items, 200 folders,
// names it can read back, a files program that lists each entry's type). It says how many items go and which it
// cannot copy (pipes, sockets, devices). A lost answer, or the program's 409 COPY_INCOMPLETE, is "may have gone
// through"; the held band compares both trees, read now: equal, done; missing or different items, still held
// (the copy may still be running) with their count when last checked. A done answer that left items out lists them.
//
// One change at a time on a computer (data.ts FILES_LOCK): while any change there may have gone through, the dialog
// says so before the press.
//
// Layout, all kit: From and To as one spec sheet (Facts); a taken name's new name is the dialog's body (the consequence);
// one Verdict plate for what is known now (checking, the folder copy's plan, a held copy found part made, settled
// elsewhere); what a copy leaves out as a "Left out" SubSection with its paths in an ItemList; a refusal as the one Band.
import { newKey } from '@core';
import { Band, Dialog, Disclosure, Facts, ItemList, SubSection, TextButton, TextField, useStrings, Verdict, type ItemProps } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { shownOutcome } from './changes';
import { SKIP_LIST_MAX, skippedOf, reasonKey, verdictWords, partWords, walkRefusal } from './Transfer.pure';
import type { Result, Skipped } from './Transfer.pure';
export { SKIP_LIST_MAX, skippedOf, verdictWords, partWords, useTransferCheck } from './Transfer.pure';
export type { TransferKind } from './Transfer.pure';
import type { TransferKind } from './Transfer.pure';
import { readBackShown, transferDestOk, useCanChange, useFilesChange, useFolder, useHeldOn, usePlanReads, usePartial, useTreeWalk, verdictOf, type FilesComputer } from './data';
import { displayName, joinPath, parentOf, type Entry } from './logic';
import { keepBothName, nameProblem, placeOf, renameTyped, storageIn } from './plan';
import type { Walk } from './tree';
import fileStrings from './strings.en.json';
import strings from './Transfer.strings.en.json';

export interface TransferProps {
  readonly kind: TransferKind;
  readonly c: FilesComputer;
  /** The folder the item is in, and the item as the listing showed it (its version is what the person approved). */
  readonly folder: string;
  readonly entry: Entry;
  /** The other side's folder, on the same computer. */
  readonly destFolder: string;
  readonly onClose: () => void;
}

export function TransferDialog(p: TransferProps) {
  const t = useStrings(strings);
  const tf = useStrings(fileStrings);
  const [kind, setKind] = useState<TransferKind>(p.kind);
  const { c, folder, entry, destFolder, onClose } = p;
  const copy = useFilesChange('copy');
  const move = useFilesChange('move');
  const change = kind === 'copy' ? copy : move;
  const src = joinPath(folder, entry.name);
  const canChange = useCanChange();
  const held = useHeldOn(c.id);

  // The other side's names, read now (the pane's own read when it shows them): a taken name gets the Keep-both name.
  const dest = useFolder(c, destFolder, true);
  const taken = dest.data && !dest.isError ? dest.data.entries.map((e) => e.name) : null;
  const newName = taken ? (taken.includes(entry.name) ? keepBothName(entry.name, taken, entry.dir) : entry.name) : null;
  const nameBad = newName !== null && nameProblem(newName, destFolder) !== null;
  const target = newName !== null && !nameBad ? joinPath(destFolder, newName) : null;

  // A move: where both ends resolve and which storages are open, read fresh.
  const realPaths = kind === 'move' ? (destFolder === '/' ? [src] : [src, destFolder]) : [];
  const plan = usePlanReads(c, realPaths, kind === 'move');
  const realSrc = plan.real?.get(src);
  const realDest = destFolder === '/' ? '/' : plan.real?.get(destFolder);
  const mountsKnown = !!plan.mounts && plan.mounts.complete;
  const mountsList = plan.mounts ? plan.mounts.items : [];
  const holds = kind === 'move' && entry.dir && realSrc !== undefined && plan.mounts ? storageIn(src, realSrc, mountsList) : undefined;
  const fromPlace = realSrc !== undefined && plan.mounts ? placeOf(realSrc, mountsList) : null;
  const toPlace = realDest !== undefined && plan.mounts ? placeOf(realDest, mountsList) : null;
  const placesDiffer = !!fromPlace && !!toPlace && fromPlace.key !== toPlace.key;
  const mustType = kind === 'move' && ((realSrc !== undefined && renameTyped(realSrc)) || (realDest !== undefined && destFolder !== '/' && renameTyped(realDest)));
  const [typed, setTyped] = useState('');

  const [sent, setSent] = useState<{ kind: TransferKind; dest: string; name: string; op: string } | null>(null);
  const [result, setResult] = useState<Result>(null);
  const once = useRef(false);
  const heldRow = sent ? held.find((h) => h.identity.kind === sent.kind && h.identity.path === src && h.identity.dest === sent.dest) : undefined;
  const heldHere = !!heldRow;
  const overlap = !sent && held.length > 0;
  // A folder copy: its tree, read fresh until the press (tree.ts walkTree), towards the destination shown.
  const folderCopy = kind === 'copy' && entry.dir;
  const walk = useTreeWalk(c, src, target ?? '', folderCopy && !!target && !sent);

  const placeName = (pl: { key: string; label: string }) => (pl.key === '' ? c.name : pl.label || t('move.aShare'));
  let refusal: string | null = null;
  let offerCopy = false;
  if (!sent) {
    if (overlap) refusal = tf('changes.overlap');
    else if (taken && newName === null) refusal = t('takenNoName', { name: displayName(entry.name), folder: displayName(destFolder) });
    else if (nameBad) refusal = t('badName', { folder: displayName(destFolder) });
    else if (kind === 'move') {
      if (plan.failed) refusal = t('move.checkFailed');
      else if (holds) refusal = t('move.holdsMount', { name: holds.label || t('move.aStorage') });
      else if (entry.dir && plan.mounts !== undefined && !mountsKnown) refusal = t('move.mountsUnknown');
      else if (placesDiffer) { refusal = t('move.places', { from: placeName(fromPlace!), to: placeName(toPlace!) }); offerCopy = true; }
    } else if (folderCopy) refusal = walkRefusal(t, walk, displayName(entry.name));
    // Changes off in this session: said as the refusal when nothing else refuses (the press is off either way).
    if (!refusal && !canChange) refusal = tf('changes.off');
  }
  // The files program's own refusal of a move across disks: the same offer, from its code.
  if (result?.kind === 'failed' && result.code === 'FILE_MOVE_CROSSES_DEVICES') offerCopy = true;
  const moveReady = kind !== 'move' || (realSrc !== undefined && realDest !== undefined && plan.mounts !== undefined && (!mustType || typed === entry.name));
  const walkReady = !folderCopy || walk.state === 'done';
  const busy = change.state === 'running';
  const ready = !sent && canChange && !!target && !refusal && moveReady && walkReady && transferDestOk(src, target ?? undefined);

  const send = async () => {
    // Single use: a second press or a re-render never sends this again; the destination shown is the one sent.
    if (once.current || !ready || !target || newName === null) return;
    once.current = true;
    const frozen = { kind, dest: target, name: newName, op: newKey() };
    setSent(frozen);
    const r = await change.run({ c, path: src, dest: target, op: frozen.op, dir: entry.dir, size: entry.size, modified: entry.modified });
    // A done copy that left items out: a folder copy's pipes, sockets or devices, or a file that had become a folder.
    const skipped = r.outcome === 'done' && frozen.kind === 'copy' ? skippedOf(r.data) : undefined;
    setResult({ kind: r.outcome, ...(r.code ? { code: r.code } : {}), ...(skipped ? { skipped } : {}) });
  };
  // Done: the listing shows the result (core re-reads it), so the dialog closes; one that left items out stays.
  const done = result?.kind === 'done' && !result.skipped;
  useEffect(() => { if (done) onClose(); }, [done, onClose]);
  // A pending send settled by a read (core's own read-back, or the held band's Check again): proved made, it closes;
  // proved NOT made, it stays and says what the read found (verdictWords). The verdict is the frozen send's.
  const settled = result?.kind === 'pending' && !heldHere;
  const sentId = sent ? { kind: sent.kind, computer: c.id, path: src, dest: sent.dest, op: sent.op } : null;
  const verdict = settled && sentId ? verdictOf(sentId) : undefined;
  const madeHere = verdict?.verdict === 'applied';
  const partial = usePartial(sentId);
  // Proved NOT made here, or settled where this tab cannot see what was proved: it stays and says so.
  const notMade = settled && !madeHere;
  useEffect(() => { if (madeHere) onClose(); }, [madeHere, onClose]);
  // Copy instead (a move across places): a fresh, unsent copy dialog over the same item and folder.
  const toCopy = () => { setKind('copy'); setResult(null); setSent(null); once.current = false; };

  const shownName = sent?.name ?? newName ?? entry.name;
  const shownDest = sent?.dest ?? target ?? joinPath(destFolder, entry.name);
  // Stays open with only Close: proved not made, settled elsewhere, or copied with items left out.
  const stays = notMade || !!result?.skipped;
  const outcome = result?.skipped ? undefined : notMade && sentId && verdict ? { kind: 'failed' as const, message: verdictWords(t, sentId, verdict) }
    : notMade ? undefined
    : result ? shownOutcome(result.kind, result.code, tf) : undefined;
  const failedWords = result?.kind === 'failed' && result.code === 'DESTINATION_EXISTS' ? t('exists', { name: displayName(shownName), folder: displayName(destFolder) })
    : result?.kind === 'failed' && result.code === 'FILE_MOVE_CROSSES_DEVICES' ? t('move.crosses') : null;
  const finished = (!!result && result.kind !== 'pending') || notMade;

  const renamed = !sent && !!taken && newName !== null && newName !== entry.name && !nameBad;
  const walkShown = !sent && folderCopy && !refusal && !!target && walk.state === 'done' ? walk : null;
  const opaque = !!walkShown && walkShown.opaque.length > 0;
  // What is known now, one sentence: before the press, the check of a move's two ends or the folder copy's walk; after it,
  // a held folder copy found part made, or a send settled in another tab or window.
  const known = sent
    ? result?.kind === 'pending' && !settled && partial !== undefined ? partWords(t, sent.dest, partial)
      : notMade && !verdict ? t('verdict.elsewhere', { folder: displayName(parentOf(sent.dest)) }) : null
    : refusal ? null
      : kind === 'move' && realSrc === undefined && !plan.failed ? t('move.checking')
        : folderCopy && target && walk.state === 'reading' ? t('walk.reading', { name: displayName(entry.name) })
          : walkShown ? planWords(t, walkShown, entry.name) : null;

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t(kind === 'copy' ? 'copy.title' : 'move.title', { name: displayName(entry.name) })}
      size="lg"
      {...(renamed && newName !== null ? { body: t(kind === 'copy' ? 'copy.taken' : 'move.taken', { name: displayName(entry.name), folder: displayName(destFolder), newName: displayName(newName) }) } : {})}
      {...(stays ? { cancelLabel: t('close') } : { primaryLabel: t(kind === 'copy' ? 'copy.primary' : 'move.primary'), onPrimary: () => void send(), primaryDisabled: !ready || busy })}
      busy={busy}
      // The page's own words replace the code's (the kit would map a code before a message).
      outcome={outcome ? (failedWords ? { kind: outcome.kind, message: failedWords } : outcome) : undefined}
      // Check again only reads; what it proved decides (the settled effect closes a proved change, a not-made one stays).
      onCheck={() => readBackShown(change.readBack, heldRow ? [heldRow.hold] : [])}
      {...(finished && !stays ? { cancelLabel: t('close') } : {})}
    >
      <Facts layout="spec" columns={1} label={t('ends')} items={[
        { label: t('from'), value: t('where', { computer: c.name, path: displayName(src) }), mono: true },
        { label: t('to'), value: t('where', { computer: c.name, path: displayName(shownDest) }), mono: true },
      ]} />
      {known ? (
        // With links it cannot compare, a lost answer cannot be checked: the plan says so on its next line (walk.opaque).
        <Verdict label={t((sent?.kind ?? kind) === 'copy' ? 'plate.copy' : 'plate.move')} next={opaque ? t('walk.opaque') : undefined}>
          {known}
        </Verdict>
      ) : null}
      {/* Why links stay links is detail behind the plan; what the copy leaves out stays in view (it can decide the press). */}
      {walkShown && walkShown.links.length + walkShown.opaque.length ? <Disclosure title={t('walk.linksMore')}>{t('walk.links')}</Disclosure> : null}
      {walkShown && walkShown.left.length ? <WalkLeft left={walkShown.left} /> : null}
      {refusal ? <Band tone="warn" size="table" /* noDetails: a refusal the page decided (no rejection to show); the dialog's fields fix it */>{refusal}</Band> : null}
      {result?.skipped && sent ? <SkippedList skipped={result.skipped} name={sent.name} folder={parentOf(sent.dest)} wasFolder={entry.dir} /> : null}
      {offerCopy ? <TextButton onPress={toCopy}>{t('copyInstead')}</TextButton> : null}
      {mustType && !sent ? (
        <TextField label={t('move.typeName', { name: entry.name })} description={t('move.protected')} value={typed} onChange={setTyped} mono autoComplete="off" />
      ) : null}
    </Dialog>
  );
}

/** What a walked folder copy will do, in words: how many items go, and whether a lost answer can be checked. */
function planWords(t: ReturnType<typeof useStrings<typeof strings>>, walk: Walk & { state: 'done' }, name: string): string {
  const count = walk.dirs.length - 1 + walk.files.length + walk.links.length + walk.opaque.length;
  const words = { name: displayName(name), count: String(count) };
  return t(count === 0 ? 'walk.planEmpty' : walk.opaque.length ? 'walk.planUnchecked' : count === 1 ? 'walk.planOne' : 'walk.plan', words);
}

/** How many of `all` rows a list leaves unshown past SKIP_LIST_MAX (`total`: the program's count when it named fewer
 *  than it left out). */
const moreOf = (all: readonly ItemProps[], total = 0) => Math.max(total, all.length) - Math.min(all.length, SKIP_LIST_MAX);

/** A copy that left items out: a folder copy's pipes, sockets or devices, or a file that had become a folder. */
function SkippedList({ skipped, name, folder, wasFolder }: { skipped: Skipped; name: string; folder: string; wasFolder: boolean }) {
  const t = useStrings(strings);
  const words = { name: displayName(name), folder: displayName(folder), count: String(skipped.count) };
  const rows = skipped.list.map((x) => ({ id: x.path, title: t(reasonKey(x.reason), { path: displayName(x.path) }) }));
  const more = moreOf(rows, skipped.count);
  return (
    <SubSection title={t('left.title')} state={{ kind: 'ready' }}
      description={wasFolder ? t(skipped.count === 1 ? 'skipped.folderOne' : 'skipped.folderTitle', words) : t(skipped.count === 1 ? 'skipped.one' : 'skipped.title', words)}>
      <ItemList label={t('left.title')} items={rows.slice(0, SKIP_LIST_MAX)} />
      {more > 0 ? t('skipped.more', { count: String(more) }) : null}
    </SubSection>
  );
}

/** What a folder copy leaves out (pipes, sockets, devices), from its walk, before the press. */
function WalkLeft({ left }: { left: readonly string[] }) {
  const t = useStrings(strings);
  const rows = left.map((rel) => ({ id: rel, title: displayName(rel), mono: true }));
  const more = moreOf(rows);
  return (
    <SubSection title={t('left.title')} state={{ kind: 'ready' }} description={t('walk.left')}>
      <ItemList label={t('left.title')} items={rows.slice(0, SKIP_LIST_MAX)} />
      {more > 0 ? t('skipped.more', { count: String(more) }) : null}
    </SubSection>
  );
}

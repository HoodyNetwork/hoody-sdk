// The change surfaces other than delete: the name dialog (New folder, Rename) and the band of changes on a
// computer that may have gone through. Every send goes through data.ts useFilesChange
// (core's C9 lock): a lost answer is "This may have gone through" with Check again, which only reads.
import { shownOutcome } from './changes.pure';
export { shownOutcome } from './changes.pure';
import { Band, ConfirmDialog, Dialog, Outcome, TextButton, TextField, useStrings, type OutcomeLike } from '@kit';
import { useShownRealm } from '@core';
import { useEffect, useRef, useState } from 'react';
import { readBackShown, useCanChange, useCopyCheck, useExtractResults, useFileHash, useFilesChange, useFolder, useHeldOn, usePartial, usePlanReads, verdictOf, type ChangeIdentity, type FilesComputer } from './data';
import { useDeleteCheck } from './DeletePlanner';
import { ExtractResults, HeldExtract } from './Extract';
import { partWords, useTransferCheck, verdictWords } from './Transfer';
import { displayName, joinPath, parentOf, partsOf, type Entry } from './logic';
import { nameProblem, renameTyped, storageIn } from './plan';
import { HeldUploads } from './Upload';
import s from './files.module.css';
import strings from './strings.en.json';
import transferStrings from './Transfer.strings.en.json';

type Result = { outcome: OutcomeLike['kind']; code?: string } | null;
const shown = (r: Result, t: (k: 'changes.off' | 'changes.overlap') => string): OutcomeLike | undefined => (r ? shownOutcome(r.outcome, r.code, t) : undefined);

/** New folder (no entry) or Rename (an entry) in `parent`. `taken`: the names the folder shows now. */
export function NameDialog({ c, parent, entry, taken, onClose }: { c: FilesComputer; parent: string; entry?: Entry; taken: readonly string[]; onClose: () => void }) {
  const t = useStrings(strings);
  const kind = entry ? 'rename' : 'mkdir';
  const change = useFilesChange(kind);
  const [name, setName] = useState(entry?.name ?? '');
  const [result, setResult] = useState<Result>(null);
  const [typed, setTyped] = useState('');
  const path = entry ? joinPath(parent, entry.name) : '';
  // A protected path is renamed only after its name is typed, judged where it resolves. A folder holding an
  // open storage (at either spelling) is refused like a delete, and no folder is renamed while the storages are not
  // known for sure.
  const plan = usePlanReads(c, entry ? [path] : [], !!entry);
  const real = entry ? plan.real?.get(path) : undefined;
  const mustType = !!real && renameTyped(real);
  const dirMounts = entry?.dir ? plan.mounts : null;
  const storage = entry?.dir && real !== undefined && dirMounts ? storageIn(path, real, dirMounts.items) : undefined;
  const mountsUnknown = !!entry?.dir && (plan.mounts === null || (plan.mounts !== undefined && !plan.mounts.complete));
  const mountsReady = !entry?.dir || (plan.mounts !== undefined && !mountsUnknown);
  // Where it resolves could not be read (a failed read, or a path the Hub cannot address): Rename stays off, said so
  // with Check again, which only reads again. The storages unread is the same: said, and read again on Check again.
  const checkFailed = !!entry && plan.failed;
  const refusal = checkFailed ? t('rename.checkFailed') : storage ? t('rename.holdsMount', { name: storage.label || t('delete.aStorage') }) : mountsUnknown ? t('rename.mountsUnknown') : null;
  const others = entry ? taken.filter((n) => n !== entry.name) : taken;
  const problem = name === '' && !result ? null : nameProblem(name, parent, others);
  const unchanged = !!entry && name === entry.name;
  const busy = change.state === 'running';
  // A change of this path that may have gone through, sent here or before this dialog opened: its outcome stands and
  // nothing is sent until it settles. The fields freeze with it, so an edit never clears that outcome.
  const held = useHeldOn(c.id);
  const sentPath = entry ? path : joinPath(parent, name);
  const heldRow = held.find((h) => h.identity.kind === kind && h.identity.path === sentPath);
  const heldHere = !!heldRow;
  const locked = busy || result?.outcome === 'pending' || (!!entry && heldHere);
  // Read live: a token's capabilities can drop while the dialog is open (the send checks again).
  const canChange = useCanChange();
  // A held change of the path typed is kept off by its pending outcome below: the kit's Dialog takes no primary press
  // while its outcome is pending (changes.namecap.test.tsx).
  const ready = canChange && !locked && !problem && name !== '' && !unchanged && !refusal
    && (!entry || (real !== undefined && mountsReady && (!mustType || typed === entry.name)));

  const send = async () => {
    if (!ready) return;
    const vars = entry
      ? { c, path, to: name, dir: entry.dir, size: entry.size, modified: entry.modified }
      : { c, path: joinPath(parent, name) };
    const r = await change.run(vars);
    setResult({ outcome: r.outcome, ...(r.code ? { code: r.code } : {}) });
  };
  useEffect(() => { if (result?.outcome === 'done') onClose(); }, [result, onClose]);
  // This dialog's own Check again, while it reads: what it answers decides (below). State, not a ref: when the read
  // ends without a proof of its own and the hold went meanwhile (another tab's proof, a Dismiss), the effect runs
  // again and the dialog closes as settled elsewhere.
  const [checking, setChecking] = useState(false);
  // Settled, here or elsewhere: the dialog draws once with no outcome, then closes. Closing unmounts it, and the kit's
  // leave watch moves the last outcome it saw to a "may have gone through" toast: never one already settled.
  const [over, setOver] = useState(false);
  useEffect(() => { if (over) onClose(); }, [over, onClose]);
  // A pending send settled elsewhere (the held band's Check again): the dialog has nothing left to say.
  useEffect(() => { if (result?.outcome === 'pending' && !heldHere && !checking) setOver(true); }, [result, heldHere, checking]);
  // Settled by the read-back: proved made, it closes (the listing shows it); proved NOT made by this read (core's
  // stored release of the shown hold, never the hold merely gone), it stays, says it did not go through and can be
  // sent again.
  const check = async () => {
    const proof = { notApplied: false };
    setChecking(true);
    let ok = false;
    try { ok = await readBackShown(change.readBack, heldRow ? [heldRow.hold] : [], proof); } finally { setChecking(false); }
    if (ok) setOver(true);
    else if (proof.notApplied) setResult({ outcome: 'failed' });
    return ok;
  };
  const outcome = over ? undefined : (shown(result, t) ?? (heldHere ? { kind: 'pending' as const } : undefined));

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t(entry ? 'rename.title' : 'mkdir.title', { name: entry ? displayName(entry.name) : '' })}
      body={t(entry ? 'rename.body' : 'mkdir.body', { folder: parent === '/' ? c.name : displayName(partsOf(parent).at(-1) ?? '') })}
      size={mustType ? 'lg' : 'sm'}
      primaryLabel={t(entry ? 'action.rename' : 'action.create')}
      onPrimary={() => void send()}
      primaryDisabled={!ready || busy || over}
      busy={busy}
      outcome={outcome}
      // Settled by the read-back (either way): the listing now shows what is there, so the dialog's job is over.
      onCheck={check}
    >
      <TextField
        label={t('name.label')}
        value={name}
        onChange={(v) => { setName(v); setResult(null); }}
        isDisabled={locked}
        errorMessage={problem ? t(`name.${problem}`) : undefined}
        reserveError
        mono
      />
      {refusal ? <p className={s.note}>{refusal}</p> : null}
      {checkFailed || mountsUnknown ? <TextButton onPress={plan.retry}>{t('action.checkAgain')}</TextButton> : null}
      {!canChange && !result ? <p className={s.note}>{t('changes.off')}</p> : null}
      {mustType && entry && (
        <>
          <p className={s.note}>{t('rename.protected')}</p>
          <TextField label={t('typeName', { name: entry.name })} value={typed} onChange={setTyped} isDisabled={locked} mono />
        </>
      )}
    </Dialog>
  );
}

const leaf = (path: string) => displayName(partsOf(path).at(-1) ?? '');

/** The changes on this computer that may have gone through: each with Check again, which only reads. No Dismiss:
 *  the kit offers none on "may have gone through" (C9), and a fresh listing of the folder settles each one. A copy or
 *  a move reads what proves it itself, whichever folders the panes show: both folders, and for a file
 *  copy the SHA-256 of both files once both are listed. A copy or move a read proves was NOT made leaves a note
 *  saying what the read found. */
/** The held changes on one computer: its notes and what it showed are that computer's (a new computer starts empty). */
/** `onRest`: opens Copy the rest for a held folder copy found part made, in a dialog the page owns
 *  (it outlives this band's row: the press lets the held copy go). */
export function HeldBand({ c, onRest }: { c: FilesComputer; onRest?: (id: ChangeIdentity) => void }) {
  // The computer's upload batch (running, held unknown files, files not sent) shows beside its changes.
  return (
    <>
      <HeldOn key={c.id} c={c} {...(onRest ? { onRest } : {})} />
      <HeldUploads key={`up:${c.id}`} c={c} />
    </>
  );
}

function HeldOn({ c, onRest }: { c: FilesComputer; onRest?: (id: ChangeIdentity) => void }) {
  const t = useStrings(strings);
  const tt = useStrings(transferStrings);
  const held = useHeldOn(c.id);
  const mkdir = useFilesChange('mkdir');
  const rename = useFilesChange('rename');
  const del = useDeleteCheck();
  const copy = useTransferCheck('copy');
  const move = useTransferCheck('move');
  const extract = useFilesChange('extract');
  const hooks = { mkdir, rename, delete: del, copy, move, extract };
  // What each extract's answer said on this computer, until closed (kept outside this band, data.ts).
  const realm = useShownRealm();
  const results = useExtractResults(realm, c.id, true);
  // Copies and moves this band showed that a read in this tab then proved were NOT made (Check again here or in the
  // dialog, one or several at once, whatever else stays held): what it found, until dismissed (session only).
  const [notes, setNotes] = useState<readonly { id: ChangeIdentity; words: string }[]>([]);
  const shown = useRef(new Map<string, ChangeIdentity>());
  useEffect(() => {
    const now = new Map(held.flatMap((h) => ((h.identity.kind === 'copy' || h.identity.kind === 'move') && h.identity.op ? [[h.identity.op, h.identity] as const] : [])));
    const left = [...shown.current].filter(([op]) => !now.has(op));
    shown.current = now;
    const add = left.flatMap(([, id]) => { const v = verdictOf(id); return v?.verdict === 'not_applied' ? [{ id, words: verdictWords(tt, id, v) }] : []; });
    if (add.length) setNotes((all) => [...all.filter((x) => !add.some((a) => a.id.op === x.id.op)), ...add]);
  }, [held, tt]);
  if (!held.length && !notes.length && !results.length) return null;
  return (
    <>
      {notes.map((n) => (
        <Band key={`note:${n.id.op ?? `${n.id.kind}:${n.id.path}>${n.id.dest}`}`} tone="warn" size="table" onDismiss={() => setNotes((all) => all.filter((x) => x !== n))} /* noDetails: a read settled it; there is no rejection, only what the read found */>
          {n.words}
        </Band>
      ))}
      <ExtractResults c={c} realm={realm} />
      {held.map((h) => {
        const id = h.identity;
        const hook = hooks[id.kind];
        if (id.kind === 'extract') return <HeldExtract key={h.hold ?? `extract:${id.path}>${id.dest}`} id={id} onCheck={async () => { await readBackShown(hook.readBack, [h.hold]); }} onStop={() => { void extract.dismissOne(h.identity); }} />;
        if (id.kind === 'copy' || id.kind === 'move') {
          const stopHold = (hold: string) => () => {
            const transition = { own: false };
            void copy.dismissOne(h.identity, { hold, transition }).then((freed) => {
              if (freed && transition.own) setNotes((all) => [...all.filter((x) => x.id.op !== id.op), { id, words: tt('held.unchecked', { name: leaf(id.path), dest: displayName(id.dest ?? '') }) }]);
            });
          };
          return (
            <HeldTransfer
              key={h.hold ?? `${id.kind}:${id.path}`}
              c={c}
              id={id}
              onCheck={async () => { await readBackShown(hook.readBack, [h.hold]); }}
              // Stop tracking frees only this shown send (core dismissOne bound to its hold token;
              // a hold shown without one is never offered it), and notes it was not checked only when this press freed
              // it (another tab may have settled it meanwhile)
              {...(h.hold ? { onStop: stopHold(h.hold) } : {})}
              {...(onRest ? { onRest } : {})}
            />
          );
        }
        return (
          <Outcome
            key={h.hold ?? `${id.kind}:${id.path}`}
            outcome={{ kind: 'pending' }}
            /* noDetails: a held change carries no rejection, only an unknown outcome, so there is no error to pass */
            variant="line"
            wrap
            detail={t(id.kind === 'delete' ? (id.dir ? 'held.deleteFolder' : 'held.delete') : `held.${id.kind}`, { name: leaf(id.path), to: displayName(id.to ?? '') })}
            onCheck={async () => { await readBackShown(hook.readBack, [h.hold]); }}
          />
        );
      })}
    </>
  );
}

/** One held copy or move: its line, and the reads that prove it, held open while it shows (both folders; for a file
 *  copy each file's SHA-256 once its folder lists it; for a folder copy both trees and the SHA-256 they need, once
 *  both ends list as folders). Check again re-reads them fresh (core's read-back). A folder copy's compare reads in
 *  steps (each folder found asks for the next), so once every read it needs has answered, the band checks again by
 *  itself, once for each new set of reads: it only reads. */
function HeldTransfer({ c, id, onCheck, onStop, onRest }: { c: FilesComputer; id: ChangeIdentity; onCheck: () => Promise<void>; onStop?: () => void; onRest?: (id: ChangeIdentity) => void }) {
  const tt = useStrings(transferStrings);
  const dest = id.dest ?? '';
  const from = useFolder(c, parentOf(id.path), true);
  const to = useFolder(c, parentOf(dest), true);
  const listedAs = (l: typeof from, path: string, dir: boolean) => !!l.data && !l.isError && l.data.entries.some((e) => e.name === (partsOf(path).at(-1) ?? '') && e.dir === dir);
  const fileCopy = id.kind === 'copy' && id.dir !== true;
  useFileHash(c, id.path, fileCopy && listedAs(from, id.path, false));
  useFileHash(c, dest, fileCopy && listedAs(to, dest, false));
  const folderCopy = id.kind === 'copy' && id.dir === true;
  const { compare } = useCopyCheck(c, id.path, dest, folderCopy && listedAs(from, id.path, true) && listedAs(to, dest, true));
  // The compare reads in steps; when it reaches a result the band checks again by itself, once for a result that
  // proves the copy made and once for the first part-made one (later counts wait for Check again: the copy may still
  // be running, and each check re-reads every SHA-256).
  const asked = useRef(new Set<string>());
  const settled = compare?.state === 'equal' || compare?.state === 'differs' ? compare.state : '';
  const partial = usePartial(id);
  useEffect(() => {
    if (!settled || asked.current.has(settled)) return;
    asked.current.add(settled);
    void onCheck();
  }, [settled, onCheck]);
  // Copy the rest: offered once the compare found items missing (only different ones: nothing to copy).
  const rest = !!onRest && compare?.state === 'differs' && compare.missing.length > 0;
  // A copy whose source a whole listing no longer shows, or shows as the other kind, can
  // never be checked (no tree or SHA-256 of a source that is not there) and would hold every change on this computer.
  // Only then may the person stop tracking it, asked first; until then nothing changes. The listing must answer a
  // read this line saw start (it shows only while the copy is held, so after the send): an answer that arrives later
  // to a read started earlier is not a proof.
  const before = useAnswerBeforeSeenRead(from.isFetching, from.dataUpdatedAt);
  const gone = id.kind === 'copy' && before !== null && !from.isFetching && from.dataUpdatedAt > before ? sourceGone(from, id.path, id.dir === true) : null;
  const [asking, setAsking] = useState(false);
  const folder = displayName(parentOf(id.path));
  return (
    <>
      <Outcome
        outcome={{ kind: 'pending' }}
        /* noDetails: a held change carries no rejection, only an unknown outcome, so there is no error to pass */
        variant="line"
        wrap
        detail={[tt(id.kind === 'move' ? 'held.move' : 'held.copy', { name: leaf(id.path), dest: displayName(dest) }), ...(partial !== undefined ? [partWords(tt, dest, partial)] : []), ...(gone ? [tt(gone === 'absent' ? 'held.sourceGone' : 'held.sourceChanged', { name: leaf(id.path), folder })] : [])].join(' ')}
        onCheck={onCheck}
      />
      {rest && onRest ? <TextButton onPress={() => onRest(id)}>{tt('rest.action')}</TextButton> : null}
      {gone && onStop ? (
        <>
          <TextButton onPress={() => setAsking(true)}>{tt('held.stop')}</TextButton>
          <ConfirmDialog
            overlayId="files-copy-stop"
            isOpen={asking}
            onOpenChange={setAsking}
            title={tt('held.stopTitle')}
            body={tt('held.stopBody', { dest: displayName(dest) })}
            confirmLabel={tt('held.stop')}
            onConfirm={() => { setAsking(false); onStop(); }}
          />
        </>
      ) : null}
    </>
  );
}

/** Whether a listing proves a held copy's source gone ('absent') or now the other kind ('changed'): it answered
 *  without error (the newest read: an older answer kept after a failed read is not enough) and is whole (an item it
 *  does not show is not there). Anything less proves nothing (null). Freshness is the caller's (useAnswerBeforeSeenRead). */
function sourceGone(l: { readonly data?: { readonly entries: readonly Entry[]; readonly whole?: boolean } | undefined; readonly isError: boolean }, path: string, dir: boolean): 'absent' | 'changed' | null {
  if (!l.data || l.isError || l.data.whole !== true) return null;
  const e = l.data.entries.find((x) => x.name === (partsOf(path).at(-1) ?? ''));
  if (!e) return 'absent';
  return e.dir !== dir ? 'changed' : null;
}

/** The listing's answer time (`dataUpdatedAt`) as it stood when this component last saw a read start (fetching turning
 *  on after it was seen off), or null. A proof needs the answer time to have MOVED since: a new answer to that read (or
 *  a later one). A read that ends with no new answer (cancelled, failed) leaves it unmoved, whatever the clock says;
 *  nothing writes a folder listing into the cache but its read (no setQueryData). A read already running when this
 *  mounted may have started before, so only its successors count. */
function useAnswerBeforeSeenRead(fetching: boolean, updatedAt: number): number | null {
  const [before, setBefore] = useState<number | null>(null);
  const was = useRef<boolean | null>(null);
  useEffect(() => {
    if (was.current === false && fetching) setBefore(updatedAt);
    was.current = fetching;
  }, [fetching, updatedAt]);
  return before;
}

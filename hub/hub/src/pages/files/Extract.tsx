// Extract an archive into a new folder beside it: the dialog, a held extract's
// line in the held band, and the results kept until the person closes them. Every send goes through data.ts
// useFilesChange('extract'), core's C9 lock. The files program merges into a folder that is there and replaces its
// files, so:
//   - the folder is always a new one: the send reads the archive's folder fresh and sends nothing when the name is
//     there now (DEST_TAKEN) or the folder can't be read (DEST_UNREAD); the dialog then offers the next free name;
//   - an answer whose replaced[] is not empty (a folder made between that read and the run) says plainly that files
//     there were replaced, never a plain "Extracted"; a failure says what its answer says it left in the folder;
//   - only the send's own answer settles it (data.ts sendExtract). A lost answer, or one that does not read whole or
//     names another folder or part of the archive, stays held: "may or may not have run. Look in the folder.", with
//     Check again (reads the folder) and Stop tracking. No read of the computer's extractions settles it: they name
//     no client attempt;
//   - what an answer said is kept by realm and computer until closed (data.ts keepExtractResult): leaving Browse or
//     switching computer mid-send loses nothing; the band shows what no dialog shows.
import { Band, ConfirmDialog, Dialog, Outcome, TextButton, TextField, useStrings, type OutcomeLike } from '@kit';
import { newKey, onBump, useShownRealm } from '@core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { extractFolderName, type ExtractDone } from './archive';
import { shownOutcome } from './changes';
import { dropExtractResult, extractChangedOf, extractDoneOf, freshListing, keepExtractResult, showingInDialog, useCanChange, useExtractAllowed, useExtractResults, useFilesChange, useFolder, type ChangeIdentity, type ExtractWords, type FilesComputer } from './data';
import { displayName, joinPath, parentOf, partsOf } from './logic';
import { nameProblem } from './plan';
import s from './files.module.css';
import filesStrings from './strings.en.json';
import strings from './Archive.strings.en.json';

const leaf = (path: string) => displayName(partsOf(path).at(-1) ?? '');

type T = ReturnType<typeof useStrings<typeof strings>>;
type TF = ReturnType<typeof useStrings<typeof filesStrings>>;
/** A send's result: words (kept until closed), an outcome (pending: the held band says it; or a failure that changed
 *  nothing), or a refusal before anything went (the dialog says it). */
type Sent = { words: ExtractWords } | { outcome: OutcomeLike } | { refused: 'DEST_TAKEN' | 'DEST_UNREAD' };

/** What a done answer says, in the page's words: the counts, entries left out, and files replaced in a folder that
 *  was there (the warning, never plain "Extracted"). */
export function doneWords(t: T, d: ExtractDone, dest: string): ExtractWords {
  const where = leaf(dest);
  const words = [
    d.replaced > 0 ? t('extract.replaced', { count: d.replaced, dest: where }) : t('extract.done', { count: d.files, dest: where }),
    ...(d.skipped > 0 ? [t('extract.skipped', { count: d.skipped })] : []),
  ].join(' ');
  return { tone: d.replaced > 0 ? 'warn' : 'ok', words };
}

/** One extract sent; what came back, in the page's words. A failure whose answer says it changed files in the folder
 *  says what; one whose lists do not read says files there may have changed. */
async function sendOne(change: ReturnType<typeof useFilesChange>, c: FilesComputer, archive: string, to: string, op: string, t: T, tf: TF): Promise<Sent> {
  const r = await change.run({ c, path: archive, to, op });
  const dest = joinPath(parentOf(archive), to);
  if (r.outcome === 'done') {
    const d = extractDoneOf(r.data);
    return d ? { words: doneWords(t, d, dest) } : { outcome: { kind: 'pending' } };
  }
  if (r.outcome === 'not_sent' && (r.code === 'DEST_TAKEN' || r.code === 'DEST_UNREAD')) return { refused: r.code };
  if (r.outcome === 'failed') {
    const changed = extractChangedOf(r.details);
    const name = leaf(archive), where = leaf(dest);
    if (changed === 'unknown') return { words: { tone: 'warn', words: `${t('extract.failed', { name })} ${t('extract.mayHaveChanged', { dest: where })}` } };
    if (changed && changed !== 'none' && changed.created + changed.replaced > 0) {
      return {
        words: {
          tone: 'warn',
          words: [
            t('extract.failed', { name }),
            ...(changed.created > 0 ? [t('extract.leftAdded', { count: changed.created, dest: where })] : []),
            ...(changed.replaced > 0 ? [t('extract.leftReplaced', { count: changed.replaced, dest: where })] : []),
          ].join(' '),
        },
      };
    }
  }
  return { outcome: shownOutcome(r.outcome, r.code, tf) ?? { kind: r.outcome === 'pending' ? 'pending' : 'failed' } };
}

/** Extract `path` (an archive) into a new folder beside it. `taken`: the names the folder shows now. */
export function ExtractDialog({ c, path, taken, onClose }: { c: FilesComputer; path: string; taken: readonly string[]; onClose: () => void }) {
  const t = useStrings(strings);
  const tf = useStrings(filesStrings);
  const realm = useShownRealm();
  const folder = parentOf(path);
  const change = useFilesChange('extract');
  const listing = useFolder(c, folder, true);
  const names = useMemo(() => (listing.data && !listing.isError ? listing.data.entries.map((e) => e.name) : taken), [listing.data, listing.isError, taken]);
  const [name, setName] = useState(() => extractFolderName(partsOf(path).at(-1) ?? '', taken, folder) ?? '');
  // This press's id: its result is kept under it (data.ts keepExtractResult) and shown here while the dialog is open.
  const [op, setOp] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OutcomeLike | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const kept = useExtractResults(realm, c.id, false).find((r) => r.op === op);
  useEffect(() => {
    if (!op) return undefined;
    showingInDialog(op, true);
    return () => showingInDialog(op, false);
  }, [op]);
  const canChange = useCanChange();
  // The program's history read answers 403 where extract is off on that computer: then nothing can be sent.
  const allowed = useExtractAllowed(c, true);
  const problem = name === '' ? 'empty' : nameProblem(name, folder, names);
  const busy = sending || change.state === 'running';
  const shown = !!kept || !!outcome;
  const locked = busy || shown;
  const ready = canChange && allowed === true && !locked && !problem;

  const send = async () => {
    if (!ready) return;
    setNote(null);
    setSending(true);
    const id = newKey();
    setOp(id);
    // Kept whether or not this dialog still shows when the answer comes.
    const computer = c.id;
    try {
      const r = await sendOne(change, c, path, name, id, t, tf);
      if ('words' in r) { keepExtractResult(realm, computer, id, r.words); return; }
      if ('outcome' in r) { setOutcome(r.outcome); return; }
      // The name is there now, or the folder could not be read: nothing was sent. Read it again and offer a free name.
      setOp(null);
      if (r.refused === 'DEST_TAKEN') {
        const now = await freshListing(c, folder);
        const next = now === 'failed' ? null : extractFolderName(partsOf(path).at(-1) ?? '', now.entries.map((e) => e.name), folder);
        setName(next ?? '');
        setNote(next ? t('extract.taken') : t('extract.noName'));
      } else setNote(t('extract.unread'));
    } finally { setSending(false); }
  };
  // The person closes the dialog: its result goes with it. A pending one stays in the held band. A context end (a
  // switch, a realm fallback, sign-out) closes it too (kit useCloseOnContextEnd): that keeps the result, and the band
  // shows it once the dialog is gone. Bump listeners run in one pass, the kit's first, so the drop waits a microtask
  // and is skipped when that pass marked an end.
  const ended = useRef(false);
  useEffect(() => onBump((reason) => { if (reason !== 'late') ended.current = true; }), []);
  const close = () => {
    if (op && kept) {
      const shut = op;
      queueMicrotask(() => { if (!ended.current) dropExtractResult(realm, c.id, shut); });
    }
    onClose();
  };

  return (
    <Dialog
      overlayId="files-extract"
      isOpen
      onOpenChange={(open) => { if (!open) close(); }}
      title={t('extract.title', { name: leaf(path) })}
      body={t('extract.line')}
      size="sm"
      {...(shown ? { cancelLabel: t('extract.close') } : { primaryLabel: t('extract.primary'), onPrimary: () => void send(), primaryDisabled: !ready || busy })}
      busy={busy}
      {...(outcome ? { outcome } : {})}
    >
      {kept ? (
        <Band tone={kept.words.tone === 'warn' ? 'warn' : 'neutral'} size="table" /* noDetails: an answer's own words; no rejection to show */>{kept.words.words}</Band>
      ) : (
        <TextField
          label={t('extract.field')}
          value={name}
          onChange={(v) => { setName(v); setNote(null); }}
          isDisabled={locked}
          errorMessage={name !== '' && problem ? tf(`name.${problem}`) : undefined}
          reserveError
          mono
        />
      )}
      {note ? <p className={s.note}>{note}</p> : null}
      {!canChange && !shown ? <p className={s.note}>{t('extract.changesOff')}</p> : null}
      {canChange && !shown && allowed !== true ? <p className={s.note}>{allowed === false ? t('extract.off') : t('extract.checking')}</p> : null}
    </Dialog>
  );
}

/** One held extract in the held band: "may or may not have run", Check again (re-reads the folders shown, so the
 *  person can look; it settles nothing) and Stop tracking, warned first (core dismissOne: frees this one hold). */
export function HeldExtract({ id, onCheck, onStop }: { id: ChangeIdentity; onCheck: () => Promise<void>; onStop: () => void }) {
  const t = useStrings(strings);
  const [asked, setAsked] = useState(false);
  const dest = leaf(id.dest ?? '');
  return (
    <>
      <Outcome
        outcome={{ kind: 'pending' }}
        /* noDetails: a held change carries no rejection, only an unknown outcome, so there is no error to pass */
        variant="line"
        wrap
        detail={t('held.extract', { name: leaf(id.path), dest })}
        onCheck={onCheck}
      />
      <TextButton onPress={() => setAsked(true)}>{t('held.stop')}</TextButton>
      <ConfirmDialog
        overlayId="files-extract-stop"
        isOpen={asked}
        onOpenChange={setAsked}
        title={t('held.stopTitle')}
        body={t('held.stopBody', { dest })}
        confirmLabel={t('held.stop')}
        onConfirm={() => { setAsked(false); onStop(); }}
      />
    </>
  );
}

/** The results kept on this computer that no dialog shows, each until the person closes it. */
export function ExtractResults({ c, realm }: { c: FilesComputer; realm: string }) {
  const kept = useExtractResults(realm, c.id, true);
  return (
    <>
      {kept.map((r) => (
        <Band key={`xres:${r.op}`} tone={r.words.tone === 'warn' ? 'warn' : 'neutral'} size="table" onDismiss={() => dropExtractResult(realm, c.id, r.op)} /* noDetails: an answer's own words; no rejection to show */>
          {r.words.words}
        </Band>
      ))}
    </>
  );
}

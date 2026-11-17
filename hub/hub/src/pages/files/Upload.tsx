// Upload of new names. The toolbar button and a drop on the folder's table (view.tsx,
// the kit's DataTable drop) pick files; the dialog shows the plan (sizes, taken names: Keep both or Skip, names
// that can't be sent, the limits) and then the batch as it goes; the band (HeldUploads) shows, on every tab, a batch
// that runs, uploads that may have gone through (Check again, which only reads; the warned Stop tracking) and the
// files a batch did not send.
import { Band, Button, Dialog, formatBytes, IconButton, Outcome, RadioGroup, Spinner, TextButton, useStrings } from '@kit';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useCanChange, useFolder, useUploadsOn, type FilesComputer, type HeldUpload } from './data';
import { displayName, partsOf } from './logic';
import { MAX_UNKNOWN, planOf, sendName, type Choice, type PlanRow } from './upload';
import { forgetNote, useBatch, useBatches, useCheckNotes, useUpload, type Batch, type Item } from './uploadRun';
import s from './Upload.module.css';
import strings from './Upload.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const folderName = (c: { name: string }, folder: string) => (folder === '/' ? c.name : displayName(folder));

/** The toolbar's Upload: a button that opens the browser's file picker (several files). */
export function UploadButton({ compact, isDisabled, disabledReason, onFiles }: { compact: boolean; isDisabled: boolean; disabledReason?: string; onFiles: (files: readonly File[]) => void }) {
  const reason = disabledReason ? { disabledReason } : {};
  const t = useStrings(strings);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      {compact
        ? <IconButton variant="secondary" icon="upload" label={t('action.upload')} isDisabled={isDisabled} {...reason} onPress={() => input.current?.click()} />
        : <Button icon="upload" isDisabled={isDisabled} {...reason} onPress={() => input.current?.click()}>{t('action.upload')}</Button>}
      <input
        ref={input}
        className={s.fileInput}
        type="file"
        multiple
        tabIndex={-1}
        aria-label={t('pick.label')}
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) onFiles(fs); }}
      />
    </>
  );
}

/** A long pick lists at most this many rows (the ones that need a look first); the rest are counted. */
const ROWS_SHOWN = 200;
function firstOf<X>(xs: readonly X[], look: (x: X) => boolean): readonly X[] {
  if (xs.length <= ROWS_SHOWN) return xs;
  return [...xs.filter(look), ...xs.filter((x) => !look(x))].slice(0, ROWS_SHOWN);
}

const ROW_KEY = { queued: 'row.queued', hashing: 'row.hashing', sending: 'row.sending', done: 'row.done', taken: 'row.taken', refused: 'row.refused', unknown: 'row.unknown', notSent: 'row.notSent' } as const;
const itemWords = (t: T, x: Item) => (x.state === 'notSent' && x.code === 'NOT_THERE' ? t('row.notThere') : t(ROW_KEY[x.state]));
const badWords = (t: T, r: PlanRow) => (r.bad === 'tooBig' ? t('bad.tooBig') : r.bad === 'noKeepName' ? t('bad.noKeepName') : r.bad === 'deep' ? t('bad.deep') : t('bad.name'));
const OVERLAP = new Set(['HELD_OVERLAP', 'HELD', 'READ_BACK_FIRST', 'HELD_BY_OTHER', 'BUSY']);

/** What a batch did, in words (the dialog's end and the band's paused line). */
export function resultWords(t: T, b: Batch): string {
  if (b.phase === 'notSent') return OVERLAP.has(b.code ?? '') ? t('result.overlap', { computer: b.computerName }) : b.code === 'CHANGES_OFF' ? t('result.off') : t('result.notSentAll');
  const n = (st: Item['state']) => b.items.filter((x) => x.state === st).length;
  const failed = n('taken') + n('refused');
  return [
    ...(n('done') ? [t('result.done', { count: n('done') })] : []),
    ...(n('unknown') ? [t('result.unknown', { count: n('unknown') })] : []),
    ...(failed ? [t('result.failed', { count: failed })] : []),
    ...(n('notSent') ? [t('result.notSent', { count: n('notSent') })] : []),
  ].join(' ');
}

function progressOf(b: Batch) {
  const fin = b.items.filter((x) => x.state !== 'queued' && x.state !== 'hashing' && x.state !== 'sending');
  return { done: fin.length, count: b.items.length, bytes: fin.reduce((a, x) => a + x.size, 0), total: b.items.reduce((a, x) => a + x.size, 0) };
}

/** The Upload dialog: the plan, then the batch it started. `taken`: the names the folder lists now. */
export function UploadDialog({ c, folder, files, onClose }: { c: FilesComputer; folder: string; files: readonly File[]; onClose: () => void }) {
  const t = useStrings(strings);
  const up = useUpload();
  const canChange = useCanChange();
  // The names the folder holds now (the folder shown, or the folder a drop on its row named): the plan waits for them.
  const listing = useFolder(c, folder, true);
  const entries = listing.isError ? undefined : listing.data?.entries;
  const taken = useMemo(() => (entries ?? []).map((e) => e.name), [entries]);
  const [choice, setChoice] = useState<Choice>('keep');
  const plan = useMemo(() => planOf(folder, taken, files.map((f) => ({ name: f.name, size: f.size })), choice), [folder, taken, files, choice]);
  const [batchId, setBatchId] = useState<string | undefined>();
  const [starting, setStarting] = useState(false);
  const batch = useBatch(batchId);
  const where = folderName(c, folder);
  const picks = plan.rows.flatMap((r) => { const as = sendName(r, choice); return as ? [{ as, file: files[r.i]! }] : []; });
  const anyTaken = plan.rows.some((r) => r.taken && !r.bad);
  const bad = plan.rows.filter((r) => r.bad).length;

  // The batch is in this tab's store from the press on (before its hold is admitted); start() answers only when it
  // ends, so the dialog follows the newest batch of this folder until then.
  const start = async () => {
    setStarting(true);
    const b = await up.start(c, folder, picks);
    setBatchId(b.id);
    setStarting(false);
  };
  const live = useBatches(c.id).filter((b) => b.folder === folder).at(-1);
  const shown = batch ?? (starting ? live : undefined);

  if (shown) {
    const running = shown.phase === 'running';
    const p = progressOf(shown);
    return (
      <Dialog
        isOpen
        onOpenChange={(open) => { if (!open) onClose(); }}
        title={t('title', { folder: where })}
        size="lg"
        cancelLabel={t('close')}
        {...(running ? { primaryLabel: t('cancel'), primaryVariant: 'secondary' as const, primaryChip: false, onPrimary: () => up.cancel(shown.id) } : {})}
      >
        <div className={s.body}>
          {running
            ? <div className={s.progress}><Spinner /><span>{t('progress', { done: String(p.done), count: p.count, bytes: formatBytes(p.bytes), total: formatBytes(p.total) })}</span></div>
            : <p>{resultWords(t, shown)}</p>}
          {running ? <p className={s.note}>{t('background')}</p> : null}
          <ul className={s.rows} aria-label={t('list.label')}>
            {firstOf(shown.items, (x) => x.state !== 'done' && x.state !== 'queued').map((x) => (
              <li key={x.i} className={s.row}>
                <span className={s.name}>{displayName(x.as)}</span>
                <span className={s.size}>{formatBytes(x.size)}</span>
                <span className={s.state}>{itemWords(t, x)}</span>
              </li>
            ))}
          </ul>
          {shown.items.length > ROWS_SHOWN ? <p className={s.note}>{t('rows.more', { count: shown.items.length - ROWS_SHOWN })}</p> : null}
        </div>
      </Dialog>
    );
  }

  const problem = listing.isError ? t('problem.unlisted') : plan.problem ? t(`problem.${plan.problem}`) : null;
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t('title', { folder: where })}
      size="lg"
      primaryLabel={t('primary', { count: picks.length })}
      onPrimary={() => void start()}
      primaryDisabled={!!problem || !entries || !picks.length || !canChange || starting}
      busy={starting}
    >
      <div className={s.body}>
        <p>{t('summary', { count: files.length, bytes: formatBytes(plan.bytes) })}{bad ? ` ${t('bad.count', { count: bad })}` : ''}</p>
        {problem ? <Band tone="warn" size="table" /* noDetails: a limit of the plan, nothing was sent */>{problem}</Band> : null}
        {anyTaken ? (
          <RadioGroup
            label={t('taken.title', { folder: where })}
            options={[{ value: 'keep' as const, label: t('choice.keep') }, { value: 'skip' as const, label: t('choice.skip') }]}
            value={choice}
            onChange={(v) => setChoice(v as Choice)}
          />
        ) : null}
        <ul className={s.rows} aria-label={t('list.label')}>
          {firstOf(plan.rows, (r) => !!r.bad || r.taken).map((r) => {
            const as = sendName(r, choice);
            const note: ReactNode = r.bad ? badWords(t, r) : r.taken ? (as ? t('row.as', { name: displayName(as) }) : t('row.skip')) : null;
            return (
              <li key={r.i} className={s.row}>
                <span className={s.name}>{displayName(r.name)}</span>
                <span className={s.size}>{formatBytes(r.size)}</span>
                {note ? <span className={s.state}>{note}</span> : null}
              </li>
            );
          })}
        </ul>
        {plan.rows.length > ROWS_SHOWN ? <p className={s.note}>{t('rows.more', { count: plan.rows.length - ROWS_SHOWN })}</p> : null}
      </div>
    </Dialog>
  );
}

// ── the band ─────────────────────────────────────────────────────────────────────────────────────────────
/** Every upload line of one computer: this tab's batches, the held batch, and what a Check again found. */
export function HeldUploads({ c }: { c: FilesComputer }) {
  const t = useStrings(strings);
  const held = useUploadsOn(c.id);
  const mine = useBatches(c.id);
  const notes = useCheckNotes(c.id);
  const up = useUpload();
  // Continue is offered only while changes are on (uploadGate refuses CHANGES_OFF at send time too).
  const canChange = useCanChange();
  const lines: ReactNode[] = [];
  for (const b of mine) {
    if (b.phase === 'running') {
      const p = progressOf(b);
      lines.push(<Band key={`run:${b.id}`} tone="neutral" size="table" actions={<TextButton onPress={() => up.cancel(b.id)}>{t('cancel')}</TextButton>}>{t('held.running', { folder: folderName(c, b.folder), done: String(p.done), count: p.count })}</Band>);
    }
  }
  for (const h of held) lines.push(<HeldUploadLine key={`held:${h.hold.id}`} c={c} held={h} />);
  for (const b of mine) {
    // Files this tab did not send, with nothing held for them (the hold went): Continue sends them.
    const left = b.items.filter((x) => x.state === 'notSent' && x.code !== 'NOT_PICKED').length;
    if (b.phase === 'running' || !left || held.some((h) => h.meta?.batch === b.id)) continue;
    lines.push(<Band key={`left:${b.id}`} tone="warn" size="table" /* noDetails: files this tab never sent; there is no rejection */ actions={canChange ? <TextButton onPress={() => void up.resume(c, b.id)}>{t('continue')}</TextButton> : undefined}>{t('held.paused', { count: left, folder: folderName(c, b.folder) })}</Band>);
  }
  for (const n of notes) {
    const name = displayName(partsOf(n.path).at(-1) ?? n.path);
    const folder = displayName('/' + partsOf(n.path).slice(0, -1).join('/'));
    lines.push(<Band key={n.key} tone={n.found === 'uploaded' ? 'neutral' : 'warn'} size="table" onDismiss={() => forgetNote(n.key)} /* noDetails: a read settled it; there is no rejection */>{t(`note.${n.found}`, { name, folder })}</Band>);
  }
  return lines.length ? <>{lines}</> : null;
}

function HeldUploadLine({ c, held }: { c: FilesComputer; held: HeldUpload }) {
  const t = useStrings(strings);
  const up = useUpload();
  const mine = useBatches(c.id);
  const canChange = useCanChange();
  const [stopping, setStopping] = useState(false);
  const [failed, setFailed] = useState(false);
  const m = held.meta;
  if (m && held.hold.inFlight === 'here') return null; // this tab's running batch has its own line
  if (m && held.hold.inFlight === 'elsewhere') return <Band tone="neutral" size="table">{t('held.elsewhere', { folder: folderName(c, m.folder) })}</Band>;
  const stop = stopping ? <StopUploads c={c} held={held} onClose={() => setStopping(false)} /> : null;
  if (!m) {
    return (
      <>
        <Band tone="warn" size="table" actions={<TextButton onPress={() => setStopping(true)}>{t('stop')}</TextButton>} /* noDetails: an unreadable hold; there is no rejection */>{t('held.unreadable', { computer: c.name })}</Band>
        {stop}
      </>
    );
  }
  const where = folderName(c, m.folder);
  const own = mine.find((b) => b.id === m.batch);
  const leftHere = own ? own.items.filter((x) => x.state === 'notSent' && x.code !== 'NOT_PICKED').length : 0;
  const names = m.files.map((f) => displayName(partsOf(f.path).at(-1) ?? f.path)).join(', ');
  const unknownWords = `${t('held.unknown', { count: m.files.length, folder: where, names })} ${t('held.blocks', { computer: c.name })}`;
  const stopWords = leftHere ? (m.files.length >= MAX_UNKNOWN ? t('held.tooMany') : t('held.paused', { count: leftHere, folder: where })) : m.left ? t('held.left', { count: m.left }) : null;
  return (
    <>
      {m.files.length ? (
        <Outcome
          outcome={{ kind: 'pending' }}
          /* noDetails: an unknown outcome carries no rejection, only the files that may have gone through */
          variant="line"
          wrap
          detail={failed ? `${t('checkFailed')} ${unknownWords}` : unknownWords}
          onCheck={async () => { const ok = await up.check(c, held); setFailed(!ok); }}
        />
      ) : null}
      <Band
        tone="warn"
        size="table"
        /* noDetails: the batch's own words say what is where; there is no rejection object to show */
        actions={(
          <>
            {canChange && leftHere && m.files.length < MAX_UNKNOWN ? <TextButton onPress={() => void up.resume(c, m.batch)}>{t('continue')}</TextButton> : null}
            {m.files.length
              ? <TextButton onPress={() => setStopping(true)}>{t('stop')}</TextButton>
              /* Only files never sent: nothing may have gone through, so no warning is needed to stop remembering them. */
              : <TextButton onPress={() => void up.stopTracking(held)}>{t('dismiss')}</TextButton>}
          </>
        )}
      >
        {stopWords ?? t('held.tracking', { folder: where })}
      </Band>
      {stop}
    </>
  );
}

/** The warned Stop tracking: frees the batch's hold (only the version shown, never while a send is out). */
function StopUploads({ c, held, onClose }: { c: FilesComputer; held: HeldUpload; onClose: () => void }) {
  const t = useStrings(strings);
  const up = useUpload();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const folder = held.meta ? folderName(c, held.meta.folder) : '/';
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={t('stopTitle')}
      body={t('stopBody', { computer: c.name, folder })}
      size="sm"
      primaryLabel={t('stop')}
      onPrimary={() => { setBusy(true); void up.stopTracking(held).then((ok) => { setBusy(false); if (ok) onClose(); else setFailed(true); }); }}
      busy={busy}
      outcome={failed ? { kind: 'failed', message: t('stopFailed') } : undefined}
    />
  );
}

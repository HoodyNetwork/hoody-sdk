// Import: a pasted KEY=VALUE list or a .env file into ONE partition, one savePut per row (data.ts runImport).
// Phases: input (paste or pick) → preview (names only) → running → done (counts, then a read-back by write id). They
// show as three steps on one track (Source, Preview, Result); the open step holds the phase's body. Back exists only on
// the preview, before anything is sent, and drops what was read. Each step shows one plate (what Send will do; what the
// run did, with the one line that says why it ended early or waits) and at most one Band (a failed read, with Details).
//
// Containment: no value in text, attributes, toasts, URLs, storage or logs. Only the person's own secret fields hold it
// (the paste box and the password fields, kit SecretInputs), hidden unless they press Show; the paste box is emptied the
// moment it is read, the password fields at Send, and both are hidden and emptied on close, partition change and done. A picked file is read as text and the File is dropped right after (the kit's FileButton empties its
// input before handing the file over). The parsed values and the one password live in a holder kept in a ref
// (importEnv.ts holdImport), never in React state, a query, the URL, storage, a toast or a log; every row shows the same
// fixed mask. The holder is dropped at the end of the run, at Stop, on every epoch move (a realm switch, a close, a
// bump) and when the dialog closes or leaves. Errors keep only their category.
//
// Honesty: a row that exists is skipped unless the person chose Overwrite on screen; a name added since the preview is
// skipped (savePut refuses New over it). A 429 waits its Retry-After with the countdown shown and sends the same row
// again; if the run ends during that wait the row reads "Refused (busy), not saved" (a PUT of it went out), never "Not
// sent". A pending row (it may have gone through) stops the run there, its hold shown with Check again and Dismiss; a
// row no PUT of which went out reads "Not sent". A row is "saved" only when the read-back list shows this import's
// write id ("Confirmed saved"); before that it is "sent". The result shows in the dialog only (rows and the summary, no
// toast); a dialog closed before it shows reports through the page band. Both use these words.
import { Band, Button, Checkbox, Dialog, Facts, FileButton, ItemList, OutcomeBanner, Row, SecretInput, Stack, SubSection, TextButton, Track, TrackStep, Verdict, useStrings, type ActionSpec, type Fact, type ItemProps, type Tone } from '@kit';
import { capture, type HubError } from '@core';
import { useEffect, useRef, useState } from 'react';
import { canEncrypt } from '../crypto';
import { checkHold, currentEpoch, importReadBack, keepLeftImportReport, moveEpoch, onEpochMove, readListFresh, runImport, useVaultHolds, type CheckResult, type ImportEnd, type ImportStep } from '../data';
import {
  IMPORT_MAX_BYTES,
  dropImport,
  expectedMinutes,
  holdImport,
  parseImport,
  type ImportHeld,
  type ImportParse,
  type ImportRow,
} from '../importEnv';
import type { Partition } from '../logic';
import strings from '../strings.en.json';
import { changeText, useCountdown, type T } from './words';

export interface ImportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  partition: Partition;
  partitionName: string;
  /** A run cut short by a close (the kit closes the dialog when the realm switches, too): its counts, for the page to show.
   *  When the page itself is gone (left mid-run), the report is kept for its next mount instead (keepLeftImportReport). */
  onReport?: (text: string) => void;
}

type Phase = 'input' | 'preview' | 'running' | 'done';
type InputProblem = Exclude<ImportParse, { ok: true }> | { ok: false; why: 'file' };
// 'unread' keeps the read's HubError for the band's Details (status, code, request id: never a value).
type Exists = { state: 'loading' } | { state: 'unread'; error: HubError } | { state: 'ok'; names: ReadonlySet<string> };
type ReadBack = { state: 'reading' } | { state: 'unread'; error: HubError } | { state: 'ok'; confirmed: ReadonlySet<string> };
/** Why the run ended before its last row: the person's Stop, an epoch move, or a row whose end stops the rest. */
type Ended = 'stop' | 'moved' | null;

/** The row's send mode, or null when it is not sent (not imported, or skipped by the person's choice). */
function modeOf(r: ImportRow, exists: Exists, overwrite: ReadonlySet<string>): 'new' | 'replace' | null {
  if (r.status !== 'ok' || exists.state !== 'ok') return null;
  if (!exists.names.has(r.key)) return 'new';
  return overwrite.has(r.key) ? 'replace' : null;
}

function parseStatus(t: T, r: ImportRow): { tone: Tone; label: string; tip?: string } {
  switch (r.status) {
    case 'no_equals':
      return { tone: 'danger', label: t('import.st.no_equals') };
    case 'invalid':
      return { tone: 'danger', label: t('import.st.invalid'), ...(r.problem ? { tip: t(`name.${r.problem}`) } : {}) };
    case 'trailing':
      return { tone: 'danger', label: t('import.st.trailing') };
    case 'continued':
      // The pill stays short (it never wraps); the remedy is its tip, as an invalid name's reason is.
      return { tone: 'danger', label: t('import.st.continued', { line: r.next ?? 0 }), tip: t('import.st.continuedTip', { line: r.next ?? 0 }) };
    case 'continuation':
      return { tone: 'danger', label: t('import.st.continuation') };
    case 'empty':
      return { tone: 'danger', label: t('import.st.empty') };
    case 'replaced':
      return { tone: 'neutral', label: t('import.st.replaced', { line: r.replacedBy ?? 0 }) };
    case 'ok':
      return { tone: 'neutral', label: '' };
  }
}

/**
 * The run's counts and the names that may have gone through. `planned`: the rows chosen to send. `sent` counts the rows the
 * vault answered with a write; "saved" is said only of `confirmed`, the read-back's proof (null: no read-back).
 */
function tally(rows: readonly ImportRow[], ends: Readonly<Record<number, ImportEnd>>, planned: ReadonlySet<number>, confirmed: ReadonlySet<string> | null) {
  const c = { sent: 0, skipped: 0, refused: 0, notSent: 0, failed: 0, busy: 0 };
  let saved: number | null = confirmed ? 0 : null;
  const pendingNames: string[] = [];
  rows.forEach((r, i) => {
    if (r.status !== 'ok') return void c.refused++;
    const e = ends[i];
    if (!e) return void (planned.has(i) ? c.notSent++ : c.skipped++);
    if (e.outcome === 'done') {
      c.sent++;
      if (saved !== null && confirmed!.has(r.key)) saved++;
    } else if (e.outcome === 'pending') pendingNames.push(r.key);
    else if (e.outcome === 'failed') c.failed++;
    else if (e.outcome === 'refused_busy') c.busy++;
    else if (e.outcome === 'not_sent' && e.why === 'exists') c.skipped++;
    else c.notSent++;
  });
  return { ...c, saved, pendingNames };
}

/** The counts in words, one part each (names only for the rows that may have gone through). */
function summaryOf(t: T, c: ReturnType<typeof tally>): string[] {
  return [
    c.sent ? t('import.sum.sent', { count: c.sent }) : '',
    c.sent && c.saved !== null ? t('import.sum.saved', { count: c.saved }) : '',
    c.skipped ? t('import.sum.skipped', { count: c.skipped }) : '',
    c.refused ? t('import.sum.refused', { count: c.refused }) : '',
    c.pendingNames.length ? t('import.sum.pending', { count: c.pendingNames.length, names: c.pendingNames.join(', ') }) : '',
    c.failed ? t('import.sum.failed', { count: c.failed }) : '',
    c.busy ? t('import.sum.busy', { count: c.busy }) : '',
    c.notSent ? t('import.sum.notSent', { count: c.notSent }) : '',
  ].filter(Boolean);
}

/** The same counts as label/value facts for the finished import's plate, in the same order (zero counts left out). */
function factsOf(t: T, c: ReturnType<typeof tally>): Fact[] {
  const n = c.pendingNames.length;
  const all: Array<Fact | null> = [
    c.sent ? { label: t('import.fact.sent'), value: c.sent } : null,
    c.sent && c.saved !== null ? { label: t('import.fact.saved'), value: c.saved } : null,
    c.skipped ? { label: t('import.fact.skipped'), value: c.skipped } : null,
    c.refused ? { label: t('import.fact.refused'), value: c.refused } : null,
    n ? { label: t('import.fact.pending'), value: t('import.fact.pendingValue', { count: n, names: c.pendingNames.join(', ') }) } : null,
    c.failed ? { label: t('import.fact.failed'), value: c.failed } : null,
    c.busy ? { label: t('import.fact.busy'), value: c.busy } : null,
    c.notSent ? { label: t('import.fact.notSent'), value: c.notSent } : null,
  ];
  return all.filter((f): f is Fact => f !== null);
}

function endStatus(t: T, end: ImportEnd, key: string, back: ReadBack | null): { tone: Tone; label: string; tip?: string } {
  switch (end.outcome) {
    case 'done':
      if (!back || back.state === 'reading') return { tone: 'neutral', label: t('import.st.reading') };
      if (back.state === 'unread') return { tone: 'warn', label: t('import.st.unreadBack') };
      return back.confirmed.has(key) ? { tone: 'ok', label: t('import.st.confirmed') } : { tone: 'warn', label: t('import.st.notShown'), tip: t('import.notShownNote') };
    case 'pending':
      return { tone: 'warn', label: t('import.st.pending'), tip: t('hold.bodyPut') };
    case 'held':
      return { tone: 'warn', label: t('import.st.held'), tip: t('held.body') };
    case 'failed':
      return { tone: 'danger', label: t('import.st.failed'), tip: changeText(t, end) ?? undefined };
    case 'not_sent':
      if (end.why === 'exists') return { tone: 'neutral', label: t('import.st.meanwhile') };
      // "Change metadata" is a box of the entry's own editor: from here the way is to open the entry.
      if (end.why === 'unwritable') return { tone: 'neutral', label: t('import.st.notSent'), tip: t('import.unwritable') };
      return { tone: 'neutral', label: t('import.st.notSent'), tip: changeText(t, end) ?? undefined };
    case 'refused_busy':
      return { tone: 'warn', label: t('import.st.busy') };
    case 'stale':
    case 'stopped':
      return { tone: 'neutral', label: t('import.st.notSent') };
  }
}

export function ImportDialog({ isOpen, onOpenChange, partition, partitionName, onReport }: ImportDialogProps) {
  const t = useStrings(strings);
  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<InputProblem | null>(null);
  const [rows, setRows] = useState<readonly ImportRow[]>([]);
  const [interpolation, setInterpolation] = useState(false);
  const [exists, setExists] = useState<Exists>({ state: 'loading' });
  const [overwrite, setOverwrite] = useState<ReadonlySet<string>>(new Set());
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [pwRefused, setPwRefused] = useState<'required' | 'mismatch' | 'crypto' | null>(null);
  // The run: the partition it writes to (kept when the realm changes under it), each row's end by row index, the row
  // being sent, a 429's end time, why it ended early, and the read-back.
  const [runFor, setRunFor] = useState<{ partition: Partition; name: string } | null>(null);
  const [ends, setEnds] = useState<Readonly<Record<number, ImportEnd>>>({});
  const [sendingRow, setSendingRow] = useState<number | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const [ended, setEnded] = useState<Ended>(null);
  const [back, setBack] = useState<ReadBack | null>(null);
  // Check again on this import's own pending row: what it found when it proved nothing.
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<CheckResult | null>(null);
  const left = useCountdown(until);
  const holds = useVaultHolds();
  // The values and the password: here only, never in state.
  const held = useRef<ImportHeld | null>(null);
  // The run in progress (its token), and whether it was told to stop.
  const run = useRef<object | null>(null);
  const stop = useRef(false);
  // Each read (the existing names, a picked file) is answered only while it is the newest.
  const readGen = useRef(0);

  const drop = () => {
    dropImport(held.current);
    held.current = null;
  };
  const reset = () => {
    if (run.current) moveEpoch();
    run.current = null;
    stop.current = true;
    readGen.current++;
    drop();
    setPhase('input');
    setText('');
    setProblem(null);
    setRows([]);
    setInterpolation(false);
    setExists({ state: 'loading' });
    setOverwrite(new Set());
    setEncrypt(false);
    setPassword('');
    setRepeat('');
    setPwRefused(null);
    setRunFor(null);
    setEnds({});
    setSendingRow(null);
    setUntil(null);
    setEnded(null);
    setBack(null);
    setCheckNote(null);
  };
  // Closing (Cancel, Escape, the close x, the page) stops a run and drops everything typed, read or parsed.
  useEffect(() => {
    if (!isOpen) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only an open/close change
  }, [isOpen]);
  // Leaving the page: the same; a run's report then goes to the page's next mount (keepLeftImportReport).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (run.current) moveEpoch();
      run.current = null;
      stop.current = true;
      dropImport(held.current);
      held.current = null;
    };
  }, []);
  // A partition change that is not a context end (a realm switch is one: the kit Dialog closes itself then, and the run
  // reports to the page through onReport): a run stops before its next row and keeps showing what it did, under the
  // partition it wrote to; anything not yet sent belongs to the old partition and is dropped.
  const shownPartition = useRef(partition);
  useEffect(() => {
    if (shownPartition.current === partition) return;
    shownPartition.current = partition;
    if (run.current) {
      stop.current = true;
      setEnded('moved');
      drop();
      return;
    }
    if (phase !== 'done') reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a partition change
  }, [partition]);
  // Any epoch move during a run (a bump, a close, Stop) drops the password and the values at once: the row in flight
  // already has its own copy, and no later row is sent.
  useEffect(() => {
    if (phase !== 'running') return;
    return onEpochMove(() => {
      // Stop and a partition change dropped them already, before their own epoch move.
      if (!run.current || stop.current) return;
      stop.current = true;
      setEnded((e) => e ?? 'moved');
      drop();
    });
  }, [phase]);

  const readExisting = async (p: Partition) => {
    const gen = ++readGen.current;
    setExists({ state: 'loading' });
    const got = await readListFresh(p);
    // Stale: the context ended or the view moved during the read, so this dialog is closed (the kit closes it at a
    // context end) or unmounted (a view change leaves the page). The answer is dropped and no band is shown.
    if (gen !== readGen.current || got.kind === 'stale') return;
    setExists(got.kind === 'rows' ? { state: 'ok', names: new Set(got.rows.map((r) => r.key)) } : { state: 'unread', error: got.error });
  };

  // Reads what was pasted or picked: the paste box empties first, whatever the parse says.
  const read = (source: string) => {
    setText('');
    setProblem(null);
    const r = parseImport(source);
    if (!r.ok) {
      setProblem(r);
      return;
    }
    drop();
    held.current = holdImport(r.values);
    setRows(r.rows);
    setInterpolation(r.interpolation);
    setOverwrite(new Set());
    setPhase('preview');
    void readExisting(partition);
  };

  const pick = async (files: File[]) => {
    let file: File | null = files[0] ?? null;
    files.length = 0;
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      setProblem({ ok: false, why: 'size', bytes: file.size });
      file = null;
      return;
    }
    const gen = ++readGen.current;
    let source = '';
    try {
      source = await file.text();
    } catch {
      source = '';
      if (gen === readGen.current) setProblem({ ok: false, why: 'file' });
      return;
    } finally {
      file = null;
    }
    if (gen === readGen.current) read(source);
    source = '';
  };

  const plan = rows.map((r, i) => ({ r, i, mode: modeOf(r, exists, overwrite) })).filter((x): x is { r: ImportRow; i: number; mode: 'new' | 'replace' } => x.mode !== null);
  const conflicts = exists.state === 'ok' ? rows.filter((r) => r.status === 'ok' && exists.names.has(r.key)).map((r) => r.key) : [];

  const send = () => {
    // Every press clears both password fields, whatever happens next; the checks read the snapshot.
    const pw = encrypt ? password : '';
    const again = encrypt ? repeat : '';
    setPassword('');
    setRepeat('');
    if (run.current || phase !== 'preview' || exists.state !== 'ok' || !held.current || plan.length === 0) return;
    const why = !encrypt ? null : !canEncrypt() ? 'crypto' : !pw ? 'required' : pw !== again ? 'mismatch' : null;
    setPwRefused(why);
    if (why) return;
    const h = held.current;
    h.password = pw;
    const token = {};
    run.current = token;
    stop.current = false;
    const ctx = capture();
    const p = partition;
    const steps: ImportStep[] = plan.map((x) => ({ key: x.r.key, mode: x.mode }));
    const rowOf = plan.map((x) => x.i);
    const written: { key: string; writeId: string }[] = [];
    // Each row's end, kept here too: a close drops the dialog's state, and the page is told what happened.
    const local: Record<number, ImportEnd> = {};
    const rowsAtSend = rows;
    const planned = new Set(rowOf);
    setRunFor({ partition: p, name: partitionName });
    setEnds({});
    setEnded(null);
    setBack(null);
    setPhase('running');
    const live = () => run.current === token;
    void (async () => {
      // Whether the loop stopped before its last row (Stop, a close, a moved epoch, a row whose end stops the rest). A
      // full pass with refused or vanished rows did not stop: it is not "stopped before the end".
      let early = true;
      try {
        setSendingRow(rowOf[0] ?? null);
        early = await runImport(p, steps, currentEpoch(), {
          value: (n) => h.values[rowOf[n]!] ?? '',
          password: () => h.password,
          stopped: () => stop.current || !live(),
          onRow: (n, end) => {
            if (end.outcome === 'done' && end.writeId) written.push({ key: steps[n]!.key, writeId: end.writeId });
            local[rowOf[n]!] = end;
            if (!live()) return;
            setEnds((prev) => ({ ...prev, [rowOf[n]!]: end }));
            setSendingRow(rowOf[n + 1] ?? null);
          },
          onWait: (_n, u) => {
            if (live()) setUntil(u);
          },
        });
      } finally {
        dropImport(h);
        if (held.current === h) held.current = null;
      }
      // The page's report of a dialog closed before its result showed: counts and the may-have names only, no read-back
      // (so never "saved"). A run cut short says it stopped; a full pass says no entry is confirmed (its read-back was
      // dropped). The page gone (left mid-run): kept for its next mount.
      const report = (stopped: boolean) => {
        const text = t(stopped ? 'import.report' : 'import.reportUnread', { partition: partitionName, summary: summaryOf(t, tally(rowsAtSend, local, planned, null)).join(' · ') });
        if (mounted.current) onReport?.(text);
        else keepLeftImportReport(text, ctx);
      };
      if (!live()) return void report(early);
      // Cut short is the loop's own answer, read before the read-back: a close or realm switch during the read-back ends
      // the dialog, and the page still has to be told. A Stop pressed once the last row's PUT was out stopped nothing; one
      // pressed while that row still got ready is a stop (runImport).
      const cut = early;
      if (!cut) setEnded(null);
      setSendingRow(null);
      setUntil(null);
      setBack({ state: 'reading' });
      const res = written.length ? await importReadBack(p, written) : ({ kind: 'ok', confirmed: new Set<string>() } as const);
      // Stale as in readExisting: the dialog is closed or gone, so the read-back is dropped and the page is told (a full
      // pass too: its rows are sent, none confirmed).
      if (!live() || res.kind === 'stale') {
        report(cut);
        return;
      }
      run.current = null;
      setBack(res.kind === 'ok' ? { state: 'ok', confirmed: res.confirmed } : { state: 'unread', error: res.error });
      setPhase('done');
      // No toast: the dialog is open and shows the result in place (each row's pill and the summary line; inline first,
      // Toast.calls `quiet`). A dialog closed before this point reports through the page band (above).
    })();
  };

  const pressStop = () => {
    if (!run.current) return;
    stop.current = true;
    setEnded('stop');
    drop();
    moveEpoch();
  };

  // ── what shows ──
  const items: ItemProps[] = rows.map((r, i) => {
    // Every refused row (importEnv keeps names only on rows that can be sent or were replaced) is its line number: its
    // text may be part of a value.
    const title = r.key || t('import.line', { line: r.line });
    const meta: readonly [string] | readonly [string, string] = r.status === 'ok' ? [t('import.line', { line: r.line }), t('import.mask')] : [t('import.line', { line: r.line })];
    let status: { tone: Tone; label: string; tip?: string };
    const end = ends[i];
    const mode = modeOf(r, exists, overwrite);
    if (r.status !== 'ok') status = parseStatus(t, r);
    else if (end) status = endStatus(t, end, r.key, back);
    else if (phase === 'running' || phase === 'done') {
      status = mode === null ? { tone: 'neutral', label: t('import.st.skipped') } : sendingRow === i ? { tone: 'neutral', label: t('import.st.sending') } : { tone: 'neutral', label: t('import.st.waiting') };
    } else if (exists.state !== 'ok') status = { tone: 'neutral', label: t('import.st.checking') };
    else if (!exists.names.has(r.key)) status = { tone: 'ok', label: t('import.st.new') };
    else status = overwrite.has(r.key) ? { tone: 'warn', label: t('import.st.overwrite') } : { tone: 'neutral', label: t('import.st.skip') };
    const choice =
      phase === 'preview' && r.status === 'ok' && exists.state === 'ok' && exists.names.has(r.key)
        ? overwrite.has(r.key)
          ? { id: 'skip', label: t('import.skip'), name: t('import.skipName', { key: r.key }), onPress: () => setOverwrite((o) => new Set([...o].filter((k) => k !== r.key))) }
          : { id: 'overwrite', label: t('import.overwrite'), name: t('import.overwriteName', { key: r.key }), onPress: () => setOverwrite((o) => new Set(o).add(r.key)) }
        : null;
    return {
      id: String(i),
      title,
      mono: r.key !== '',
      meta,
      status,
      ...(choice ? { actions: { inline: [choice] as const } } : {}),
    };
  });

  const counts = tally(rows, ends, new Set(plan.map((x) => x.i)), back?.state === 'ok' ? back.confirmed : null);
  const facts = factsOf(t, counts);
  // The run stops at its first pending row, so at most one hold is this import's.
  const pendingEnd = Object.values(ends).find((e) => e.outcome === 'pending');
  const pendingHold = pendingEnd?.outcome === 'pending' ? holds.find((h) => h.change.hold === pendingEnd.hold) : undefined;
  const doneCount = Object.keys(ends).length;
  const minutes = expectedMinutes(plan.length);
  const problemText = (p: InputProblem): string =>
    p.why === 'size'
      ? t('import.size', { kb: Math.ceil(p.bytes / 1024) })
      : p.why === 'quote'
        ? t('import.quote', { line: p.line })
        : p.why === 'rows'
          ? t('import.rows', { count: p.count })
          : p.why === 'file'
            ? t('import.fileUnread')
            : t('import.nothing');
  const pwErr = encrypt && pwRefused === 'required' && !password ? t('password.required') : undefined;
  const repeatErr = encrypt && pwRefused === 'mismatch' && !password && !repeat ? t('password.mismatch') : undefined;
  const name = runFor?.name ?? partitionName;
  const checkPending = async () => {
    if (!pendingHold) return;
    setChecking(true);
    try {
      setCheckNote(await checkHold(pendingHold));
    } finally {
      setChecking(false);
    }
  };

  // ── the three steps: one is open, its body is the dialog's; each shows at most one Band ──
  const step: 'source' | 'preview' | 'result' = phase === 'input' ? 'source' : phase === 'preview' ? 'preview' : 'result';
  // Back: only from the preview, before anything is sent. It drops what was read (the paste box was emptied by the read).
  const goBack = () => {
    if (phase === 'preview') reset();
  };
  const entries = (actions?: { secondary: readonly [ActionSpec, ActionSpec] }) => (
    <SubSection title={t('import.list')} state={{ kind: 'ready' }} {...(interpolation ? { description: t('import.interp') } : {})} {...(actions ? { actions } : {})}>
      <ItemList label={t('import.list')} items={items} />
    </SubSection>
  );
  const sourceBody = (
    <Stack gap={3}>
      <SecretInput label={t('import.paste')} description={t('import.pasteDesc')} value={text} onChange={setText} resetKey={partition} multiline rows={6} />
      <Row>
        <FileButton label={t('import.file')} icon="upload" accept=".env,text/plain" onFiles={(f) => void pick(f)} />
      </Row>
      {problem && <Band tone="warn" /* noDetails: the refusal's category and a line number or a count only */>{problemText(problem)}</Band>}
    </Stack>
  );
  const previewBody = (
    <Stack gap={3}>
      {/* What Send will do, and what the person may still choose: one plate, no strip per fact. */}
      <Verdict label={t('import.verdict')} {...(conflicts.length > 0 ? { next: t('import.conflicts', { count: conflicts.length }) } : {})}>
        {minutes === 0 ? t('import.timeShort', { count: plan.length }) : t('import.time', { count: plan.length, minutes })}
      </Verdict>
      {exists.state === 'unread' ? (
        <Band tone="warn" error={exists.error} actions={<TextButton onPress={() => void readExisting(partition)}>{t('import.readAgain')}</TextButton>}>
          {t('import.unread')}
        </Band>
      ) : pwRefused === 'crypto' ? (
        <Band tone="warn" /* noDetails: a check of this browser (no secure context), not a rejection; nothing was sent */>{t('crypto.unavailable')}</Band>
      ) : null}
      {entries(
        conflicts.length > 0
          ? {
              secondary: [
                { id: 'skip-all', label: t('import.skipAll'), onPress: () => setOverwrite(new Set()) },
                { id: 'overwrite-all', label: t('import.overwriteAll'), onPress: () => setOverwrite(new Set(conflicts)) },
              ],
            }
          : undefined,
      )}
      <Checkbox
        isSelected={encrypt}
        onChange={(on) => {
          setEncrypt(on);
          setPassword('');
          setRepeat('');
          setPwRefused(null);
        }}
        label={t('import.encrypt')}
        description={t('import.encryptDesc')}
      />
      {encrypt && (
        <>
          <SecretInput label={t('import.password')} value={password} onChange={setPassword} errorMessage={pwErr} resetKey={partition} />
          <SecretInput label={t('import.repeat')} value={repeat} onChange={setRepeat} errorMessage={repeatErr} resetKey={partition} />
        </>
      )}
    </Stack>
  );
  // Under the result's sentence, the one line that says why the run ended early or waits. A row that may have gone
  // through comes first (the run stopped there, whatever else happened); a stop or a moved view before a wait that the
  // run no longer serves.
  const resultNext = pendingEnd
    ? t('import.pendingStop', { names: counts.pendingNames.join(', ') })
    : ended === 'stop'
      ? t('import.stopped')
      : ended === 'moved'
        ? t('import.moved')
        : phase === 'running' && until !== null
          ? t('import.wait', { seconds: left })
          : undefined;
  // Running: how far along. Ended: one sentence, the counts as facts under it. "Nothing was sent" only when no row was
  // sent, none was refused after going out, and none may have gone through.
  const resultLine =
    phase === 'running'
      ? t('import.sending', { done: doneCount, total: plan.length })
      : counts.sent === 0 && counts.failed === 0 && counts.busy === 0 && counts.pendingNames.length === 0
        ? t('import.nothingSent')
        : t('import.ended');
  const resultBody = (
    <Stack gap={3}>
      {/* noDetails: counts, names and a countdown only; a row's end keeps its outcome, never an error object, so no value can reach this text */}
      <Verdict
        label={t(phase === 'running' ? 'import.verdictRunning' : 'import.verdictDone')}
        {...(resultNext ? { next: resultNext } : {})}
        {...(phase !== 'running' && facts.length > 0 ? { facts: <Facts label={t('import.factsLabel')} items={facts} /> } : {})}
      >
        {resultLine}
      </Verdict>
      {pendingHold && (
        <OutcomeBanner
          /* noDetails: a write that may have gone through has no rejection to show; the run keeps outcomes only, never an error object */
          kind="pending"
          title={t('hold.title.put', { key: pendingHold.id.op === 'put' ? pendingHold.id.key : '', partition: name })}
          /* The hold's sentence stays and what Check again found follows it, as the page banner (Holds) says it. No
             Stop tracking here: its warning would open a second dialog over this one; the page banner offers it,
             warned, once the dialog is closed. */
          body={checkNote === 'unproven' ? `${t('hold.bodyPut')} ${t('hold.unproven')}` : checkNote === 'unread' ? `${t('hold.bodyPut')} ${t('hold.unread')}` : t('hold.bodyPut')}
          onCheck={() => void checkPending()}
          checking={checking}
        />
      )}
      {back?.state === 'unread' && <Band tone="warn" error={back.error}>{t('import.readBackFailed')}</Band>}
      {entries()}
    </Stack>
  );

  return (
    <Dialog
      overlayId="vault-import"
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
      title={t('import.title', { partition: name })}
      size="lg"
      cancelLabel={phase === 'running' || phase === 'done' ? t('import.close') : undefined}
      primaryLabel={phase === 'input' ? t('import.read') : phase === 'preview' ? t('import.send', { count: plan.length }) : phase === 'running' ? t('import.stop') : undefined}
      onPrimary={phase === 'input' ? () => read(text) : phase === 'preview' ? send : pressStop}
      primaryDisabled={phase === 'input' ? !text : phase === 'preview' ? exists.state !== 'ok' || plan.length === 0 : ended !== null || back !== null}
      primaryChip={phase !== 'running'}
    >
      {/* Opening a closed row does something only for the source row during the preview (Back); every other press is
          declined, so the open step stays the phase's. */}
      <Track label={t('import.steps')} open={step} onOpen={(id) => (id === 'source' ? goBack() : undefined)}>
        <TrackStep
          id="source"
          state={step === 'source' ? 'now' : 'done'}
          name={t('import.step.source')}
          {...(step === 'source' || step === 'preview' ? { why: t('import.body') } : {})}
          {...(step === 'source' ? {} : { result: t('import.step.sourceResult', { count: rows.length }) })}
        >
          {step === 'source' ? sourceBody : undefined}
        </TrackStep>
        <TrackStep
          id="preview"
          state={step === 'source' ? 'later' : step === 'preview' ? 'now' : 'done'}
          name={t('import.step.preview')}
          {...(step === 'result' ? { result: t('import.step.previewResult', { count: plan.length }) } : {})}
          {...(step === 'preview' ? { why: t('import.step.previewWhy'), foot: { secondary: <Button onPress={goBack}>{t('import.back')}</Button> } } : {})}
        >
          {step === 'preview' ? previewBody : undefined}
        </TrackStep>
        <TrackStep id="result" state={step !== 'result' ? 'later' : phase === 'done' ? 'done' : 'now'} name={t('import.step.result')}>
          {step === 'result' ? resultBody : undefined}
        </TrackStep>
      </Track>
    </Dialog>
  );
}

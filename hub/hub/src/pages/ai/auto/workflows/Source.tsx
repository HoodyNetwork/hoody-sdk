// One workflow's source as an editor under its detail, with Delete, Reset to shipped
// and Hide. The detail gives the workflow (its name, origin and listed realm) and the computer's name.
// useWorkflowSource is the controller; the detail's ActionBar takes useSourceActions (Edit
// source first, the rest in "...") and its Source section renders WorkflowSource: the change notes, the Definition fold
// holding the editor (Edit source opens it and puts the cursor in the editor), and the confirms.
//   - The source is read when the person opens it, and every save is checked against the revision it was read at. If the
//     workflow changed, nothing is written: Compare shows how saving would change it, Keep mine bases the draft on it
//     (press Save again), Load theirs drops the draft.
//   - If the answer to a save is lost it MAY have been saved: no second send, and "Check what is saved" reads it back.
//   - Yours: Delete. Shipped: Hide (they cannot be deleted). Shipped and changed: Reset to shipped and Hide. A project's
//     own: none. Saving a project's workflow or a shipped one makes your own copy, said above Save.
//   - Without the agent's workflow_hidden capability the list does not say which workflows are hidden, so until a hide
//     is answered both Hide and Show again are offered (each sets one value; sending it twice changes nothing). With
//     it, only the one that changes something; a hide's own answer wins over the row it was sent from until a list read
//     brings a new row.
//   - The editor goes away whenever the detail does: another workflow picked (a search change no LeaveGuard sees), Back,
//     or agents paused (the detail then shows its paused state). So the stores of a workflow that still holds something
//     (typed text, a save or delete or reset whose outcome is unknown, one still out) stay in `kept` and come back with
//     it; answers that arrive meanwhile land in them. An entry is keyed by the context it was made under (account,
//     realm generation, the computer's project and container ids, never its shown name) plus the realm and name, and every request it sends carries that captured
//     context, so a late answer's follow-up read goes to the computer the change went to. An entry whose context is no
//     longer alive holds nothing. Entries that hold nothing and are not shown are dropped (on every mount).
//     Each completion (seq) is acted on once, by the entry itself whether or not an editor shows it (a reset reloads an
//     open source, a delete drops the draft with the workflow, and an entry nobody shows that then holds nothing is
//     dropped), so showing a kept workflow again never repeats it and a delete answered after leaving keeps nothing.
//     While typed text or an unknown save is kept, a reload gets the browser's own prompt (the mounted editor's
//     LeaveGuard covers only its own page's path changes).
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { kept, losing, holding, drop, prune, settle, dangerKinds } from './Source.pure';
import type { Kept } from './Source.pure';
export { keptSourceCount, dropKeptSources, dangerKinds, useSourceActions } from './Source.pure';
export type { WorkflowSourceCtl } from './Source.pure';
import type { WorkflowSourceCtl } from './Source.pure';
import { alive, capture, hostEnv } from '@core';
import { Band, Button, CodeEditor, ConfirmDialog, DangerConfirm, Disclosure, ErrorState, LeaveGuard, Skeleton, TextButton, diffRows, useStrings, type CodeEditorHandle, type Translate } from '@kit';
import { refreshWorkflows } from './data';
import { createDangerStore, type DangerKind, type DangerStore, type DangerView } from './danger';
import type { Workflow } from './logic';
import { createSourceStore, type SourceStore, type SourceView } from './source';
import { workflowSourceApi, type WorkflowSourceApi } from './sourceApi';
import strings from './Source.strings.en.json';
import s from './Source.module.css';

type T = Translate<typeof strings>;

const MAX_DIFF_ROWS = 400;

function useStore<V>(st: { view(): V; subscribe(fn: () => void): () => void }): V {
  return useSyncExternalStore(st.subscribe, st.view, st.view);
}

let unloadHooked = false;
// Through the host's lifecycle seam (core host-env), never `window`: the web env adds the same beforeunload listener; a
// terminal host has no tab to close and registers nothing (a `window` read there would trap and exit the Hub).
function hookUnload(): void {
  if (unloadHooked) return;
  unloadHooked = true;
  hostEnv().onLifecycle('beforeunload', (e) => {
    for (const k of kept.values()) if (losing(k)) { e.preventDefault(); return; }
  });
}

export interface WorkflowSourceOptions {
  /** The requests (tests); default: the agent's, in the realm the workflow was listed in. */
  api?: WorkflowSourceApi;
  /** The agent reports workflow_hidden: the list row says whether the workflow is hidden. */
  hiddenCap?: boolean;
  /** When the list was last read (ListRead.readAt, the query's dataUpdatedAt): a hide's answer holds over reads that
   *  completed no later than the answer (Kept.hideAnswer). Without it, until the list brings another row object. */
  readAt?: number;
}

export function useWorkflowSource(w: Workflow, { api: given, hiddenCap = false, readAt }: WorkflowSourceOptions = {}): WorkflowSourceCtl {
  const now = capture();
  // Ids only: the computer's name is for sentences (it can change, and two computers can share one).
  const key = [now.account ?? '', now.gen, now.target?.project.id ?? '', now.target?.container.id ?? '', w.realm ?? '', w.name].join('\n');
  const { stores, wasKept } = useMemo(() => {
    const had = kept.get(key);
    if (had && alive(had.ctx)) return { stores: had, wasKept: holding(had) };
    const ctx = capture();
    const api = given ?? workflowSourceApi(w.name, w.realm, ctx);
    const fresh: Kept = { source: createSourceStore({ api }), danger: createDangerStore({ name: w.name, api }), open: false, ctx, consumed: 0, mounted: 0, unhook: null, hideAnswer: null };
    kept.set(key, fresh);
    return { stores: fresh, wasKept: false };
  }, [key, given, w.name, w.realm]);
  useEffect(() => {
    kept.set(key, stores);
    // Hooked again after a drop (StrictMode's second run, or a held entry shown again after it settled).
    stores.unhook ??= stores.danger.subscribe(() => settle(key, stores));
    stores.mounted++;
    prune();
    hookUnload();
    return () => {
      stores.mounted--;
      if (stores.mounted === 0 && !holding(stores)) drop(key, stores);
    };
  }, [key, stores]);
  const view = useStore(stores.source);
  const dv = useStore(stores.danger);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [asking, setAsking] = useState<'delete' | 'reset' | null>(null);
  const [forgetAsking, setForgetAsking] = useState(false);
  const [closeAsking, setCloseAsking] = useState(false);
  const focusWanted = useRef(false);
  const [focusNonce, bumpFocus] = useReducer((n: number) => n + 1, 0);

  const savedNow = view.save === 'saved';
  useEffect(() => { if (savedNow) refreshWorkflows(); }, [savedNow]);

  // A hide's answer says which it is until the list is read again. With the read time: over every read that completed no
  // later than the answer, timed in the completion notice itself (an identical read keeps the same row object, and the
  // refresh can complete before React renders the answer). Without it: until the list brings another row object.
  const hideSeq = dv.phase === 'done' && (dv.kind === 'hide' || dv.kind === 'show') ? dv.seq : null;
  const [answered, setAnswered] = useState<{ seq: number; row: Workflow } | null>(null);
  useEffect(() => { if (hideSeq !== null) setAnswered((a) => (a?.seq === hideSeq ? a : { seq: hideSeq, row: w })); }, [hideSeq, w]);
  const timed = stores.hideAnswer;
  const answerHolds = readAt !== undefined && timed !== null
    ? timed.at >= readAt
    : (hideSeq !== null && answered?.seq !== hideSeq) || answered?.row === w;
  const hidden = !hiddenCap ? null : dv.hidden !== null && answerHolds ? dv.hidden : w.hidden === true;

  const open = stores.open;
  const saveOut = view.save === 'saving' || view.save === 'unsure';
  const saveBusy = saveOut || view.reading;
  const dangerBusy = dv.phase === 'running' || (dv.phase === 'unsure' && dv.kind !== 'hide' && dv.kind !== 'show');
  const setOpen = (o: boolean) => { stores.open = o; rerender(); };
  const close = () => { setOpen(false); stores.source.reset(); };
  const show = () => { if (!stores.open) { setOpen(true); void stores.source.load(); } };
  return {
    w,
    stores,
    view,
    dv,
    open,
    wasKept,
    kinds: dangerKinds(w.origin),
    saveBusy,
    dangerBusy,
    saveOut,
    hidden,
    edit: () => {
      if (dangerBusy || saveOut) return;
      show();
      focusWanted.current = true;
      bumpFocus();
    },
    toggle: (o) => {
      if (dangerBusy) return;
      if (o) { show(); return; }
      if (!stores.open || view.save === 'saving' || view.save === 'unsure') return;
      if (view.dirty) setCloseAsking(true);
      else close();
    },
    ask: setAsking,
    asking,
    closeAsk: () => setAsking(null),
    closeAsking,
    setCloseAsking,
    forgetAsking,
    setForgetAsking,
    close,
    focusWanted,
    focusNonce,
  };
}

export interface WorkflowSourceProps {
  source: WorkflowSourceCtl;
  computer: string;
}

/** The Source section's body: what a change did (or that its outcome is unknown), the Definition fold with the
 *  editor, and the confirms the actions open. */
export function WorkflowSource({ source: c, computer }: WorkflowSourceProps) {
  const t = useStrings(strings);
  const { w, stores, view, dv } = c;
  return (
    <>
      <DangerNotes t={t} name={w.name} computer={computer} dv={dv} store={stores.danger} onForget={() => c.setForgetAsking(true)} />
      {!dv.gone && (
        <Disclosure title={t('disclosure')} isExpanded={c.open} onExpandedChange={c.toggle}>
          {c.open && c.wasKept && view.dirty && <p className={s.status} role="status" /* reason: a one-line note that the draft came back */>{t('kept')}</p>}
          {c.open && <Editor t={t} w={w} computer={computer} store={stores.source} view={view} locked={c.dangerBusy} focus={c} />}
        </Disclosure>
      )}

      <ConfirmDialog
        isOpen={c.asking === 'reset'}
        onOpenChange={(o) => { if (!o) c.closeAsk(); }}
        title={t('danger.reset.title', { name: w.name })}
        body={t('danger.reset.body')}
        confirmLabel={t('danger.reset.confirm')}
        tone="danger"
        onConfirm={() => { c.closeAsk(); if (!c.saveBusy) void stores.danger.run('reset'); }}
      />
      <DangerConfirm
        isOpen={c.asking === 'delete'}
        onOpenChange={(o) => { if (!o) c.closeAsk(); }}
        title={t('danger.delete.title', { name: w.name })}
        body={t('danger.delete.body', { computer })}
        confirmText={w.name}
        consequences={[t('danger.delete.consequence1'), t('danger.delete.consequence2')]}
        confirmLabel={t('danger.delete.confirm')}
        onConfirm={() => { c.closeAsk(); if (!c.saveBusy) void stores.danger.run('delete'); }}
      />
      <ConfirmDialog
        isOpen={c.closeAsking}
        onOpenChange={c.setCloseAsking}
        title={t('reload.title')}
        body={t('closeAsk.body')}
        confirmLabel={t('reload.confirm')}
        tone="danger"
        onConfirm={() => { c.setCloseAsking(false); c.close(); }}
      />
      <ConfirmDialog
        isOpen={c.forgetAsking}
        onOpenChange={c.setForgetAsking}
        title={t('forget.title')}
        body={t('forget.body')}
        confirmLabel={t('forget.confirm')}
        tone="danger"
        onConfirm={() => { c.setForgetAsking(false); stores.danger.forget(); }}
      />
    </>
  );
}

function DangerNotes({ t, name, computer, dv, store, onForget }: { t: T; name: string; computer: string; dv: DangerView; store: DangerStore; onForget: () => void }) {
  const kind: DangerKind | null = dv.kind;
  if (dv.phase === 'running') return <p className={s.status} role="status" /* reason: a one-line working note under the actions */>{t('danger.running')}</p>;
  if (dv.phase === 'done' && kind === 'reset') {
    const said = dv.restored === 'now' ? t('danger.done.reset', { name }) : dv.restored === 'later' ? t('danger.done.resetLater', { name, computer }) : null;
    if (said) return <p className={s.status} role="status" /* reason: a one-line note where a done reset's shipped version stands */>{said}</p>;
    return (
      <Band
        tone="neutral"
        size="table"
        actions={<Button size="sm" variant="secondary" onPress={() => void store.check()} isDisabled={dv.reading}>{t('danger.readAgain')}</Button>}
      >
        {t('danger.done.resetUnread', { name })}
      </Band>
    );
  }
  if (dv.phase === 'done' && kind) {
    const text = kind === 'delete' ? t('danger.done.delete', { name }) : dv.hidden ? t('danger.hiddenNow') : t('danger.shownNow');
    return <p className={s.status} role="status" /* reason: a one-line done note under the actions */>{text}</p>;
  }
  if (dv.phase === 'paused')
    return <Band tone="warn" size="table" /* noDetails: the agent refused because agents are paused; nothing was done */ actions={<TextButton onPress={() => store.clear()}>{t('danger.dismiss')}</TextButton>}>{t('danger.paused', { computer })}</Band>;
  if (dv.phase === 'refused' && dv.refusal)
    return (
      <Band tone="danger" size="table" /* noDetails: a refusal that changed nothing, said in fixed words with its code */ actions={<TextButton onPress={() => store.clear()}>{t('danger.dismiss')}</TextButton>}>
        {t('danger.refused', { code: dv.refusal.code || String(dv.refusal.status) })}
      </Band>
    );
  if (dv.phase !== 'unsure' || !kind) return null;
  if (kind === 'hide' || kind === 'show') return <Band tone="warn" size="table" /* noDetails: a lost answer; choosing again sets the same value */>{t('danger.unsure.hide', { name })}</Band>;
  return (
    <>
      <Band
        tone="warn"
        size="table"
        /* noDetails: an unknown outcome has no error to show; Check again reads it back */
        actions={(
          <>
            <Button size="sm" variant="secondary" onPress={() => void store.check()} isDisabled={dv.reading}>{t('danger.check')}</Button>
            <TextButton onPress={onForget} isDisabled={dv.reading}>{t('danger.forget')}</TextButton>
          </>
        )}
      >
        {t(kind === 'delete' ? 'danger.unsure.delete' : 'danger.unsure.reset', { name })}
      </Band>
      {dv.observed === 'same' && <p className={s.warnText} role="status" /* reason: a one-line note under Check again */>{t('danger.seenSame')}</p>}
      {dv.observed === 'failed' && <p className={s.warnText} role="status" /* reason: a one-line note under Check again */>{t('danger.checkFailed')}</p>}
    </>
  );
}

function problemText(t: T, p: NonNullable<SourceView['problem']>): string {
  if (p.kind === 'json') return p.line !== null ? t('problem.jsonAt', { line: p.line }) : t('problem.json');
  if (p.kind === 'unknownKey' || p.kind === 'type' || p.kind === 'blankOutput') return t(`problem.${p.kind}`, { key: p.key ?? '' });
  return t(`problem.${p.kind}`);
}

function refusedText(t: T, computer: string, r: NonNullable<SourceView['refusal']>): string {
  if (r.code === 'daemon_paused') return t('refused.paused', { computer });
  if (r.code === 'invalid_definition') return r.reason ? t('refused.invalid', { reason: r.reason }) : t('refused.invalidNoReason');
  return t(r.unsent ? 'refused.unsent' : 'refused', { code: r.code || String(r.status) });
}

function Editor({ t, w, computer, store, view, locked, focus }: { t: T; w: Workflow; computer: string; store: SourceStore; view: SourceView; locked: boolean; focus: Pick<WorkflowSourceCtl, 'focusWanted' | 'focusNonce'> }) {
  const [reloadAsk, setReloadAsk] = useState(false);
  const editorRef = useRef<CodeEditorHandle>(null);
  const ready = view.load === 'ready';
  // Edit source: the cursor goes into the editor once the source is read (once per press).
  useEffect(() => {
    if (!ready || !focus.focusWanted.current) return;
    focus.focusWanted.current = false;
    editorRef.current?.focus();
  }, [ready, focus.focusWanted, focus.focusNonce]);
  const [abandonAsk, setAbandonAsk] = useState(false);
  const [leave, setLeave] = useState<{ proceed: () => void; reset: () => void } | null>(null);
  const guardActive = view.dirty || view.save === 'unsure' || view.save === 'saving';

  if (view.load === 'loading' || view.load === 'idle') return <Skeleton aria-label={t('loading', { name: w.name })} />;
  if (view.load === 'gone') return <p className={s.warnText} role="status" /* reason: a one-line note that the workflow is gone */>{t('load.gone', { name: w.name, computer })}</p>;
  if (view.load === 'failed') {
    const e = view.loadError;
    return (
      <ErrorState
        size="sm"
        /* noDetails: the settled read keeps the agent's code, shown in the sentence */
        title={t('load.failed.title', { name: w.name })}
        body={e?.code === 'daemon_paused' ? t('load.failed.paused', { computer }) : e?.code === 'unreadable' ? t('load.failed.unreadable') : t('load.failed.body', { code: e?.code || String(e?.status ?? '') })}
        onRetry={() => { store.reset(); void store.load(); }}
      />
    );
  }

  const readOnly = locked || view.save === 'unsure' || view.save === 'conflict';
  const canSave = !readOnly && view.dirty && view.problem === null && view.save !== 'saving' && !view.reading && !view.stale && view.revision !== null;
  const theirs = view.theirs;
  const dropAsk = () => (view.dirty ? setReloadAsk(true) : void store.reload());

  return (
    <div className={s.stack}>
      <LeaveGuard active={guardActive} onBlock={(proceed, reset) => setLeave({ proceed, reset })} />
      {view.save === 'refused' && view.refusal && <Band tone="danger" size="table" /* noDetails: a refusal that wrote nothing, said in fixed words with its code */>{refusedText(t, computer, view.refusal)}</Band>}
      {view.save === 'unsure' && (
        <Band
          tone="warn"
          size="table"
          /* noDetails: an unknown outcome has no error to show; Check what is saved reads it back */
          actions={(
            <>
              <Button size="sm" variant="secondary" onPress={() => void store.check()} isDisabled={view.reading}>{t('unsure.check')}</Button>
              <TextButton onPress={() => setAbandonAsk(true)} isDisabled={view.reading}>{t('unsure.abandon')}</TextButton>
            </>
          )}
        >
          {t('unsure')}
        </Band>
      )}
      {view.save === 'unsure' && view.checked && <p className={s.warnText} role="status" /* reason: a one-line note of what the check saw; Check what is saved is above it */>{t(`unsure.${view.checked}`)}</p>}
      {view.stale && (
        <Band tone="warn" size="table" /* noDetails: the workflow was not read again after the change */ actions={<TextButton onPress={dropAsk} isDisabled={view.reading}>{t('stale.reload')}</TextButton>}>
          {t('stale')}
        </Band>
      )}
      {view.save === 'conflict' && (
        <Band
          tone="warn"
          size="table"
          /* noDetails: the agent refused before writing (revision_conflict); Compare shows the difference */
          actions={(
            <>
              <TextButton onPress={() => void store.compare()} isDisabled={view.reading}>{t('conflict.compare')}</TextButton>
              {theirs?.phase === 'read' && <TextButton onPress={() => store.keepMine()}>{t('conflict.keep')}</TextButton>}
              <TextButton onPress={dropAsk} isDisabled={view.reading}>{t('conflict.reload')}</TextButton>
            </>
          )}
        >
          {t('conflict')}
        </Band>
      )}
      {view.save === 'conflict' && theirs && <TheirsView t={t} theirs={theirs} mine={view.draft} />}

      {view.project ? <p className={s.hint}>{t('project')}</p> : w.origin === 'system' ? <p className={s.hint}>{t('system')}</p> : null}
      <CodeEditor
        ref={editorRef}
        label={t('label', { name: w.name })}
        value={view.draft}
        onChange={(v) => store.setDraft(v)}
        readOnly={readOnly}
        onSave={() => { if (canSave) void store.save(); }}
        rows={24}
        tools={(
          <Button size="sm" variant="primary" onPress={() => void store.save()} isDisabled={!canSave}>
            {view.save === 'saving' ? t('saving') : t('save')}
          </Button>
        )}
      />
      <div className={s.foot}>
        {view.dirty && view.problem && <span className={s.warnText} role="alert" /* reason: a one-line hint why Save is off, under the editor */>{problemText(t, view.problem)}</span>}
        {view.save === 'saved' && view.reading && <span className={s.status} role="status" /* reason: a one-line note while the saved workflow is read again */>{t('rebasing')}</span>}
        {view.save === 'saved' && !view.reading && !view.dirty && <span className={s.status} role="status" /* reason: a one-line Saved tick under the editor */>{t('saved')}</span>}
        {view.dirty && view.save !== 'saving' && <span className={s.status}>{t('dirty')}</span>}
      </div>

      <ConfirmDialog
        isOpen={reloadAsk}
        onOpenChange={setReloadAsk}
        title={t('reload.title')}
        body={t('reload.body')}
        confirmLabel={t('reload.confirm')}
        tone="danger"
        onConfirm={() => { setReloadAsk(false); void store.reload(); }}
      />
      <ConfirmDialog
        isOpen={abandonAsk}
        onOpenChange={setAbandonAsk}
        title={t('abandon.title')}
        body={t('abandon.body')}
        confirmLabel={t('abandon.confirm')}
        tone="danger"
        onConfirm={() => { setAbandonAsk(false); store.abandon(); }}
      />
      <ConfirmDialog
        isOpen={leave !== null}
        onOpenChange={(o) => { if (!o && leave) { leave.reset(); setLeave(null); } }}
        title={t('leave.title')}
        body={view.save === 'unsure' ? t('leave.body.unsure', { name: w.name }) : t('leave.body', { name: w.name })}
        confirmLabel={t('leave.leave')}
        cancelLabel={t('leave.stay')}
        tone="danger"
        onConfirm={() => { const l = leave; setLeave(null); l?.proceed(); }}
      />
    </div>
  );
}

function TheirsView({ t, theirs, mine }: { t: T; theirs: NonNullable<SourceView['theirs']>; mine: string }) {
  const diff = useMemo(() => (theirs.phase === 'read' ? diffRows(theirs.content, mine) : null), [theirs, mine]);
  if (theirs.phase === 'reading') return <p className={s.status} role="status" /* reason: a one-line note that theirs is being read; Compare is in the band above */>{t('conflict.reading')}</p>;
  if (theirs.phase === 'failed') return <p className={s.warnText} role="alert" /* reason: a one-line note that theirs could not be read; Compare is in the band above */>{t('conflict.theirsFailed', { code: theirs.code || String(theirs.status) })}</p>;
  if (theirs.phase === 'gone') return <p className={s.warnText} role="status" /* reason: a one-line note that the workflow is gone; Load theirs is in the band above */>{t('conflict.theirsGone')}</p>;
  if (!diff || (diff.added === 0 && diff.removed === 0)) return <p className={s.status} role="status" /* reason: a one-line note that both are the same; Keep mine is in the band above */>{t('diff.same')}</p>;
  const rows = diff.rows.slice(0, MAX_DIFF_ROWS);
  const cut = diff.rows.length - rows.length;
  return (
    <div className={s.diff}>
      <h4 className={s.diffTitle}>{t('diff.title')}</h4>
      <p className={s.status}>
        {diff.added === 1 ? t('diff.added.one') : t('diff.added', { n: diff.added })} · {diff.removed === 1 ? t('diff.removed.one') : t('diff.removed', { n: diff.removed })}
      </p>
      <ul className={s.rows} aria-label={t('diff.title')}>
        {rows.map((r, i) => (
          <li key={i} className={`${s.row} ${r.t === '+' ? s.add : r.t === '-' ? s.del : ''}`} aria-label={r.t === '+' ? t('diff.line.added') : r.t === '-' ? t('diff.line.removed') : undefined}>
            <span className={s.mark} aria-hidden="true">{r.t === '=' ? '' : r.t}</span>
            <span>{r.s}</span>
          </li>
        ))}
      </ul>
      {cut > 0 && <p className={s.warnText} role="status" /* reason: a one-line note that the list is cut */>{t('diff.cut', { n: cut })}</p>}
    </div>
  );
}

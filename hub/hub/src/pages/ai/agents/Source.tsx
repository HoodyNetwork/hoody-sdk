// One agent's source file as an editor in a Disclosure, with Reset to shipped and Delete in the
// danger group under it.
// Self-contained: the host gives the agent's name, the computer's
// name, whether agents are paused (`paused`, the pause store's reading) and what to do when the agent is deleted.
//   - A save is checked against the revision the file was read at. If the file changed, nothing is written: Compare shows
//     how saving over it would change it, Keep mine bases the draft on it (press Save again), Load their file drops the draft.
//   - If the answer to a save is lost it MAY have been saved: no second send, and "Check what is saved" reads the file back.
//   - The text is saved exactly as typed, so `tools: none` (or any line the person didn't touch) is kept as it was read.
//   - Reset and Delete say "Resume to ..." while agents are paused, and send nothing until they are resumed.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Band, Button, CodeEditor, ConfirmDialog, DangerConfirm, Disclosure, EmptyState, ErrorState, LeaveGuard, SettingGroup, SettingRow, Skeleton, TextButton, diffRows, useStrings,
  type OutcomeInput,
} from '@kit';
import { createDangerStore, type DangerKind, type DangerStore, type DangerView } from './danger';
import { createSourceStore, type SourceStore, type SourceView } from './source';
import { agentSourceApi, type SourceApi } from './sourceApi';
import { agent } from '@core';
import strings from './Source.strings.en.json';
import s from './Source.module.css';

export interface AgentSourceProps {
  /** The agent's name (its file's stem). */
  name: string;
  /** The agent's list row says Hoody owns it (`product-owned (read-only)`): it reads as its runtime definition and refuses
   *  writes, so the editor is read-only and offers no Reset or Delete. From the row, never a list of names. */
  productOwned: boolean;
  /** The computer's name, as the top bar shows it. */
  computer: string;
  /** Agents on the computer are paused (the pause store's reading): Reset and Delete wait for Resume. */
  paused: boolean;
  /** The realm the agent is read in (default: the one the page is in). */
  realm?: string;
  /** The agent was deleted (the person is done here: go back to the list). */
  onDeleted?: () => void;
  /** Reset to shipped ran: reload what shows the agent. */
  onReset?: () => void;
  /** Requests; tests give their own. */
  api?: SourceApi;
  /** Hide Reset and Delete (a host that shows them elsewhere). */
  hideDanger?: boolean;
  /** A host that changes the agent without navigating (LeaveGuard sees only path changes), or that owns the route guard
   *  (`hostGuard`), calls `leaveRef.current(go, stay)` first: `go` runs at once when nothing is held, else after the person
   *  confirms the leave dialog; Stay keeps all and calls `stay` (a host's held navigation is let go there). */
  leaveRef?: { current: ((go: () => void, stay?: () => void) => void) | null };
  /** The host owns the route's leave guard (one question for everything on its page): no LeaveGuard here; the host asks
   *  through `leaveRef`. */
  hostGuard?: boolean;
  /** A sentence the host adds to the leave dialog's body: what else Leave drops on its page (its own words). */
  alsoLost?: string;
  /** Told whenever the editor starts or stops holding what its leave check asks about (the LeaveGuard's own predicate: a
   *  draft, a save of unknown outcome, a Reset or Delete running); false when it closes. */
  onHeldChange?: (held: boolean) => void;
  /** Another writer of this file on the host's page has a save running or of unknown outcome: the editor is locked, and
   *  Save, Reset and Delete wait and send nothing until it settles. */
  peerBusy?: boolean;
  /** The editor starts folded (a host that shows the file's settings above it). It opens by itself, and stays open, while it
   *  holds a draft, a save that is running, unknown, refused or in conflict, or a file that was not read again. */
  folded?: boolean;
}

type T = ReturnType<typeof useStrings<typeof strings>>;

function useStore<V>(store: { subscribe(fn: () => void): () => void; view(): V }): V {
  return useSyncExternalStore(store.subscribe, store.view, store.view);
}

const REFUSED_WORDS = new Set(['bad_request', 'forbidden', 'read_only']);
function refusedText(t: T, r: NonNullable<SourceView['refusal']>): string {
  if (r.unsent) return t('refused.unsent', { code: r.code || String(r.status) });
  if (REFUSED_WORDS.has(r.code)) return t(`refused.${r.code}` as 'refused.bad_request');
  return t('refused.generic', { code: r.code || String(r.status) });
}

export function AgentSource({ name, productOwned, computer, paused, realm, onDeleted, onReset, api: given, hideDanger, leaveRef, onHeldChange, hostGuard, alsoLost, peerBusy = false, folded = false }: AgentSourceProps) {
  const t = useStrings(strings);
  const api = useMemo(() => given ?? agentSourceApi(name, realm ? { realm } : {}), [given, name, realm]);
  // Save and Reset / Delete are one family of writes: while either is running or its outcome is unknown, the other is not
  // offered and its store does not send (each store asks the other's view).
  const peers = useRef<{ source?: SourceStore; danger?: DangerStore }>({});
  const peerRef = useRef(peerBusy);
  peerRef.current = peerBusy;
  const source = useMemo(() => {
    const st = createSourceStore({ api, blocked: () => { const p = peers.current.danger?.view().phase; return peerRef.current || p === 'running' || p === 'unsure'; } });
    peers.current.source = st;
    return st;
  }, [api]);
  const view = useStore(source);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const danger = useMemo(() => {
    const st = createDangerStore({ api, paused: () => pausedRef.current, blocked: () => { const sv = peers.current.source?.view(); return peerRef.current || sv?.save === 'saving' || sv?.save === 'unsure' || sv?.refreshing === true; } });
    peers.current.danger = st;
    return st;
  }, [api]);
  const dv = useStore(danger);
  const dangerBusy = dv.phase === 'running' || dv.phase === 'unsure';
  const saveBusy = view.save === 'saving' || view.save === 'unsure' || view.refreshing || peerBusy;
  const [reloadAsk, setReloadAsk] = useState(false);
  const [forgetAsk, setForgetAsk] = useState(false);
  const [abandonAsk, setAbandonAsk] = useState(false);
  const [dangerAsk, setDangerAsk] = useState<DangerKind | null>(null);
  const [unfolded, setUnfolded] = useState(!folded);
  // A product agent's display name (core's AGENT_LABELS), else its name.
  const label = agent.AGENT_LABELS[name];

  useEffect(() => {
    void source.load();
    return () => { source.reset(); danger.reset(); };
  }, [source, danger]);

  // A finished run is told to the host once, whatever the host's callbacks are re-created as.
  const cb = useRef({ onDeleted, onReset });
  cb.current = { onDeleted, onReset };
  useEffect(() => {
    if (dv.phase !== 'done') return;
    if (dv.kind === 'delete' && dv.gone) cb.current.onDeleted?.();
    else if (dv.kind === 'reset') { void source.refresh(); cb.current.onReset?.(); }
  }, [dv.phase, dv.kind, dv.gone, source]);

  const guardActive = view.dirty || view.save === 'unsure' || dangerBusy;
  const [leave, setLeave] = useState<{ proceed: () => void; reset: () => void } | null>(null);
  const held = useRef(guardActive);
  held.current = guardActive;
  useEffect(() => {
    if (!leaveRef) return;
    leaveRef.current = (go, stay) => (held.current ? setLeave({ proceed: go, reset: stay ?? (() => {}) }) : go());
    return () => { leaveRef.current = null; };
  }, [leaveRef]);
  const heldCb = useRef(onHeldChange);
  heldCb.current = onHeldChange;
  useEffect(() => { heldCb.current?.(guardActive); }, [guardActive]);
  useEffect(() => () => heldCb.current?.(false), []);

  // The leave question's words, then the host's sentence on what else Leave drops (alsoLost).
  const leaveWords = view.save === 'unsure' ? t('leave.body.unsure', { name }) : t('leave.body', { name });
  const leaveBody = alsoLost ? `${leaveWords} ${alsoLost}` : leaveWords;
  // Every branch renders the guard and its dialog: a draft can outlive a read that ends loading, gone or failed (a reset
  // whose refresh finds the file gone), and a held navigation must always get Stay and Leave.
  const leaveParts = (
    <>
      <LeaveGuard active={guardActive && !hostGuard} onBlock={(proceed, reset) => setLeave({ proceed, reset })} />
      <ConfirmDialog
        isOpen={leave !== null}
        onOpenChange={(o) => { if (!o && leave) { leave.reset(); setLeave(null); } }}
        title={t('leave.title')}
        body={leaveBody}
        confirmLabel={t('leave.leave')}
        cancelLabel={t('leave.stay')}
        tone="danger"
        onConfirm={() => { const l = leave; setLeave(null); l?.proceed(); }}
      />
    </>
  );

  if (view.load === 'loading' || (view.load === 'idle' && view.base === null)) return <><Skeleton aria-label={t('loading', { name })} />{leaveParts}</>;
  if (view.load === 'gone') return <><EmptyState title={t('load.gone.title', { name })} body={t('load.gone.body')} />{leaveParts}</>;
  if (view.load === 'failed') {
    const e = view.loadError;
    return (
      <>
        <ErrorState
          /* noDetails: the settled read keeps the agent's code, shown in the sentence */
          title={t('load.failed.title', { name })}
          body={e?.code === 'unreadable' ? t('load.failed.unreadable') : t('load.failed.body', { code: e?.code || String(e?.status ?? '') })}
          onRetry={() => void source.load()}
        />
        {leaveParts}
      </>
    );
  }

  const locked = productOwned || view.save === 'unsure' || view.save === 'conflict' || view.refreshing || dangerBusy || peerBusy;
  const canSave = !locked && view.dirty && !view.tooBig && view.save !== 'saving';
  const theirs = view.theirs;
  const dropAsk = () => (view.dirty ? setReloadAsk(true) : void source.reload());
  // What the editor holds or owes an answer about is never folded away.
  const mustShow = view.dirty || view.tooBig || view.stale || view.save === 'saving' || view.save === 'unsure' || view.save === 'refused' || view.save === 'conflict';

  return (
    <div className={s.stack}>
      {leaveParts}
      {productOwned && <Band tone="neutral" size="table">{t('readonly', { name: label ? t(label) : name })}</Band>}
      {!productOwned && view.path === null && <Band tone="neutral" size="table">{t('new')}</Band>}
      {view.save === 'refused' && view.refusal && <Band tone="danger" size="table" /* noDetails: a refusal that wrote nothing, said in fixed words with its code */>{refusedText(t, view.refusal)}</Band>}
      {view.save === 'unsure' && (
        <Band
          tone="warn"
          size="table"
          /* noDetails: an unknown outcome has no error to show; Check what is saved reads it back */
          actions={(
            <>
              <Button size="sm" variant="secondary" onPress={() => void source.check()} isDisabled={view.reading}>{t('unsure.check')}</Button>
              <TextButton onPress={() => setAbandonAsk(true)} isDisabled={view.reading}>{t('unsure.abandon')}</TextButton>
            </>
          )}
        >
          {t('unsure')}
        </Band>
      )}
      {view.save === 'unsure' && view.checked === 'failed' && <p className={s.warnText} role="status" /* reason: a one-line note that the check failed; Check what is saved is above it */>{t('unsure.failed')}</p>}
      {view.save === 'unsure' && view.checked === 'same' && <p className={s.warnText} role="status" /* reason: a one-line note that the file looks unchanged; Save again from this file is above it */>{t('unsure.same')}</p>}
      {view.save === 'unsure' && view.checked === 'changed' && <p className={s.warnText} role="status" /* reason: a one-line note that the file is different; Check what is saved is above it */>{t('unsure.changed')}</p>}
      {view.save === 'unsure' && view.checked === 'gone' && <p className={s.warnText} role="status" /* reason: a one-line note that the file is gone; your text stays here until you copy it */>{t('unsure.gone')}</p>}
      {view.stale && (
        <Band tone="warn" size="table" /* noDetails: the file was not read again after the reset */ actions={<TextButton onPress={() => void source.refresh()} isDisabled={view.reading || view.refreshing || saveBusy}>{t('stale.reload')}</TextButton>}>
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
              <TextButton onPress={() => void source.compare()} isDisabled={view.reading}>{t('conflict.compare')}</TextButton>
              {theirs?.phase === 'read' && <TextButton onPress={() => source.keepMine()}>{t('conflict.keep')}</TextButton>}
              <TextButton onPress={dropAsk} isDisabled={view.reading}>{t('conflict.reload')}</TextButton>
            </>
          )}
        >
          {t('conflict')}
        </Band>
      )}
      {view.save === 'conflict' && theirs && <TheirsView t={t} theirs={theirs} mine={view.draft} />}

      <Disclosure
        title={t('editor.title')}
        description={view.path !== null ? t('file', { path: view.path }) : undefined}
        isExpanded={unfolded || mustShow}
        onExpandedChange={setUnfolded}
      >
        <div className={s.stack}>
          <CodeEditor
            label={t('label', { name })}
            value={view.draft}
            onChange={(v) => source.setDraft(v)}
            readOnly={locked}
            onSave={() => { if (canSave) void source.save(); }}
            rows={24}
            tools={(
              <Button size="sm" variant="primary" onPress={() => void source.save()} isDisabled={!canSave}>
                {view.save === 'saving' ? t('saving') : t('save')}
              </Button>
            )}
          />
          <div className={s.foot}>
            {view.tooBig && <span className={s.warnText} role="alert" /* reason: a one-line cap hint under the editor; Save is disabled beside it */>{t('tooBig')}</span>}
            {view.save === 'saved' && !view.dirty && <span className={s.status} role="status" /* reason: a one-line Saved tick under the editor */>{t('saved')}</span>}
            {view.dirty && view.save !== 'saving' && <span className={s.status}>{t('dirty')}</span>}
          </div>
        </div>
      </Disclosure>

      {!hideDanger && !productOwned && (
        <DangerRow
          t={t}
          name={name}
          computer={computer}
          paused={paused}
          dv={dv}
          saveBusy={saveBusy}
          onAsk={setDangerAsk}
          onCheck={() => void danger.check()}
          onForget={() => setForgetAsk(true)}
        />
      )}

      <ConfirmDialog
        isOpen={reloadAsk}
        onOpenChange={setReloadAsk}
        title={t('reload.title')}
        body={t('reload.body')}
        confirmLabel={t('reload.confirm')}
        tone="danger"
        onConfirm={() => { setReloadAsk(false); void source.reload(); }}
      />
      <ConfirmDialog
        isOpen={abandonAsk}
        onOpenChange={setAbandonAsk}
        title={t('abandon.title')}
        body={t('abandon.body')}
        confirmLabel={t('abandon.confirm')}
        tone="danger"
        onConfirm={() => { setAbandonAsk(false); source.abandon(); }}
      />
      <ConfirmDialog
        isOpen={forgetAsk}
        onOpenChange={setForgetAsk}
        title={t('forget.title')}
        body={t('forget.body')}
        confirmLabel={t('forget.confirm')}
        tone="danger"
        onConfirm={() => { setForgetAsk(false); danger.forget(); }}
      />
      <ConfirmDialog
        isOpen={dangerAsk === 'reset'}
        onOpenChange={(o) => { if (!o) setDangerAsk(null); }}
        title={t('danger.reset.confirmTitle', { name })}
        body={t('danger.reset.confirmBody', { name })}
        confirmLabel={t('danger.reset.confirm')}
        tone="danger"
        onConfirm={() => { setDangerAsk(null); void danger.run('reset', view.revision); }}
      />
      <DangerConfirm
        isOpen={dangerAsk === 'delete'}
        onOpenChange={(o) => { if (!o) setDangerAsk(null); }}
        title={t('danger.delete.confirmTitle', { name })}
        body={t('danger.delete.confirmBody', { name })}
        confirmText={name}
        consequences={[t('danger.delete.consequence1'), t('danger.delete.consequence2')]}
        confirmLabel={t('danger.delete.confirm')}
        onConfirm={() => { setDangerAsk(null); void danger.run('delete', view.revision); }}
      />
    </div>
  );
}

const MAX_DIFF_ROWS = 400;

function TheirsView({ t, theirs, mine }: { t: T; theirs: NonNullable<SourceView['theirs']>; mine: string }) {
  const diff = useMemo(() => (theirs.phase === 'read' ? diffRows(theirs.content, mine) : null), [theirs, mine]);
  if (theirs.phase === 'reading') return <p className={s.status} role="status" /* reason: a one-line note that their file is being read; Compare is in the band above */>{t('conflict.reading')}</p>;
  if (theirs.phase === 'failed') return <p className={s.warnText} role="alert" /* reason: a one-line note that their file could not be read; Compare is in the band above */>{t('conflict.theirsFailed', { code: theirs.code || String(theirs.status) })}</p>;
  if (theirs.phase === 'gone') return <p className={s.warnText} role="status" /* reason: a one-line note that their file is gone; Load their file is in the band above */>{t('conflict.theirsGone')}</p>;
  if (!diff || (diff.added === 0 && diff.removed === 0)) return <p className={s.status} role="status" /* reason: a one-line note that both files are the same; Keep mine is in the band above */>{t('diff.same')}</p>;
  const rows = diff.rows.slice(0, MAX_DIFF_ROWS);
  const cut = diff.rows.length - rows.length;
  return (
    <div className={s.diff}>
      <h3 className={s.diffTitle}>{t('diff.title')}</h3>
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
      {cut > 0 && <p className={s.warnText} role="status" /* reason: a one-line note that the list is cut; Load their file shows the whole file */>{t('diff.cut', { n: cut })}</p>}
    </div>
  );
}

interface DangerRowProps {
  t: T;
  name: string;
  computer: string;
  paused: boolean;
  dv: DangerView;
  saveBusy: boolean;
  onAsk: (k: DangerKind) => void;
  onCheck: () => void;
  onForget: () => void;
}

function DangerRow({ t, name, computer, paused, dv, saveBusy, onAsk, onCheck, onForget }: DangerRowProps) {
  const busy = dv.phase === 'running' || dv.phase === 'unsure';
  const off = busy || paused || saveBusy;
  // What the read-back of an unknown outcome saw: never a verdict on the run (only `gone` after a delete settles it).
  const seen =
    dv.observed === 'failed' ? t('danger.checkFailed')
    : dv.observed === 'same' ? t('danger.seenSame')
    : dv.observed === 'changed' ? t('danger.seenChanged')
    : dv.observed === 'gone' ? t('danger.seenGone')
    : null;
  // The last Reset or Delete answers on its own row: working, done, not sent (paused), refused, or unknown (the row then
  // offers only Check again, which reads back; Stop tracking under the rows asks first and sends nothing).
  const outcomeOf = (k: DangerKind): { outcome?: OutcomeInput; detail?: string; onCheck?: () => void } => {
    if (dv.kind !== k) return {};
    switch (dv.phase) {
      case 'running':
        return { outcome: 'running' };
      case 'done':
        return { outcome: { kind: 'done' }, detail: t(k === 'delete' ? 'danger.done.delete' : 'danger.done.reset', { name }) };
      case 'paused':
        return { outcome: { kind: 'not_sent' }, detail: t('danger.paused', { computer }) };
      case 'refused':
        return dv.refusal ? { outcome: { kind: 'failed' }, detail: t('danger.refused', { code: dv.refusal.code || String(dv.refusal.status) }) } : {};
      case 'unsure':
        return { outcome: { kind: 'pending' }, detail: seen ? `${t('danger.unsure')} ${seen}` : t('danger.unsure'), onCheck };
      default:
        return {};
    }
  };
  const reset = outcomeOf('reset');
  const del = outcomeOf('delete');
  return (
    <>
      {paused && <Band size="table" /* noDetails: agents are paused; nothing was sent */>{t('danger.paused.hint', { computer })}</Band>}
      <SettingGroup title={t('danger.title')} tone="danger">
        <SettingRow
          label={t('danger.reset.label')}
          help={t('danger.reset.help')}
          tone="danger"
          outcome={reset.outcome}
          // noDetails: the store keeps only the phase and the agent's code; the sentence says what it means.
          detail={reset.detail}
          onCheck={reset.onCheck}
          actions={(
            <Button tone="danger" size="sm" onPress={() => onAsk('reset')} isDisabled={off}>
              {paused ? t('danger.reset.paused') : t('danger.reset')}
            </Button>
          )}
        />
        <SettingRow
          label={t('danger.delete.label')}
          help={t('danger.delete.consequence1')}
          tone="danger"
          outcome={del.outcome}
          // noDetails: the store keeps only the phase and the agent's code; the sentence says what it means.
          detail={del.detail}
          onCheck={del.onCheck}
          actions={(
            <Button tone="danger" size="sm" onPress={() => onAsk('delete')} isDisabled={off}>
              {paused ? t('danger.delete.paused') : t('danger.delete')}
            </Button>
          )}
        />
      </SettingGroup>
      {/* A row with an unknown outcome offers only Check again; letting go of it is asked here, under the rows. */}
      {dv.phase === 'unsure' && <TextButton onPress={onForget} isDisabled={dv.reading}>{t('danger.forget')}</TextButton>}
    </>
  );
}

// "Being built in this browser": the New script builds this browser
// holds, at the top of the Scripts page and before both of its early returns (view.tsx), so a build stays visible with no
// computer ready. Each row is read on its own computer (bindingOfRecord: the attempt's stored compId, realm and owner, and that
// computer's containers row), never the computer the Hub shows.
//
// What is read: the store (draft records and asks) whenever it changes; per row, its session once (the label), its receipt,
// its transcript once completed, and /state only while Building. Unsettled rows are read again every 5 s while the page is
// visible; settled rows once. Check again reads a row again at once; a deploy nobody answered for is checked by a fresh read of
// its script on the reservation's own computer (deploy.ts confirmDeployed: an instantiate found makes it live; a write found, or
// no script there, is said, and only the draft's own page settles it or offers Deploy again, as only it asks hoody-exec's journal
// and frees core's hold of the send). Stop and Discard's cancel go to the
// row's own computer, realm and turn; Discard ends the draft (discardDraft; under such a deploy, after the warning that it
// may already be live), or the stored asks of a row without one.
import { Button, ConfirmDialog, Disclosure, ErrorState, StatusPill, formatRelative, showToast, useNow, useStrings, type Tone } from '@kit';
export { useBuildSource } from './Building.hooks';
import { buildTiming, handleOf, heldDeploy, factsKey, turnAskOf, isObj } from './Building.pure';
import type { TurnHandle, Got } from './Building.pure';
export { liveBuildIO, buildTiming, heldDeploy, fixtureBuildIO, openBuild, openChange } from './Building.pure';
export type { BuildIO, BuildLine, FxBuilds } from './Building.pure';
import type { BuildIO, BuildLine } from './Building.pure';
import { DRAFTS_MAX, SCRIPT_ASKS_MAX, hostEnv, subscribeScriptAsksVersion, type ScriptAsk } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bindingOfRecord, type Binding, type StoredBuildReads } from '../data';
import { computerNameOf, labelOf, listOf, mayRun, readsState, rowOf, stepOf, unsettled, type BuildPill } from '../building';
import { routeOf } from '../logic';
import { confirmDeployed, type DeployAnswer } from '../new/deploy';
import { bindingOfDraft } from '../new/record';
import type { RecordRead } from '../new/records';
import strings from '../strings.en.json';
import s from './Building.module.css';
export interface BuildsView {
  /** 'unreadable': the store cannot be read (never shown as empty). */
  status: 'ok' | 'unreadable';
  lines: BuildLine[];
  /** The shared store is full: n asks of New script, m change requests. */
  full: { n: number; m: number } | null;
  /** The draft store is full and no draft can make room (a new draft is refused until one is discarded). */
  draftsFull: boolean;
  changes: readonly ScriptAsk[];
  check: (l: BuildLine) => void;
  stop: (l: BuildLine) => Promise<void>;
  discard: (l: BuildLine) => Promise<void>;
  /** End one stored change request where it was made (capacity recovery: its script may be gone). */
  discardChange: (a: ScriptAsk) => Promise<void>;
  retry: () => void;
}

const hidden = (): boolean => !hostEnv().visible();

/** The section's state. `enabled` false (another view of the page is shown) reads nothing remote; `refetchContainers` reads
 *  the computers again (Check again on a row whose computer cannot be told yet). */
export function useBuilds(io: BuildIO, computers: unknown, enabled: boolean, refetchContainers?: () => unknown): BuildsView {
  const t = useStrings(strings);
  const [bump, setBump] = useState(0);
  useEffect(() => subscribeScriptAsksVersion(() => setBump((v) => v + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- bump is the store's change signal (another tab, a write here, Try again)
  const recs = useMemo(() => io.records(), [io, bump]);
  const list = useMemo(() => (recs === 'unreadable' ? null : listOf(recs.drafts, recs.asks)), [recs]);

  const [got, setGot] = useState<Record<string, Got>>({});
  // The containers answer of the last render: a toast's Check again resolves a build's own computer on it when it runs.
  const rowsNow = useRef(computers);
  rowsNow.current = computers;
  const [stopping, setStopping] = useState<Record<string, true>>({});
  const gotRef = useRef(got);
  gotRef.current = got;
  const busy = useRef(new Set<string>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  // A read chain asks this before each request: none starts once the page is hidden or shows another view.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const mayRead = useCallback((): boolean => alive.current && enabledRef.current && !hidden(), []);

  // A deploy's heartbeat goes stale on the clock alone: while one is beating, the rows are worked out again on a local timer.
  // Off, the clock is a constant 0 (no row reads it then), so the rows are not worked out again on every render.
  const beating = !!list?.entries.some((e) => e.record?.state === 'deploying' && e.record.deploy?.phase === 'sending');
  const clock = useNow(beating, buildTiming.clockMs);
  const now = beating ? clock : 0;

  const lines = useMemo<BuildLine[]>(() => (list?.entries ?? []).map((entry) => {
    const a = entry.ask;
    // A draft under a deploy is read on the reservation's own computer, as its record names it (the wizard's recordBinding).
    const binding = entry.record?.state === 'deploying' ? bindingOfDraft(entry.record, computers) : a ? bindingOfRecord(a, computers) : 'unknown';
    const g = a ? got[factsKey(a)] ?? {} : {};
    const row = rowOf(entry, { ...g, binding: a && !entry.legacy ? binding : g.binding }, now);
    return {
      entry, row, binding,
      name: binding && binding !== 'unknown' ? computerNameOf(computers, binding) : null,
      // A draft with no stored ask has no session to name it.
      label: !a && entry.record?.state === 'open' ? '' : labelOf(a, g.session),
      step: readsState(row) ? stepOf(g.state) : null,
      stopping: !!stopping[entry.key],
    };
  }), [list, computers, got, stopping, now]);

  const readOne = useCallback(async (l: BuildLine, force: boolean): Promise<void> => {
    const a = l.entry.ask;
    if (!a || l.entry.legacy || !l.binding || l.binding === 'unknown') return;
    const r0 = l.entry.record?.state;
    if (r0 === 'deploying' || r0 === 'live_cleanup') return;
    const key = factsKey(a);
    if (busy.current.has(key) || !mayRead()) return;
    const cur = gotRef.current[key] ?? {};
    if (!force && cur.receipt !== undefined && !unsettled(l.row)) return;
    busy.current.add(key);
    const b = l.binding;
    try {
      const next: Got = { ...cur };
      const sid = a.sessionId, tid = a.turnId;
      // The label is read once; one that could not be read is read again.
      if (sid && (force || cur.session === undefined || labelOf(a, cur.session) === '')) next.session = await io.reads.session(b, sid);
      if (sid && tid && a.phase !== 'create' && a.phase !== 'turn' && a.phase !== 'lost') {
        if (!mayRead()) return;
        next.receipt = await io.reads.receipt(b, sid, tid);
        const row = rowOf(l.entry, { binding: b, receipt: next.receipt });
        if (row.pill === 'reading' && !mayRead()) return;
        if (row.pill === 'reading') next.transcript = await io.reads.transcript(b, sid);
        else delete next.transcript;
        if (readsState(row) && !mayRead()) return;
        next.state = readsState(row) ? await io.reads.state(b, sid) : undefined;
      }
      if (alive.current) setGot((g) => ({ ...g, [key]: next }));
    } finally {
      busy.current.delete(key);
    }
  }, [io, mayRead]);

  // First reads, and the 5 s re-reads of unsettled rows while the page is visible.
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const shape = lines.map((l) => `${l.entry.key}:${l.entry.ask ? factsKey(l.entry.ask) : ''}:${l.binding ? (l.binding === 'unknown' ? 'u' : 'b') : 'n'}`).join(',');
  useEffect(() => {
    if (!enabled) return;
    const tick = (): void => {
      if (hidden()) return;
      for (const l of linesRef.current) if (unsettled(l.row)) void readOne(l, false);
    };
    tick();
    const id = setInterval(tick, buildTiming.everyMs);
    const onVis = (): void => { if (!hidden()) tick(); };
    const offVis = hostEnv().onVisibilityChange(onVis);
    return () => {
      clearInterval(id);
      offVis();
    };
  }, [enabled, readOne, shape]);

  /** A held deploy's Check: confirmDeployed over a fresh read of its script on the row's computer, with no hold to free (the
   *  list sends nothing that frees core's hold of the send: hoody-exec's own "Script not found" answers ABSENT_SEEN, and the
   *  draft's page offers Deploy again; for an idea's request, which no journal fences, ABSENT_UNPROVEN: it may still arrive). Found: an instantiate's draft is made live, and its row says so; a write's is not
   *  (only hoody-exec's journal proves the file is this deploy's, which the draft's own Check asks), FOUND_SEEN. */
  const checkDeploy = useCallback(async (l: BuildLine, b: Binding): Promise<void> => {
    const r = l.entry.record;
    if (!r?.deploy) return;
    const key = `deploy:${r.draftId}`;
    if (busy.current.has(key) || !mayRead()) return;
    busy.current.add(key);
    try {
      const script = io.reads.script;
      const read = (id: string): RecordRead => { const x = io.records(); return x === 'unreadable' ? 'unreadable' : x.drafts.find((d) => d.draftId === id) ?? null; };
      const a = await confirmDeployed({ sends: { exists: (p) => (script ? script(b, p) : Promise.resolve(null)) }, read }, r.draftId).catch(() => ({ outcome: 'pending', code: 'NOT_KNOWN' }) as DeployAnswer);
      if (!alive.current) return;
      setBump((v) => v + 1);
      const route = routeOf(r.deploy.path) ?? r.deploy.path;
      if (a.outcome === 'pending' && a.code === 'ABSENT_SEEN') showToast({ title: l.name ? t('build.deployAbsentOn', { computer: l.name, route }) : t('build.deployAbsent', { route }), tone: 'warn' /* noDetails: the Check's read found no script at the path; the draft's own page offers Deploy again */ });
      else if (a.outcome === 'pending' && a.code === 'ABSENT_UNPROVEN') showToast({ title: l.name ? t('build.deployUnprovenOn', { computer: l.name, route }) : t('build.deployUnproven', { route }), tone: 'unknown' /* noDetails: no script at the path yet, but an idea's request has no journal to fence it and may still make it; only the draft's own Check settles it */ });
      else if (a.outcome === 'pending' && a.code === 'FOUND_SEEN') showToast({ title: l.name ? t('build.deployFoundOn', { computer: l.name, route }) : t('build.deployFound', { route }), tone: 'unknown' /* noDetails: the Check's read found a script, which only the draft's own Check can tell is this deploy's */ });
      else if (a.outcome === 'pending' && a.code === 'NOT_KNOWN') showToast({ title: l.name ? t('build.deployUnknownOn', { computer: l.name }) : t('build.deployUnknown'), ...(a.why ? { body: t(`flow.live.why.${a.why}`, { computer: l.name ?? t('build.thisComputer') }) } : {}), tone: 'unknown' /* noDetails: the Check's read got no answer; its cause, when its failure gave one, is the body */ });
    } finally {
      busy.current.delete(key);
    }
  }, [io, mayRead, t]);

  const check = useCallback((l: BuildLine) => {
    setBump((v) => v + 1);
    // No computer to read it on yet: the computers are read again, and the row is read once its binding resolves.
    if (!l.binding || l.binding === 'unknown') { void refetchContainers?.(); return; }
    if (heldDeploy(l)) { void checkDeploy(l, l.binding); return; }
    void readOne(l, true);
  }, [checkDeploy, readOne, refetchContainers]);

  const setStop = (key: string, on: boolean): void => {
    if (!alive.current) return;
    setStopping((m) => {
      const n = { ...m };
      if (on) n[key] = true;
      else delete n[key];
      return n;
    });
  };

  /** Cancel the row's own turn on its own computer true only when the agent took it. */
  const cancel = useCallback(async (l: BuildLine): Promise<boolean | 'unknown'> => {
    const h = handleOf(l);
    return h ? io.stop(h.b, h.sid, h.turnId) : 'unknown';
  }, [io]);

  /** An unknown stop's read (its toast's Check again): true once the turn's own receipt shows it ended, which closes the
   *  toast; false when the receipt can't be read or is another turn's; nothing while it still runs. Reads only. */
  const turnEnded = useCallback(async (h: TurnHandle): Promise<boolean | undefined> => {
    let rc: Awaited<ReturnType<StoredBuildReads['receipt']>>;
    try { rc = await io.reads.receipt(h.b, h.sid, h.turnId); } catch { return false; }
    if (rc === null || rc === 'unreadable' || rc.turnId !== h.turnId) return false;
    return rc.ended ? true : undefined;
  }, [io]);

  /** The turn handle of an ask whose turn was recorded, its computer resolved now from that ask (compId, realm, owner) on the
   *  computers as read, or read again once when it can't be told yet. null: no turn recorded, or its computer is still not found
   *  (nothing is read anywhere else). */
  const handleNow = useCallback(async (a: ScriptAsk | null): Promise<TurnHandle | null> => {
    if (!a?.sessionId || !a.turnId) return null;
    let b = bindingOfRecord(a, rowsNow.current);
    if (!b || b === 'unknown') {
      let got: unknown;
      try { got = await refetchContainers?.(); } catch { got = undefined; }
      b = bindingOfRecord(a, isObj(got) ? got.data : undefined);
    }
    return b && b !== 'unknown' ? { b, sid: a.sessionId, turnId: a.turnId } : null;
  }, [refetchContainers]);

  const stop = useCallback(async (l: BuildLine): Promise<void> => {
    setStop(l.entry.key, true);
    try {
      const h = handleOf(l);
      // Stop is offered only on a Building row, which has its turn and computer; nothing else is sent.
      if (!h) return;
      const r = await cancel(l);
      // Only a cancelled receipt says Stopped: the read below decides. A cancel the agent refused or whose answer was lost
      // proves nothing; the toast's Check again reads the turn's receipt (and the row is read again with it).
      if (r !== true) showToast({ title: l.name ? t('build.stopUnknownOn', { computer: l.name }) : t('build.stopUnknown'), tone: 'unknown', action: { label: t('build.check'), onAction: () => { void readOne(l, true); return turnEnded(h); } } /* noDetails: a cancel refused or unanswered has no rejection to show */ });
      await readOne(l, true);
    } finally {
      setStop(l.entry.key, false);
    }
  }, [cancel, readOne, t, turnEnded]);

  const discard = useCallback(async (l: BuildLine): Promise<void> => {
    // A build that may still run is stopped first; Discard goes on whatever the cancel answers (the confirm said so).
    let stopped: boolean | 'unknown' | null = null;
    if (mayRun(l.row)) stopped = await cancel(l);
    let clean = true, done = true;
    const removed: ScriptAsk[] = [];
    if (l.entry.record) {
      const r = await io.discard(l.entry.record, heldDeploy(l) ? { mayBeDeployed: true } : {});
      if (!r.ok) done = false;
      else { clean = r.clean; removed.push(...(r.removed ?? [])); }
    } else {
      for (const a of l.entry.asks) if ((await io.close(a, (s) => removed.push(s))) !== 'ok') clean = false;
    }
    setBump((v) => v + 1);
    if (!done) { showToast({ title: t('build.discardRefused'), tone: 'warn' /* noDetails: the draft moved in another tab (or the store refused); the row shows where it is now */ }); return; }
    // A recorded turn keeps a read-only Check again, its computer resolved when it runs (it may not be resolved yet: never
    // "never recorded"); only a build with no turn stored has nothing to read, and the confirm warned before Discard.
    // The identity is the ask as the discard removed it (a turn another tab stored while the confirm was open), else the row's.
    const recordedAsk = turnAskOf(removed, l.entry.ask);
    if (stopped !== null && stopped !== true && recordedAsk) showToast({ title: l.name ? t('build.discardedRunningOn', { computer: l.name }) : t('build.discardedRunning'), tone: 'unknown', action: { label: t('build.check'), onAction: async () => { const h = await handleNow(recordedAsk); return h ? turnEnded(h) : false; } } /* noDetails: the cancel was refused or unanswered; the build may finish on its computer */ });
    else if (stopped !== null && stopped !== true) showToast({ title: l.name ? t('build.discardedLostOn', { computer: l.name }) : t('build.discardedLost'), body: t('build.discardedLostBody'), tone: 'unknown' /* noDetails: no request of it can be addressed */ });
    else if (!clean) showToast({ title: t('build.discardedKept'), tone: 'warn' /* noDetails: an ask's close could not be proven; the leftover stays listed with Discard */ });
  }, [cancel, handleNow, io, t, turnEnded]);

  const discardChange = useCallback(async (a: ScriptAsk): Promise<void> => {
    const r = await io.close(a);
    setBump((v) => v + 1);
    if (r !== 'ok') showToast({ title: t('build.discardChangeFailed'), tone: 'warn' /* noDetails: the store could not show it removed; the request stays listed with Discard */ });
  }, [io, t]);

  return {
    status: list ? 'ok' : 'unreadable',
    lines,
    full: list?.full ? { n: list.builds, m: list.changes } : null,
    draftsFull: !!list?.draftsFull,
    changes: list?.changeAsks ?? [],
    check,
    stop,
    discard,
    discardChange,
    retry: () => setBump((v) => v + 1),
  };
}

const TONES: Record<BuildPill, Tone> = {
  checking: 'neutral',
  starting: 'info',
  building: 'info',
  reading: 'info',
  ready: 'ok',
  unusable: 'warn',
  stopped: 'neutral',
  interrupted: 'neutral',
  failed: 'danger',
  unknown: 'neutral',
  goingLive: 'info',
  goingLiveUnknown: 'neutral',
  notLive: 'warn',
  live: 'ok',
  legacy: 'neutral',
  notStarted: 'neutral',
};

export interface BuildingProps {
  view: BuildsView;
  /** Open a build: its computer shown if needed, then its New script page (a legacy ask: a fresh New script). */
  onOpen: (l: BuildLine) => void;
  /** Open a change request's drawer. */
  onOpenChange: (a: ScriptAsk) => void;
}

/** The section. Shown only while this browser holds New script builds, when the shared store is full, or when it cannot be
 *  read. */
export function Building({ view, onOpen, onOpenChange }: BuildingProps) {
  const t = useStrings(strings);
  const [confirm, setConfirm] = useState<BuildLine | null>(null);
  const [confirmChange, setConfirmChange] = useState<ScriptAsk | null>(null);
  const [discarding, setDiscarding] = useState(false);
  if (view.status === 'ok' && view.lines.length === 0 && !view.full && !view.draftsFull) return null;

  if (view.status === 'unreadable') {
    return (
      <section className={s.section} aria-label={t('build.titlePlain')}>
        <ErrorState size="compact" title={t('build.unreadable')} onRetry={view.retry} /* noDetails: this browser's own store could not be read; Try again reads it */ />
      </section>
    );
  }

  const running = confirm ? mayRun(confirm.row) : false;
  // A draft under a deploy nobody answered for: the wizard's warning (the script may already be live).
  const live = confirm ? heldDeploy(confirm) : false;
  return (
    <section className={s.section} aria-label={t('build.titlePlain')}>
      <Disclosure title={t('build.title', { count: view.lines.length })} defaultExpanded>
        {/* One store-full note: the ask store's sentence when it is full (nothing can start then), else the draft
            store's (no draft can make room for a new one). */}
        {(view.full || view.draftsFull) && (
          <div className={s.note} role="note">
            <p>{view.full ? t('build.full', { max: SCRIPT_ASKS_MAX, n: view.full.n, m: view.full.m }) : t('build.draftsFull', { max: DRAFTS_MAX })}</p>
            {view.full && view.changes.length > 0 && (
              <Disclosure title={t('build.showChanges')}>
                <ul className={s.changes}>
                  {view.changes.map((c) => (
                    <li key={c.askId} className={s.change}>
                      <span className={s.mono}>{c.path}</span>
                      <span className={s.changeActions}>
                        <Button size="sm" onPress={() => onOpenChange(c)}>{t('build.open')}</Button>
                        <Button size="sm" variant="ghost" onPress={() => setConfirmChange(c)}>{t('build.discard')}</Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </div>
        )}
        {view.lines.length > 0 && (
          <ul className={s.rows}>
            {view.lines.map((l) => <Row key={l.entry.key} line={l} view={view} onOpen={onOpen} onDiscard={setConfirm} />)}
          </ul>
        )}
      </Disclosure>
      <ConfirmDialog
        isOpen={confirm !== null}
        onOpenChange={(o) => { if (!o && !discarding) setConfirm(null); }}
        title={live ? t('flow.live.discardWarn.title') : t('build.discardTitle')}
        body={live ? t('flow.live.discardWarn.body', { computer: confirm?.name ?? t('build.thisComputer') }) : running ? (confirm?.name ? t('build.discardBodyRunningOn', { computer: confirm.name }) : t('build.discardBodyRunning')) : t('build.discardBody')}
        confirmLabel={t('build.discard')}
        tone="danger"
        busy={discarding}
        onConfirm={() => {
          if (!confirm) return;
          setDiscarding(true);
          void view.discard(confirm).finally(() => {
            setDiscarding(false);
            setConfirm(null);
          });
        }}
      />
      <ConfirmDialog
        isOpen={confirmChange !== null}
        onOpenChange={(o) => { if (!o && !discarding) setConfirmChange(null); }}
        title={t('build.discardChangeTitle')}
        body={t('build.discardChangeBody')}
        confirmLabel={t('build.discard')}
        tone="danger"
        busy={discarding}
        onConfirm={() => {
          if (!confirmChange) return;
          setDiscarding(true);
          void view.discardChange(confirmChange).finally(() => {
            setDiscarding(false);
            setConfirmChange(null);
          });
        }}
      />
    </section>
  );
}

function Row({ line, view, onOpen, onDiscard }: { line: BuildLine; view: BuildsView; onOpen: (l: BuildLine) => void; onDiscard: (l: BuildLine) => void }) {
  const t = useStrings(strings);
  const { entry, row, name, label, step, stopping } = line;
  const text = label === null ? t('build.labelStarting') : label === '' ? t('build.labelUnknown') : label;
  const pill = stopping && row.pill === 'building' ? t('build.stopping') : t(`build.pill.${row.pill}` as never);
  const has = (a: string): boolean => (row.actions as readonly string[]).includes(a);
  return (
    <li className={s.row} data-pill={row.pill}>
      <span className={s.desc} dir="auto" title={text}>{text}</span>
      <span className={s.state}>
        <StatusPill tone={TONES[row.pill]} dot>{pill}</StatusPill>
        {step && !stopping ? <span className={s.step}>{t(`build.step.${step}` as never, { computer: name ?? t('build.thisComputer') })}</span> : null}
      </span>
      <span className={s.comp}>{name ?? ''}</span>
      <span className={s.age}>{entry.ask ? formatRelative(entry.ask.sentAt) : ''}</span>
      <span className={s.actions}>
        {has('check') && <Button size="sm" onPress={() => view.check(line)}>{t('build.check')}</Button>}
        {has('open') && <Button size="sm" variant={row.pill === 'ready' ? 'primary' : 'secondary'} onPress={() => onOpen(line)}>{t('build.open')}</Button>}
        {has('stop') && <Button size="sm" isDisabled={stopping} aria-label={name ? t('build.stopOn', { computer: name }) : undefined} onPress={() => void view.stop(line)}>{t('build.stop')}</Button>}
        {has('discard') && <Button size="sm" variant="ghost" onPress={() => onDiscard(line)}>{t('build.discard')}</Button>}
      </span>
    </li>
  );
}

// DockSession: the dock's transcript once its conversation has a session. The kit's SessionView draws it from the ACTIVE
// source built over the DOCK'S OWN engine (engineActive on a fixed handle: no registry hand-over, so the conversation stays the dock's
// and the dock never blanks under itself; opening the reference elsewhere hands it over, registry.openRef). The Composer
// sends on that same engine, so what it attaches or switches on the engine is what the source shows. Before a session
// exists (a draft, a first message on its way) the column the dock always had is drawn instead.
//
// What the dock's column did that the kit's transcript has no place for stays the dock's, read from the engine's own rules and acting on
// the engine: the hooks card with its working link to the Agent app (above the transcript); Check status / Stop tracking for a message
// still Queued or of unknown outcome, Check again after a turn whose end could not be read, and the way on after a failure Retry cannot
// help (a new conversation, the models page); the shell jobs the chat runs (all between the transcript and the composer). The dock draws
// its own bands for reaching the computer, so the transcript's "reach" line is not drawn a second time. The column's two hidden live
// regions (a finished reply, polite; a card's arrival, assertive) stay too: the log is not announced token by token.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  OutcomeBanner, SessionView, ShellJobRows, shownShellJobs, useNow, useSizeClass, useStrings,
  type ActiveSource, type ConvSnapshot, type ShellJobStops,
} from '@kit';
import { engineActive, liveDeps, type ActiveDeps, type EngineActive } from './active';
import * as C from './conv';
import { clean } from './code';
import { hideSecrets } from './md';
import { retryFor, retryWaits } from './rowActions';
import type { AskEngine, Snapshot } from './engine';
import { failureKey } from './logic';
import { CheckAgain, FailureExtras, HooksHeld, UserState } from './Column';
import { stopFor } from './Composer';
import type { ConvRef } from './registry';
import type { Host } from './source';
import strings from './strings.en.json';
import s from './Ask.module.css';

/** The host's menu for one finished reply (the kit's TurnMenu shape). */
type TurnMenu = (t: { key: string; turn: number }) => ReactNode;

/** The hooks block the engine draws as a card (its key is `h<turn>`). */
const isHooks = (b: ConvSnapshot['blocks'][number]): boolean => b.k === 'line' && /^h\d+$/.test(b.key);

/** The source as the dock draws it: without the hooks line (the dock draws that as its card), without the "reach" line (the dock's
 *  bands say it), without the note of a row the tail acts on, without the Check again of the line the tail offers it for, and
 *  without a failure line's page link (the tail draws the dock's own ways on, FailureExtras). The
 *  source's own operations are untouched: only the snapshot's
 *  blocks differ. `held`: the conversation has the hooks line. `woke`: counts the retry wakes (useRetryWake); a new count is a new view,
 *  and a rate-limited prompt gets its Retry once its time has come even when the source built its blocks before then (the source
 *  offers Retry only from the time it was last read; the engine publishes nothing when the time passes). */
function dockView(src: ActiveSource, eng: AskEngine | null, woke: number): { view: ActiveSource; held: (s: ConvSnapshot) => boolean } {
  let last: { inner: ConvSnapshot; view: ConvSnapshot; w: string } | null = null;
  const snapshot = (): ConvSnapshot => {
    const inner = src.snapshot();
    const es = eng ? eng.getSnapshot() : null;
    const ids = new Set(es ? waitingRows(es).map((m) => 'u' + m.id) : []);
    const due = es ? retryDue(es, Date.now()) : null;
    // The tail's Check again (a last turn whose end could not be read): the kit's Check again on that same line would be a second
    // one. Read only while some line offers it, so a chat with none pays nothing.
    const tail = es && inner.blocks.some((b) => b.k === 'line' && b.recheck) ? tailUnsureKey(es) : null;
    const w = [...ids].join() + '|' + String(due) + '|' + String(woke) + '|' + String(tail);
    if (last && last.inner === inner && last.w === w) return last.view;
    const drop = (b: ConvSnapshot['blocks'][number]): boolean => (b.k === 'line' && (isHooks(b) || b.key === 'reach'));
    const late = (b: ConvSnapshot['blocks'][number]): boolean => b.k === 'user' && due !== null && b.key === 'u' + due && !!b.text && !b.actions?.includes('retry');
    const tailChecks = (b: ConvSnapshot['blocks'][number]): boolean => b.k === 'line' && !!b.recheck && b.key === tail;
    const touched = inner.blocks.some((b) => drop(b) || late(b) || tailChecks(b) || (b.k === 'line' && !!b.link) || (b.k === 'user' && ids.has(b.key) && !!b.note));
    const fix = (b: ConvSnapshot['blocks'][number]): ConvSnapshot['blocks'][number] => {
      if (b.k === 'line' && b.link) { const { link: _link, ...rest } = b; return fix(rest); }
      if (b.k === 'line' && tailChecks(b)) { const { recheck: _recheck, ...rest } = b; return rest; }
      const kept = b.k === 'user' && ids.has(b.key) && b.note ? omitNote(b) : b;
      return late(kept) && kept.k === 'user' ? { ...kept, actions: [...(kept.actions ?? []), 'retry'] } : kept;
    };
    const view = touched ? { ...inner, blocks: inner.blocks.filter((b) => !drop(b)).map(fix) } : inner;
    last = { inner, view, w };
    return view;
  };
  return { view: Object.create(src, { snapshot: { value: snapshot } }) as ActiveSource, held: (sn) => sn.blocks.some(isHooks) };
}
/** The key of the "could not tell how it ended" block when it is the conversation's last (the tail then draws Check again), else null. */
function tailUnsureKey(es: Snapshot): string | null {
  const bs = C.blocks(es.conv, 0);
  const lastB = bs[bs.length - 1];
  return lastB?.k === 'unsure' ? lastB.key : null;
}
function omitNote(b: Extract<ConvSnapshot['blocks'][number], { k: 'user' }>): ConvSnapshot['blocks'][number] {
  const { note: _note, ...rest } = b;
  // The tail's line has Check status for this row: the kit's Check again beside the bubble would be a second one.
  return b.actions?.includes('check') ? { ...rest, actions: b.actions.filter((a) => a !== 'check') } : rest;
}

/** The chat's shell jobs: the source's own store, drawn only while it has a row to show (ages read at each render). */
function Jobs({ stops }: { stops: ShellJobStops }) {
  const snap = useSyncExternalStore(stops.subscribe, stops.snapshot, stops.snapshot);
  useNow(true, 60_000);
  return snap && shownShellJobs(snap).length > 0 ? <div className={s.dockJobs}><ShellJobRows stops={stops} now={Date.now()} /></div> : null;
}

export interface DockSessionProps {
  /** The dock's own engine, and the reference of the conversation it holds (null until it has a session and a realm). */
  eng: AskEngine;
  conv: ConvRef | null;
  /** The page's words for where the chat runs. */
  host: Host;
  agentUrl: string;
  typing: boolean;
  empty: ReactNode;
  /** A band above the transcript (cannot reach, connection lost). */
  top?: ReactNode;
  turnMenu?: TurnMenu;
  /** A Not sent message taken back: its text goes to the composer (its files stay with the engine's draft). */
  onTakeBack: (text: string) => void;
  /** What the dock draws while there is no source (no session yet). */
  fallback: ReactNode;
  /** The page's leases and approvers the source reads its readiness from (tests give their own; the page's own by default). */
  deps?: ActiveDeps;
}

/** The active source over the dock's engine for one conversation; released when the conversation or the engine changes. */
function useDockSource(eng: AskEngine, conv: ConvRef | null, host: Host, deps?: ActiveDeps): ActiveSource | null {
  const key = conv ? `${conv.computer}|${conv.realm}|${conv.sid}` : '';
  const hostRef = useRef(host);
  hostRef.current = host;
  const [held, setHeld] = useState<{ k: string; e: AskEngine; source: EngineActive } | null>(null);
  useEffect(() => {
    if (!conv) { setHeld(null); return; }
    // The handle is the dock engine itself, never ended or swapped by this source (the dock owns its life).
    const source = engineActive({ current: () => eng, release: () => undefined }, conv, () => hostRef.current, deps ?? liveDeps());
    setHeld({ k: key, e: eng, source });
    return () => source.release();
    // `key` names the conversation; `conv` itself is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eng, key]);
  // A source for an earlier conversation or engine is never shown for the current one, even for the render before the effect runs.
  return held && held.k === key && held.e === eng ? held.source : null;
}

export function DockSession(p: DockSessionProps) {
  const source = useDockSource(p.eng, p.conv, p.host, p.deps);
  return source ? <DockSessionView {...p} source={source} /> : <>{p.fallback}</>;
}

/** The rows the dock's tail acts on: a message still Queued or of unknown outcome, in transcript order. */
function waitingRows(snap: Snapshot): C.UserMsg[] {
  return C.blocks(snap.conv, 0).flatMap((b) => (b.k === 'user' && (b.msg.state === 'queued' || b.msg.state === 'unknown') ? [b.msg] : []));
}

/** What sits between the transcript and the composer: the shell jobs, and what the dock's column let the person do that the kit's
 *  transcript cannot (see the head of this file). Everything reads the engine's own rules (rowActions.ts) and acts on the engine. */
function Tail({ eng, snap, stops, t }: { eng: AskEngine; snap: Snapshot; stops: ShellJobStops | null; t: ReturnType<typeof useStrings<typeof strings>> }) {
  const bs = C.blocks(snap.conv, 0);
  const last = bs[bs.length - 1];
  const rows = waitingRows(snap);
  const extras = last && (last.k === 'outcome' && last.state === 'failed' ? { code: last.code, ended: true } : last.k === 'error' ? { code: last.code, ended: false } : null);
  const kind = extras ? failureKey(extras.code) : '';
  const showExtras = !!extras && (kind === 'ask.tooLong' || kind === 'ask.noModel');
  const unsure = last?.k === 'unsure';
  const modeUnread = snap.modeUnread === true;
  if (!rows.length && !showExtras && !unsure && !stops && !modeUnread) return null;
  return (
    <>
      {rows.map((m) => (
        <div key={m.id} className={s.dockPending}>
          {rows.length > 1 && <span className={s.dockPendingText}>{clean(m.text, 80).text}</span>}
          <UserState msg={m} eng={eng} t={t as never} />
        </div>
      ))}
      {(showExtras || unsure) && (
        <div className={s.errorActions}>
          {showExtras && <FailureExtras kind={kind} ended={extras!.ended} eng={eng} t={t as never} />}
          {unsure && <CheckAgain eng={eng} t={t as never} />}
        </div>
      )}
      {modeUnread && <OutcomeBanner kind="pending" title={t('ask.modeUnread.title')} body={t('ask.modeUnread')} onCheck={() => eng.checkMode()} />}
      {stops && <Jobs stops={stops} />}
    </>
  );
}

/** The column's announcements: only a finished reply (polite) and a card's arrival (assertive), never each streamed token. */
function Announce({ snap, t }: { snap: Snapshot; t: ReturnType<typeof useStrings<typeof strings>> }) {
  const bs = C.blocks(snap.conv, 0);
  const reply = [...bs].reverse().find((b) => b.k === 'reply' && b.final && !b.streaming) as Extract<C.Block, { k: 'reply' }> | undefined;
  const gate = snap.gates[snap.gates.length - 1];
  // Read as the reply is shown: keys hidden before cleaning.
  const said = reply ? clean(hideSecrets(C.withoutCloseMarker(reply.text)), 300).text : '';
  const asked = gate ? (gate.gate.kind === 'confirm' ? t('ask.needsApproval') : t('ask.needsAnswer')) : '';
  return (
    <>
      <span className={s.srOnly} aria-live="polite">{said}</span>
      <span className={s.srOnly} aria-live="assertive">{asked}</span>
    </>
  );
}

/** The dock's transcript over a given source (the part DockSession adds the source to). */
export function DockSessionView({ source, eng, agentUrl, typing, empty, top, turnMenu, onTakeBack }: DockSessionProps & { source: ActiveSource }) {
  const t = useStrings(strings);
  const snap = useSyncExternalStore(source.subscribe, source.snapshot, source.snapshot);
  const engSnap = useSnapshotOf(eng);
  const woke = useRetryWake(retryAtOf(engSnap, Date.now()));
  const split = useMemo(() => dockView(source, eng, woke), [source, eng, woke]);
  const [ref, size] = useSizeClass<HTMLDivElement>('s');
  const stops = useMemo(() => source.shellJobs?.() ?? null, [source]);
  const hooks = split.held(snap);
  const above = hooks || top ? <>{top}{hooks && <HooksHeld agentUrl={agentUrl} t={t} />}</> : undefined;
  return (
    <div ref={ref} className={s.dockSession}>
      {above}
      <SessionView source={split.view} size={size} agentUrl={agentUrl} typing={typing} empty={empty} turnMenu={turnMenu} onTakeBack={onTakeBack} takeBackFiles stop={engSnap && eng ? stopFor(engSnap, () => eng.stop(), true) : null} />
      {engSnap ? <Tail eng={eng} snap={engSnap} stops={stops} t={t} /> : stops && <Jobs stops={stops} />}
      {engSnap && <Announce snap={engSnap} t={t} />}
    </div>
  );
}

/** The prompt a rate-limited failure's Retry belongs to once its time has come: the rule the kit's source applies (source.ts), read at `now`. */
function retryDue(snap: Snapshot, now: number): string | null {
  const bs = C.blocks(snap.conv, 0);
  const last = bs[bs.length - 1];
  return last && last.k === 'outcome' && last.retryAt && !retryWaits(last, now) ? retryFor(last, true) : null;
}

/** The time (ms) a rate-limited failure's Retry comes, none when nothing waits. */
export function retryAtOf(snap: Snapshot | null, now: number): number | null {
  if (!snap) return null;
  const bs = C.blocks(snap.conv, 0);
  const last = bs[bs.length - 1];
  return last && last.k === 'outcome' && last.retryAt && retryWaits(last, now) ? Date.parse(last.retryAt) : null;
}

/** The longest delay a timer takes (a larger one fires at once). */
export const MAX_TIMER_MS = 2 ** 31 - 1;

/** A rate-limited failure's Retry is offered only once its time has come, and the engine publishes nothing then: this counts a wake at
 *  that time (the dock's view is made again). A time further away than a timer can wait is waited for in steps. */
export function useRetryWake(at: number | null): number {
  const [woke, setWoke] = useState(0);
  useEffect(() => {
    if (at === null) return undefined;
    let id: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      const left = at - Date.now() + 50;
      if (left <= 0) { setWoke((n) => n + 1); return; }
      id = setTimeout(arm, Math.min(left, MAX_TIMER_MS));
    };
    arm();
    return () => clearTimeout(id);
  }, [at]);
  return woke;
}

const noEng = (): (() => void) => () => undefined;
const noSnap = (): Snapshot | null => null;
/** The engine's snapshot; none for a view given a source and no engine (a test's fake). */
function useSnapshotOf(eng: AskEngine | null): Snapshot | null {
  return useSyncExternalStore(eng ? eng.subscribe : noEng, eng ? eng.getSnapshot : noSnap, eng ? eng.getSnapshot : noSnap);
}

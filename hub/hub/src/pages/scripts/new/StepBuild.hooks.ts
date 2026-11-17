// New script's Build step hooks (split out of StepBuild.tsx so the terminal build shares them; the notes are at the top
// of StepBuild.tsx, which re-exports every name here). fixes and started are one Set each, never copied.
import { resumableStream } from '@core';
import { useEffect, useRef, useState } from 'react';
import { refusedOf, buildOf, maps, admitting, repairGen } from './StepBuild.pure';
import type { Answer, Build } from './StepBuild.pure';
import { attemptPrompt, storedBuildReads, useBuildApi, type Binding } from '../data';
import { routes as R } from '../routes';
import { buildPrompt, repairOf, type PromptBlock } from './prompt';
import { ensureRecord, type BuildRun } from './record';
import { attemptUsable, nextAttempt, readDraftRecord } from './records';
import { promptIsFix } from './recover';
import type { DraftRecord } from '@core';
import { cursor, frame, replay, resynced, snapshot, start, type Progress } from './progress';
import type { BuiltWith } from './draft';

/** What "Ask the assistant to fix it" asks about: the code as it is and Check's problems, raw (masked before anything is sent). */
export interface Fix { code: string; problems: string[] }

export interface UseBuild {
  build: Build;
  /** Start attempt n+1 (the description, address, schedule and folder as they are now; `fix`: Check's code and problems, sent masked). */
  run: (fix?: Fix) => Promise<void>;
  stop: () => Promise<void>;
  checkAgain: () => Promise<void>;
  /** Build again was pressed while the last attempt's end is unknown: asks first. */
  askReplace: boolean;
  confirmReplace: () => Promise<void>;
  cancelReplace: () => void;
  builtWith: BuiltWith | null;
  /** Keep this code: the code stays, and the inputs it is now judged against are the current ones. */
  keep: (w: BuiltWith) => void;
}

// Each fix attempt of this tab and its secret map, in this tab's memory only: never stored, so a reload or another tab
// cannot apply it. They outlive the page (coming back to the draft keeps them). The map goes with the draft's memory (Flow
// drops both together); that an attempt was a fix is kept for the tab's life, so a fix answer whose map is gone is refused
// (answerCode map_lost), never read as a plain build.
const fixes = new Set<string>();
// The attempts this tab started, fix or not: their kind is the prompt this tab wrote. Any other attempt's kind is read from its
// stored prompt at settle (recover.ts promptIsFix), so a reload or another tab never reads a repair as a plain build.
const started = new Set<string>();
const repairKey = (draftId: string, n: number) => `${draftId}#${n}`;
/** Runs `body` with the draft's admission counted, so `forgetRepairs` fences it; `body` gets the generation taken at start. */
async function admission<T>(draftId: string, body: (gen: number) => Promise<T>): Promise<T> {
  admitting.set(draftId, (admitting.get(draftId) ?? 0) + 1);
  try { return await body(repairGen(draftId)); } finally {
    const left = (admitting.get(draftId) ?? 1) - 1;
    if (left > 0) admitting.set(draftId, left); else admitting.delete(draftId);
  }
}

/** An attempt this tab did not start: a fix exactly when its stored prompt says so; a prompt that cannot be read, or is not the
 *  Hub's shape, settles as a fix (its answer then reads map_lost without this tab's map, never applied as a plain build). */
async function storedIsFix(b: Binding | null, draftId: string, n: number): Promise<boolean> {
  const p = b ? await attemptPrompt(b, draftId, n).catch(() => 'unreadable' as const) : 'unreadable';
  return promptIsFix(typeof p === 'object' ? p.text : null);
}

/**
 * The attempts of one draft. `onCode` receives a usable answer's code (only from the current attempt); `onAttempt` the
 * attempt number the draft now holds.
 */
export function useBuild(o: {
  binding: Binding | null;
  draftId: string;
  attempt: number;
  /** The draft's build baseline (Draft.builtWith): kept with the draft, so a remount of the wizard never loses it. */
  builtWith: BuiltWith | null;
  onBuiltWith: (w: BuiltWith) => void;
  input: () => { description: string; block: PromptBlock; with: BuiltWith };
  onAttempt: (n: number) => void;
  onCode: (code: string, summary: string) => void;
}): UseBuild {
  const api = useBuildApi();
  const [build, setBuild] = useState<Build>(o.attempt > 0 ? { k: 'unknown', n: o.attempt } : { k: 'idle' });
  const [askReplace, setAskReplace] = useState<Fix | false | null>(null);
  // The attempt answers are accepted for: a late answer of another one is ignored.
  const current = useRef(o.attempt);
  const stopping = useRef(false);
  const latest = useRef(o);
  latest.current = o;

  // The record generation this tab allocated the current attempt in: its answer is used only while that still holds.
  const gen = useRef<DraftRecord | null>(null);
  const settle = async (n: number, a: Answer | null) => {
    if (n !== current.current) return;
    const key = repairKey(latest.current.draftId, n);
    const fix = started.has(key) ? fixes.has(key) : await storedIsFix(latest.current.binding, latest.current.draftId, n);
    if (n !== current.current) return;
    const b = buildOf(n, a, stopping.current, { fix, map: maps.get(key) ?? null });
    stopping.current = false;
    if (b.k !== 'ready') { setBuild(b); return; }
    // A usable answer becomes the draft's only when the record says attempt n is still current (another tab may have moved on).
    // A draft this page did not start the attempt in (it came back to the draft) has no generation yet: the stored record decides.
    const stored = gen.current ? null : readDraftRecord(latest.current.draftId);
    const prev = gen.current ?? (stored && stored !== 'unreadable' ? stored : null);
    const used = prev ? await attemptUsable(prev, n).catch(() => ({ use: false, record: null, why: 'unreadable' as const })) : { use: false, record: null, why: stored === 'unreadable' ? ('unreadable' as const) : ('gone' as const) };
    if (n !== current.current) return;
    if (!used.use) { setBuild({ k: 'refused', why: refusedOf(used.why) }); return; }
    // attemptUsable may await closing the attempt it replaced: another tab can move the draft on meanwhile. The record as
    // stored now decides again before the answer is applied.
    const now = readDraftRecord(latest.current.draftId);
    if (now === 'unreadable' || now === null) { setBuild({ k: 'refused', why: now === null ? 'stale' : 'unreadable' }); return; }
    if (now.state !== 'open' || now.current !== n) { setBuild({ k: 'refused', why: now.state !== 'open' ? 'deploying' : 'stale' }); return; }
    gen.current = now;
    setBuild(b);
    latest.current.onCode(b.code, b.summary);
  };

  /** Starts the next attempt. `replacing`: the attempt whose end is unknown, ended only once the new one is admitted. */
  const begin = async (fix?: Fix, replacing?: number) => {
    const { binding, draftId } = latest.current;
    if (!binding) return;
    const inp = latest.current.input();
    // A fix is sent with every literal secret of the code and the problems masked; the map stays with the attempt.
    const repair = fix ? repairOf(fix.code, fix.problems) : null;
    if (repair && 'error' in repair) { setBuild({ k: 'refused', why: 'placeholder' }); return; }
    const block = repair ? { ...inp.block, fix: repair.fix } : inp.block;
    const prompt = buildPrompt(inp.description, block);
    if (!prompt.ok) { setBuild({ k: 'refused', why: 'input' }); return; }
    setBuild({ k: 'starting' });
    const ready = build.k === 'ready' && build.n === current.current;
    const r = await admission(draftId, async (g0) => {
      const opened = await ensureRecord(draftId, 'ai', binding).catch(() => ({ ok: false as const, why: 'unreadable' as const }));
      if (!opened.ok) return opened;
      // The next attempt follows the one this tab holds: a draft another tab has moved on is refused, never adopted.
      if (opened.record.current !== current.current) return { ok: false as const, why: 'stale' as const };
      const next = await nextAttempt(opened.record, ready).catch(() => ({ ok: false as const, why: 'unreadable' as const }));
      // The draft was dropped while this was admitted: its memory is gone, so nothing of the attempt is kept here.
      if (next.ok && repairGen(draftId) !== g0) return { ok: false as const, why: 'dropped' as const };
      if (next.ok) started.add(repairKey(draftId, next.record.current));
      if (next.ok && repair) { fixes.add(repairKey(draftId, next.record.current)); maps.set(repairKey(draftId, next.record.current), repair.map); }
      return next;
    });
    if (!r.ok) { if (r.why !== 'dropped') setBuild({ k: 'refused', why: refusedOf(r.why) }); return; }
    gen.current = r.record;
    const n = r.record.current;
    current.current = n;
    latest.current.onAttempt(n);
    latest.current.onBuiltWith(inp.with);
    setBuild({ k: 'running', n });
    // Yes to "start a new one anyway" ends the last attempt knowingly (closeAsk), after the new one is admitted.
    if (replacing !== undefined) await api.discard(binding, draftId, replacing).catch(() => 'unknown');
    const a = await api.start(binding, draftId, n, prompt.text, repair ? repair.map : undefined).catch(() => null);
    await settle(n, a);
  };

  const run = async (fix?: Fix) => {
    const n = current.current;
    // A running attempt is stopped first; an end we cannot tell asks before a new one starts.
    if (build.k === 'running' || build.k === 'stopping' || build.k === 'unknown') {
      const { binding, draftId } = latest.current;
      const stopped = binding && build.k !== 'unknown' ? await api.cancel(binding, draftId, n).catch(() => 'unknown' as const) : 'unknown';
      if (stopped !== true) { setAskReplace(fix ?? false); return; }
    }
    await begin(fix);
  };

  const stop = async () => {
    const { binding, draftId } = latest.current;
    const n = current.current;
    if (!binding || build.k !== 'running') return;
    stopping.current = true;
    setBuild({ k: 'stopping', n });
    const r = await api.cancel(binding, draftId, n).catch(() => 'unknown' as const);
    // Only the attempt's own end says "Stopped" (its answer settles it); an unknown cancel says so.
    if (r !== true && n === current.current) setBuild((b) => (b.k === 'stopping' ? { k: 'unknown', n, stop: true } : b));
  };

  const checkAgain = async () => {
    const { binding, draftId } = latest.current;
    const n = current.current;
    if (!binding || n === 0) return;
    const a = await api.check(binding, draftId, n).catch(() => null);
    await settle(n, a);
  };

  const confirmReplace = async () => {
    const fix = askReplace || undefined;
    setAskReplace(null);
    await begin(fix, current.current);
  };

  return { build, run, stop, checkAgain, askReplace: askReplace !== null, confirmReplace, cancelReplace: () => setAskReplace(null), builtWith: o.builtWith, keep: (w) => latest.current.onBuiltWith(w) };
}

/** The progress of attempt n: its session's replay, then its stream from the replay's cursor. */
export function useBuildProgress(b: Binding | null, r: BuildRun | null, on: boolean): Progress {
  const [p, setP] = useState<Progress>(() => start(r?.turnId));
  const sid = r?.sid ?? null;
  const turnId = r?.turnId ?? null;
  const resync = p.resync;
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!on || !b || !sid || !turnId) return;
    let live = true;
    let close: (() => void) | null = null;
    const reads = storedBuildReads;
    void (async () => {
      const [state, rp] = await Promise.all([reads.state(b, sid), reads.replay(b, sid)]);
      if (!live) return;
      let q = round === 0 ? start(turnId) : resynced(p);
      const since = state !== 'unreadable' && state && typeof state === 'object' ? (state as Record<string, unknown>).turn_since : undefined;
      if (rp !== 'unreadable') q = replay(q, { events: rp.events, incarnation: rp.incarnation, min_seq: rp.minSeq, max_seq: rp.maxSeq }, since, Date.now());
      if (state !== 'unreadable') q = snapshot(q, state);
      setP(q);
      const from = cursor(q);
      const st = resumableStream(R.stream, {
        target: b.target,
        params: { sid },
        keys: { since: 'since', incarnation: 'incarnation' },
        from: { since: from.since, ...(from.incarnation ? { incarnation: from.incarnation } : {}) },
        onEvent: (name, data) => {
          let json: unknown = null;
          try { json = JSON.parse(data); } catch { return; }
          setP((x) => frame(x, name, json, Date.now()));
        },
        onResync: () => { if (live) setRound((x) => x + 1); },
      });
      close = st.close;
    })();
    return () => { live = false; close?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new attempt, session or resync round reopens it
  }, [on, b?.target.container.id, sid, turnId, round]);
  // A frame asked for the replay again (a gap or another incarnation).
  useEffect(() => { if (resync) setRound((x) => x + 1); }, [resync]);
  return p;
}

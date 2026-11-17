// building.ts: what the "Being built in this browser" section shows.
// Pure: this browser's draft records and stored asks, and what has been read for each build, go in; the rows, their pills and
// actions come out. The reads (each build on its own computer: bindingOfRecord + storedBuildReads) and the sends (Stop,
// Discard) are made by parts/Building.tsx.
//
// Which builds (the draft records): each New script draft that holds a stored attempt ask (its current attempt, else its retained one),
// every open draft that reserved an attempt whose ask is not stored (nothing was sent: the writer stores the ask before it sends;
// it holds a draft slot that admission never takes, so it is listed with Discard), every draft under a deploy or its cleanup, every stored attempt ask whose draft has ended or is gone (it still holds a slot),
// and every legacy New script ask (path null: an ask stored without a step path). A "Change with AI" ask is not a build; the full-store note
// counts it beside the builds.
//
// Truth rules (C9): a read that failed, a body that is not the published shape, a receipt of another turn, a state this file
// does not know, a computer missing from a whole list or a record that cannot name its computer is "can't tell yet", never a
// failure and never done. "No usable script" is shown only when the transcript was read and positively holds none.
import { DRAFTS_MAX, SCRIPT_ASKS_MAX, type DraftRecord, type ScriptAsk } from '@core';
import type { Binding } from './data';
import { extract } from './logic';
import { deployStale, victimOf } from './new/records';
import { MARKER } from './new/prompt';
import { attemptOf, replyOf, type Receipt } from './writer';

export interface BuildEntry {
  /** Stable row key: the draft id, or the ask id of a legacy ask or a leftover attempt. */
  key: string;
  draftId: string | null;
  /** The draft's record; null for a legacy ask and for an attempt whose draft has ended or is gone. */
  record: DraftRecord | null;
  /** The attempt ask the row shows (the deploy's attempt, else the current one, else the retained one); null when none is stored. */
  ask: ScriptAsk | null;
  /** Every stored ask of this row (all attempts of the draft): Discard closes each where it was made. */
  asks: readonly ScriptAsk[];
  legacy: boolean;
}

export interface BuildList {
  entries: BuildEntry[];
  /** Stored asks held by New script (attempts and legacy) and by "Change with AI" requests. */
  builds: number;
  changes: number;
  /** The change requests, for the full-store disclosure. */
  changeAsks: ScriptAsk[];
  /** The shared store cannot take another ask (SCRIPT_ASKS_MAX): starting a build or a change is blocked. */
  full: boolean;
  /** The draft store holds DRAFTS_MAX records and none can make room (victimOf): a new draft is refused until one is discarded. */
  draftsFull: boolean;
}

const LISTED: ReadonlySet<DraftRecord['state']> = new Set(['open', 'deploying', 'live_cleanup']);

/** The rows of this browser's builds, oldest first. */
export function listOf(drafts: readonly DraftRecord[], asks: readonly ScriptAsk[]): BuildList {
  const byDraft = new Map<string, ScriptAsk[]>();
  const legacy: ScriptAsk[] = [];
  const changeAsks: ScriptAsk[] = [];
  for (const a of asks) {
    if (a.path === null) { legacy.push(a); continue; }
    const at = attemptOf(a.path);
    if (!at) {
      // A New script place this page cannot read back is still a build's slot, never a change request.
      if (a.path.startsWith('new:')) legacy.push(a);
      else changeAsks.push(a);
      continue;
    }
    const l = byDraft.get(at.draftId) ?? [];
    l.push(a);
    byDraft.set(at.draftId, l);
  }
  const nOf = (a: ScriptAsk): number => attemptOf(a.path)?.n ?? -1;
  const entries: Array<BuildEntry & { at: number }> = [];
  const seen = new Set<string>();
  for (const r of drafts) {
    if (!LISTED.has(r.state)) continue;
    const mine = byDraft.get(r.draftId) ?? [];
    const pick = (n: number | null | undefined): ScriptAsk | null => (n === null || n === undefined ? null : mine.find((a) => nOf(a) === n) ?? null);
    const ask = (r.state === 'deploying' ? pick(r.deploy?.attempt) : null) ?? pick(r.current) ?? pick(r.retained);
    // An open draft with no stored attempt and none reserved has nothing being built (an idea or a write draft).
    if (r.state === 'open' && !ask && r.current === 0) continue;
    seen.add(r.draftId);
    entries.push({ key: r.draftId, draftId: r.draftId, record: r, ask, asks: mine, legacy: false, at: ask?.sentAt ?? r.updatedAt });
  }
  for (const [draftId, mine] of byDraft) {
    if (seen.has(draftId)) continue;
    // A draft that ended (made live, discarded) or is gone while its attempt asks are still stored: each still holds a slot.
    const last = mine.reduce((x, y) => (nOf(y) > nOf(x) ? y : x));
    entries.push({ key: `${draftId}:${last.askId}`, draftId, record: null, ask: last, asks: mine, legacy: false, at: last.sentAt });
  }
  for (const a of legacy) entries.push({ key: a.askId, draftId: null, record: null, ask: a, asks: [a], legacy: true, at: a.sentAt });
  entries.sort((x, y) => x.at - y.at || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
  return {
    entries: entries.map(({ at: _at, ...e }) => e),
    builds: asks.length - changeAsks.length,
    changes: changeAsks.length,
    changeAsks,
    full: asks.length >= SCRIPT_ASKS_MAX,
    draftsFull: drafts.length >= DRAFTS_MAX && victimOf(drafts, asks) === null,
  };
}

export type BuildPill =
  | 'checking'
  | 'starting'
  | 'building'
  | 'reading'
  | 'ready'
  | 'unusable'
  | 'stopped'
  | 'interrupted'
  | 'failed'
  | 'unknown'
  | 'goingLive'
  | 'goingLiveUnknown'
  | 'notLive'
  | 'live'
  | 'legacy'
  | 'notStarted';
export type BuildAction = 'open' | 'stop' | 'discard' | 'check';

/** What has been read for one row; each is undefined until read. */
export interface BuildFacts {
  /** bindingOfRecord of the row's ask: null when its computer is missing from a whole list, 'unknown' when that cannot be told. */
  binding?: Binding | null | 'unknown';
  receipt?: Receipt | null | 'unreadable';
  /** GET /sessions/{sid}/transcript, read once the receipt is completed. */
  transcript?: unknown;
}

export interface BuildRow {
  pill: BuildPill;
  actions: readonly BuildAction[];
  /** 'unusable' and 'failed': the ai.err.* suffix (an extract error, NO_REPLY, or the agent's code). */
  why?: string;
}

const UNKNOWN: BuildRow = { pill: 'unknown', actions: ['check', 'open', 'discard'] };
const ENDED: readonly BuildAction[] = ['open', 'discard'];

/** The row's pill and actions. Open needs the draft's record (a legacy ask opens a fresh New script; the page
 *  that settled it is retired, so Discard is how its slot is freed). A draft under a
 *  deploy nobody answered for (held, or its sender's beat stale) is offered Check (a fresh read of the reservation's computer) and
 *  the wizard's warned Discard (it may already be live, so the Discard is warned); any other
 *  deploy is the wizard's alone. An attempt whose draft ended or is gone is offered Discard in every state, so its slot can
 *  always be freed. */
export function rowOf(e: BuildEntry, f: BuildFacts, now = Date.now()): BuildRow {
  const row = rawRow(e, f, now);
  if (e.record || e.legacy) return row;
  const actions = row.actions.filter((a) => a !== 'open');
  return { ...row, actions: actions.includes('discard') ? actions : [...actions, 'discard'] };
}

function rawRow(e: BuildEntry, f: BuildFacts, now: number): BuildRow {
  if (e.legacy) return { pill: 'legacy', actions: ['open', 'discard'] };
  const r = e.record;
  if (r?.state === 'live_cleanup') return { pill: 'live', actions: ['open'] };
  if (r?.state === 'deploying') {
    const d = r.deploy;
    if (d?.phase === 'didnt') return { pill: 'notLive', actions: ['open'] };
    if (d?.phase === 'sending' && !deployStale(r, now)) return { pill: 'goingLive', actions: ['open'] };
    return { pill: 'goingLiveUnknown', actions: ['check', 'open', 'discard'] };
  }
  const a = e.ask;
  // A reserved attempt whose ask is not stored was never sent: nothing runs, so Discard needs no stop.
  if (!a) return r?.state === 'open' ? { pill: 'notStarted', actions: ['open', 'discard'] } : UNKNOWN;
  if (a.phase === 'create' || a.phase === 'turn') return { pill: 'starting', actions: ['open'] };
  if (f.binding === undefined) return { pill: 'checking', actions: ['open'] };
  if (f.binding === null || f.binding === 'unknown') return UNKNOWN;
  // A turn whose answer was lost: only the session's own receipts can say whether it was admitted.
  if (a.phase === 'lost' || !a.sessionId || !a.turnId) return UNKNOWN;
  if (f.receipt === undefined) return { pill: 'checking', actions: ['open'] };
  if (f.receipt === null || f.receipt === 'unreadable' || f.receipt.turnId !== a.turnId) return UNKNOWN;
  const rc = f.receipt;
  if (!rc.ended) return rc.state === 'accepted' || rc.state === 'dispatched' ? { pill: 'building', actions: ['open', 'stop', 'discard'] } : UNKNOWN;
  if (rc.state === 'cancelled') return { pill: 'stopped', actions: ENDED };
  if (rc.state === 'interrupted') return { pill: 'interrupted', actions: ENDED };
  if (rc.state === 'failed') return { pill: 'failed', actions: ENDED, why: rc.code };
  if (rc.state !== 'completed') return UNKNOWN;
  if (f.transcript === undefined) return { pill: 'reading', actions: ['open'] };
  const reply = replyOf(f.transcript);
  if (reply.kind === 'unreadable') return UNKNOWN;
  if (reply.kind === 'none') return { pill: 'unusable', actions: ENDED, why: 'NO_REPLY' };
  const x = extract(reply.text, true);
  if ('error' in x) return { pill: 'unusable', actions: ENDED, why: x.error };
  return { pill: 'ready', actions: ENDED };
}

/** Rows read again every 5 s while the page is visible (settled rows are read once). */
export const unsettled = (row: BuildRow): boolean => row.pill === 'checking' || row.pill === 'starting' || row.pill === 'building' || row.pill === 'reading' || row.pill === 'unknown';
/** GET /state (the step words) is read only for Building rows. */
export const readsState = (row: BuildRow): boolean => row.pill === 'building';
/** A build that may be running (or may start to): Discard warns for it and tries its cancel first; a cancel it cannot
 *  address (no turn yet, no computer) counts as not confirmed. A legacy ask is never read, so its turn may still run. */
export const mayRun = (row: BuildRow): boolean => row.pill === 'building' || row.pill === 'unknown' || row.pill === 'checking' || row.pill === 'starting' || row.pill === 'legacy';

export type StepWord = 'model' | 'gate' | 'routes' | 'validate' | 'monitor';
const TOOL_WORDS: Readonly<Record<string, StepWord>> = { hoody_exec_routes: 'routes', hoody_exec_validate: 'validate', hoody_exec_monitor: 'monitor' };
/** A Building row's step words from GET /state's current_step (as far as it tells): null when it tells nothing worded. */
export function stepOf(state: unknown): StepWord | null {
  const cs = isPlain(state) ? state.current_step : undefined;
  if (!isPlain(cs)) return null;
  if (cs.kind === 'model' || cs.kind === 'gate') return cs.kind;
  if (cs.kind === 'tool' && typeof cs.tool === 'string' && Object.hasOwn(TOOL_WORDS, cs.tool)) return TOOL_WORDS[cs.tool] ?? null;
  return null;
}

const isPlain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const MARKERISH = /^ +\[Hoody New script v1\]$/;
/**
 * The row's label from GET /sessions/{sid} (`session.first_message`): the person's description only, cut at the Hub's marker
 * (the first line equal to it after a blank line), never the block after it. null: no session yet ("Starting…"); '': not
 * readable ("A new script").
 */
export function labelOf(ask: Pick<ScriptAsk, 'sessionId'> | null, session: unknown): string | null {
  if (!ask?.sessionId) return null;
  const s = isPlain(session) && isPlain(session.session) ? session.session : null;
  const fm = s && s.id === ask.sessionId ? s.first_message : undefined;
  if (typeof fm !== 'string') return '';
  const lines = fm.replace(/\r\n?/g, '\n').split('\n');
  let end = lines.length;
  for (let i = 1; i < lines.length; i++) if (lines[i] === MARKER && lines[i - 1] === '') { end = i; break; }
  return lines.slice(0, end).map((l) => (MARKERISH.test(l) ? l.slice(1) : l)).join(' ').replace(/\s+/g, ' ').trim();
}

/** The computer's name from the containers answer (the row the binding came from); null when it is not listed. */
export function computerNameOf(containers: unknown, b: Binding): string | null {
  const body = isPlain(containers) && isPlain(containers.data) ? containers.data : containers;
  const rows = isPlain(body) && Array.isArray(body.computers) ? (body.computers as unknown[]) : [];
  const row = rows.find((c) => isPlain(c) && c.id === b.target.container.id && c.project_id === b.target.project.id);
  return isPlain(row) && typeof row.name === 'string' && row.name ? row.name : null;
}

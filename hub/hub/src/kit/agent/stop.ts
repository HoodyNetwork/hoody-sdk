// A "stop everything in this realm" sweep, as the Rules & safety screen shows it.
//
// One sweep is a first call without a cursor and, when the person asks, follow-up calls along the cursors the agent
// returned. What the view says is only what the answers say:
//   - The headline is the per-item outcomes: stopped / already done / may still be running (failed). `complete` is that
//     the call reached everything it could see, never "everything stopped"; a failed item stays listed even when
//     complete is true, and `unknown` outcomes count as may-still-be-running.
//   - `after` is only ever a next_cursor this sweep's own earlier call returned, unchanged, and a cursor is used once.
//   - `canContinue`: the last page was complete:false with a cursor not used yet, every item on it was acted on (none
//     failed), fewer than MAX_PAGES pages have been taken. A page with a failure, or a cursor that comes back again,
//     ends the offer: a repeated failure never loops.
//   - `again` ("Stop all again", a fresh sweep without `after`): something was left (items behind the cursor, started
//     during the call, or a failure). A sweep that stopped nothing new and failed nothing says nothing is left.
//   - A lost answer is `unsure`: the stop may have reached some, nothing is resent by itself; Stop all again is the
//     person's choice and is safe (the agent stops by state).
import { agent } from '@core';

export const MAX_PAGES = 10;

export type StopPhase = 'idle' | 'running' | 'ready' | 'unsure' | 'refused';
export interface StopView {
  phase: StopPhase;
  /** Pages taken in this sweep. */
  pages: number;
  /** Every item of the sweep, one row per (kind, id), the latest outcome. */
  items: agent.StopItem[];
  counts: { stopped: number; alreadyDone: number; failed: number };
  started: agent.StopRef[];
  behind: agent.StopRef[];
  notCovered: agent.NotCovered[];
  complete: boolean;
  canContinue: boolean;
  again: boolean;
  /** The sweep reached something and stopped nothing new, failed nothing: nothing more to offer. */
  nothingNew: boolean;
  /** The agent's refusal (phase refused). */
  error: { code: string; status: number } | null;
}

export interface StopRun {
  view(): StopView;
  subscribe(fn: () => void): () => void;
  /** A fresh sweep: no cursor. Ignored while a call is out. */
  start(): Promise<void>;
  /** The next page along the last cursor. Ignored unless view().canContinue. */
  next(): Promise<void>;
  /** Forget everything; answers still on their way change nothing. */
  reset(): void;
}

const IDLE: StopView = { phase: 'idle', pages: 0, items: [], counts: { stopped: 0, alreadyDone: 0, failed: 0 }, started: [], behind: [], notCovered: [], complete: false, canContinue: false, again: false, nothingNew: false, error: null };
const key = (r: agent.StopRef) => `${r.kind}\u0000${r.id}`;

export function createStopRun(deps: { api: agent.StopApi; realm?: string }): StopRun {
  const subs = new Set<() => void>();
  let v: StopView = IDLE, gen = 0, out = false;
  let rows = new Map<string, agent.StopItem>();
  let used = new Set<string>();
  let cursor: string | null = null, lastClean = false;

  const emit = (p: Partial<StopView>): void => {
    v = { ...v, ...p };
    for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
  };
  const counts = (): StopView['counts'] => {
    const c = { stopped: 0, alreadyDone: 0, failed: 0 };
    for (const i of rows.values()) { if (i.outcome === 'stopped') c.stopped++; else if (i.outcome === 'already_done') c.alreadyDone++; else c.failed++; }
    return c;
  };

  async function call(after: string | undefined, fresh: boolean): Promise<void> {
    if (out) return;
    out = true;
    const mine = gen;
    if (fresh) { rows = new Map(); used = new Set(); cursor = null; lastClean = false; }
    emit({ phase: 'running', error: null, ...(fresh ? { ...IDLE, phase: 'running' as const } : {}) });
    if (after !== undefined) used.add(after);
    let r: Awaited<ReturnType<agent.StopApi['stop']>>;
    try { r = await deps.api.stop(after, deps.realm); } catch { r = { ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } }; }
    if (mine !== gen) return; // a reset happened: `out` belongs to the new generation
    out = false;
    if (!r.ok) {
      if (r.err.kind === 'stale') { emit({ phase: v.pages ? 'ready' : 'idle' }); return; }
      cursor = null; lastClean = false;
      if (r.err.kind === 'pending') { emit({ phase: 'unsure', canContinue: false, again: true }); return; }
      emit({ phase: 'refused', error: { code: r.err.code, status: r.err.status }, canContinue: false, again: true });
      return;
    }
    const page = agent.stopPageOf(r.body);
    if (!page) { cursor = null; lastClean = false; emit({ phase: 'unsure', canContinue: false, again: true }); return; }
    for (const i of page.items) rows.set(key(i), i);
    const nc = new Map(v.notCovered.map((n) => [n.kind, n]));
    for (const n of page.notCovered) nc.set(n.kind, n);
    const pages = v.pages + 1;
    const c = counts();
    const clean = page.items.every((i) => i.outcome === 'stopped' || i.outcome === 'already_done');
    cursor = page.next;
    lastClean = clean;
    // Items that started during the call, or sit behind the cursor, were not acted on: they are for another sweep.
    // An earlier page's started one that THIS page acted on is no longer "not stopped" (it sits in the rows). What this
    // page itself reports as started stays, even for an id it also stopped: a later turn on the same session is new work.
    const acted = new Set(page.items.map(key));
    const before = fresh ? [] : v.started.filter((x) => !acted.has(key(x)));
    const have = new Set(before.map(key));
    const started = [...before, ...page.started.filter((x) => !have.has(key(x)))];
    const behind = page.behind;
    const canContinue = !page.complete && page.next !== null && !used.has(page.next) && clean && pages < MAX_PAGES;
    const nothingNew = c.stopped === 0 && c.failed === 0 && started.length === 0 && behind.length === 0 && page.complete;
    // Left over: a failure, something started during the call or behind the cursor, or a page that said more remains
    // (at the page cap this is the way on: a fresh sweep).
    const again = !nothingNew && (c.failed > 0 || started.length > 0 || behind.length > 0 || !page.complete);
    emit({ phase: 'ready', pages, items: [...rows.values()], counts: c, started, behind, notCovered: [...nc.values()], complete: page.complete, canContinue, again, nothingNew, error: null });
  }

  return {
    view: () => v,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    start: () => call(undefined, true),
    next() {
      if (!v.canContinue || cursor === null || !lastClean || used.has(cursor)) return Promise.resolve();
      return call(cursor, false);
    },
    reset() {
      gen++; out = false; rows = new Map(); used = new Set(); cursor = null; lastClean = false;
      v = IDLE;
      for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
    },
  };
}

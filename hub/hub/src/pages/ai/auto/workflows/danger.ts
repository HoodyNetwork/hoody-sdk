// Delete, Reset to shipped and Hide for one workflow. Which ones a workflow offers is the
// list's origin: yours → Delete; shipped (system) → Hide; shipped and changed (customized) → Reset to shipped and Hide; a
// project's own → none (its file belongs to the repository). The state of one run:
//   running  the request is out (one at a time, never sent twice),
//   done     the agent said it ran: a readable envelope with is_error false (delete, reset), or a readable answer to a hide.
//            A reset removes your changes; where the shipped version is then used depends on the realm (the agent restores
//            it at once in a realm of its own, but in Global it comes back only at the agent's next restart).
//            So a done reset reads the list: `restored` is 'now' (the row reads shipped and
//            unchanged), 'later' (no row: removed, back at the next restart) or null (not read yet, or the read failed or
//            still shows a changed copy); "back to the shipped version" is said only for 'now'.
//   paused   the agent refused because agents are paused (daemon_paused): nothing was done, Resume first,
//   refused  any other answer that says nothing was done,
//   unsure   a lost answer, an error the agent gave after it may have started, or a success the Hub cannot read: it MAY
//            have run. Nothing is sent again by the store. check() reads back, and only one sight settles it: a delete
//            whose workflow reads gone; a reset whose list row reads shipped and unchanged (restored now) or is gone (a
//            customized shipped workflow leaves the list only by a reset: removed, back at the next restart). Anything
//            else proves nothing.
//            No read shows a hide (the list does not say which workflows are hidden), so a hide is never checked: it sets
//            a flag, so the person may simply send the same choice again (Hide / Show again stay available).
// `hidden` is what the last answered hide said about this workflow (null: not known; the list does not carry it).
// Answers that arrive after reset() change nothing.
import { parseWorkflows } from './logic';
import type { Refusal, Settled, WorkflowSourceApi } from './sourceApi';

export type DangerKind = 'delete' | 'reset' | 'hide' | 'show';
export type DangerPhase = 'idle' | 'running' | 'done' | 'paused' | 'refused' | 'unsure';
export interface DangerView {
  phase: DangerPhase;
  kind: DangerKind | null;
  refusal: { code: string; status: number } | null;
  /** After a check of an unsure delete or reset, what the read saw (never a verdict, except the sight that settles it). */
  observed: 'same' | 'failed' | null;
  /** Counts completions (each move into done), so a caller acts on each exactly once, not on every sight of done. */
  seq: number;
  /** A done reset: where the shipped version stands (see above). */
  restored: 'now' | 'later' | null;
  /** The workflow is gone (a delete answered, or checked gone). */
  gone: boolean;
  hidden: boolean | null;
  reading: boolean;
}
export interface DangerStore {
  view(): DangerView;
  subscribe(fn: () => void): () => void;
  run(kind: DangerKind): Promise<void>;
  /** Read back an unsure delete or reset, or where a done reset's shipped version stands. */
  check(): Promise<void>;
  /** The person ends the watch of an unsure run (the UI asks first): nothing is sent, nothing is claimed. */
  forget(): void;
  /** Back to idle after done / refused / paused. */
  clear(): void;
  reset(): void;
}

const IDLE: DangerView = { phase: 'idle', kind: null, refusal: null, observed: null, seq: 0, restored: null, gone: false, hidden: null, reading: false };
const LOST: Refusal = { kind: 'pending', code: '', status: 0, notApplied: false };
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A hide's answer {hidden, hidden_workflows}: whether `name` is now hidden; null when the answer does not say. */
export function hiddenOf(body: unknown, name: string): boolean | null {
  if (!obj(body)) return null;
  if (Array.isArray(body.hidden_workflows) && body.hidden_workflows.every((n) => typeof n === 'string')) return body.hidden_workflows.includes(name);
  return null;
}

/** A list answer's row for `name`: 'shipped' (system, not customized), 'changed' (still customized), 'absent' (a list
 *  answer without it), or null (not a list answer, or a row of another origin). */
export function resetSight(body: unknown, name: string): 'shipped' | 'changed' | 'absent' | null {
  if (!obj(body) || !Array.isArray(body.items)) return null;
  const row = parseWorkflows(body).find((w) => w.name === name);
  if (!row) return 'absent';
  return row.origin === 'system' ? 'shipped' : row.origin === 'customized' ? 'changed' : null;
}

export function createDangerStore(deps: { name: string; api: Pick<WorkflowSourceApi, 'remove' | 'hide' | 'get' | 'list'> }): DangerStore {
  const subs = new Set<() => void>();
  let v: DangerView = IDLE;
  let gen = 0;
  const put = (p: Partial<DangerView>): void => {
    v = { ...v, ...p, ...(p.phase === 'done' && v.phase !== 'done' ? { seq: v.seq + 1 } : {}) };
    for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
  };

  async function run(kind: DangerKind): Promise<void> {
    if (v.phase === 'running' || v.gone) return;
    // An unsure delete or reset blocks everything; an unsure hide lets the person send a choice again.
    if (v.phase === 'unsure' && v.kind !== 'hide' && v.kind !== 'show') return;
    if (v.phase === 'unsure' && kind !== 'hide' && kind !== 'show') return;
    const mine = gen;
    put({ phase: 'running', kind, refusal: null, observed: null, restored: null });
    let r: Settled;
    try {
      r = kind === 'hide' || kind === 'show' ? await deps.api.hide(kind === 'hide') : await deps.api.remove();
    } catch {
      r = { ok: false, err: LOST };
    }
    if (mine !== gen) return;
    if (r.ok) {
      if (kind === 'hide' || kind === 'show') {
        const h = hiddenOf(r.body, deps.name);
        if (h !== null) { put({ phase: 'done', hidden: h }); return; }
        put({ phase: 'unsure' });
        return;
      }
      if (obj(r.body) && r.body.is_error === false) {
        put({ phase: 'done', gone: kind === 'delete' });
        if (kind === 'reset') await readReset();
        return;
      }
      put({ phase: 'unsure' });
      return;
    }
    const e = r.err;
    if (e.kind === 'stale') { put({ phase: 'idle', kind: null }); return; }
    if (e.kind === 'pending') { put({ phase: 'unsure' }); return; }
    if (e.code === 'daemon_paused' && e.notApplied) { put({ phase: 'paused' }); return; }
    put({ phase: 'refused', refusal: { code: e.code, status: e.status } });
  }

  /** A done reset: read the list for where the shipped version stands. */
  async function readReset(): Promise<void> {
    const mine = gen;
    put({ reading: true, observed: null });
    let r: Settled;
    try { r = await deps.api.list(); } catch { r = { ok: false, err: LOST }; }
    if (mine !== gen) return;
    const sight = r.ok ? resetSight(r.body, deps.name) : null;
    if (sight === 'shipped') put({ reading: false, restored: 'now' });
    else if (sight === 'absent') put({ reading: false, restored: 'later' });
    else put({ reading: false, observed: sight === 'changed' ? 'same' : 'failed' });
  }

  async function check(): Promise<void> {
    if (v.phase === 'done' && v.kind === 'reset' && v.restored === null && !v.reading) { await readReset(); return; }
    if (v.phase !== 'unsure' || v.reading || (v.kind !== 'delete' && v.kind !== 'reset')) return;
    const mine = gen, kind = v.kind;
    put({ reading: true, observed: null });
    let r: Settled;
    try { r = kind === 'delete' ? await deps.api.get() : await deps.api.list(); } catch { r = { ok: false, err: LOST }; }
    if (mine !== gen) return;
    if (kind === 'delete') {
      if (!r.ok && (r.err.status === 404 || r.err.code === 'not_found')) { put({ reading: false, phase: 'done', gone: true }); return; }
      put({ reading: false, observed: r.ok ? 'same' : 'failed' });
      return;
    }
    const sight = r.ok ? resetSight(r.body, deps.name) : null;
    if (sight === 'shipped') { put({ reading: false, phase: 'done', restored: 'now' }); return; }
    if (sight === 'absent') { put({ reading: false, phase: 'done', restored: 'later' }); return; }
    put({ reading: false, observed: sight === 'changed' ? 'same' : 'failed' });
  }

  function subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

  return {
    view: () => v,
    subscribe,
    run,
    check,
    forget() { if (v.phase === 'unsure' && !v.reading) put({ phase: 'idle', kind: null, observed: null }); },
    clear() { if (v.phase === 'done' || v.phase === 'refused' || v.phase === 'paused') put({ phase: 'idle', kind: null, refusal: null, observed: null, restored: null }); },
    reset() {
      gen++;
      v = IDLE;
      for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
    },
  };
}

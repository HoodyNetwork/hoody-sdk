// Delete and Reset to shipped for one agent: two gated tool runs the agent answers
// as 200 {output, is_error}. The state of one run:
//   running  the request is out (one at a time, never sent twice),
//   done     the agent said it ran: a readable envelope with `is_error` false,
//   paused   the agent refused because agents are paused (`daemon_paused`): nothing was done, Resume first. While the
//            daemon is known to be paused the store does not send at all (the buttons say "Resume to delete"),
//   refused  any other answer that says nothing was done (a 4xx),
//   unsure   an error the agent gave after it may have started, a success the Hub cannot read, or a lost answer: it MAY have
//            run. Nothing is sent again. check() reads the agent's source back and reports what it SEES (`observed`), and
//            only one sight settles the run: a delete that finds the agent gone. Anything else (the same file, a different
//            one, a reset that finds nothing) proves nothing: a revision is a hash of the bytes, not a receipt, a slow
//            request may still land, and another person may have edited. The person ends the watch (forget) knowing that.
// Answers that arrive after reset() change nothing.
import type { Settled, SourceApi } from './sourceApi';
import { sourceOf } from './source';

export type DangerKind = 'delete' | 'reset';
export type DangerPhase = 'idle' | 'running' | 'done' | 'paused' | 'refused' | 'unsure';
export interface DangerView {
  phase: DangerPhase;
  kind: DangerKind | null;
  /** refused: the agent's code and status (nothing was done). */
  refusal: { code: string; status: number } | null;
  /** After a check of an unsure run, what the read saw. Never a verdict on the run, except `gone` after a delete (which
   *  settles it as done). */
  observed: 'same' | 'changed' | 'gone' | 'failed' | null;
  /** The file is gone (a delete that was answered or whose check found it gone). */
  gone: boolean;
  reading: boolean;
}
export interface DangerStore {
  view(): DangerView;
  subscribe(fn: () => void): () => void;
  /** `revision`: the file's revision the person is looking at (null if unknown), the baseline a check compares to. */
  run(kind: DangerKind, revision: string | null): Promise<void>;
  check(): Promise<void>;
  /** The person ends the watch of an unsure run (the UI asks first): nothing was sent again, nothing is claimed. */
  forget(): void;
  /** Back to idle after done / refused / paused. Refused while running or unsure. */
  clear(): void;
  reset(): void;
}

const IDLE: DangerView = { phase: 'idle', kind: null, refusal: null, observed: null, gone: false, reading: false };

/** A readable success: the tool envelope with `is_error` exactly false. */
const succeeded = (b: unknown): boolean => !!b && typeof b === 'object' && !Array.isArray(b) && (b as Record<string, unknown>).is_error === false;

export function createDangerStore(deps: { api: Pick<SourceApi, 'remove' | 'reset' | 'get'>; paused: () => boolean; blocked?: () => boolean }): DangerStore {
  const subs = new Set<() => void>();
  let v: DangerView = IDLE;
  let gen = 0, baseline: string | null = null;
  const put = (p: Partial<DangerView>): void => {
    v = { ...v, ...p };
    for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
  };
  const lost = (): Settled => ({ ok: false, err: { kind: 'pending', code: '', status: 0, retryAfterMs: null, notApplied: false, currentRevision: null } });

  async function run(kind: DangerKind, revision: string | null): Promise<void> {
    if (v.phase === 'running' || v.phase === 'unsure' || deps.paused() || deps.blocked?.()) return;
    const mine = gen;
    baseline = revision;
    put({ phase: 'running', kind, refusal: null, observed: null, gone: false });
    let r: Settled;
    try { r = await (kind === 'delete' ? deps.api.remove() : deps.api.reset()); } catch { r = lost(); }
    if (mine !== gen) return;
    if (r.ok) {
      // A success the Hub cannot read (no envelope, is_error missing or not false) is not a success it can show.
      if (succeeded(r.body)) put({ phase: 'done', gone: kind === 'delete' });
      else put({ phase: 'unsure' });
      return;
    }
    const e = r.err;
    if (e.kind === 'stale') { put({ phase: 'idle', kind: null }); return; }
    if (e.code === 'daemon_paused' && e.notApplied) { put({ phase: 'paused' }); return; }
    if (e.kind === 'pending') { put({ phase: 'unsure' }); return; }
    put({ phase: 'refused', refusal: { code: e.code, status: e.status } });
  }

  async function check(): Promise<void> {
    if (v.phase !== 'unsure' || v.reading) return;
    const mine = gen, kind = v.kind;
    put({ reading: true, observed: null });
    let r: Settled;
    try { r = await deps.api.get(); } catch { r = lost(); }
    if (mine !== gen) return;
    if (!r.ok) {
      if (r.err.status === 404 || r.err.code === 'not_found') {
        // Gone settles a delete. After a reset it settles nothing: a reset leaves a file.
        if (kind === 'delete') put({ reading: false, phase: 'done', gone: true, observed: 'gone' });
        else put({ reading: false, observed: 'gone' });
        return;
      }
      put({ reading: false, observed: 'failed' });
      return;
    }
    const doc = sourceOf(r.body);
    if (!doc) { put({ reading: false, observed: 'failed' }); return; }
    put({ reading: false, observed: baseline !== null && doc.revision === baseline ? 'same' : 'changed' });
  }

  return {
    view: () => v,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    run, check,
    forget() { if (v.phase !== 'unsure' || v.reading) return; baseline = null; put({ phase: 'idle', kind: null, refusal: null, observed: null, gone: false }); },
    clear() { if (v.phase === 'unsure' || v.phase === 'running') return; put({ phase: 'idle', kind: null, refusal: null, observed: null, gone: false }); },
    reset() { gen++; baseline = null; v = IDLE; for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } } },
  };
}

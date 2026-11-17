// A workflow create that left the browser is owned by its target, not by the drawer that sent it (the rename attempts'
// rule, pages/ai/parts/renameAttempts.ts). The record is keyed by the account, computer, realm and name captured at send,
// with no context generation, so it outlives the drawer, a realm switch and the way back. It holds what was sent (the
// definition's JSON as serialized at send: the request carries that same copy, so a caller changing its object later
// changes neither) and the context it was sent in:
//   - The original answer settles it only while that context is alive. An answer that comes after it died proves
//     nothing here, so the record becomes unknown, never done or failed; only core's own word that nothing went out
//     (not_sent, stale) still ends it as refused.
//   - While a record is sending or unknown, nothing creates that name again (sendCreate answers `held`, sending nothing).
//     A name with a problem (nameProblem) is refused before any record or request (`badName`).
//   - Check again reads under a fresh capture of the record's computer, and only while that capture's account and realm
//     (what is shown now) are the record's. It never sends the create. Only a read proving the workflow as sent ends it (done); anything else
//     leaves it unknown with what was seen.
//   - A record ends on its answer, on Check again proving it, or on an explicit Stop tracking. It is never pruned: a
//     record that is not live is gone, and a late settle of a replaced record does nothing.
import { alive, capture, type Ctx } from '@core';
import { checkCreate, createOutcome, nameProblem, type CheckResult, type CreateOutcome, type NameProblem } from './create';
import { workflowCreateApi, type Settled, type WorkflowCreateApi } from './sourceApi';

export interface CreateAttempt {
  /** scope|name */
  readonly key: string;
  /** account|project|container|realm, captured at send. */
  readonly scope: string;
  readonly name: string;
  readonly realm: string;
  /** The definition that was sent, as the JSON serialized at send (the request carried the same copy). */
  readonly sent: string;
  /** The context it was sent in: it decides only whether the original answer may settle the record. */
  readonly ctx: Ctx;
  /** 'sending' and 'unknown' are live; 'done' and 'failed' are ended (the record is gone). */
  phase: 'sending' | 'unknown' | 'done' | 'failed';
  /** With 'failed': the refusal. */
  outcome?: CreateOutcome;
  /** With 'unknown' after a Check again: what the read showed. */
  seen?: Extract<CheckResult, { k: 'unknown' }>['seen'];
}

/** The scope a context names (account|project|container|realm), or null when it names no computer. */
export function scopeOf(ctx: Ctx, realm: string): string | null {
  const t = ctx.target;
  if (!t || !t.project?.id || !t.container?.id || !realm) return null;
  return [ctx.account ?? '', t.project.id, t.container.id, realm].join('|');
}

export interface CreateAttempts {
  /** The live record (sending or unknown) for a key. */
  get(key: string): CreateAttempt | undefined;
  /** The live records of one scope, oldest first. */
  list(scope: string): CreateAttempt[];
  /** Starts a record; false (nothing changes) while a live one holds its key. */
  begin(a: CreateAttempt): boolean;
  /** The original answer. Only the record itself settles, and only while its context is alive. */
  settle(a: CreateAttempt, s: Settled): void;
  /** A Check again read. Ends the record only on proof. */
  checked(a: CreateAttempt, r: CheckResult): void;
  /** Stop tracking: the record ends, nothing is sent or read. */
  stop(a: CreateAttempt): void;
  subscribe(fn: () => void): () => void;
  /** Changes with every publish (a useSyncExternalStore snapshot). */
  version(): number;
}

export function createCreateAttempts(): CreateAttempts {
  const m = new Map<string, CreateAttempt>();
  const subs = new Set<() => void>();
  let v = 0;
  const publish = () => { v++; for (const f of [...subs]) { try { f(); } catch { /* the subscriber's */ } } };
  const live = (a: CreateAttempt) => m.get(a.key) === a;
  const end = (a: CreateAttempt, phase: 'done' | 'failed', outcome?: CreateOutcome) => {
    m.delete(a.key);
    a.phase = phase;
    if (outcome) a.outcome = outcome;
    publish();
  };
  return {
    get: (k) => m.get(k),
    list: (scope) => [...m.values()].filter((a) => a.scope === scope),
    begin: (a) => {
      if (m.has(a.key)) return false;
      m.set(a.key, a);
      publish();
      return true;
    },
    settle: (a, s) => {
      if (!live(a) || a.phase !== 'sending') return;
      const o = createOutcome(s);
      const unsent = !s.ok && (s.err.kind === 'not_sent' || s.err.kind === 'stale');
      if (unsent) return end(a, 'failed', o);
      if (!alive(a.ctx) || o.k === 'unknown') { a.phase = 'unknown'; publish(); return; }
      if (o.k === 'created') end(a, 'done');
      else end(a, 'failed', o);
    },
    checked: (a, r) => {
      if (!live(a) || a.phase !== 'unknown') return;
      if (r.k === 'created') return end(a, 'done');
      a.seen = r.seen;
      publish();
    },
    stop: (a) => { if (live(a)) end(a, 'failed'); },
    subscribe: (f) => { subs.add(f); return () => { subs.delete(f); }; },
    version: () => v,
  };
}

/** The tab's creates: they outlive the drawer and a realm switch. */
export const createAttempts: CreateAttempts = createCreateAttempts();

export type SendResult =
  | { k: 'held'; attempt: CreateAttempt } | { k: 'noComputer' } | { k: 'badName'; problem: NameProblem } | { k: 'badDefinition' }
  | { k: 'sent'; attempt: CreateAttempt };

/** Sends one create of `name` with `definition` in `realm`, on the computer shown now (or `ctx`'s). A name with a problem,
 *  a definition JSON.stringify cannot serialize (a cycle, a BigInt), or a live record of the same key: nothing is sent.
 *  What JSON leaves out or changes (an undefined property, NaN as null) is sent and stored as that same JSON. `makeApi` is for tests. */
export async function sendCreate(
  store: CreateAttempts, name: string, realm: string, definition: Record<string, unknown>,
  opts: { ctx?: Ctx; makeApi?: (name: string, realm: string, ctx: Ctx) => WorkflowCreateApi } = {},
): Promise<SendResult> {
  const problem = nameProblem(name);
  if (problem) return { k: 'badName', problem };
  let sent: string;
  try { sent = JSON.stringify(definition); } catch { return { k: 'badDefinition' }; }
  if (typeof sent !== 'string') return { k: 'badDefinition' };
  const ctx = opts.ctx ?? capture();
  const scope = scopeOf(ctx, realm);
  if (!scope) return { k: 'noComputer' };
  const key = `${scope}|${name}`;
  const a: CreateAttempt = { key, scope, name, realm, sent, ctx, phase: 'sending' };
  if (!store.begin(a)) return { k: 'held', attempt: store.get(key)! };
  const api = (opts.makeApi ?? workflowCreateApi)(name, realm, ctx);
  store.settle(a, await api.create(JSON.parse(sent) as Record<string, unknown>));
  return { k: 'sent', attempt: a };
}

/** Check again for an unknown create: reads the workflow under a fresh capture of the record's computer, only while that
 *  capture's account and the realm the page names (`realm`: the page's own, e.g. a computer's Global under All realms;
 *  default the capture's) are the record's ('elsewhere' otherwise, nothing read). Never sends the create. */
export async function checkAgain(
  store: CreateAttempts, a: CreateAttempt,
  opts: { makeApi?: (name: string, realm: string, ctx: Ctx) => WorkflowCreateApi; realm?: string } = {},
): Promise<CheckResult | { k: 'elsewhere' } | { k: 'ended' }> {
  if (store.get(a.key) !== a || a.phase !== 'unknown') return { k: 'ended' };
  const fresh = capture(a.ctx.target);
  const now = opts.realm ?? fresh.realm;
  if (!alive(fresh) || now !== a.realm || scopeOf(fresh, now) !== a.scope) return { k: 'elsewhere' };
  const api = (opts.makeApi ?? workflowCreateApi)(a.name, a.realm, fresh);
  const r = checkCreate(await api.get(), JSON.parse(a.sent) as Record<string, unknown>);
  store.checked(a, r);
  return r;
}

// Memory administration: tidy a project up (consolidate), write pending memory now
// (flush), erase a project's memory, and use this computer as the realm's memory host. Every guarded write mints its
// own single-use intent (POST /memory/write-intents) at the moment of the press, inside the same locked change that
// sends the write: the intent is spent by the write whether it succeeds or is refused, so a write is never sent twice
// and a lost answer is held as unknown until a fresh read proves it (a 409 write_intent_invalid after a lost answer
// proves nothing, and nothing here ever asks for one). A refused or lost MINT sent no write: it reads as not sent.
// Realm: memory is per realm, so every request names it (header) and asserts it (expect_realm).
import {
  api, coreSource, defineRoute, heldChanges, refreshFresh, sourceReads, useLockedChange,
  type Ctx, type HeldChange, type HubError, type LockedResult, type SourceTable,
} from '@core';
import { outcomeOf } from '@core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHeldIn } from '../../heldIn';
import { memoryRoutes, type MemoryAt, type ProjectAt } from './data';
import { projectsOf, statusOf, type MemoryStatus, type ProjectRow } from './logic';

/** The project list the recovery reads: its rows, and whether the answer is the whole list. The request is unpaginated
 *  (limit=0), so `meta.total` must equal the rows the agent sent, the realm-wide row (key "") included; a list that
 *  says nothing of its size, or more than it sent, proves no project absent. */
export interface AdminProjects { rows: ProjectRow[]; complete: boolean }

export function adminProjectsOf(raw: unknown): AdminProjects {
  // The realm-wide row (key '') is no project: it is never erased or tidied, so the admin rows leave it out; it still
  // counts toward meta.total below.
  const rows = projectsOf(raw).filter((x) => x.key !== '');
  const r = rec(raw);
  const raw0 = Array.isArray(r?.items) ? r.items : [];
  const keys = raw0.map((x) => rec(x)?.key);
  // A repeated key is a listing that contradicts itself: its length says nothing about having every project.
  const unique = keys.every((k) => typeof k === 'string') && new Set(keys).size === keys.length;
  const total = rec(r?.meta)?.total;
  return { rows, complete: unique && typeof total === 'number' && Number.isInteger(total) && total === raw0.length };
}

/** The memory admin requests (agent routes; the realm rides every call, and core refuses All realms unsent). */
export const adminRoutes = {
  /** Mints the single-use intent a guarded write presents as `nonce`. It changes nothing, so a lost answer to it is harmless. */
  intent: defineRoute({ method: 'POST', path: '/memory/write-intents', scope: 'agent', realm: 'realm', body: ['op', 'project', 'expect_realm'] }),
  /** Refusals before anything was queued: a spent or foreign intent, another realm, a store or queue that is not there. */
  consolidate: defineRoute({
    method: 'POST', path: '/memory/consolidate', scope: 'agent', realm: 'realm',
    body: ['project', 'nonce', 'min_observations', 'expect_realm'],
    cas: { via: 'body', keys: ['nonce'] },
    refuses: ['write_intent_invalid', 'realm_mismatch', 'store_unavailable', 'consolidate_unavailable', 'service_unavailable'],
  }),
  /** The erasure drains capture work first and fails on the agent's own faults (500 store_failed) after it may have begun:
   *  only the refusals before it starts are definite. */
  erase: defineRoute({
    method: 'DELETE', path: '/memory/projects/:project', scope: 'agent', realm: 'realm', deleteBody: true,
    body: ['nonce', 'reason', 'expect_realm'],
    cas: { via: 'body', keys: ['nonce'] },
    refuses: ['write_intent_invalid', 'realm_mismatch', 'store_unavailable', 'service_unavailable'],
  }),
  /** The durability barrier: not admin-gated, no intent, safe to repeat. */
  flush: defineRoute({ method: 'POST', path: '/memory/flush', scope: 'agent', realm: 'realm' }),
  /** Elects THIS computer as the realm's memory host (the recovery action when no host is reachable). */
  host: defineRoute({
    method: 'PUT', path: '/memory/datahost', scope: 'agent', realm: 'realm',
    body: ['use_self', 'expect_realm'], refuses: ['refused_realm_changed', 'service_unavailable'],
  }),
} as const;

export const MEMORY_CONSOLIDATE_LOCK = 'agent.memory_consolidate';
export const MEMORY_ERASE_LOCK = 'agent.memory_erase';
export const MEMORY_HOST_LOCK = 'agent.memory_host';
/** The Memory page's own source (data.ts SOURCE): its reads are what a held change is checked against. */
const MEMORY_SOURCE = 'ai-memory';
export const ADMIN_SOURCE = 'ai-memory-admin';
const PAGE = 'ai-memory-admin';

// ---- what the status says about a tidy-up ----

export interface Consolidation {
  state: 'idle' | 'queued' | 'running';
  /** The project a queued or running pass is for ('' when the agent names none). */
  project: string;
  queuedAtMs: number | null;
  lastDoneMs: number | null;
  lastResult: 'ok' | 'failed' | null;
}

const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const ms = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null);

/** getMemoryStatus's `consolidation` block. null: the agent reports none (it predates the block); 'unreadable': it
 *  reports one this page cannot read, which says nothing either way. */
export function consolidationOf(raw: unknown): Consolidation | 'unreadable' | null {
  const r = rec(raw);
  if (!r) return 'unreadable';
  if (!('consolidation' in r) || r.consolidation === undefined) return null;
  const c = rec(r.consolidation);
  if (!c || (c.state !== 'idle' && c.state !== 'queued' && c.state !== 'running')) return 'unreadable';
  return {
    state: c.state,
    project: typeof c.project === 'string' ? c.project : '',
    queuedAtMs: ms(c.queued_at_ms),
    lastDoneMs: ms(c.last_done_ms),
    lastResult: c.last_result === 'ok' || c.last_result === 'failed' ? c.last_result : null,
  };
}

/** What a lost consolidate answer is judged by: only a pass the agent reports as queued or running for THIS project
 *  proves one was enqueued. An idle block proves nothing (a pass that ran and finished is not told from none). */
export function consolidateProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const project = rec(identity)?.project;
  if (typeof project !== 'string' || project === '') return undefined;
  for (const a of answers[0] ?? []) {
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      const c = a as Partial<Consolidation>;
      if ((c.state === 'queued' || c.state === 'running') && c.project === project) return 'applied';
    }
  }
  return undefined;
}

/** A lost erase is proved only by a fresh COMPLETE projects list that lacks the project AND a status of the same realm that
 *  says a store resolved: an off or unreadable realm lists nothing, which is also what an erased project looks like. It
 *  proves the project is gone, not that every follow-up step finished (the lost answer carried that), and the page says so. */
export function eraseProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const project = rec(identity)?.project;
  if (typeof project !== 'string' || project === '') return undefined;
  const lists = (answers[0] ?? []).map(rec).filter((x): x is Record<string, unknown> => x !== null && Array.isArray(x.rows));
  const statuses = (answers[1] ?? []).filter((x): x is MemoryStatus => !!x && typeof x === 'object' && !Array.isArray(x));
  if (lists.length === 0 || statuses.length === 0) return undefined;
  if (!lists.every((l) => l.complete === true)) return undefined;
  if (!statuses.some((x) => x.enabled === true && x.available === true && x.degraded === false)) return undefined;
  return lists.every((l) => (l.rows as ProjectRow[]).every((p) => p.key !== project)) ? 'applied' : undefined;
}

/** The data-host facts a recovery check judges, read from the RAW answer with nothing defaulted: null unless the realm, state, host
 *  and every row's id are non-empty strings and every row's flags are real booleans (the daemon always sends both, so a missing or
 *  non-boolean flag is an answer this page cannot read, never a "false"). */
export interface HostFacts { realm: string; state: string; host: string; hosts: { id: string; self: boolean; current: boolean }[] }
export function hostFactsOf(raw: unknown): HostFacts | null {
  const d = rec(rec(raw)?.datahost);
  if (!d || typeof d.realm !== 'string' || d.realm === '' || typeof d.state !== 'string' || typeof d.host !== 'string' || !Array.isArray(d.hosts)) return null;
  const hosts: HostFacts['hosts'] = [];
  for (const h of d.hosts as unknown[]) {
    const r = rec(h);
    if (!r || typeof r.id !== 'string' || r.id === '' || typeof r.is_self !== 'boolean' || typeof r.is_current !== 'boolean') return null;
    hosts.push({ id: r.id, self: r.is_self, current: r.is_current });
  }
  return { realm: d.realm, state: d.state, host: d.host, hosts };
}

/** A lost host assignment is proved only by a fresh data-host read of the held realm that says THIS computer serves it: state
 *  leader, the answer's host and exactly one current row both this computer, and that row its own (self). A pointer that merely
 *  names this computer (stuck, unavailable, a follower), an answer about another realm or none, contradictory rows or ids, or a
 *  row whose flags are not booleans prove nothing. */
export function hostProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const id = rec(identity);
  const realm = id?.realm;
  const computer = id?.computer;
  if (typeof realm !== 'string' || realm === '' || typeof computer !== 'string' || computer === '') return undefined;
  for (const a of answers[0] ?? []) {
    const h = a as Partial<HostFacts> | null;
    if (!h || h.realm !== realm || h.state !== 'leader' || h.host !== computer || !Array.isArray(h.hosts)) continue;
    const rows = h.hosts;
    if (!rows.every((x) => !!x && typeof x.id === 'string' && x.id !== '' && typeof x.self === 'boolean' && typeof x.current === 'boolean')) continue;
    if (new Set(rows.map((x) => x.id)).size !== rows.length) continue;
    const own = rows.filter((x) => x.self), current = rows.filter((x) => x.current);
    if (own.length === 1 && current.length === 1 && own[0]!.id === computer && current[0]!.id === computer) return 'applied';
  }
  return undefined;
}

// ---- the sends ----

/** An error as a send that never left: the intent could not be minted, so no write was sent. Its facts are kept for Details. */
function unsent(e: unknown): Error {
  const x = (e && typeof e === 'object' ? e : {}) as Partial<HubError> & { message?: string };
  return Object.assign(new Error(typeof x.message === 'string' ? x.message : 'intent'), x, { kind: 'not_sent', notSent: true, pending: false, stale: false });
}

/** An answer to a write that the page cannot read as the agent's success: the write may have been applied. */
function unreadable(code: string): Error {
  return Object.assign(new Error('unreadable answer'), { kind: 'pending', pending: true, code });
}

/** The nonce of a minted intent, only when it is bound to the op and project asked for (a mismatch is a refusal). */
export function nonceOf(raw: unknown, op: string, project: string): string | null {
  const r = rec(raw);
  if (!r || r.status !== 'ok') return null;
  const n = r.nonce;
  if (typeof n !== 'string' || n.length < 1 || n.length > 512) return null;
  if (r.op !== op || r.project !== project) return null;
  return n;
}

async function mintIntent(v: ProjectAt, op: 'consolidate' | 'wipe_project', ctx: Ctx): Promise<string> {
  let raw: unknown;
  try {
    // recovers: a lost answer to the mint is read as "not sent" here, so core must not announce a change that may have gone through.
    raw = await api(adminRoutes.intent, { target: v.target, realm: v.realm, body: { op, project: v.project, expect_realm: v.realm }, ctx, recovers: true });
  } catch (e) {
    throw unsent(e);
  }
  const nonce = nonceOf(raw, op, v.project);
  if (nonce === null) throw unsent(Object.assign(new Error('intent'), { code: 'INTENT_UNREADABLE' }));
  return nonce;
}

export type ConsolidateVars = ProjectAt;
export type EraseVars = ProjectAt;
export type HostVars = MemoryAt;

/** The erase's answer, as the page may say it: erased, with the follow-up steps the agent could not confirm. */
export interface Erased { incomplete: readonly string[] | null }

export function erasedOf(raw: unknown, project: string): Erased {
  const r = rec(raw);
  if (!r || r.wiped !== true || r.status !== 'ok' || r.project !== project) throw unreadable('ERASE_UNREADABLE');
  if (r.incomplete_erasure !== undefined && typeof r.incomplete_erasure !== 'boolean') throw unreadable('ERASE_UNREADABLE');
  // The unconfirmed steps come only with the flag: steps without it contradict a clean erasure.
  if (r.incomplete_erasure !== true && r.incomplete_steps !== undefined) throw unreadable('ERASE_UNREADABLE');
  if (r.incomplete_erasure !== true) return { incomplete: null };
  const steps = Array.isArray(r.incomplete_steps) ? r.incomplete_steps.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 200).slice(0, 8) : [];
  return { incomplete: steps };
}

/** A consolidate answer is the page's success only when it says queued for THIS project. */
export function queuedOf(raw: unknown, project: string): { queued: true } {
  const r = rec(raw);
  if (!r || r.queued !== true || r.status !== 'ok' || r.project !== project) throw unreadable('CONSOLIDATE_UNREADABLE');
  return { queued: true as const };
}

/** A host answer is the page's success only when it says ok, the coordinator outcome won (this computer published, was
 *  stamped and became the host) and names THIS computer as the host. Two outcomes are a definite "not this computer",
 *  never a hold: refused_healthy_host (a peer already proven serving the realm, left in place) and adopted naming another
 *  computer (a newer peer pointer won the race; this computer follows it). Every other answer may have gone through and
 *  stays unknown until a fresh read of the realm's hosts says so: adopted naming this computer (the coordinator only
 *  follows the newer pointer, becomeFollower: nothing proves this computer serves), not_ready_recovering (a self pointer
 *  was published, not yet stamped, while the coordinator recovers the realm profile), any other outcome, a missing field
 *  or a host that is no string. */
export function assignedOf(raw: unknown, computer: string): { assigned: true } {
  const r = rec(raw);
  if (!r || r.status !== 'ok' || typeof r.host !== 'string') throw unreadable('HOST_UNREADABLE');
  if (r.outcome === 'won' && r.host === computer) return { assigned: true as const };
  if (r.outcome === 'refused_healthy_host' || (r.outcome === 'adopted' && r.host !== '' && r.host !== computer)) throw notAssigned(r.outcome);
  throw unreadable('HOST_UNREADABLE');
}

/** A host answer that says this computer did not become the host (assignedOf): failed, nothing held. */
const notAssigned = (outcome: string): Error => Object.assign(new Error('not assigned'), { code: outcome });

/** The visible Memory page's own reads of this computer, fetched again after a change that moved what they show (the write
 *  is never sent again: this only reads). */
function refreshVisible(at: MemoryAt): void {
  try { void refreshFresh(sourceReads(MEMORY_SOURCE, undefined, { computer: computerOf(at) })).catch(() => undefined); } catch { /* a read that cannot start changes nothing */ }
}

const adminTable: SourceTable = {
  reads: {
    'memory.consolidation': {
      route: memoryRoutes.status,
      input: (p: MemoryAt & { project?: string }) => ({ target: p.target, realm: p.realm, query: p.project ? { project: p.project } : {} }),
      select: (raw) => consolidationOf(raw),
    },
    // The reads a held erase is checked against, this source's own and enabled for as long as the hold lasts: the page's
    // list read stops while its status says the store is not there, which is exactly when a Check again must still read.
    'memory.projects': {
      route: memoryRoutes.projects,
      input: (p: MemoryAt) => ({ target: p.target, realm: p.realm, query: { limit: '0' } }),
      select: (raw) => adminProjectsOf(raw),
    },
    'memory.status': {
      route: memoryRoutes.status,
      input: (p: MemoryAt) => ({ target: p.target, realm: p.realm }),
      select: (raw, p: MemoryAt) => statusOf(raw, p.realm),
    },
    // The host read a held assignment is checked against: this source's own, with the raw flags kept as sent (null: unreadable).
    'memory.datahost': {
      route: memoryRoutes.host,
      input: (p: MemoryAt) => ({ target: p.target, realm: p.realm }),
      select: (raw) => hostFactsOf(raw),
    },
  },
};
const adminSource = coreSource(ADMIN_SOURCE, adminTable);

/** The tidy-up the agent reports for this realm now (null: it reports none, or the read is not there). */
export const useConsolidation = (at: MemoryAt, project: string | undefined, enabled: boolean) =>
  adminSource.useQuery<Consolidation | 'unreadable' | null, MemoryAt & { project?: string }>('memory.consolidation', project ? { ...at, project } : at, { enabled });

const computerOf = (a: MemoryAt) => a.target.container.id;
/** A hold of this computer and realm, whatever project it was for: the notice and its controls follow the hold, not the open project. */
const pickHost = (at: MemoryAt) => (i: Record<string, unknown>) => i.computer === computerOf(at) && i.realm === at.realm;

/** What a locked admin change shows the page: the hold (an earlier send that may have gone through
 *  in this project), Check again (reads only) and Stop waiting (this hold only). */
export interface AdminChange<V, D> {
  run: (v: V) => Promise<LockedResult<D>>;
  state: 'free' | 'running' | 'pending';
  held: HeldChange | null;
  /** One new read for the hold held now; true when that check ended the hold. It says nothing about whether the change went through. */
  check: () => Promise<boolean>;
  stopWaiting: () => Promise<boolean>;
  /** What the notice remembers across the page's own re-mounts (the manage bar moves when the project list changes):
   *  the project's name as the press used it. */
  notice: NoticeMemory;
}

export interface NoticeMemory {
  /** The names presses used, by project key (for the hold's words). There is no result notice: after a press settles or a wait
   *  ends, the page's re-read lists are all that shows. */
  names: Readonly<Record<string, string>>;
  setAbout: (name: string, key: string) => void;
}

function useNoticeMemory(): NoticeMemory {
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const setAbout = useCallback((name: string, key: string) => { setNames((n) => ({ ...n, [key]: name })); }, []);
  return { names, setAbout };
}

const keyOfIdentity = (identity: unknown): string => JSON.stringify(identity ?? null);
const projectOfIdentity = (identity: unknown): string => {
  const p = rec(identity)?.project;
  return typeof p === 'string' ? p : '';
};

function useAdminChange<V, D>(
  id: string,
  lock: string,
  route: typeof adminRoutes[keyof typeof adminRoutes],
  send: (v: V, ctx: Ctx) => Promise<D>,
  reads: (at: MemoryAt) => readonly ((k: readonly unknown[]) => boolean)[],
  at: MemoryAt,
  pick: (i: Record<string, unknown>) => boolean,
  lockKey: (v: V) => unknown,
  proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => 'applied' | undefined,
  afterProved?: (at: MemoryAt) => void,
): AdminChange<V, D> {
  // Nothing infers that a change went through. A hold ends only by a Check again: ONE new read started after that press, for the
  // hold that is held at that moment, judged by the verdict functions below on what that read fetched, and freed by core against
  // the hold it captured when the read began. Any other read (core's own, a background refresh, another tab's) frees nothing:
  // `proves` answers nothing unless a press of Check again is in flight for this very hold. The page then only shows what the
  // server reports now; it never says "it worked".
  const probe = useRef<{ hold: string; key: string } | null>(null);
  const heldNow = useCallback((): HeldChange | null => heldChanges(lock, { realm: atRef.current.realm }).find((x) => pick((x.identity ?? {}) as Record<string, unknown>)) ?? null, [lock, pick]);
  const locked = useLockedChange<V, D>(
    (v, _idem, ctx) => send(v, ctx),
    reads(at),
    id,
    {
      // Filed under the store the change names (under All realms a computer's own realm), not the context's 'all'.
      lock, route, sentIn: at.realm, lockKey, identity: lockKey, page: PAGE,
      proves: (identity, answers) => {
        const pr = probe.current;
        if (!pr || pr.key !== keyOfIdentity(identity)) return undefined;
        const now = heldNow();
        if (!now || now.hold !== pr.hold || keyOfIdentity(now.identity) !== pr.key) return undefined;
        return proves(identity, answers);
      },
    },
  );
  // In the store's realm, where the change is filed (sentIn), never the top bar's: Global's held change keeps its notice
  // under a realm at the top.
  const held = useHeldIn(lock, pick, at.realm);
  const notice = useNoticeMemory();
  // Counts what ends a hold's story (a new press, a Stop waiting).
  const epoch = useRef(0);
  const atRef = useRef(at);
  atRef.current = at;
  const after = useRef(afterProved);
  after.current = afterProved;
  // A hold that goes, however it went, makes the visible reads stale: fetch them again (reads only). Nothing is claimed here.
  const prevHeld = useRef<HeldChange | null>(held);
  useEffect(() => {
    const prev = prevHeld.current;
    prevHeld.current = held;
    if (!prev || (held && held.hold === prev.hold)) return;
    after.current?.(atRef.current);
  }, [held]);
  const run = useCallback((v: V): Promise<LockedResult<D>> => {
    epoch.current += 1;
    probe.current = null;
    return locked.run(v);
  }, [locked]);
  const check = useCallback(async (): Promise<boolean> => {
    const h = heldNow();
    if (!h || typeof h.hold !== 'string' || h.hold === '') return false;
    const mine = epoch.current;
    const pr = { hold: h.hold, key: keyOfIdentity(h.identity) };
    probe.current = pr;
    // The read this check judges is one this press sends: any read already out (core's automatic read-back, a refresh) is
    // cancelled and answers nobody, and the read-back below joins the one sent here, never an older one.
    for (const r of reads(atRef.current)) { try { void refreshFresh(r, { own: true }).catch(() => undefined); } catch { /* a read that cannot start proves nothing */ } }
    try { await locked.readBack(); } finally { if (probe.current === pr) probe.current = null; }
    // True when this check ended the hold; nothing is said about the change, the re-read lists are what shows.
    const released = epoch.current === mine && heldNow() === null;
    return released;
  }, [locked, heldNow, reads]);
  const stopWaiting = useCallback(async (): Promise<boolean> => {
    const h = heldNow();
    epoch.current += 1;
    probe.current = null;
    return h ? locked.dismissOne(h.identity) : false;
  }, [locked, heldNow]);
  return { run, state: locked.state, held, check, stopWaiting, notice };
}

const projectReads = (at: MemoryAt) => [
  sourceReads(ADMIN_SOURCE, ['memory.projects'], { computer: computerOf(at) }),
  sourceReads(ADMIN_SOURCE, ['memory.status'], { computer: computerOf(at) }),
];

/** Tidy a project up: mints the intent, then enqueues the pass. A 200 means queued, never finished. */
export function useConsolidate(at: MemoryAt): AdminChange<ConsolidateVars, { queued: true }> {
  const change = useAdminChange<ConsolidateVars, { queued: true }>(
    'ai-memory.consolidate', MEMORY_CONSOLIDATE_LOCK, adminRoutes.consolidate,
    async (v, ctx) => {
      const nonce = await mintIntent(v, 'consolidate', ctx);
      const raw = await api(adminRoutes.consolidate, { target: v.target, realm: v.realm, body: { project: v.project, nonce, expect_realm: v.realm }, ctx });
      return queuedOf(raw, v.project);
    },
    (a) => [sourceReads(ADMIN_SOURCE, ['memory.consolidation'], { computer: computerOf(a) })],
    at, pickHost(at),
    (v) => ({ computer: computerOf(v), realm: v.realm, project: v.project }),
    consolidateProved,
  );
  // A held tidy-up is checked against the status of ITS project, whichever project is open now.
  const heldProject = projectOfIdentity(change.held?.identity);
  adminSource.useQuery<Consolidation | 'unreadable' | null, MemoryAt & { project?: string }>('memory.consolidation', heldProject ? { ...at, project: heldProject } : at, { enabled: heldProject !== '' });
  return change;
}

/** Erase a project's memory: mints the intent, then erases. Irreversible; a lost answer is held until the project list shows it gone. */
export function useErase(at: MemoryAt): AdminChange<EraseVars, Erased> {
  const change = useAdminChange<EraseVars, Erased>(
    'ai-memory.erase', MEMORY_ERASE_LOCK, adminRoutes.erase,
    async (v, ctx) => {
      const nonce = await mintIntent(v, 'wipe_project', ctx);
      const raw = await api(adminRoutes.erase, { target: v.target, realm: v.realm, params: { project: v.project }, body: { nonce, expect_realm: v.realm }, ctx });
      const done = erasedOf(raw, v.project);
      refreshVisible(v);
      return done;
    },
    projectReads,
    at, pickHost(at),
    (v) => ({ computer: computerOf(v), realm: v.realm, project: v.project }),
    eraseProved,
    refreshVisible,
  );
  const holding = change.held !== null;
  adminSource.useQuery<AdminProjects, MemoryAt>('memory.projects', at, { enabled: holding });
  adminSource.useQuery<MemoryStatus, MemoryAt>('memory.status', at, { enabled: holding });
  return change;
}

/** Use this computer as the realm's memory host. Self only, the shown realm only (expect_realm is always sent). */
export function useUseSelf(at: MemoryAt): AdminChange<HostVars, { assigned: true }> {
  const change = useAdminChange<HostVars, { assigned: true }>(
    'ai-memory.host', MEMORY_HOST_LOCK, adminRoutes.host,
    async (v, ctx) => {
      const raw = await api(adminRoutes.host, { target: v.target, realm: v.realm, body: { use_self: true, expect_realm: v.realm }, ctx });
      // A definite "not this computer" moves what the band shows as a success does: both read the hosts again (an unknown
      // answer is read back by its hold).
      let done: { assigned: true };
      try { done = assignedOf(raw, computerOf(v)); } catch (e) { if ((e as { kind?: unknown }).kind !== 'pending') refreshVisible(v); throw e; }
      refreshVisible(v);
      return done;
    },
    (a) => [sourceReads(ADMIN_SOURCE, ['memory.datahost'], { computer: computerOf(a) })],
    at, pickHost(at),
    (v) => ({ computer: computerOf(v), realm: v.realm }),
    hostProved,
    refreshVisible,
  );
  adminSource.useQuery<HostFacts | null, MemoryAt>('memory.datahost', at, { enabled: change.held !== null });
  return change;
}

// ---- write pending memory now ----

export interface FlushState {
  busy: boolean;
  /** The result the person closed (its key), so it stays closed when the bar re-mounts. */
  closed: string | null;
  /** The last press: done, a refusal, or unknown (the answer was lost, or the agent's own fault came back after some stores drained). */
  outcome: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale' | null;
  code?: string;
  status?: number;
  traceId?: string;
  route?: string;
}

/** A flush that failed is a definite failure only when the agent refused before draining anything (a realm it does not
 *  serve, a missing store). Its own fault after draining some stores comes back as an uncoded 400: some stores may be
 *  flushed already, so that is unknown, not failed. */
const FLUSH_REFUSALS = ['invalid_realm', 'realm_scope_unsupported', 'realm_mismatch', 'not_found', 'forbidden', 'service_unavailable', 'memory_realm_cold'];
function flushOutcome(e: unknown): Exclude<FlushState['outcome'], 'done' | null> {
  const o = outcomeOf(e, true);
  if (o !== 'failed') return o;
  const code = (e as Partial<HubError> | null)?.code;
  return typeof code === 'string' && FLUSH_REFUSALS.includes(code) ? 'failed' : 'pending';
}

/** The durability barrier. It is idempotent by state, so a lost answer is shown as unknown and the person may press again:
 *  no hold, no intent. */
export function useFlush(at: MemoryAt) {
  const [state, set] = useState<FlushState>({ busy: false, closed: null, outcome: null });
  const busy = useRef(false);
  const run = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    set((s0) => ({ busy: true, closed: s0.closed, outcome: null }));
    try {
      const raw = await api(adminRoutes.flush, { target: at.target, realm: at.realm });
      // The agent answers {status:"ok"}; any other 200 body is not its success, so the barrier may or may not have held.
      if (rec(raw)?.status !== 'ok') throw unreadable('FLUSH_UNREADABLE');
      set((s0) => ({ busy: false, closed: s0.closed, outcome: 'done' }));
    } catch (e) {
      const x = e as Partial<HubError> | null;
      set((s0) => ({
        busy: false,
        closed: s0.closed,
        outcome: flushOutcome(e),
        ...(typeof x?.code === 'string' ? { code: x.code } : {}),
        ...(typeof x?.status === 'number' ? { status: x.status } : {}),
        ...(typeof x?.traceId === 'string' ? { traceId: x.traceId } : {}),
        ...(typeof x?.route === 'string' ? { route: x.route } : {}),
      }));
    } finally {
      busy.current = false;
    }
  }, [at.target, at.realm]);
  const close = useCallback((key: string) => set((s0) => ({ ...s0, closed: key })), []);
  return { ...state, run, close };
}

/** Every admin action of the place shown, once, so the band's host action and the manage bar share their state. `project` is
 *  '' with none open (only flush and the host action apply then). */
export function useAdmin(at: MemoryAt, project: string) {
  const tidy = useConsolidate(at);
  const erase = useErase(at);
  const host = useUseSelf(at);
  const flush = useFlush(at);
  return { at, project, tidy, erase, host, flush };
}
export type Admin = ReturnType<typeof useAdmin>;

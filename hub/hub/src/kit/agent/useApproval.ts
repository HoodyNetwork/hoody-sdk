// The data behind Details → Session's approvals: the mode and auto-approve, one read and one change at a time,
// each change decided by reading the approvals back (core agent approval).
//
// The same rules as useLiveSession:
//   - one operation at a time (the read, or one change with its read-back, or one Check again); `running` is true
//     meanwhile, `active()` from the moment one starts;
//   - every read captures the hook's generation, and an answer from another generation is dropped. A new computer or
//     conversation starts a new generation. An ordinary read also captures its conversation's change count: one that
//     began before a change of that conversation (from here or the ask dock) is read again, never shown;
//   - a change is sent once. "Saved" needs the read-back to show it. A lost answer, or a read-back that does not show
//     it, is "may have gone through" with Check again (one read, nothing sent), never a resend (C9);
//   - while `paused` (another hook of the tab runs) a read waits and runs once it is quiet.
// A refusal (busy, Strict or locked, a policy that changed meanwhile) changed nothing: it is said with its reason and
// nothing is resent. A policy that changed meanwhile is read again, so the person chooses against what it is now.
// A read that fails or cannot be parsed leaves the approvals unknown (nothing to choose from), never the last ones.
//
// Attempts bind to their target. A change's attempt is captured at send (the computer, the
// conversation's realm, the conversation and the change) and kept outside the render, in this module, by its key:
// computer|realm|conversation; its read-back and Check again carry that realm. Until it
// is settled (shown by a read-back, or definitely refused) it stays there across another conversation, an unmount and a
// remount, and its own answer settles it whenever it comes. Meanwhile that conversation's approvals offer only Check
// again, which reads the captured target.
//
// The ask dock's Approve automatically switch writes the same yolo setting, so it takes its attempt here too
// (takeApprovalAttempt): one store per conversation, whichever surface sent the change. While either holds one, the other
// sends nothing, and a lost answer from either is "may have gone through" in both, settled by one read
// (checkApprovalAttempt).
import { useEffect, useMemo, useRef, useState } from 'react';
import { agent, type Target } from '@core';

export type ApprovalChangeState = {
  kind: 'running' | 'done' | 'pending' | 'busy' | 'refused' | 'conflict' | 'failed' | 'not_sent';
  code?: string;
  change: agent.ApprovalChange;
} | null;

export interface ApprovalData {
  phase: 'none' | 'loading' | 'done' | 'failed';
  approval: agent.Approval | null;
  error: unknown;
  change: ApprovalChangeState;
  running: boolean;
  /** The target the data is for (computer|conversation): what a confirm opened here belongs to. */
  key: string;
  /** Finished operations so far: a caller waiting for this hook to be quiet re-checks on each. */
  ops: number;
  /** Reads that came back with the approvals and were shown, so far. An operation that ends without one (a failed read,
   *  an answer that may predate a change) leaves `approval` as it was: only a count that moved proves a fresh read. */
  reads: number;
  /** An operation runs now (also one started in this commit, before `running` renders). */
  active(): boolean;
  retry(): void;
  save(change: agent.ApprovalChange): void;
  check(): Promise<boolean>;
}

// ── The unsettled attempts, by target ───────────────────────────────────────────────

interface Attempt {
  target: Target;
  realm: string;
  session: string;
  change: agent.ApprovalChange;
  /** running: sent, or read back, now; pending: its outcome is unknown until a read shows it. */
  kind: 'running' | 'pending';
}
const attempts = new Map<string, Attempt>();
// How many times a key's attempt has changed (taken, checked, settled), from any surface (as useLiveSession): an ordinary
// read that began before a change of its conversation may predate it, and is read again instead of shown.
const epochs = new Map<string, number>();
const epochOf = (key: string) => epochs.get(key) ?? 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const f of [...listeners]) f();
};
/** Replace `a` at `key` (only while `a` is still the one there, or nothing is). */
function put(key: string, a: Attempt, prev: Attempt | null) {
  if ((attempts.get(key) ?? null) !== prev) return;
  attempts.set(key, a);
  epochs.set(key, epochOf(key) + 1);
  notify();
}
function drop(key: string, a: Attempt) {
  if (attempts.get(key) !== a) return;
  attempts.delete(key);
  epochs.set(key, epochOf(key) + 1);
  notify();
}
/** Tests only: forget every attempt. */
export function forgetApprovalAttempts() {
  attempts.clear();
  epochs.clear();
  notify();
}

const keyOf = (target: Target | null, realm: string | null, session: string | null) =>
  target && realm && session ? `${target.project.id}|${target.container.id}|${target.container.server_name ?? ''}|${realm}|${session}` : '';

/** A finished change is still what the approvals read says: the read shows it and, for Ask when needed, auto-approve is off (Ask
 *  when needed under auto-approve asks nothing). A finished change the read no longer bears out is not said any more. */
const stillShown = (a: agent.Approval | null, c: ApprovalChangeState): boolean =>
  !!c && c.kind === 'done' && agent.approvalShows(a, c.change) && (c.change.field !== 'mode' || c.change.value !== 'default' || a?.yolo === false);
const keepChange = (a: agent.Approval | null, c: ApprovalChangeState): ApprovalChangeState => (c?.kind === 'done' && !stillShown(a, c) ? null : c);

/**
 * Read the captured target back for `a` and settle it: shown, it is dropped; otherwise it stays, pending. Nothing is sent.
 * `ok` only when the read showed the change.
 */
async function readBackAttempt(k: string, a: Attempt): Promise<{ ok: boolean; r: Awaited<ReturnType<typeof agent.readApproval>> }> {
  const reading: Attempt = { ...a, kind: 'running' };
  put(k, reading, attempts.get(k) ?? null);
  const r = await agent.readApproval(agent.approvalApi(a.target, a.realm), a.session);
  const ok = !r.stale && agent.approvalShows(r.approval, a.change);
  if (ok) drop(k, reading);
  else put(k, { ...a, kind: 'pending' }, reading);
  return { ok, r };
}

/** A change another surface sends itself (the ask dock's switch): it says how its answer ended. */
export interface ApprovalAttempt {
  /** Answered (shown, or definitely refused): the attempt is dropped. */
  settle(): void;
  /** The answer was lost or did not show the change: it stays, "may have gone through", until a read shows it. */
  unknown(): void;
}
/**
 * Take the conversation's attempt for `change` before sending it. Null when the conversation already has one (from
 * Details or the dock): then nothing is sent. Called only once the conversation's realm and session are known.
 */
export function takeApprovalAttempt(target: Target, realm: string, session: string, change: agent.ApprovalChange): ApprovalAttempt | null {
  const k = keyOf(target, realm, session);
  if (!k || attempts.has(k)) return null;
  const a: Attempt = { target, realm, session, change, kind: 'running' };
  put(k, a, null);
  // Each acts only while `a` is still the attempt there: the first of them ends it, the other then changes nothing.
  return {
    settle: () => drop(k, a),
    unknown: () => put(k, { ...a, kind: 'pending' }, a),
  };
}
/** The conversation's attempt now, from whichever surface: running (out now) or pending (may have gone through). */
export function approvalAttemptOf(target: Target | null, realm: string | null, session: string | null): { kind: 'running' | 'pending'; change: agent.ApprovalChange } | null {
  const a = attempts.get(keyOf(target, realm, session));
  return a ? { kind: a.kind, change: a.change } : null;
}
/** The same, as a hook: it re-renders whenever any attempt changes. */
export function useApprovalAttempt(target: Target | null, realm: string | null, session: string | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return approvalAttemptOf(target, realm, session);
}
/** Check again from another surface: one read of a pending attempt's captured target, nothing sent. True when it showed. */
export async function checkApprovalAttempt(target: Target, realm: string, session: string): Promise<boolean> {
  const k = keyOf(target, realm, session);
  const a = k ? attempts.get(k) : undefined;
  if (!a || a.kind !== 'pending') return false;
  return (await readBackAttempt(k, a)).ok;
}

type State = Pick<ApprovalData, 'phase' | 'approval' | 'error' | 'change' | 'running'>;
const EMPTY: State = { phase: 'none', approval: null, error: null, change: null, running: false };

/**
 * `realm`: the conversation's realm ('global' or its id), as the conversation reports it; null until known (nothing is
 * read or sent before).
 */
export function useApproval(target: Target | null, session: string | null, realm: string | null, paused = false): ApprovalData {
  const key = keyOf(target, realm, session);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the target's identity
  const api = useMemo(() => (target && realm ? agent.approvalApi(target, realm) : null), [key]);
  const gen = useRef(0);
  const live = useRef(true);
  const running = useRef(false);
  const wanted = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [st, setSt] = useState<State>(EMPTY);
  const [ops, setOps] = useState(0);
  const [reads, setReads] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  const attempt = key ? (attempts.get(key) ?? null) : null;

  const start = (): number => {
    running.current = true;
    setSt((x) => ({ ...x, running: true }));
    return ++gen.current;
  };
  const current = (g: number) => live.current && g === gen.current;
  const end = (g: number) => {
    if (!current(g)) return;
    running.current = false;
    setSt((x) => ({ ...x, running: false }));
    setOps((n) => n + 1);
  };

  /** The approvals read, as one operation. `refresh`: the approvals stay shown while it runs. */
  const read = (refresh = false) => {
    if (!api || !session) return;
    if (running.current || pausedRef.current || attempts.get(key)?.kind === 'running') {
      wanted.current = true;
      return;
    }
    wanted.current = false;
    const k = keyRef.current;
    const e = epochOf(k);
    const g = start();
    if (!refresh) setSt((x) => ({ ...x, phase: 'loading' }));
    void (async () => {
      const r = await agent.readApproval(api, session);
      if (!current(g)) return;
      // A change of this conversation moved while the read ran (here or from another surface, the ask dock's switch): the
      // answer may predate it. It is not shown; the read runs again once the hooks are quiet and no change is out.
      if (epochOf(k) !== e) {
        wanted.current = true;
        return end(g);
      }
      if (r.stale) {
        setSt((x) => (x.approval ? x : { ...x, phase: 'failed', error: true }));
        return end(g);
      }
      setSt((x) => ({ ...x, phase: r.approval ? 'done' : 'failed', approval: r.approval, error: r.approval ? null : r.err && !r.err.ok ? r.err.err : true, change: keepChange(r.approval, x.change) }));
      if (r.approval) setReads((n) => n + 1);
      end(g);
    })();
  };
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    live.current = true;
    gen.current += 1;
    running.current = false;
    wanted.current = false;
    setSt({ ...EMPTY, phase: api && session ? 'loading' : 'none' });
    readRef.current();
    return () => {
      live.current = false;
      gen.current += 1;
      wanted.current = false;
    };
  }, [api, session]);

  // A change of this conversation that another surface made (the host's own switch, the ask dock, another mount of this hook)
  // has ended: what is shown here predates it, so the approvals are read again. This hook's own change is read back by itself.
  const mine = useRef<unknown>(null);
  const lastAttempt = useRef<unknown>(null);
  useEffect(() => {
    const prev = lastAttempt.current;
    lastAttempt.current = attempt;
    // Another change of this conversation began (here, in Details, in the dock): a change this hook finished earlier is no
    // longer what the chat is, so it is not said any more.
    if (!prev && attempt) setSt((x) => (x.change ? { ...x, change: null } : x));
    if (prev && !attempt && (prev as { change?: unknown }).change !== mine.current) readRef.current(true);
  }, [attempt]);

  // A read asked for while not quiet runs once the hooks are (and this target's attempt is no longer in flight).
  const inFlight = attempt?.kind === 'running';
  useEffect(() => {
    if (!wanted.current || st.running || paused || inFlight) return;
    readRef.current(true);
  }, [st.running, paused, ops, inFlight]);

  /**
   * Read the captured target back for `a` and settle it. True only when the read showed it. `g`: the operation of this
   * hook it runs as, when it still belongs to the hook's target (else it settles the attempt alone).
   */
  const readBack = async (k: string, a: Attempt, g: number): Promise<boolean> => {
    const { ok, r } = await readBackAttempt(k, a);
    if (current(g) && keyRef.current === k) {
      setSt((x) => (r.stale
        ? { ...x, change: null }
        : { ...x, phase: r.approval ? 'done' : 'failed', approval: r.approval, error: r.approval ? null : r.err && !r.err.ok ? r.err.err : true, change: ok ? keepChange(r.approval, { kind: 'done', change: a.change }) : null }));
      if (!r.stale && r.approval) setReads((n) => n + 1);
      end(g);
    }
    return ok;
  };

  const save = (c: agent.ApprovalChange) => {
    const now = st.approval;
    if (!api || !session || !realm || !key || !now || running.current || pausedRef.current || attempts.has(key)) return;
    const k = key;
    const a: Attempt = { target: target!, realm, session, change: c, kind: 'running' };
    put(k, a, null);
    mine.current = c;
    const g = start();
    setSt((x) => ({ ...x, change: null }));
    void agent.sendApproval(api, session, c, now.revision).then((r) => {
      if (r.state === 'sent' || r.state === 'unknown' || r.state === 'stale') return void readBack(k, a, g);
      // A definite refusal: nothing changed, the attempt is settled.
      drop(k, a);
      if (!current(g) || keyRef.current !== k) return;
      if (r.state === 'failed') setSt((x) => ({ ...x, change: { kind: r.err.kind === 'not_sent' ? 'not_sent' : 'failed', code: r.err.code, change: c } }));
      else setSt((x) => ({ ...x, change: { kind: r.state, code: r.state === 'refused' ? r.code : r.state === 'busy' ? 'session_busy' : 'precondition_failed', change: c } }));
      end(g);
      // Refused for what the approvals or the chat are now: read them again so the controls follow.
      read(true);
    });
  };

  // Check again: one read of the captured target, nothing sent.
  const check = async (): Promise<boolean> => {
    const a = key ? attempts.get(key) : undefined;
    if (!a || a.kind !== 'pending' || running.current || pausedRef.current) return false;
    const g = start();
    return readBack(key, a, g);
  };

  const change: ApprovalChangeState = attempt ? { kind: attempt.kind === 'running' ? 'running' : 'pending', change: attempt.change } : st.change;
  return {
    ...st,
    change,
    running: st.running || inFlight,
    key,
    ops,
    reads,
    active: () => running.current || attempts.get(keyRef.current)?.kind === 'running',
    retry: () => read(),
    save,
    check,
  };
}

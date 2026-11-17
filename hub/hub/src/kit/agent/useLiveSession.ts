// The data behind Details → Session's live model and agent and its fixed rows: one conversation read and one
// change at a time, decided by reading the conversation back (core agent live).
//
// The same rules as useAgentSettings:
//   - one operation at a time (the reads, or one change with its read-back, or one Check again); `running` is true
//     meanwhile;
//   - every request captures the hook's generation, and an answer from another generation is dropped. A new
//     computer or conversation starts a new generation;
//   - a change is sent once. "Saved" needs the read-back to show it. A lost answer, or a read-back that does not show
//     it, is "may have gone through" with Check again (one read, nothing sent), never a resend (C9).
// Attempts bind to their target (as useApproval). A change's attempt is captured at send (the
// computer, the realm the caller shows, the conversation and the change) and kept outside the render, in this module, by
// its key: computer|realm|conversation (the realm as the link names it, not a label that can change). Until it is proven (the read-back shows it) or definitely refused it stays there
// across another conversation, an unmount and a remount (another Details tab, Details closed), and its own answer settles
// it whenever it comes. Meanwhile that conversation's model and agent offer only Check again, which reads the captured
// target; no second change is sent. Another conversation, computer or realm never sees it.
// A busy chat (409 gate_parked / turn_in_flight, or an agent switch the agent discarded behind a parked gate) changed
// nothing: that is said with its reason, nothing is resent, and the conversation is read again.
// The busy state is kept fresh while the tab is open: a busy chat is read again on a widening schedule (BUSY_STEPS,
// then every last step) until it is idle, and any chat is read again when the window comes back into view. A refresh
// asked for while an operation runs here or `paused` holds (another hook's operation runs) is kept and runs once
// afterwards. Each finished operation re-arms the schedule, so a refresh that fails at once keeps the schedule going.
// A background read never replaces a known conversation with a failed read.
// The change's answer (`persisted`, `defaultChanged`) is kept through "may have gone through" and every Check again.
import { useEffect, useMemo, useRef, useState } from 'react';
import { agent, hostEnv, type Target } from '@core';

export type LiveChangeState = {
  kind: 'running' | 'done' | 'pending' | 'busy' | 'failed' | 'not_sent';
  code?: string;
  change: agent.LiveChange;
  /** model: whether the answer said the chat's own record holds it; null when it was not answered. */
  persisted: boolean | null;
  /** model: whether the answer showed the agent also rewrote the chat agent's default (scope "agent"); null when it showed neither. */
  defaultChanged: boolean | null;
} | null;

export interface LiveData {
  phase: 'none' | 'loading' | 'done' | 'failed';
  live: agent.Live | null;
  liveError: unknown;
  change: LiveChangeState;
  running: boolean;
  /** Finished operations so far: a caller waiting for this hook to be quiet re-checks on each. */
  ops: number;
  /** An operation runs now (also one started in this commit, before `running` renders). */
  active(): boolean;
  retry(): void;
  save(change: agent.LiveChange): void;
  check(): Promise<boolean>;
}

// ── The unproven attempts, by target ──────────────────────────────────────────────────

interface Attempt {
  target: Target;
  session: string;
  change: agent.LiveChange;
  /** running: sent, or read back, now; pending: its outcome is unknown until a read shows it. */
  kind: 'running' | 'pending';
  /** The answer's facts, kept through "may have gone through" and every Check again. */
  persisted: boolean | null;
  defaultChanged: boolean | null;
}
const attempts = new Map<string, Attempt>();
// How many times a key's attempt has changed (sent, checked, proven, refused): an ordinary read that began before a change of
// its conversation, in this mount or another, may predate it, and is read again instead of shown.
const epochs = new Map<string, number>();
const epochOf = (key: string) => epochs.get(key) ?? 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const f of [...listeners]) f();
};
/** Put `a` at `key`, replacing `prev` only while `prev` is still the attempt there (null: only when there is none). */
function settle(key: string, prev: Attempt | null, next: Attempt | null) {
  if ((attempts.get(key) ?? null) !== prev) return;
  if (next) attempts.set(key, next);
  else attempts.delete(key);
  epochs.set(key, epochOf(key) + 1);
  notify();
}
/** Tests only: forget every attempt. */
export function forgetLiveAttempts() {
  attempts.clear();
  epochs.clear();
  notify();
}

const keyOf = (target: Target | null, realm: string, session: string | null) =>
  target && session ? `${target.project.id}|${target.container.id}|${target.container.server_name ?? ''}|${realm}|${session}` : '';

type State = Omit<LiveData, 'retry' | 'save' | 'check' | 'ops' | 'active'>;
const EMPTY: State = { phase: 'none', live: null, liveError: null, change: null, running: false };

/** The waits (ms) between reads of a busy chat; the last repeats until it is idle. */
export const BUSY_STEPS: readonly number[] = [2000, 5000, 10000, 30000];

/** The read shows the change. */
const shows = (live: agent.Live | null, c: agent.LiveChange) => live !== null && (c.field === 'model' ? live.model === c.value : live.agent === c.value);

/** `realm`: the conversation's realm as its link names it (the wire value, never a display name); part of the attempt's key. */
export function useLiveSession(target: Target | null, session: string | null, onSaved?: () => void, paused = false, realm = ''): LiveData {
  const key = keyOf(target, realm, session);
  const keyRef = useRef(key);
  keyRef.current = key;
  const where = target ? `${target.project.id}|${target.container.id}|${target.container.server_name ?? ''}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `where` is the target's identity
  const api = useMemo(() => (target ? agent.liveApi(target) : null), [where]);
  const gen = useRef(0);
  const live = useRef(true);
  const running = useRef(false);
  const saved = useRef(onSaved);
  saved.current = onSaved;
  const [st, setSt] = useState<State>(EMPTY);
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  const attempt = key ? (attempts.get(key) ?? null) : null;
  // Sent, or read back, now (by this or an earlier mount): no read or change meanwhile.
  const inFlight = attempt?.kind === 'running';
  // Finished operations: each one re-arms the busy schedule (React may batch away the running flag of a fast one).
  const [ops, setOps] = useState(0);
  // A refresh asked for while the hooks were not quiet: run once they are.
  const wanted = useRef(false);
  // ... and in the strongest mode asked for: a foreground read (initial, Try again) beats a background one, so the read that finally
  // runs shows loading and ends in the error phase when it fails, never a background read that leaves "loading" behind.
  const wantedFg = useRef(false);

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

  /** The conversation read, as one operation. `refresh`: a background read, which keeps a known conversation when it fails. */
  const read = (force = false, refresh = false) => {
    if (!api || !session || (running.current && !force)) return;
    // A change of this conversation is in flight (here or in an earlier mount): the read waits and runs once it is settled.
    if (attempts.get(keyRef.current)?.kind === 'running') {
      wanted.current = true;
      if (!refresh) wantedFg.current = true;
      return;
    }
    const k = keyRef.current;
    const e = epochOf(k);
    const g = start();
    if (!refresh) setSt((x) => ({ ...x, phase: 'loading' }));
    void (async () => {
      const r = await agent.readLive(api, session);
      if (!current(g)) return;
      // A change of this conversation moved while the read ran (here or in another mount): the answer may predate it. Read again,
      // as deferred work like every other refresh: not while the hooks are paused or a change runs, and in the strongest mode asked for.
      if (epochOf(k) !== e) {
        end(g);
        wanted.current = true;
        if (!refresh) wantedFg.current = true;
        refreshRef.current();
        return;
      }
      // The page moved on while the hook stays: a known conversation stays; with none yet, the read failed (Try again).
      if (r.stale) {
        setSt((x) => (x.live ? x : { ...x, phase: 'failed', liveError: true }));
        return end(g);
      }
      setSt((x) => (refresh && !r.live && x.live
        ? x
        : { ...x, phase: r.live ? 'done' : 'failed', live: r.live, liveError: r.live ? null : r.err && !r.err.ok ? r.err.err : true }));
      end(g);
    })();
  };

  useEffect(() => {
    live.current = true;
    gen.current += 1;
    running.current = false;
    wanted.current = false;
    wantedFg.current = false;
    setSt({ ...EMPTY, phase: api && session ? 'loading' : 'none' });
    read();
    return () => {
      live.current = false;
      gen.current += 1;
      wanted.current = false;
      wantedFg.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read is this render's; the Api and conversation decide
  }, [api, session, key]);

  // A busy chat is read again on the widening schedule; the step restarts whenever it is not busy.
  const step = useRef(0);
  const busy = st.live?.busy === true;
  const idleNow = st.phase === 'done' && !st.running && !inFlight && !paused;
  useEffect(() => {
    if (!busy) {
      step.current = 0;
      return;
    }
    if (!idleNow) return;
    const wait = BUSY_STEPS[Math.min(step.current, BUSY_STEPS.length - 1)]!;
    const id = setTimeout(() => {
      step.current += 1;
      read(false, true);
    }, wait);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read is this render's; the schedule follows busy, idle and each finished operation
  }, [busy, idleNow, st.live, ops]);

  // A background refresh: now when both hooks are quiet, else once they are.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const readRef = useRef(read);
  readRef.current = read;
  const refresh = () => {
    if (running.current || pausedRef.current || attempts.get(keyRef.current)?.kind === 'running') {
      wanted.current = true;
      return;
    }
    wanted.current = false;
    const fg = wantedFg.current;
    wantedFg.current = false;
    readRef.current(false, !fg);
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!wanted.current || st.running || inFlight || paused || !api || !session) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is this render's; it runs when the hooks go quiet
  }, [st.running, paused, ops, inFlight]);

  // Back in view: the chat may have started or finished work meanwhile.
  useEffect(() => {
    // Through the host env (the browser's document and window on the web; the terminal has neither).
    const env = hostEnv();
    const back = () => {
      if (env.visible()) refreshRef.current();
    };
    const offVisible = env.onVisibilityChange(back);
    const offFocus = env.onLifecycle('focus', back);
    return () => {
      offVisible();
      offFocus();
    };
  }, []);

  /**
   * Read the captured target back for `a` and settle it. True only when the read showed it. `g`: the operation of this
   * hook it runs as, when it still belongs to the hook's target (else it settles the attempt alone).
   */
  const readBack = async (k: string, a: Attempt, g: number, deferred: boolean): Promise<boolean> => {
    const r = await agent.readLive(agent.liveApi(a.target), a.session);
    const here = current(g) && keyRef.current === k;
    if (r.stale) {
      // The page moved on: unknown. The attempt stays, and the hook (if it is still here) reads once more.
      const pending: Attempt = { ...a, kind: 'pending' };
      settle(k, a, pending);
      if (here) {
        gen.current += 1;
        running.current = false;
        read(true);
      }
      return false;
    }
    const ok = shows(r.live, a.change);
    // An agent switch the agent discarded behind a parked gate did not happen (the agent said so); anything else the
    // read does not show may still be on its way.
    const kind = ok ? 'done' : deferred ? 'busy' : 'pending';
    settle(k, a, kind === 'pending' ? { ...a, kind: 'pending' } : null);
    if (!here) return ok;
    // The answer's facts stay with the change until it is decided (a later Check again shows them once it is saved).
    const ans = { persisted: a.persisted, defaultChanged: a.defaultChanged };
    // (An unknown outcome lives in the store, which the returned change reads: nothing here to go stale when another mount proves it.)
    setSt((x) => ({ ...x, live: r.live ?? x.live, change: kind === 'pending' ? null : { kind, code: deferred && !ok ? 'gate_parked' : undefined, change: a.change, ...ans } }));
    end(g);
    if (ok) saved.current?.();
    // A switch the agent discarded behind a parked gate: the chat is busy, so read it again for the controls.
    else if (deferred) refresh();
    return ok;
  };

  const save = (c: agent.LiveChange) => {
    const now = st.live;
    if (!api || !session || !key || !now || running.current || attempts.has(key)) return;
    const k = key;
    const a: Attempt = { target: target!, session, change: c, kind: 'running', persisted: null, defaultChanged: null };
    settle(k, null, a);
    const g = start();
    setSt((x) => ({ ...x, change: null }));
    void agent.sendLive(api, session, c, now.fixed.backend).then((r) => {
      if (r.state === 'busy' || r.state === 'failed') {
        // A definite refusal: nothing changed, the attempt is settled.
        settle(k, a, null);
        if (!current(g) || keyRef.current !== k) return;
        const kind = r.state === 'busy' ? 'busy' : r.err.kind === 'not_sent' ? 'not_sent' : 'failed';
        setSt((x) => ({ ...x, change: { kind, code: r.state === 'busy' ? r.code : r.err.code, change: c, persisted: null, defaultChanged: null } }));
        end(g);
        // Refused as busy: the chat started work since it was read, so read it again (the controls follow).
        if (r.state === 'busy') refresh();
        return;
      }
      if (r.state === 'stale') {
        // The page moved on: unknown. The attempt stays, and the hook (if it is still here) reads once more.
        settle(k, a, { ...a, kind: 'pending' });
        if (current(g) && keyRef.current === k) {
          gen.current += 1;
          running.current = false;
          read(true);
        }
        return;
      }
      const b: Attempt = r.state === 'sent' ? { ...a, persisted: r.persisted, defaultChanged: r.defaultChanged } : a;
      settle(k, a, b);
      void readBack(k, b, g, r.state === 'sent' && r.deferred);
    });
  };

  // Check again: one read of the captured target, nothing sent.
  const check = async (): Promise<boolean> => {
    const a = key ? attempts.get(key) : undefined;
    if (!api || !session || !a || a.kind !== 'pending' || running.current) return false;
    // The check is the attempt's operation now, for every mount: no second check or change meanwhile.
    const reading: Attempt = { ...a, kind: 'running' };
    settle(key, a, reading);
    const g = start();
    return readBack(key, reading, g, false);
  };

  // Try again: while the other hook's operation runs it waits, and runs once that is done.
  const retry = () => {
    if (pausedRef.current) {
      wanted.current = true;
      wantedFg.current = true;
    } else read();
  };

  const change: LiveChangeState = attempt ? { kind: attempt.kind, change: attempt.change, persisted: attempt.persisted, defaultChanged: attempt.defaultChanged } : st.change;
  return { ...st, change, running: st.running || inFlight, ops, active: () => running.current || attempts.get(keyRef.current)?.kind === 'running', retry, save, check };
}

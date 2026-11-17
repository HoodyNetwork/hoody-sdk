// The reads and the guarded writes of the hooks, on core. listHooks needs the settings
// session (Session.ts), so the list is read only once the session is open, and a list the agent answers 404/410 (the session is
// gone) is re-read after ONE replacement. Every write mints its own single-use nonce on that session at the moment of the press,
// inside the same locked change that sends the write (sendGuarded); it is sent once. A lost answer is held as unknown until a
// fresh read proves it (never resent); a refused or lost MINT sent no write and reads as not sent.
import {
  api, coreSource, heldChanges, outcomeOf, refreshFresh, sourceReads, useLockedChange,
  type Ctx, type HeldChange, type LockedResult, type SourceTable,
} from '@core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHeldIn } from '../../heldIn';
import { HOOK_EVENTS, OP_OF, disableAllBody, deleteBody, hooksBlockOf, nameable, placeable, placeDeleteBody, placeDigest, testBody, toggleBody, upsertBody, type HookOp, type HookPlace, type HookRef, type HooksBlock, type HooksRead, type UpsertFields } from './hooks';
import type { PlanStep } from './hookEdit';
import { CALL_WHEN, type RuleScope } from './logic';
import { rulesRoutes, hookRoutes } from './routes';
import { SessionError, isLostSession, settingsSessions, type Hold, type SettingsAt } from './Session';
import { sendGuarded, unreadable } from './data';
import { sendTrust } from './trustData';
import type { Review } from './trust';

export const HOOKS_LOCK = 'agent.hooks';
export const HOOKS_SOURCE = 'ai-hooks';
const PAGE = 'ai-hooks';
export { HOOK_EVENTS };

const computerOf = (a: SettingsAt) => a.target.container.id;

interface ListIn { at: SettingsAt; sid: string }
const hooksTable: SourceTable = {
  reads: {
    // The hooks of the settings session. The read keeps the place it was made for: a proof only counts a read of the same
    // realm and folder as the write.
    hooks: {
      route: rulesRoutes.list,
      input: (p: ListIn) => ({ target: p.at.target, realm: p.at.realm, query: { session_id: p.sid } }),
      select: (raw, p: ListIn): HooksRead | null => {
        const block = hooksBlockOf(raw);
        return block ? { block, realm: p.at.realm, cwd: p.at.cwd ?? null } : null;
      },
    },
  },
};
const source = coreSource(HOOKS_SOURCE, hooksTable);

export interface HooksList {
  /** The read, null while it is not in or when the answer cannot be read as a whole. */
  read: HooksRead | null;
  loading: boolean;
  /** Why there is no list: the settings chat could not be opened, or the read failed. */
  error: unknown;
  /** The settings chat could not be had (not a read failure). */
  sessionError: SessionError | null;
  reload: () => void;
  /** Reads the list again now and hands back that read: null when it failed or cannot be read as a whole. It changes nothing. */
  fresh: () => Promise<HooksBlock | null>;
  /** The list answered but cannot be read as a whole. */
  unreadable: boolean;
}

/**
 * The hooks of a place. Entering opens the settings session (once), then lists on it. A list the agent says no session is behind
 * (404/410) replaces the session ONCE for this place and lists again; a second loss shows as an error, never a loop.
 */
export function useHooksList(at: SettingsAt | null, hold: Hold | null): HooksList {
  const [sid, setSid] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<SessionError | null>(null);
  const replaced = useRef(0);
  const placeKey = at ? `${at.target.container.id}\u0000${at.realm}\u0000${at.cwd ?? ''}` : '';
  // A hold is one place: a new place starts over.
  useEffect(() => { setSid(null); setSessionError(null); replaced.current = 0; }, [placeKey, hold]);
  useEffect(() => {
    if (!hold) return undefined;
    let live = true;
    settingsSessions().run(hold, async (s) => s).then(
      (s) => { if (live) setSid(s); },
      (e: unknown) => { if (live && e instanceof SessionError && e.kind !== 'superseded') setSessionError(e); },
    );
    return () => { live = false; };
  }, [hold]);
  const q = source.useQuery<HooksRead | null, ListIn>('hooks', { at: at ?? ({} as SettingsAt), sid: sid ?? '' }, { enabled: at !== null && sid !== null });
  const err = q.error;
  useEffect(() => {
    if (!hold || sid === null || !err || !isLostSession(err) || replaced.current >= 1) return;
    replaced.current += 1;
    const dead = sid;
    // The manager replaces the session it sees the lost error on, once, and hands back the new one.
    settingsSessions().run(hold, async (s) => { if (s === dead) throw err; return s; }).then(
      (s) => setSid(s),
      (e: unknown) => { if (e instanceof SessionError && e.kind !== 'superseded') setSessionError(e); },
    );
  }, [err, hold, sid]);
  const reload = useCallback(() => { void q.refetch(); }, [q]);
  // Only an answer to a request this call sent counts (core's fetched-success tracking, refreshFresh own): a read that failed, was
  // cancelled (which hands the cached list back) or answered from the cache gives null.
  const fresh = useCallback(async (): Promise<HooksBlock | null> => {
    if (at === null || sid === null) return null;
    const mineNow = sourceReads(HOOKS_SOURCE, ['hooks'], { computer: computerOf(at) });
    const r = await refreshFresh((k) => mineNow(k) && (k[7] as { sid?: unknown } | null)?.sid === sid, { own: true });
    if (r.state !== 'fresh' || r.answers.length !== 1) return null;
    // The query holds the selected read (HooksRead), null when the answer could not be read as a whole.
    return (r.answers[0]!.data as HooksRead | null)?.block ?? null;
  }, [at, sid]);
  const have = at !== null && sid !== null;
  return {
    read: have ? (q.data ?? null) : null,
    loading: (hold !== null && sid === null && sessionError === null) || (have && q.isLoading),
    error: have ? q.error : null,
    sessionError,
    reload,
    fresh,
    unreadable: have && q.isSuccess && q.data === null,
  };
}

// ---- the writes ----

export interface HookVars extends SettingsAt {
  hold: Hold;
  scope: RuleScope;
  op: HookOp;
  /** toggle and delete: the hook, exactly as the list shows it. */
  hook?: HookRef;
  /** delete of a hook the agent turned off for hidden characters: its place, sent with `hook`'s event and command as listed (the
   *  position form). Never set for any other hook, and never for another op. */
  place?: HookPlace;
  /** toggle: the state asked for (true: off). */
  disabled?: boolean;
  /** disable all: the kill switch asked for. */
  value?: boolean;
  /** trust: the set the person reviewed (its hash and unverifiable targets are what is acknowledged). */
  review?: Review;
  /** upsert: the hook as it is to be written. */
  fields?: UpsertFields;
  /** A later step of a plan: the settings chat the first step ran on. The step is sent on that chat only, never on one opened to replace it. */
  pin?: string;
  /** A first step of a plan: told the chat it was sent on. */
  onSession?: (sid: string) => void;
}

/** One send of one guarded hook write: its nonce, then the write. The answer is only "ok"; the rest is read back. */
export function sendHook(v: HookVars, ctx: Ctx): Promise<{ ok: true }> {
  // A trust acknowledgement takes no nonce and names no hook: it presents the reviewed hash (trustData.ts).
  if (v.op === 'trust') return v.review ? sendTrust({ ...v, review: v.review }, ctx) : Promise.reject(new SessionError('scope'));
  // A write names a hook whole or not at all: the page never offers one that cannot be named, and this refuses it again before anything is minted.
  // A delete by place names the hook by its listed (marked) text, which is never plain ASCII: it is checked for what that form needs.
  if (v.place !== undefined && (v.op !== 'delete' || !v.hook || placeable({ ...v.hook, hidden: v.place }))) return Promise.reject(new SessionError('scope'));
  const named = v.op === 'upsert' ? v.fields : v.hook;
  if (v.op !== 'disable_all' && v.place === undefined && named && nameable(named)) return Promise.reject(new SessionError('scope'));
  // A pinned step (`before`): the chat of the plan was lost and another opened in its place. It does not carry on there: it is refused
  // before any nonce is minted on the new chat, so nothing reaches it and the step reads "not sent".
  return sendGuarded(v, OP_OF[v.op as Exclude<HookOp, 'trust'>], ctx, async (sid, nonce) => {
    v.onSession?.(sid);
    const base = { sessionId: sid, nonce, scope: v.scope };
    let raw: unknown;
    if (v.op === 'toggle') {
      if (!v.hook || typeof v.disabled !== 'boolean') throw new SessionError('scope');
      raw = await api(hookRoutes.toggle, { target: v.target, realm: v.realm, body: toggleBody({ ...base, hook: v.hook, disabled: v.disabled }), ctx });
    } else if (v.op === 'upsert') {
      if (!v.fields) throw new SessionError('scope');
      raw = await api(hookRoutes.upsert, { target: v.target, realm: v.realm, body: upsertBody({ ...base, fields: v.fields }), ctx });
    } else if (v.op === 'delete') {
      if (!v.hook) throw new SessionError('scope');
      const body = v.place ? placeDeleteBody({ ...base, event: v.hook.event, command: v.hook.command, place: v.place }) : deleteBody({ ...base, hook: v.hook });
      raw = await api(hookRoutes.remove, { target: v.target, realm: v.realm, body, ctx });
    } else {
      if (typeof v.value !== 'boolean') throw new SessionError('scope');
      raw = await api(hookRoutes.disableAll, { target: v.target, realm: v.realm, body: disableAllBody({ ...base, value: v.value }), ctx });
    }
    if ((raw as { status?: unknown } | null)?.status !== 'ok') throw unreadable('HOOKS_UNREADABLE');
    return { ok: true as const };
  }, true, v.pin === undefined ? undefined : (sid) => sid === v.pin, v.op === 'upsert' && v.fields?.when !== undefined ? CALL_WHEN : undefined);
}

/** What the lock holds: the place and the file. A folder only names the project and local files. */
export const hookLockKeyOf = (v: HookVars) => ({ computer: computerOf(v), realm: v.realm, scope: v.scope, cwd: v.scope === 'user' ? '' : (v.cwd ?? '') });
/** What the hold records: the lock's place, the op, and a digest of the hook it names, never its text, for every op (only `op` is
 *  shown; nothing judges the rest). A hook's text can be as long as the agent takes (a command up to 4096 units, a hidden hook's marked
 *  text with no bound), and core refuses a record past its size cap (TOO_LARGE), which would leave that write impossible.
 *  A delete by place also records its place. */
export const hookIdentityOf = (v: HookVars) => {
  const h = v.hook ?? v.fields;
  return {
    ...hookLockKeyOf(v), op: v.op,
    ...(v.place ? { matcher_index: v.place.matcherIndex, index: v.place.index } : {}),
    ...(h ? { text: placeDigest(`${h.event}\u0000${v.place ? v.place.matcher : h.matcher}\u0000${h.command}`) } : {}),
    ...(v.disabled !== undefined ? { disabled: v.disabled } : {}), ...(v.value !== undefined ? { value: v.value } : {}),
    ...(v.review ? { hash: v.review.hash } : {}),
  };
};

export interface HookChange {
  run: (v: HookVars) => Promise<LockedResult<{ ok: true }>>;
  state: 'free' | 'running' | 'pending';
  held: HeldChange | null;
  /** Reads the hooks again, for the person to look at. It frees nothing and says nothing about the change: true is "the read was started". */
  check: () => Promise<boolean>;
  stopWaiting: () => Promise<boolean>;
}

/**
 * Change one hook or the kill switch. Nothing infers that a write went through, and no read ever releases a hold: a hold after a lost
 * answer ends only by the person's Stop tracking, after looking at a fresh listing. (A listing cannot prove a delete or a switch off:
 * it is lossy and the agent names a hook by a canonical matcher the page cannot always reproduce.)
 */
export function useHookWrite(at: SettingsAt | null): HookChange {
  const atRef = useRef(at);
  atRef.current = at;
  const pick = useCallback((i: Record<string, unknown>) => !!atRef.current && i.computer === computerOf(atRef.current) && i.realm === atRef.current.realm, []);
  const heldNow = useCallback((): HeldChange | null => {
    const a = atRef.current;
    if (!a) return null;
    return heldChanges(HOOKS_LOCK, { realm: a.realm }).find((x) => pick((x.identity ?? {}) as Record<string, unknown>)) ?? null;
  }, [pick]);
  const reads = useCallback((): readonly ((k: readonly unknown[]) => boolean)[] => {
    const a = atRef.current;
    return a ? [sourceReads(HOOKS_SOURCE, ['hooks'], { computer: computerOf(a) })] : [];
  }, []);
  // No `proves`: core then keeps every hold until the person dismisses it.
  const locked = useLockedChange<HookVars, { ok: true }>(
    (v, _idem, ctx) => sendHook(v, ctx),
    reads(),
    'ai-hooks.write',
    // Filed under the realm the change names (under All realms a computer's own, not the context's 'all').
    { lock: HOOKS_LOCK, route: hookRoutes.toggle, sentIn: at?.realm, lockKey: hookLockKeyOf, identity: hookIdentityOf, page: PAGE },
  );
  // In the place's realm, where the change is filed (sentIn), never the top bar's.
  const held = useHeldIn(HOOKS_LOCK, pick, at?.realm ?? null);
  // A hold that goes, however it went, makes the visible hooks stale: fetch them again (reads only). Nothing is claimed here.
  const prevHeld = useRef<HeldChange | null>(held);
  useEffect(() => {
    const prev = prevHeld.current;
    prevHeld.current = held;
    if (!prev || (held && held.hold === prev.hold)) return;
    for (const r of reads()) { try { void refreshFresh(r).catch(() => undefined); } catch { /* a read that cannot start changes nothing */ } }
  }, [held, reads]);
  const run = useCallback((v: HookVars): Promise<LockedResult<{ ok: true }>> => locked.run(v), [locked]);
  const check = useCallback(async (): Promise<boolean> => {
    let started = false;
    for (const r of reads()) { try { void refreshFresh(r, { own: true }).catch(() => undefined); started = true; } catch { /* a read that cannot start shows nothing */ } }
    return started;
  }, [reads]);
  const stopWaiting = useCallback(async (): Promise<boolean> => {
    const h = heldNow();
    return h ? locked.dismissOne(h.identity) : false;
  }, [locked, heldNow]);
  return { run, state: locked.state, held, check, stopWaiting };
}

// ---- the editor's steps ----

export interface StepReport { op: PlanStep['op']; result: LockedResult<{ ok: true }> }
interface StepBase { at: SettingsAt; hold: Hold; scope: RuleScope }

/** One step of a plan, through the SAME change as every other write to the hooks (one lock per file: a held step blocks the rest). */
export async function runStep(change: Pick<HookChange, 'run'>, b: StepBase, step: PlanStep, bind: Pick<HookVars, 'pin' | 'onSession'> = {}): Promise<StepReport> {
  const v: HookVars = step.op === 'upsert'
    ? { ...b.at, hold: b.hold, scope: b.scope, op: 'upsert', fields: step.fields, ...bind }
    : { ...b.at, hold: b.hold, scope: b.scope, op: 'delete', hook: step.hook, ...bind };
  return { op: step.op, result: await change.run(v) };
}
/**
 * The steps of a plan in order. A step starts only when the one before it answered `done`: a refusal, a step that never left, or a lost
 * answer (the new hook may or may not exist) ends the run there, and the later steps are never minted or sent.
 */
export async function runPlan(change: Pick<HookChange, 'run'>, b: StepBase, steps: readonly PlanStep[]): Promise<StepReport[]> {
  const out: StepReport[] = [];
  // The steps run on ONE settings chat: a chat lost after the first step ends the plan there (the next step is not sent on a new one).
  let on: string | undefined;
  for (const step of steps) {
    const r = await runStep(change, b, step, on === undefined ? { onSession: (sid) => { on = sid; } } : { pin: on });
    out.push(r);
    if (r.result.outcome !== 'done') break;
  }
  return out;
}

export interface TestRow { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; durationMs: number | null }
/** What a test of an unsaved command came to: rows, the agent's refusal, a lost answer (it may have run), or nothing sent. */
export type TestResult =
  | { kind: 'rows'; rows: TestRow[] }
  | { kind: 'refused'; code: string }
  | { kind: 'unknown' }
  | { kind: 'not_run' };

/** One row of a test, read whole or not at all: a missing field, a wrong type or an impossible number makes the answer unknown, never a clean run. */
export const testRowOf = (x: unknown): TestRow | null => {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (!(r.exit_code === null || Number.isInteger(r.exit_code)) || typeof r.stdout !== 'string' || typeof r.stderr !== 'string'
    || typeof r.timed_out !== 'boolean' || !Number.isInteger(r.duration_ms) || (r.duration_ms as number) < 0) return null;
  return { exitCode: r.exit_code as number | null, stdout: r.stdout, stderr: r.stderr, timedOut: r.timed_out, durationMs: r.duration_ms as number };
};

/**
 * Runs the draft command now on the settings chat. It EXECUTES, so it is sent once whatever the answer looks like: a chat the agent lost
 * is not replaced and the request not repeated. It writes nothing and uses no nonce.
 */
export async function runTest(a: { at: SettingsAt; hold: Hold; event: string; command: string; timeout: number }): Promise<TestResult> {
  let sent = false;
  try {
    const out = await settingsSessions().run(a.hold, async (sid, alive) => {
      if (!alive()) throw new SessionError('superseded');
      sent = true;
      // Handed back as data, so the session manager sees a finished run and has nothing to replace and re-run.
      try { return { ok: true as const, v: await api(hookRoutes.test, { target: a.at.target, realm: a.at.realm, body: testBody({ sessionId: sid, event: a.event, command: a.command, timeout: a.timeout }) }) }; } catch (e) { return { ok: false as const, e }; }
    });
    if (!out.ok) {
      const o = outcomeOf(out.e, true);
      if (o === 'pending') return { kind: 'unknown' };
      if (o === 'failed') return { kind: 'refused', code: String((out.e as { code?: unknown } | null)?.code ?? 'other') };
      return { kind: 'not_run' };
    }
    const raw = out.v as { status?: unknown; rows?: unknown } | null;
    if (raw?.status !== 'ok' || !Array.isArray(raw.rows)) return { kind: 'unknown' };
    const rows = raw.rows.map(testRowOf);
    return rows.some((r) => r === null) ? { kind: 'unknown' } : { kind: 'rows', rows: rows as TestRow[] };
  } catch (e) {
    // A chat that ended after the request left may have run it; one that never opened ran nothing.
    if (e instanceof SessionError && sent && e.kind !== 'lost') return { kind: 'unknown' };
    return { kind: 'not_run' };
  }
}

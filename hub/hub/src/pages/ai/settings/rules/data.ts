// The reads and the one write of the checked rules, on core. Reading rules needs no session
// (getHookRules, with X-Hoody-Cwd for a folder's project and local scopes). A write goes through the settings session
// (Session.ts): it mints its single-use nonce on the session at the moment of the press, inside the same locked change that
// sends the write, and presents it with the scope's revision. The nonce is spent by the write whether it is applied or
// refused, so a write is never sent twice: a lost answer is held as unknown until a fresh read proves it (a 409 after a lost
// answer proves nothing, and nothing here asks for one). A refused or lost MINT sent no write: it reads as not sent.
// The one exception to "sent once" is a session the agent lost (Session.ts): its 404 is a refusal made before anything was
// applied, so the write is made again on a new session with a new nonce, against the same revision.
import {
  api, coreSource, heldChanges, refreshFresh, sourceReads, useLockedChange,
  type Ctx, type HeldChange, type HubError, type LockedResult, type SourceTable, type Target,
} from '@core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHeldIn } from '../../heldIn';
import { CALL_WHEN, listHasWhen, nonceOf, rulesBlockOf, rulesProved, writeBody, writtenOf, type Read, type Rule, type RuleScope, type Written } from './logic';
import { rulesRoutes } from './routes';
import { SessionError, scopeKeyOf, settingsSessions, type Hold, type SettingsAt } from './Session';

export type { SettingsAt } from './Session';
export const RULES_LOCK = 'agent.hook_rules';
export const RULES_SOURCE = 'ai-rules';
const PAGE = 'ai-rules';

const computerOf = (a: SettingsAt) => a.target.container.id;

const rulesTable: SourceTable = {
  reads: {
    // The rules of the realm's settings, with no session. The block keeps the place it was read for: a proof only counts
    // a read of the same realm and folder as the write.
    rules: {
      route: rulesRoutes.get,
      input: (p: SettingsAt) => ({ target: p.target, realm: p.realm, ...(p.cwd !== undefined ? { cwd: p.cwd } : {}) }),
      select: (raw, p: SettingsAt): Read | null => {
        const block = rulesBlockOf(raw);
        return block ? { block, realm: p.realm, cwd: p.cwd ?? null } : null;
      },
    },
  },
};
const source = coreSource(RULES_SOURCE, rulesTable);

/** The rules the agent reports for this place now. `data` is null when the answer cannot be read as a whole: never an empty list. */
export const useRules = (at: SettingsAt, enabled: boolean) => source.useQuery<Read | null, SettingsAt>('rules', at, { enabled });

/**
 * The confirming read of a write: ONE request sent now for this place's rules (any read already out is cancelled), judged by what
 * that request itself fetched, never by the cache (a cancelled or failed refetch hands the cached answer back). null when it did
 * not answer, or answered for another place. The caller still checks the revision it shows.
 */
export async function confirmRead(at: SettingsAt): Promise<Read | null> {
  const base = sourceReads(RULES_SOURCE, ['rules'], { computer: computerOf(at) });
  const mine = (k: readonly unknown[]): boolean => {
    const p = k[7] as Partial<SettingsAt> | null;
    return base(k) && !!p && typeof p === 'object' && p.realm === at.realm && (p.cwd ?? null) === (at.cwd ?? null);
  };
  let f;
  try { f = await refreshFresh(mine, { own: true }); } catch { return null; }
  if (f.state !== 'fresh') return null;
  for (const a of f.answers) {
    const r = a.data as Read | null;
    if (r && typeof r === 'object' && r.block && r.realm === at.realm && (r.cwd ?? null) === (at.cwd ?? null)) return r;
  }
  return null;
}

// ---- the session hold ----

/** Holds the settings session of `at` for as long as the caller is mounted. Holding opens nothing; the first write does. */
export function useSettingsHold(at: SettingsAt | null): Hold | null {
  const key = at ? scopeKeyOf(at) : null;
  const atRef = useRef(at);
  atRef.current = at;
  const [hold, setHold] = useState<Hold | null>(null);
  useEffect(() => {
    const a = atRef.current;
    if (!a) return undefined;
    const h = settingsSessions().hold(a);
    setHold(h);
    return () => { h.release(); setHold(null); };
  }, [key]);
  return hold;
}

/** The session's state for words ("settings chat opened ...", "could not open"). */
export function useSessionState() {
  const m = settingsSessions();
  const [st, set] = useState(() => m.state());
  useEffect(() => { set(m.state()); return m.subscribe(() => set(m.state())); }, [m]);
  return st;
}

// ---- the write ----

/** An error as a send that never left: the nonce could not be minted, or no session could be made. Its facts are kept for Details. */
export function unsent(e: unknown, code?: string): Error {
  const x = (e && typeof e === 'object' ? e : {}) as Partial<HubError> & { message?: string };
  return Object.assign(new Error(typeof x.message === 'string' ? x.message : 'nonce'), x, { kind: 'not_sent', notSent: true, pending: false, stale: false }, code ? { code } : {});
}

/** An answer to a write that the page cannot read as the agent's success: the write may have been applied. */
export function unreadable(code: string): Error {
  return Object.assign(new Error('unreadable answer'), { kind: 'pending', pending: true, code });
}

export interface SaveVars extends SettingsAt {
  hold: Hold;
  scope: RuleScope;
  /** The scope's revision the list was read at. */
  revision: string;
  /** The scope's complete list, as it is to be. */
  rules: readonly Rule[];
}

// The demo's refusal keeps its own code: the kit's words say it is the demo (kit/states/errorWords.ts LOCAL), and no page
// repeats that sentence.
export const sessionCode = (e: SessionError): string => (e.kind === 'demo' && e.code ? e.code : `SETTINGS_${e.kind.toUpperCase()}`);

/** What a guarded write needs to be sent: the place, the settings-session hold and the settings scope the nonce binds to. */
export interface GuardedVars { target: Target; realm: string; hold: Hold; scope: RuleScope }
export type GuardedOp = 'rules_set' | 'toggle' | 'delete' | 'set_disabled' | 'upsert';

async function mint(v: GuardedVars, op: GuardedOp, sid: string, ctx: Ctx): Promise<string> {
  let raw: unknown;
  try {
    // recovers: a lost answer to the mint is read as "not sent" here, so core must not announce a change that may have gone through.
    raw = await api(rulesRoutes.begin, { target: v.target, realm: v.realm, body: { session_id: sid, op, scope: v.scope }, ctx, recovers: true });
  } catch (e) {
    throw unsent(e);
  }
  const nonce = nonceOf(raw);
  if (nonce === null) throw unsent(new Error('nonce'), 'NONCE_UNREADABLE');
  return nonce;
}

/**
 * One guarded write: a nonce minted for this op and scope on the settings session (made first when there is none), then the write
 * `write` makes with it. The write is sent once. A nonce or session that fails before the write left is "not sent"; a write that
 * left and whose session then ended is held as unknown, never sent again. The only re-run is a session the agent lost (Session.ts).
 * `onceOnly`: the WRITE step is never re-run, even on an answer that looks like a lost session. A hook write answers 404 not_found
 * for a hook that is not there as well as for a missing session, and the two cannot be told apart: that answer stays a refusal.
 * `before`: checked on each session attempt BEFORE the nonce is minted; false sends nothing (not sent, no nonce), as a lost session.
 * `needs`: a capability the write's body relies on (call_when for a `when`). An agent that does not list it would ignore that part, so
 * the write is refused before the nonce is minted (not sent, code CAPABILITY_MISSING), never sent without it.
 */
export async function sendGuarded<T>(v: GuardedVars, op: GuardedOp, ctx: Ctx, write: (sid: string, nonce: string) => Promise<T>, onceOnly = false, before?: (sid: string) => boolean, needs?: string): Promise<T> {
  // Whether the write request left in the run that ended last: a session that ends after that point leaves its outcome unknown.
  let sent = false;
  try {
    return await settingsSessions().run(v.hold, async (sid, alive, has) => {
      sent = false;
      if (before && !before(sid)) throw new SessionError('lost');
      if (needs !== undefined && !has(needs)) throw unsent(new Error('capability'), 'CAPABILITY_MISSING');
      const nonce = await mint(v, op, sid, ctx);
      // The hold or the session ended while the nonce was being minted: the write is not started, and this nonce is not used.
      if (!alive()) throw new SessionError('superseded');
      sent = true;
      if (!onceOnly) return write(sid, nonce);
      // Handed back as data, so the session manager sees a finished run and has nothing to replace and re-run.
      try { return { ok: true as const, v: await write(sid, nonce) }; } catch (e) { return { ok: false as const, e }; }
    }).then((r) => {
      if (!onceOnly) return r as T;
      const o = r as { ok: boolean; v?: T; e?: unknown };
      if (o.ok) return o.v as T;
      throw o.e;
    });
  } catch (e) {
    if (e instanceof SessionError) {
      // A write that had left when its session ended may have been applied: it is held, never reported as not sent.
      // (A session the agent lost twice refused the request before applying anything: that is not sent.)
      if (sent && e.kind !== 'lost') throw unreadable(sessionCode(e));
      // No session could be had, or the write never started: nothing was sent.
      throw unsent(e, sessionCode(e));
    }
    throw e;
  }
}

/** One send of a scope's list: the nonce, then the write, on the settings session (made first when there is none). */
export function sendRules(v: SaveVars, ctx: Ctx): Promise<Written> {
  return sendGuarded(v, 'rules_set', ctx, async (sid, nonce) => {
    const raw = await api(rulesRoutes.set, {
      target: v.target, realm: v.realm, body: writeBody({ sessionId: sid, nonce, scope: v.scope, revision: v.revision, rules: v.rules }), ctx,
    });
    const w = writtenOf(raw);
    if (!w) throw unreadable('RULES_UNREADABLE');
    return w;
  }, false, undefined, listHasWhen(v.rules) ? CALL_WHEN : undefined);
}

export const keyOfIdentity = (identity: unknown): string => JSON.stringify(identity ?? null);

/** What the lock holds for one scope: the place and the scope. A folder only names the project and local scopes. */
export const lockKeyOf = (v: SaveVars) => ({ computer: computerOf(v), realm: v.realm, scope: v.scope, cwd: v.scope === 'user' ? '' : (v.cwd ?? '') });
/** What a Check again judges: the lock's place plus the revision and the list the write was made with. */
export const identityOf = (v: SaveVars) => ({ ...lockKeyOf(v), revision: v.revision, rules: v.rules.map((r) => ({ ...r })) });

export interface SaveChange {
  run: (v: SaveVars) => Promise<LockedResult<Written>>;
  state: 'free' | 'running' | 'pending';
  held: HeldChange | null;
  /** One new read for the hold held now; true when that check ended the hold. It says nothing about whether the change went through. */
  check: () => Promise<boolean>;
  stopWaiting: () => Promise<boolean>;
}

/**
 * Save one scope's rules. Nothing infers that a write went through: a hold ends only by a Check again (ONE new read started
 * after that press, for the hold held at that moment, judged by rulesProved on what that read fetched) or by Stop tracking.
 */
export function useSaveRules(at: SettingsAt | null): SaveChange {
  const probe = useRef<{ hold: string; key: string } | null>(null);
  const atRef = useRef(at);
  atRef.current = at;
  const pick = useCallback((i: Record<string, unknown>) => !!atRef.current && i.computer === computerOf(atRef.current) && i.realm === atRef.current.realm, []);
  const heldNow = useCallback((): HeldChange | null => {
    const a = atRef.current;
    if (!a) return null;
    return heldChanges(RULES_LOCK, { realm: a.realm }).find((x) => pick((x.identity ?? {}) as Record<string, unknown>)) ?? null;
  }, [pick]);
  const reads = useCallback((): readonly ((k: readonly unknown[]) => boolean)[] => {
    const a = atRef.current;
    return a ? [sourceReads(RULES_SOURCE, ['rules'], { computer: computerOf(a) })] : [];
  }, []);
  const locked = useLockedChange<SaveVars, Written>(
    (v, _idem, ctx) => sendRules(v, ctx),
    reads(),
    'ai-rules.save',
    {
      // Filed under the realm the save names (under All realms a computer's own, not the context's 'all').
      lock: RULES_LOCK, route: rulesRoutes.set, sentIn: at?.realm, lockKey: lockKeyOf, identity: identityOf, page: PAGE,
      proves: (identity, answers) => {
        const pr = probe.current;
        if (!pr || pr.key !== keyOfIdentity(identity)) return undefined;
        const now = heldNow();
        if (!now || now.hold !== pr.hold || keyOfIdentity(now.identity) !== pr.key) return undefined;
        return rulesProved(identity, answers);
      },
    },
  );
  // In the place's realm, where the save is filed (sentIn), never the top bar's: a Global place under a realm keeps its notice.
  const held = useHeldIn(RULES_LOCK, pick, at?.realm ?? null);
  const epoch = useRef(0);
  // A hold that goes, however it went, makes the visible rules stale: fetch them again (reads only). Nothing is claimed here.
  const prevHeld = useRef<HeldChange | null>(held);
  useEffect(() => {
    const prev = prevHeld.current;
    prevHeld.current = held;
    if (!prev || (held && held.hold === prev.hold)) return;
    for (const r of reads()) { try { void refreshFresh(r).catch(() => undefined); } catch { /* a read that cannot start changes nothing */ } }
  }, [held, reads]);
  const run = useCallback((v: SaveVars): Promise<LockedResult<Written>> => {
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
    // The read this check judges is one this press sends: any read already out is cancelled and answers nobody.
    for (const r of reads()) { try { void refreshFresh(r, { own: true }).catch(() => undefined); } catch { /* a read that cannot start proves nothing */ } }
    try { await locked.readBack(); } finally { if (probe.current === pr) probe.current = null; }
    return epoch.current === mine && heldNow() === null;
  }, [locked, heldNow, reads]);
  const stopWaiting = useCallback(async (): Promise<boolean> => {
    const h = heldNow();
    epoch.current += 1;
    probe.current = null;
    return h ? locked.dismissOne(h.identity) : false;
  }, [locked, heldNow]);
  return { run, state: locked.state, held, check, stopWaiting };
}

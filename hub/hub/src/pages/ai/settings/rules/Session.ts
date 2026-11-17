// The settings session: hooks, trust, MCP servers and every rules WRITE need a live
// session on the agent, and reading rules needs none. This is the one place that opens, leases, replaces and closes it.
//
//   - A view that needs the session HOLDS its scope (hold) and runs its requests through run(): the session is created on the
//     first run, not on entering the page, so a view that only reads rules opens nothing. The session is a `chat` agent
//     (no tools), never prompted, in the folder asked for (or the realm's home with no folder), with an attachment lease
//     taken from the create answer and held before the first request, so the agent does not drop a never-prompted draft.
//   - One session per scope. Holds of the same scope share it. A hold of another scope (Realm <-> Folder, another folder)
//     closes the old session at once; the holds of the old scope end (their run() refuses, superseded): nothing answered for
//     the old scope can reach the new one. The last hold's release closes the session; so does pagehide (keepalive).
//   - Closing is the agent's DELETE ?hard=true plus the lease's release. A close is best effort: a session left behind has
//     no tools and no prompt, and the agent drops it by itself.
//   - A session the agent no longer has (404 or 410 from the request that used it: an agent restart, an expiry) is replaced
//     ONCE: run() makes a new session and runs the request again. The request is re-run from the top, so a write mints its
//     nonce again; a nonce minted on the old session is never reused. A second loss in the same run ends it (SessionLost).
//     Re-running is only for requests the agent refuses before applying (a missing session is exactly that).
//   - The create is keyed, and a lost create answer is never asked again under its key: the next open uses a NEW key. The
//     session a lost answer may have made is a draft with no tools and no prompt, which the agent discards by itself.
//   - Everything an old scope or a closed session answers late is dropped by generation: a create that answers after its
//     hold ended closes the session it made at once.
import { scopeKeyOf, refOf, createBody, SessionError, isLostSession } from './Session.pure';
import type { Live, HoldRec } from './Session.pure';
export { SETTINGS_AGENT, scopeKeyOf, createBody, SessionError, isLostSession } from './Session.pure';
export type { SettingsAt, CreateBody, SessionApi, SessionFailure, SessionState, Hold, SettingsSessions, SessionDeps } from './Session.pure';
import type { SettingsAt, SessionApi, SessionFailure, Hold, SettingsSessions, SessionDeps } from './Session.pure';
import { agent, agentLoginOf, agentSignInRoutes, api, capture, hostEnv, isRealmOrGlobal, newKey, outcomeOf } from '@core';
import { leases as pageLeases, type LeaseHandle, type LeaseManager } from '@kit';
import { capOn, capsOk, checkStarted, gatedCreate, routes as askRoutes, seg } from '@ask/io';
import { sessionRoutes } from './routes';

export const liveApi: SessionApi = {
  status: (a) => api(agentSignInRoutes.status, { target: a.target, recovers: true }),
  version: (a) => api(askRoutes.version, { target: a.target, recovers: true }),
  create: (a, body, key) => gatedCreate(() => liveApi.version(a), () => api(sessionRoutes.create, { target: a.target, realm: a.realm, body, idem: key, recovers: true })),
  close: async (a, sid, keepalive) => {
    // hard=true removes the session at once (a plain close would keep a prompted chat; a settings session has no prompt). Core's delete
    // route reads its success status, so its answer is {status, body}: it is ignored here, as it always was (best effort, the caller ignores a failure).
    await api(agent.sessionRoutes.delete, { target: a.target, realm: a.realm, params: { id: sid }, query: { hard: true }, recovers: true, ...(keepalive ? { keepalive: true } : {}) });
  },
};

export function createSettingsSessions(deps: SessionDeps = {}): SettingsSessions {
  const io = deps.api ?? liveApi;
  const mkKey = deps.newKey ?? newKey;
  const accountNow = deps.account ?? (() => capture().account);
  const getLeases = (): LeaseManager => deps.leases ?? pageLeases();
  const subs = new Set<() => void>();

  // The scope being served. `gen` moves with every scope change and every close: an answer from an older generation is dropped.
  let gen = 0;
  // Moves whenever a session is ended ON PURPOSE (a scope change, the last release, pagehide, reset) and never when the agent lost
  // one: a run that began before such an end must not start over on a new session, whatever its late answer says.
  let ended = 0;
  let scope: string | null = null;
  let holds = new Set<HoldRec>();
  let cur: Live | null = null;
  let opening: { gen: number; promise: Promise<Live> } | null = null;
  let replaced = 0;
  let failure: SessionFailure | null = null;
  // The current end is a page hide's (closeNow), until anything opens or another end comes.
  let hidden = false;
  // The page-hide listener's unsubscribe while it is on (the host's lifecycle seam: a web page's pagehide; the terminal host's
  // own end of page, never a `window` read, which trapped there).
  let unlisten: (() => void) | null = null;
  // Each hold object stands for exactly one record: a released or superseded hold never borrows another hold's right to run.
  const recOf = new WeakMap<Hold, HoldRec>();

  const emit = () => { for (const f of [...subs]) { try { f(); } catch { /* the subscriber's own */ } } };
  const onPageHide = () => closeNow();
  const listen = (on: boolean) => {
    if (on === (unlisten !== null)) return;
    if (on) unlisten = hostEnv().onLifecycle('pagehide', onPageHide);
    else { const off = unlisten!; unlisten = null; off(); }
  };

  function drop(l: Live, keepalive: boolean) {
    try { l.handle.close(); } catch { /* the lease manager's own */ }
    void io.close(l.at, l.sid, keepalive).catch(() => undefined);
  }

  /** The current session ends; nothing it answers later counts. */
  function closeCurrent(keepalive: boolean) {
    gen++;
    ended++;
    hidden = false;
    const l = cur;
    cur = null;
    opening = null;
    if (l) drop(l, keepalive);
  }

  function closeNow() {
    const had = cur !== null || opening !== null;
    closeCurrent(true);
    hidden = had;
    // A page restored from the back/forward cache keeps its mounted holds: they get the new generation and open a fresh session
    // (new create key) at their next run.
    for (const h of holds) h.gen = gen;
    if (had) emit();
  }

  async function create(at: SettingsAt, mine: number): Promise<Live> {
    if (!isRealmOrGlobal(at.realm) || (at.cwd !== undefined && !(at.cwd.startsWith('/') && at.cwd.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(at.cwd)))) throw new SessionError('scope');
    let status: unknown;
    try { status = await io.status(at); } catch (e) { throw new SessionError('refused', (e as { code?: string })?.code ?? null, (e as { status?: number })?.status ?? null); }
    if (mine !== gen) throw new SessionError('superseded');
    const login = agentLoginOf(status, accountNow());
    const owner = (status as { owner_fingerprint?: unknown } | null)?.owner_fingerprint;
    if (login !== 'ready' || typeof owner !== 'string' || !owner) throw new SessionError('not_ready');
    let version: unknown;
    try { version = await io.version(at); } catch (e) { throw new SessionError('refused', (e as { code?: string })?.code ?? null, (e as { status?: number })?.status ?? null); }
    if (mine !== gen) throw new SessionError('superseded');
    if (!capsOk(version)) throw new SessionError('not_ready');
    let res: unknown;
    try {
      res = await io.create(at, createBody(at), mkKey());
    } catch (e) {
      const x = e as { code?: string; status?: number };
      // The terminal demo refuses every change unsent: say so, never that the agent refused.
      if (outcomeOf(e, true) === 'not_sent' && x?.code === 'DEMO_READ_ONLY') throw new SessionError('demo', x.code, x.status ?? null);
      // A create whose answer may have been lost is not asked again under its key: the next open mints a new one.
      throw new SessionError(outcomeOf(e, true) === 'pending' ? 'unknown' : 'refused', x?.code ?? null, x?.status ?? null);
    }
    const sid = (res as { session_id?: unknown } | null)?.session_id;
    const bad = checkStarted(res, { realm: at.realm, container: at.target.container.id, owner });
    if (!seg(sid)) throw new SessionError('unknown');
    const made = { at, sid, handle: null as unknown as LeaseHandle, ref: refOf(at, sid), version };
    // MISMATCH (well-formed evidence of another binding) is a binding failure; MISSING (the reply lacks the evidence) proves nothing
    // either way (C9) and reads unknown. Either way the session this create made is never used, so it is closed.
    if (bad) { void io.close(at, sid, false).catch(() => undefined); throw new SessionError(bad === 'MISMATCH' ? 'binding' : 'unknown'); }
    if (mine !== gen) { void io.close(at, sid, false).catch(() => undefined); throw new SessionError('superseded'); }
    const lm = getLeases();
    made.handle = lm.track(made.ref, { pinned: true });
    await lm.ensure(made.ref);
    if (mine !== gen) { drop(made, false); throw new SessionError('superseded'); }
    if (lm.state(made.ref).phase !== 'held') { drop(made, false); throw new SessionError('lease'); }
    return made;
  }

  async function ensureOpen(h: HoldRec): Promise<Live> {
    if (h.dead || h.gen !== gen) throw new SessionError('superseded');
    if (cur) return cur;
    if (!opening || opening.gen !== gen) {
      const mine = gen;
      const p = create(h.at, mine).then(
        (l) => {
          if (mine !== gen) { drop(l, false); throw new SessionError('superseded'); }
          cur = l; opening = null; failure = null;
          emit();
          return l;
        },
        (e: unknown) => {
          if (opening && opening.gen === mine) opening = null;
          if (mine === gen) { failure = e instanceof SessionError ? e.kind : 'refused'; emit(); }
          throw e;
        },
      );
      opening = { gen: mine, promise: p };
      hidden = false;
      emit();
    }
    return opening.promise;
  }

  function replaceLost(sid: string) {
    if (cur && cur.sid === sid) {
      const l = cur;
      cur = null;
      gen++; // answers of the lost session's requests are dropped; holds keep their right to a new one (see below)
      for (const h of holds) h.gen = gen;
      replaced++;
      drop(l, false);
      emit();
    }
  }

  return {
    hold(at) {
      const key = scopeKeyOf(at);
      if (scope !== key) {
        // A new scope: the old session closes now and the old holds end.
        if (cur || opening) closeCurrent(false); else gen++;
        for (const h of holds) h.dead = true;
        holds = new Set();
        scope = key;
        replaced = 0;
        failure = null;
        emit();
      }
      const rec: HoldRec = { at, key, gen, dead: false };
      holds.add(rec);
      listen(true);
      const handle: Hold = {
        scope: key,
        release: () => {
          if (rec.dead) return;
          rec.dead = true;
          holds.delete(rec);
          if (holds.size === 0 && scope === key) {
            closeCurrent(false);
            scope = null;
            replaced = 0;
            failure = null;
            listen(false);
            emit();
          }
        },
      };
      recOf.set(handle, rec);
      return handle;
    },

    async run<T>(hold: Hold, work: (sid: string, alive: () => boolean, has: (name: string) => boolean) => Promise<T>): Promise<T> {
      const rec = recOf.get(hold);
      if (!rec || rec.dead || !holds.has(rec)) throw new SessionError('superseded');
      const began = ended;
      let again = false;
      for (;;) {
        if (ended !== began) throw new SessionError('superseded');
        const l = await ensureOpen(rec);
        if (rec.dead || scope !== rec.key) throw new SessionError('superseded');
        try {
          const alive = () => !rec.dead && scope === rec.key && cur === l;
          const out = await work(l.sid, alive, (name) => capOn(l.version, name));
          // An answer that comes after the hold ended or the session was replaced belongs to nobody.
          if (!alive()) throw new SessionError('superseded');
          return out;
        } catch (e) {
          if (e instanceof SessionError) throw e;
          if (!isLostSession(e) || rec.dead || scope !== rec.key) throw e;
          // The session was ended on purpose while this run was out (pagehide, a scope change that came back): a late 404 does not
          // start it over.
          if (ended !== began) throw new SessionError('superseded');
          if (again) { replaceLost(l.sid); throw new SessionError('lost', (e as { code?: string })?.code ?? null, (e as { status?: number })?.status ?? null); }
          again = true;
          replaceLost(l.sid);
        }
      }
    },

    state() {
      return { phase: cur ? 'open' : opening ? 'opening' : failure ? 'failed' : 'idle', scope, sid: cur?.sid ?? null, replaced, failure, hidden };
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    closeNow,
    reset() {
      gen++;
      ended++;
      cur = null; opening = null; scope = null; holds = new Set(); replaced = 0; failure = null; hidden = false;
      listen(false);
    },
  };
}

let shared: SettingsSessions | null = null;
/** The page's one settings session manager. */
export function settingsSessions(): SettingsSessions { return shared || (shared = createSettingsSessions()); }
/** Tests: install a manager (null: the real one again). */
export function setSettingsSessionsForTests(m: SettingsSessions | null): void { shared = m; }

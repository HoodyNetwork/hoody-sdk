// GitHub accounts reads and changes, on core. They follow the top bar's computer and realm, or Global
// (realm=global) under any top-bar realm; with All realms and the realm place nothing is
// read (each realm has its own accounts). Every change names its own realm (explicitRealm), so core files its hold under the
// place it was sent in and shows it in every realm view; the hooks below pick the shown place's own. Every change is sent
// once and never resent (C9): a lost answer is held under its lock until a fresh status read of the same computer and realm
// shows it, or the person dismisses it.
// The source id 'ai-github' is the held changes' sender name: it stays when the section moves under the /ai routes.
import { coreSource, isRealmOrGlobal, useCurrentComputer, useRealms, useRunner, type HeldChange, type SourceTable, type Target } from '@core';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAiRealm } from '../../aiRealm';
import { activeProved, deviceOf, loginProved, logoutProved, statusOf, type AccountIdentity, type DeviceStart, type GhStatus, type LoginIdentity } from './logic';
import { githubRoutes } from './routes';

export const GITHUB_LOGIN_LOCK = 'agent.github_login';
export const GITHUB_ACTIVE_LOCK = 'agent.github_active';
export const GITHUB_LOGOUT_LOCK = 'agent.github_logout';
const SOURCE = 'ai-github';
const HOST = 'github.com';

/** Where a read goes: the computer and the realm. */
export interface GitHubAt { target: Target; realm: string }
/** A wait's device: the handle of its code (never the code), GitHub's interval and expiry. */
export interface WaitDevice { handle: string; interval: number; expiresIn: number }
export interface LoginVars extends GitHubAt { device: WaitDevice; activate: boolean; before: string[] }

// The device codes of waits that are out, by handle. A wait's variables carry only the handle, so core's copies of them (the
// send's variables, its byte snapshot, the held identity) never hold the code, and its request body reads the code through a
// getter (core keeps the body object for the call's life but never reads it; the request reads it when it is built). The code
// leaves this map when its wait ends or its page is left, so from then on nothing here or in core can produce it: only the
// request already built holds it, until it settles. A page left before the request was built sends an empty code, which the
// agent refuses (nothing is linked).
const codes = new Map<string, string>();
let codeSeq = 0;
const stash = (code: string): string => {
  const h = `w${++codeSeq}`;
  codes.set(h, code);
  return h;
};
/** Tests: how many device codes wait for their request. */
export const codesWaiting = (): number => codes.size;
export interface AccountVars extends GitHubAt { key: string; login: string }

const idOf = (v: GitHubAt) => v.target.container.id;

export const githubTable: SourceTable = {
  reads: {
    status: {
      route: githubRoutes.status,
      input: (p: GitHubAt) => ({ target: p.target, realm: p.realm }),
      select: (raw, p: GitHubAt): GhStatus => statusOf(raw, { computer: idOf(p), realm: p.realm }),
    },
  },
  changes: {
    // Starting links nothing (nobody has seen its code), so any status read of the place proves a lost start did nothing.
    start: {
      route: githubRoutes.start,
      explicitRealm: true,
      input: (v: GitHubAt) => ({ target: v.target, realm: v.realm, body: {} }),
      lockKey: (v: GitHubAt) => ({ computer: idOf(v) }),
      identity: (v: GitHubAt) => ({ computer: idOf(v), realm: v.realm }),
      select: (raw) => deviceOf(raw),
      reads: ['status'],
      proves: (identity, answers) => {
        const i = identity as { computer?: unknown; realm?: unknown };
        return (answers[0] ?? []).some((s) => (s as GhStatus | undefined)?.computer === i.computer && (s as GhStatus | undefined)?.realm === i.realm) ? 'not_applied' : undefined;
      },
    },
    login: {
      route: githubRoutes.poll,
      explicitRealm: true,
      input: (v: LoginVars) => ({
        target: v.target, realm: v.realm,
        body: {
          get device_code(): string { return codes.get(v.device.handle) ?? ''; },
          interval: v.device.interval, expires_in: v.device.expiresIn, activate: v.activate,
        },
      }),
      reads: ['status'],
      lock: GITHUB_LOGIN_LOCK,
      // One device login at a time on a computer (the realm is in core's scope).
      lockKey: (v: LoginVars) => ({ computer: idOf(v) }),
      identity: (v: LoginVars): LoginIdentity => ({ computer: idOf(v), realm: v.realm, host: HOST, before: [...v.before] }),
      select: (raw) => {
        const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        return { login: typeof r.login === 'string' ? r.login : '', key: typeof r.key === 'string' ? r.key : '' };
      },
      proves: loginProved,
    },
    active: {
      route: githubRoutes.active,
      explicitRealm: true,
      input: (v: AccountVars) => ({ target: v.target, realm: v.realm, body: { key: v.key } }),
      reads: ['status'],
      lock: GITHUB_ACTIVE_LOCK,
      // Activating any account changes which one is in use: one switch at a time on a computer.
      lockKey: (v: AccountVars) => ({ computer: idOf(v) }),
      identity: (v: AccountVars): AccountIdentity => ({ computer: idOf(v), realm: v.realm, key: v.key, login: v.login }),
      select: () => undefined,
      proves: activeProved,
    },
    logout: {
      route: githubRoutes.logout,
      explicitRealm: true,
      input: (v: AccountVars) => ({ target: v.target, realm: v.realm, body: { key: v.key } }),
      reads: ['status'],
      lock: GITHUB_LOGOUT_LOCK,
      lockKey: (v: AccountVars) => ({ computer: idOf(v), key: v.key }),
      identity: (v: AccountVars): AccountIdentity => ({ computer: idOf(v), realm: v.realm, key: v.key, login: v.login }),
      select: () => undefined,
      proves: logoutProved,
    },
  },
};

const source = coreSource(SOURCE, githubTable);

/** Which accounts the section shows: the top bar realm's, or Global's (accounts not tied to a realm, realm=global). */
export type AccountsPlace = 'realm' | 'global';
// The place picked, kept while the page's tab lives (in memory only). Global is offered under any top-bar realm: each change
// names its realm (explicitRealm), so core shows and releases a Global hold in every realm view (core changes.ts shownIn,
// query.ts readsRealm). Not in a shared-access session pinned to one realm: its agent calls carry that realm whatever they
// name (core kit.ts agentRealm), so its "Global" would read and change that realm (as memory's useGlobalOpen). One pinned to
// every realm (an access key with no realm limit) sends the realm each call names, as an account session does.
let placePicked: AccountsPlace = 'realm';
const placeListeners = new Set<() => void>();
const subscribePlace = (f: () => void) => { placeListeners.add(f); return () => { placeListeners.delete(f); }; };
/** Picks the accounts place, e.g. before opening Connections from a Global folder. */
export function pickAccountsPlace(p: AccountsPlace): void {
  if (placePicked === p) return;
  placePicked = p;
  for (const f of placeListeners) f();
}
/** The place picked, whether Global can be shown now (not a shared-access session), and the place shown. */
export function useAccountsPlace(): { picked: AccountsPlace; globalOk: boolean; shown: AccountsPlace } {
  const picked = useSyncExternalStore(subscribePlace, () => placePicked, () => placePicked);
  const pinned = useRealms().pinned;
  const globalOk = pinned === null || pinned === 'all';
  return { picked, globalOk, shown: picked === 'global' && globalOk ? 'global' : 'realm' };
}

/** Where the section reads now: the top bar's computer and the place shown (the page's realm: the top bar's, or under All
 *  realms the computer's own, aiRealm.ts; or Global); null when there is none (no computer, or the realm place with no one
 *  realm to tell). */
export function useGitHubAt(): GitHubAt | null {
  const target = useCurrentComputer();
  const selected = useAiRealm().realm;
  const { shown } = useAccountsPlace();
  const realm = shown === 'global' ? 'global' : selected;
  return useMemo(() => (target && isRealmOrGlobal(realm) ? { target, realm } : null), [target, realm]);
}

export function useGitHubStatus(at: GitHubAt | null) {
  return source.useQuery<GhStatus, GitHubAt | undefined>('status', at ?? undefined, { enabled: at !== null });
}

type Proof = (identity: unknown, answers: readonly (readonly unknown[])[]) => 'applied' | undefined;
type Runner<V> = ReturnType<typeof useRunner<V>>;
/** Check again for the hold this place shows, in place of core's, which re-reads every held change of the
 *  page (each change names its realm: every realm's and Global's). It re-reads this place's own status
 *  (this computer, this explicit realm: one request sent now) and frees only the shown hold, through the runner's prove
 *  (core's complete, by that hold's token), only when the change's own proof says that answer shows it applied. Anything
 *  else (no answer, a failed or older one, another place's hold) keeps it held. No change is sent. */
function usePlaceCheck<V>(runner: Runner<V>, at: GitHubAt | null, proves: Proof): Runner<V> {
  // An observer that never reads on its own (enabled: false: no read on mount, none for core's read-backs to count); its
  // refetch reads this place's status now.
  const refetch = source.useQuery<GhStatus, GitHubAt | undefined>('status', at ?? undefined, { enabled: false }).refetch;
  const { prove, held } = runner;
  const check = useCallback(async (): Promise<boolean> => {
    if (!at || !held || held.computer !== idOf(at) || held.realm !== at.realm) return false;
    const identity = held;
    return prove(async () => {
      const t0 = Date.now();
      const r = await refetch({ cancelRefetch: true });
      if (r.isError || r.status !== 'success' || r.dataUpdatedAt < t0) return false;
      return proves(identity, [[r.data]]) === 'applied';
    });
  }, [at, held, prove, refetch, proves]);
  return useMemo(() => ({ ...runner, check }), [runner, check]);
}

const s = (v: unknown) => (typeof v === 'string' ? v : '');

/** The device login's start (no hold of its own beyond core's default; a lost one is proved harmless by any status read).
 *  Its answer carries the device code (secret): `clear` drops it from both places that keep an answer, core's (a secret
 *  route keeps its last answer to show) and the runner's outcome; `leftover` is what either still keeps (tests). */
export function useLoginStart() {
  const m = source.useMutation<DeviceStart | null, GitHubAt>('start');
  const runner = useRunner<GitHubAt>(m);
  const { reset } = runner;
  const mReset = m.reset;
  const clear = useCallback(() => { reset(); mReset(); }, [reset, mReset]);
  const leftover = (): unknown => (m.data !== undefined ? m.data : runner.outcome?.data);
  return { ...runner, clear, leftover };
}

/** The device login's wait: held per computer until a status read shows a new account, or Stop waiting. */
export function useLogin(at: GitHubAt | null) {
  const m = source.useMutation<{ login: string; key: string }, LoginVars>('login');
  const computer = at?.target.container.id ?? '';
  const realm = at?.realm ?? '';
  // This place's waits only: core lists every realm's in every view (explicitRealm), and Global is a place of its own.
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.realm === realm, [computer, realm]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('login', h), []);
  const vars = useCallback(
    (i: Record<string, unknown>): LoginVars => ({
      target: at?.target as Target, realm: s(i.realm), activate: false,
      before: Array.isArray(i.before) ? i.before.map(String) : [],
      device: { handle: '', interval: 0, expiresIn: 0 },
    }),
    [at],
  );
  const runner = usePlaceCheck(useRunner<LoginVars>(m, { lock: GITHUB_LOGIN_LOCK, pick, vars, heldBy }), at, loginProved);
  // True while a wait of this computer and place is out, this mount's or one sent before the page was left: a new one is not
  // offered meanwhile. Counted here by place (waitsOut), not by core's sending state, which lists every place's (explicitRealm)
  // and so cannot tell Global from a realm.
  useSyncExternalStore(subscribeWaits, () => waitsVersion, () => waitsVersion);
  return { ...runner, inFlight: at !== null && (waitsOut.get(placeOf(at)) ?? 0) > 0 };
}

// Waits out per computer and place: one goes up when useDeviceLogin sends it and down when its call settles,
// whichever mount of the section is open then.
const waitsOut = new Map<string, number>();
const waitsListeners = new Set<() => void>();
let waitsVersion = 0;
const subscribeWaits = (f: () => void) => { waitsListeners.add(f); return () => { waitsListeners.delete(f); }; };
function countWait(place: string, d: 1 | -1): void {
  const n = (waitsOut.get(place) ?? 0) + d;
  if (n > 0) waitsOut.set(place, n);
  else waitsOut.delete(place);
  waitsVersion++;
  for (const f of waitsListeners) f();
}

/** What the person sees of a device login: never the device code. */
export interface DeviceShown { userCode: string; link: string | null; expiresIn: number }

// The last outcome of a wait that ended after its page was left, per computer and realm (no code in it): the page opened
// meanwhile shows it, as the page that sent it would have. Cleared by the next start there.
export interface LateResult { kind: 'done' | 'failed'; code: string; login: string }
const late = new Map<string, LateResult>();
const lateListeners = new Set<() => void>();
let lateVersion = 0;
const placeOf = (at: GitHubAt) => `${idOf(at)}\u0000${at.realm}`;
function setLate(place: string, r: LateResult | null): void {
  if (r) late.set(place, r);
  else if (!late.delete(place)) return;
  lateVersion++;
  for (const f of lateListeners) f();
}
const subscribeLate = (f: () => void) => { lateListeners.add(f); return () => { lateListeners.delete(f); }; };
/** The outcome of a wait of `at` that ended after its page was left, or null. */
export function useLateResult(at: GitHubAt): LateResult | null {
  useSyncExternalStore(subscribeLate, () => lateVersion, () => lateVersion);
  return late.get(placeOf(at)) ?? null;
}

// Log-outs of each computer and realm (keys only, plus the login for the done line), kept while the page's tab lives so leaving
// and coming back keeps them:
// - out: sent from this page and not yet answered or retired; each send is its own attempt (a number), so an answer is matched
//   to the send it belongs to, whichever mount of the section receives it.
// - marked: answered done while a list read before the answer may still show the account: the section marks those rows logged
//   out with nothing offered.
// A readable list of that place without the key retires both (it shows the log-out done); an answer whose attempt was retired
// meanwhile (the same account may since be linked again) marks nothing.
interface Place { out: Map<string, { n: number; login: string }>; marked: readonly string[] }
const logouts = new Map<string, Place>();
const outListeners = new Set<() => void>();
let outVersion = 0;
let attemptSeq = 0;
function placeState(place: string): Place {
  let p = logouts.get(place);
  if (!p) { p = { out: new Map(), marked: [] }; logouts.set(place, p); }
  return p;
}
function changed(): void { outVersion++; for (const f of outListeners) f(); }
const subscribeOut = (f: () => void) => { outListeners.add(f); return () => { outListeners.delete(f); }; };
const NO_KEYS: readonly string[] = [];
/** The log-outs of `at`: the keys marked logged out, and the steps of a log-out's life (see above). */
export function useLogouts(at: GitHubAt) {
  useSyncExternalStore(subscribeOut, () => outVersion, () => outVersion);
  const place = placeOf(at);
  const keys = logouts.get(place)?.marked ?? NO_KEYS;
  /** A log-out sent: its attempt number. */
  const begin = useCallback((key: string, login: string): number => {
    const n = ++attemptSeq;
    placeState(place).out.set(key, { n, login });
    changed();
    return n;
  }, [place]);
  /** Its answer: done marks the row (only while that attempt is still out); any answer ends the attempt. */
  const answered = useCallback((key: string, n: number, done: boolean): void => {
    const p = placeState(place);
    if (p.out.get(key)?.n !== n) return;
    p.out.delete(key);
    if (done && !p.marked.includes(key)) p.marked = [...p.marked, key];
    changed();
  }, [place]);
  /** A readable list: what it no longer shows is logged out; returns the logins of attempts it retired (done, also when lost). */
  const retire = useCallback((shown: readonly string[]): string[] => {
    const p = logouts.get(place);
    if (!p) return [];
    const gone = [...p.out.entries()].filter(([k]) => !shown.includes(k));
    const kept = p.marked.filter((k) => shown.includes(k));
    if (gone.length === 0 && kept.length === p.marked.length) return [];
    for (const [k] of gone) p.out.delete(k);
    p.marked = kept;
    changed();
    return gone.map(([, v]) => v.login);
  }, [place]);
  return { keys, begin, answered, retire };
}
/** Tests only: forget every log-out (a fresh page). */
export function forgetLoggedOut(): void { logouts.clear(); changed(); }

/** A done start's answer split into the wait's device (its code stashed behind a handle) and what is shown; null for a start
 *  that did not answer done. */
function split(r: { outcome: string; data?: unknown }): { device: WaitDevice | null; view: DeviceShown | null } | null {
  if (r.outcome !== 'done') return null;
  const got = (r.data ?? null) as DeviceStart | null;
  return {
    device: got ? { handle: stash(got.deviceCode), interval: got.interval, expiresIn: got.expiresIn } : null,
    view: got ? { userCode: got.userCode, link: got.link, expiresIn: got.expiresIn } : null,
  };
}

/** One device login: start (GitHub's code), then one wait. The device code is read out of the start's answer at once (core's
 *  and the runner's copies of that answer are cleared) and handed to the wait's request through a one-shot handle, so nothing
 *  here or in core's records of the wait holds it; only the request itself does, until it settles. Leaving the page does not
 *  stop a wait that is out (core change calls take no signal, and the person may be approving on GitHub in another tab): it
 *  ends at GitHub's expiry at the latest; a page opened meanwhile shows it is still waiting (useLogin's inFlight), offers no
 *  second one, and shows how it ended (useLateResult). A start answered after the page was left sends no wait: its code is
 *  dropped (a start links nothing). */
export function useDeviceLogin(at: GitHubAt) {
  const start = useLoginStart();
  const login = useLogin(at);
  const handle = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (handle.current) codes.delete(handle.current);
      handle.current = null;
    };
  }, []);
  const [shown, setShown] = useState<DeviceShown | null>(null);
  const [bad, setBad] = useState(false);
  const [linked, setLinked] = useState<string | null>(null);
  const { run: startRun, clear } = start;
  const { run: loginRun } = login;
  const begin = useCallback(async (activate: boolean, before: string[]): Promise<void> => {
    const place = placeOf(at);
    setBad(false);
    setLinked(null);
    setLate(place, null);
    // The start's answer (with the code) is read in split() and goes out of scope there: this function, which stays alive for
    // the whole wait, keeps only the handle and what is shown.
    const parts = split(await startRun(at));
    if (!parts) return;
    const { device, view } = parts;
    clear();
    // The page was left while the start was out: its code is dropped and no wait is sent.
    if (!alive.current) { if (device) codes.delete(device.handle); return; }
    if (!device || !view) { setBad(true); return; }
    handle.current = device.handle;
    setShown(view);
    countWait(place, 1);
    try {
      const p = await loginRun({ ...at, device, activate, before });
      const name = ((p.data ?? {}) as { login?: string }).login ?? '';
      if (alive.current) {
        if (p.outcome === 'done') setLinked(name);
      } else if (p.outcome === 'done' || p.outcome === 'failed') {
        setLate(place, { kind: p.outcome, code: p.code ?? '', login: name });
      }
    } finally {
      countWait(place, -1);
      codes.delete(device.handle);
      handle.current = null;
      if (alive.current) setShown(null);
    }
  }, [at, startRun, clear, loginRun]);
  /** Tests: whether anything this login owns still keeps the device code (the wait's request itself aside). */
  const holdsCode = (): boolean => (handle.current !== null && codes.has(handle.current)) || start.leftover() !== undefined;
  return { start, login, shown, bad, linked, begin, holdsCode };
}

/** Switching the account in use on this computer. */
export function useActivate(at: GitHubAt | null) {
  const m = source.useMutation<unknown, AccountVars>('active');
  const computer = at?.target.container.id ?? '';
  const realm = at?.realm ?? '';
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.realm === realm, [computer, realm]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('active', h), []);
  const vars = useCallback((i: Record<string, unknown>): AccountVars => ({ target: at?.target as Target, realm: s(i.realm), key: s(i.key), login: s(i.login) }), [at]);
  return usePlaceCheck(useRunner<AccountVars>(m, { lock: GITHUB_ACTIVE_LOCK, pick, vars, heldBy }), at, activeProved);
}

/** Logging one account out. */
export function useLogout(at: GitHubAt | null, key: string) {
  const m = source.useMutation<unknown, AccountVars>('logout');
  const computer = at?.target.container.id ?? '';
  const realm = at?.realm ?? '';
  const pick = useCallback((i: Record<string, unknown>) => i.computer === computer && i.realm === realm && i.key === key, [computer, realm, key]);
  const heldBy = useCallback((h: HeldChange) => source.heldBy('logout', h), []);
  const vars = useCallback((i: Record<string, unknown>): AccountVars => ({ target: at?.target as Target, realm: s(i.realm), key: s(i.key), login: s(i.login) }), [at]);
  return usePlaceCheck(useRunner<AccountVars>(m, { lock: GITHUB_LOGOUT_LOCK, pick, vars, heldBy }), at, logoutProved);
}

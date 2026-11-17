// The home page's data: the overview (who, where, what is set up) and the setup actions, read
// through @core. The overview is composed from the computer list of the shown realm, the realm
// view, the setup state (read only when the account has no computer), the API keys list and
// this page's account preference.
import {
  defineQuery,
  defineRoute,
  api,
  claimRetryMinute,
  redeemRoute,
  resetSetup,
  retrySetupRoute,
  setupLocks,
  useLockedChange,
  type Ctx,
  type HubError,
  type SetupRoom,
  computerHandle,
  computerState,
  pickComputer,
  type ComputerState,
  useCan,
  useCurrentComputer,
  useRealms,
  realmLabel,
  useSetupState,
  computersPage,
  containersRoute as coreContainersRoute,
  changesOverview,
  heldAttempts,
  heldChanges,
  useAttemptsVersion,
  useChangesVersion,
} from '@core';
import { countryFlag, useShellData } from '@kit';
import { useCallback, useMemo, useState } from 'react';
import { links as scripts } from '../scripts/links';
import { beingMade, homeState, redeemProves, unresolvedLines, retryProves, type Facts, type HeldLine, type UnresolvedInput } from './logic';
import { useWidgetPrefs } from './parts/useWidgetPrefs';

export type SetupKind = 'provisioning' | 'stalled' | 'invite' | 'inviteFailed' | 'capacity' | 'mailbox' | 'expired' | 'reinstalled';

export interface HomeComputer {
  id: string;
  name: string;
  running: boolean;
  /** Its state bucket; 'attention' is every status that is not running, stopped, starting or being made (unknown included). */
  state: ComputerState;
  /** name.last4: how a link names it, never the full id. */
  handle: string;
  /** Regional indicator flag emoji of its server. */
  flag?: string;
  /** Its server's country, an upper-case ISO 3166 alpha-2 code as the list gave it. */
  country?: string;
  /** Server name, e.g. "n12". */
  server?: string;
}

export interface Overview {
  /** First name or display name; absent in a shared session. */
  userName?: string;
  /** Test-only: the hour of day (0-23) the greeting uses. */
  hour?: number;
  /** A shared (token) session: no account state is read or shown. */
  shared: boolean;
  realm: { id: string; name: string; all: boolean };
  computers: HomeComputer[];
  pickedId?: string;
  /** No computer in the whole account (not only in the shown realm): setup, not an empty realm. */
  accountEmpty?: boolean;
  /** Present only while the account has no computer: what is blocking the first one ('provisioning' while unread). */
  setup?: SetupKind;
  /** The setup state as the server answered it; absent while unread or failed (never the 'provisioning' fallback). */
  setupRead?: SetupKind;
  /** 'reinstalled' only: core's read of the server list (core reinstalledOffers says what it offers). */
  setupRoom?: SetupRoom | null;
  /** The list answer is the realm's whole list (one page). False: rows beyond it may exist, so no row missing from it
   *  proves absence. */
  listWhole: boolean;
  /** Seconds the first computer has been in setup when the page loaded. */
  setupAgeSec?: number;
  facts: Facts;
  /** A milestone whose read failed (its fact is then unknown): said as "Could not check", never "Checking". */
  factsFailed?: { key: boolean };
  checklistHidden: boolean;
  /** Home saw this account being onboarded (stored flag). */
  onboarding: boolean;
  /** The person hid the Welcome panel (stored flag). */
  introHidden: boolean;
  /** Home opened or offered the tour before (stored flag in hub_home_v1, which sign-out purges: once per sign-in in this browser). */
  toured?: boolean;
  /** The stored flags above are read: the store is open and its value opens here. While it opens (or a saved value does
   *  not open on this browser) they read as defaults, so nothing that happens once may be decided from them. */
  prefsRead?: boolean;
  /** The All-realms view's whole list is one computer, still being made. Never a single-realm view: realm usage leaves
   *  out computers with no realm, so one computer there does not prove the account has one. */
  firstMaking?: boolean;
  /** The All-realms view's whole list is one computer, and it runs. */
  firstRunning?: boolean;
  bands: { offline?: boolean; stale?: boolean; partial?: number; lastDataAt?: string };
}

interface RawComputer {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  project_id?: unknown;
  server_name?: unknown;
  created_at?: unknown;
  realm_ids?: unknown;
  server?: { country?: unknown } | null;
}

// The one containers route of core: the shell's own list read and this page's share it, so fixture states and the cache see one read.
export const containersRoute = coreContainersRoute;
export const tokensRoute = defineRoute<{ data?: unknown[] }>({ method: 'GET', path: '/auth/tokens', scope: 'base', baseOnly: true });

/** The first word of the account name; an all-lowercase username reads as a name ("ada" becomes "Ada"). */
function firstName(name: string | undefined): string | undefined {
  const word = name?.trim().split(/\s+/)[0];
  if (!word) return undefined;
  return word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

// The countries a server's flag is shown for (the flag itself is kit countryFlag: the emoji on the web, the code in a
// terminal, where the emoji is two cells wide and font-dependent).
const FLAGGED: ReadonlySet<string> = new Set(['SG', 'DE', 'US', 'FR', 'GB', 'NL', 'FI', 'JP', 'CA', 'AU']);
const flagOf = (country: string): string | undefined => (FLAGGED.has(country) ? countryFlag(country) : undefined);

interface Row extends HomeComputer {
  projectId: string;
  status: unknown;
  realmIds: string[];
}

function rowOf(r: RawComputer | null): Row | null {
  if (!r || typeof r.id !== 'string' || !r.id) return null;
  const country = typeof r.server?.country === 'string' ? r.server.country.toUpperCase() : '';
  const name = typeof r.name === 'string' && r.name ? r.name : r.id.slice(0, 8);
  return {
    id: r.id,
    name,
    running: computerState(r.status) === 'running',
    state: homeState(r.status),
    handle: computerHandle({ id: r.id, name }),
    flag: flagOf(country),
    country: /^[A-Z]{2}$/.test(country) ? country : undefined,
    server: typeof r.server_name === 'string' ? r.server_name : undefined,
    projectId: typeof r.project_id === 'string' ? r.project_id : '',
    status: r.status,
    realmIds: Array.isArray(r.realm_ids) ? r.realm_ids.filter((x): x is string => typeof x === 'string') : [],
  };
}

// The computers list is core's computersPage (the shell's read, one cache entry): a body without a list is a read error, never
// "no computers", and `complete` is the whole list (totalPages <= 1, else fewer than 100 rows). The setup read-back reads it too.
const toRows = (wire: readonly unknown[]): Row[] => wire.map((c) => rowOf(c as RawComputer | null)).filter((x): x is Row => x !== null);

/**
 * A setup read-back's answers with each computers answer's rows cut to the rows Home can show (a nonempty string id):
 * only such a row proves a computer, so a body like `containers: [{}]` proves nothing. The setup states pass as read.
 */
export function provenAnswers(answers: readonly (readonly unknown[])[]): Array<readonly unknown[]> {
  const page = (a: unknown): unknown => (a && typeof a === 'object' && Array.isArray((a as { rows?: unknown }).rows) ? { ...a, rows: toRows((a as { rows: unknown[] }).rows) } : a);
  return [(answers[0] ?? []).map(page), ...answers.slice(1)];
}
const keysQ = defineQuery<{ data?: unknown[] }, number>(tokensRoute, { select: (r) => (Array.isArray(r && r.data) ? (r.data as unknown[]).length : 0) });

export interface OverviewResult {
  data: Overview | undefined;
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  /** Re-reads the list and the setup state; true when every read answered. */
  refetch: () => Promise<boolean>;
}

/**
 * The rows the shown realm holds. Behind a realm host the list is already the realm's; with realm host scoping off
 * it is the whole account's, and the Hub filters it in the browser with core's one rule (pickComputer answers a row
 * asked for by its own id only when the realm holds it), exactly as the shell's picker does.
 */
export function inRealm<T extends { id: string; status: unknown; projectId: string; realmIds: string[] }>(rows: readonly T[], realm: string): T[] {
  return rows.filter((r) => {
    const c = { id: r.id, status: r.status, project_id: r.projectId, realm_ids: r.realmIds };
    return pickComputer([c], { realm, remembered: r.id }) === c;
  });
}

export function useOverview(): OverviewResult {
  const realms = useRealms();
  const shell = useShellData();
  const current = useCurrentComputer();
  const account = useCan('account');
  const { prefs, status: prefsStatus } = useWidgetPrefs();
  const list = computersPage.use(undefined);
  // A failed refetch keeps the last whole answer (core restores it), shown under the stale band with Try again: what it says,
  // absence included, is that read's, and a held setup change keeps its Check again and Dismiss. A first read that fails (or
  // whose body holds no list) has no rows: the read error with Try again.
  const rows = useMemo(() => (list.data ? inRealm(toRows(list.data.rows), realms.selected) : undefined), [list.data, realms.selected]);
  const whole = list.data?.complete === true;
  // Empty only when the answer is the whole list: a realm whose computers sit beyond page 1 is not empty.
  const empty = !!rows && rows.length === 0 && whole;
  const keys = keysQ.use(undefined, { enabled: account && !!rows });
  const setup = useSetupState({ enabled: account && empty });

  const data = useMemo<Overview | undefined>(() => {
    if (!rows) return undefined;
    const row = realms.rows?.find((r) => r.id === realms.selected);
    const all = realms.selected === 'all';
    // A realm the list does not hold yet keeps its own name (alias, else short id), never a blank one.
    const shown = row ? row.name : realmLabel(realms.selected);
    const name = 'text' in shown ? shown.text : '';
    const known = realms.rows?.map((r) => r.computers) ?? [];
    const total = known.length > 0 && known.every((n): n is number => typeof n === 'number') ? known.reduce((a, b) => a + b, 0) : null;
    const state = setup.data;
    // Zero computers in the account (not only in this realm): the realm list counts them and the all-realms
    // view is the whole account. A realm with none while another holds computers is only an empty realm.
    const accountEmpty = empty && (all || total === 0);
    // The one computer is the shown one only when the list is whole (another may sit on a later page).
    const pickedId = rows.find((c) => c.id === current?.container.id)?.id ?? (rows.length === 1 && whole ? rows[0]?.id : undefined);
    // No setup state read yet (or none readable) is no state: never "being prepared" (unread waits on the skeleton, failed is the read error).
    const sk: SetupKind | undefined = !accountEmpty || !state || state.kind === 'empty' ? undefined : state.kind === 'invite' && state.signupCodeFailed ? 'inviteFailed' : state.kind;
    return {
      userName: account ? firstName(shell.account?.name) : undefined,
      shared: !account,
      realm: { id: realms.selected, name, all },
      computers: rows.map(({ id, name: n, running, state: st, handle, flag, country, server }) => ({ id, name: n, running, state: st, handle, flag, country, server })),
      pickedId,
      accountEmpty: accountEmpty && state?.kind !== 'empty', // 'empty' is the empty realm view; facts.computer keeps the proven absence
      setup: sk,
      setupRead: accountEmpty && state ? sk : undefined,
      ...(sk === 'reinstalled' ? { setupRoom: state?.room ?? null } : {}),
      listWhole: whole,
      setupAgeSec: 0,
      // A computer in another realm counts: the account has one even when this realm has none.
      facts: { computer: rows.length > 0 || (total ?? 0) > 0 ? true : accountEmpty ? false : null, key: !account ? null : keys.isError ? null : keys.data === undefined ? null : keys.data > 0 },
      factsFailed: { key: account && keys.isError },
      checklistHidden: prefs.checklistHidden === true,
      onboarding: prefs.onboarding === true,
      introHidden: prefs.introHidden === true,
      toured: prefs.toured === true,
      prefsRead: prefsStatus !== 'loading' && prefsStatus !== 'locked',
      firstMaking: whole && all && rows.length === 1 && beingMade(rows[0]?.status),
      firstRunning: whole && all && rows.length === 1 && rows[0]?.running === true,
      bands: {
        offline: list.isError && (list.error as { kind?: string } | null)?.kind === 'network' ? true : undefined,
        stale: list.isError ? true : undefined,
        lastDataAt: list.isError && list.dataUpdatedAt ? new Date(list.dataUpdatedAt).toISOString() : undefined,
      },
    };
  }, [rows, realms, shell.account?.name, current, account, prefs, prefsStatus, keys.data, keys.isError, setup.data, empty, whole, list.isError, list.error, list.dataUpdatedAt]);

  const refetch = useCallback(async () => {
    const rs = await Promise.all([list.refetch(), empty ? setup.refetch() : undefined]);
    return rs.every((r) => !r || !r.isError);
  }, [list, setup, empty]);
  // An account with no computer whose setup state is not read yet waits on the skeleton; one that could not be read is the read error.
  const setupUnread = !!data?.accountEmpty && account && setup.isPending && !setup.data;
  return { data, isPending: list.isPending || setupUnread, isFetching: list.isFetching || setup.isFetching, // An account with no computer whose setup state could not be read is unknown, never "provisioning".
    error: rows ? (empty && account && setup.isError && !setup.data ? setup.error : null) : list.error, refetch };
}

/** One change's controls for the setup panel (core's C9 lock under the hood). */
interface Run<V> {
  mutate: (vars: V) => void;
  isPending: boolean;
  /** An uncertain answer ("may have gone through"): nothing is sent again until a read-back succeeds. */
  locked: boolean;
  /** Reads again; the lock opens only when every read answered. */
  recheck: () => Promise<void>;
  /** The send of this change held now (core's hold token), followed as holds move here or in another tab: a warned
   *  Dismiss question takes it when it opens. Undefined while none is held. */
  hold: string | undefined;
  /** The person's warned Dismiss of the send `hold` names: frees it only while it is still that send, key kept. A
   *  later send of the same change (the shown one settled in another tab, then sent again) stays held. True once
   *  freed. */
  dismiss: (hold: string) => Promise<boolean>;
  /** Whose hold it is: 'self' (Check again / Dismiss work), 'other' (another page's: only it can free it). */
  heldBy: 'self' | 'other' | undefined;
  data: { outcome: 'done' | 'pending' | 'failed' | 'not_sent' | 'stale'; code?: string; status?: number } | undefined;
  /** A 200 that says setup is blocked: shown, and the polling does not restart. */
  blocked: 'support' | 'code' | undefined;
}

// The reads that prove a setup change's effect: the computer list, and the setup state while it is read.
const isSetupState = (k: readonly unknown[]) => k.includes('setup-state');

const unsent = (code: string) => ({ kind: 'not_sent', notSent: true, code });

/**
 * Runs a setup change once through core's C9 lock (useLockedChange): a pending answer locks the action for
 * the account, across remounts and realm switches, until a read-back proves the state; a press while locked
 * only reads again and never sends. A done answer re-reads at once and starts the polling again.
 */
function useSetup<V, R>(id: string, send: (vars: V, ctx: Ctx) => Promise<R>, afterDone: () => void, opts: { lock: string; lockKey?: (vars: V) => unknown },
  blockedOf: (answer: R | undefined) => 'support' | 'code' | undefined,
  proves: (identity: unknown, answers: readonly (readonly unknown[])[]) => 'applied' | undefined,
): Run<V> {
  const reads = useMemo(() => [computersPage, isSetupState] as const, []);
  // page 'home': the sender is l:home:<id>, so another page sharing the lock shows this hold as Home's, with a link.
  const locked = useLockedChange<V, R>((vars, _idem, ctx) => send(vars, ctx), reads, id, { ...opts, page: 'home', proves: (identity, answers) => proves(identity, provenAnswers(answers)) });
  const [blocked, setBlocked] = useState<'support' | 'code' | undefined>(undefined);
  const mutate = useCallback(
    (vars: V) => {
      void locked.run(vars).then((r) => {
        // A press that sent nothing (cooldown, read-back first) leaves the last answer's alert alone.
        if (r.outcome !== 'not_sent') setBlocked(undefined);
        if (r.outcome !== 'done') return;
        const b = blockedOf(r.data);
        if (b) setBlocked(b);
        else afterDone();
      });
    },
    [locked, afterDone, blockedOf],
  );
  const recheck = useCallback(async () => {
    await locked.readBack();
  }, [locked]);
  // A setup lock holds one change per account, so its one held send is this change's (heldBy says whose it is). Read
  // again on every move of core's changes, so a send settled or replaced in another tab is not the one shown.
  const changes = useChangesVersion();
  const hold = useMemo(() => {
    const held = heldChanges(opts.lock);
    return held.length === 1 ? held[0]?.hold : undefined;
    // changes: core's version, read so the hold follows every move of the registry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, opts.lock, locked.heldBy]);
  const dismiss = useCallback(async (shown: string): Promise<boolean> => {
    const h = heldChanges(opts.lock).find((x) => x.hold === shown);
    return h ? locked.dismissOne(h.identity, { hold: shown }) : false;
  }, [locked, opts.lock]);
  return { mutate, recheck, hold, dismiss, heldBy: locked.heldBy, isPending: locked.state === 'running', locked: locked.state === 'pending', data: locked.last, blocked };
}

/**
 * Retry a stalled setup. An answer that did not come back is pending ("may have gone through"):
 * the page reads again and never resends.
 */
// support_required is the current name; admin_recovery_required is the older name an older API may still send.
const retryBlocked = (a: { data?: { blocked_reason?: unknown } } | undefined) => {
  const b = a?.data?.blocked_reason;
  return b === 'support_required' || b === 'admin_recovery_required' ? ('support' as const) : undefined;
};

// One send a minute per account (the server's rule): core's claim, the same minute core's retrySetup takes.
// A request that provably never went out frees its own claim only.
export function useRetrySetup(afterDone: () => void) {
  return useSetup<void, { data?: { blocked_reason?: unknown } }>(
    'setup.retry',
    async (_v, ctx) => {
      const claim = claimRetryMinute();
      if (!claim) throw unsent('COOLDOWN');
      try {
        return await api(retrySetupRoute, { body: {}, ctx });
      } catch (e) {
        if ((e as HubError | null)?.notSent) claim.release();
        throw e;
      }
    },
    afterDone,
    // What the retry acts on is the account's setup: any press while one is unknown is the same change.
    setupLocks.retry,
    retryBlocked,
    retryProves,
  );
}

// A 200 without a computer and with a reason other than the two the setup state already shows.
const redeemBlocked = (a: { data?: { server?: unknown; claim_blocked_reason?: unknown } } | undefined) => {
  const r = a?.data?.claim_blocked_reason;
  return a?.data && !a.data.server && typeof r === 'string' && r !== 'pool_empty' && r !== 'mailbox_already_used' ? ('code' as const) : undefined;
};

export function useRedeemInvite(afterDone: () => void) {
  return useSetup<{ code: string }, { data?: { server?: unknown; claim_blocked_reason?: unknown } }>(
    'invite.redeem',
    (v, ctx) => {
      const code = v.code.trim().toUpperCase();
      return code ? api(redeemRoute, { body: { code }, ctx }) : Promise.reject(unsent('EMPTY_CODE'));
    },
    afterDone,
    // One redeem per account while one is unknown, whatever the code; the code is never part of the identity.
    setupLocks.redeem,
    redeemBlocked,
    redeemProves,
  );
}

/** Tests only: forgets the retry minute (core's, per account). */
export function resetActionHolds() {
  resetSetup();
}

/** Hides the first-steps checklist for good (this account, this browser). */
export function useHideChecklist() {
  const { setFlag } = useWidgetPrefs();
  return { mutate: () => setFlag('checklistHidden') };
}

/** An attempt hold's sender (core holdAttempt `by`) names its page: alone ('keys': a token mint and a share) or first, then
 *  '.' or ':' and the action ('programs.add', 'apps:openwith', 'apps.github'). Exported for its test only. */
export const attemptPage = (by: string): string | null => /^([a-z0-9-]+)(?:[.:]|$)/.exec(by)?.[1] ?? null;

/**
 * This account's changes not settled yet in this browser, in either of core's registries (changes and attempts): the
 * held ones named (heldLine), and how many are being sent. A change filed under a realm other than the shown one is left
 * out (core's view filter); in setup the setup panel shows its own holds, so `withoutSetup` leaves those out; Scripts' read-only
 * questions are never named (unresolvedLines: SCRIPT_QUESTION_BASES). Read-only:
 * Home never frees, dismisses or sends any of them; each line links to the page that checks it.
 */
// An attempt's line id: opaque (its id is never put in the page), stable for that hold's incarnation.
const attemptRefs = new Map<string, string>();
let attemptRefN = 0;
function attemptRef(id: string, incarnation: string): string {
  const k = id + '\u0000' + incarnation;
  let r = attemptRefs.get(k);
  if (r === undefined) {
    if (attemptRefs.size >= 1024) attemptRefs.clear();
    r = 'a' + (++attemptRefN).toString(36);
    attemptRefs.set(k, r);
  }
  return r;
}
export function useUnresolved(withoutSetup: boolean, realm: { id: string; all: boolean }, computers: readonly HomeComputer[]): { held: HeldLine[]; sending: number } {
  const cv = useChangesVersion();
  const av = useAttemptsVersion();
  return useMemo(() => {
    const shown = realm.all ? 'all' : realm.id;
    const rows: UnresolvedInput[] = changesOverview({ realm: shown, except: withoutSetup ? [setupLocks.retry.lock, setupLocks.redeem.lock] : [] })
      .map((c) => ({ ref: c.ref, base: c.base, page: c.from?.page ?? null, identity: c.identity, target: c.target, at: c.at, held: c.held }));
    for (const a of heldAttempts()) {
      if (!realm.all && a.realm !== null && a.realm !== realm.id) continue;
      rows.push({ ref: attemptRef(a.id, a.incarnation), base: null, page: attemptPage(a.by), identity: null, target: null, at: a.startedAt, held: a.inFlight === false });
    }
    rows.sort((a, b) => a.at - b.at);
    return unresolvedLines(rows, computers, scripts.script);
    // cv/av: core's change and attempt versions, read so the list follows every change of either registry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv, av, withoutSetup, realm.id, realm.all, computers]);
}

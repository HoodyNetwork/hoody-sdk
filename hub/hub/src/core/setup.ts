// setup.ts: why an account has no computer yet, and the two actions that help.
//
// Contract, in plain words:
//   - readSetupState() / useSetupState(): 'reinstalled' (the server of an expired computer was reinstalled: its
//     computers are gone, delete them in Projects; room: from one more read of the server list made only then:
//     'room' (a server or slice with room for a new computer), 'maybe' (a slice whose room the answer does not say),
//     'none' (no server it could go on), null (the read failed or has no list); reinstalledOffers says what a page
//     offers for each: Create only with a server to create on, Rent unless one has room, so no account is stuck) | 'expired' (a server of the account expired: rent another) | 'invite' (an
//     invite code is needed; signupCodeFailed when the sign-up code did not work) | 'capacity' (the free pool is
//     empty) | 'mailbox' (this mailbox already had a free computer) | 'empty' (no computer here and no evidence that one
//     is being set up: the page offers to create one). 'provisioning' (the free computer is being set up) stays in
//     the type for a server signal that would prove it; no read answers it today. On 'empty',
//     freeSetup: all realms only, the account can still get its free computer (claim reason 'none'; retrySetup claims
//     it); accountComputers: a realm only, whether the account has a computer in any realm (this one included; on a
//     page whose realm list is empty, that means elsewhere: the import offer), from one more read of the
//     account-wide list made only then: true when it shows a row, false only when it is whole and empty, null when
//     it failed or is not whole (unknown, never a guess either way). Two reads under one context: the
//     account's containers including expired and deleting ones, and the free-tier status. A failed read of either
//     fails the whole read with that error: the state is unknown, never a guess (a failed read is no proof of
//     'provisioning' or of no expired server). already_claimed only says the account owns a free server: it is
//     no proof that anything prepares its computer (the free-tier status checks no readiness and no job),
//     and no other read reports a queued job or a ready server
//     ("being prepared" only with positive evidence). So it is 'empty' without free setup
//     (the free server is already claimed), in every view; a realm never holds the free computer anyway (it is the
//     account's default one, in no realm). A free-tier answer without a known reason, or one
//     that does not hold together (an invite reason with the gate off), is unknown too. The page decides what an
//     unknown state shows (it must not strand the account behind an invite wall). A context that moved on fails it
//     as stale. Home shows it when the list has no computer.
//   - A token session never reads it (can('account') is false): it is refused unsent; useSetupState stays idle.
//   - redeemInvite(code): the code trimmed and upper-cased (empty → not sent). done: 'claimed' (a server came with
//     it) | 'capacity' | 'refresh' (read the state again). A failure names its reason: 'mailbox' | 'rate' | 'invalid'
//     | 'generic'. Never resent; an answer that did not come back is pending ("may have gone through").
//   - retrySetup(): the server allows one a minute, so a second press within 60 s is not sent (reason 'cooldown',
//     retrySetupWait() says how long). done: 'blocked' (support must recover it) | 'valid' (nothing to repair) |
//     'queued'. Only a request that provably never went out releases the minute; a lost answer keeps it.
//     Failure reasons: 'invite' | 'mailbox' | 'generic'.
//   - setupFixtures: fixture rules for each state, for pages' fixture states.
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api, outcomeOf, type HubError, type Outcome } from './api';
import { alive, capture, onBump, snapshot, type Ctx } from './ctx';
import { keepsChanges } from './changes';
import { prefix, useCore } from './query';
import { containersRoute } from './computer';
import { pageOf } from './power';
import { defineRoute } from './routes';
import { can } from './token';
import { reply, type FixtureRule } from './transport';

export type SetupKind = 'expired' | 'reinstalled' | 'invite' | 'capacity' | 'mailbox' | 'provisioning' | 'empty';
/** Reinstalled's room (see the contract): 'room' | 'maybe' | 'none'; null when the server list could not be read. */
export type SetupRoom = 'room' | 'maybe' | 'none';
export interface SetupState {
  readonly kind: SetupKind;
  /** invite only: the code given at sign-up did not work. */
  readonly signupCodeFailed?: boolean;
  /** empty only: the account can still get its free computer (retrySetup claims it; it lands in no realm). */
  readonly freeSetup?: boolean;
  /** empty in a realm only: the account has a computer in any realm (true/false), or null (unknown). */
  readonly accountComputers?: boolean | null;
  /** reinstalled only: the server list shows a server or slice a new computer can be made on (true/false), or null (unknown). */
  readonly room?: SetupRoom | null;
}

type GateAnswer = { data?: { claim_blocked_reason?: unknown; gate_enabled?: unknown; signup_code_failed?: unknown } | null };
/** The shared C9 locks of the setup actions: every page that sends them must spread these into its
 *  useLockedChange options or its coreSource change, so one pending send shows and holds on every page (a page
 *  that sends one without them gets a lock of its own and is not held). A read-back frees only the change its
 *  own page sent (changes.ts `by`); another page's stays held until that page proves it.
 *  - retry: one change per account (any press while one is unknown is the same change).
 *  - redeem: one change per account too: while one redeem is unknown, any redeem press, whatever
 *    its code, is refused until a read-back. The identity is a constant, never the code. */
export const setupLocks = Object.freeze({
  retry: Object.freeze({ lock: 'setup.retry', lockKey: (): string => 'account-setup' }),
  redeem: Object.freeze({ lock: 'invite.redeem', lockKey: (): string => 'invite' }),
});
/** The account-wide computer list (this page's host: every realm), for setup's accountComputers. */
export const accountContainersRoute = defineRoute<{ data?: { computers?: unknown[] } }>({ method: 'GET', path: '/computers', scope: 'base', query: ['page', 'limit', 'realm_id'] });
/** The account's servers (rentals and the free slice) on the page's host: reinstalled's room reads it, and the
 *  computers page's servers list and server detail read the same route (one fixture answer for all three). */
export const serversRoute = defineRoute<{ data?: unknown }>({ method: 'GET', path: '/servers', scope: 'realm' });
export const freeTierRoute = defineRoute<GateAnswer>({ method: 'GET', path: '/users/me/free-tier-status', scope: 'base' });
export const redeemRoute = defineRoute<{ data?: { server?: unknown; claim_blocked_reason?: unknown } }, { code: string }>({ method: 'POST', path: '/users/me/redeem-invite', scope: 'base', body: ['code'] });
export const retrySetupRoute = defineRoute<{ data?: { blocked_reason?: unknown; computer?: unknown } }>({ method: 'POST', path: '/users/me/retry-setup', scope: 'base', body: [] });

// A read that stopped because its context moved on: stale, cancelled, or refused unsent because the session was
// replaced ({status: 401, superseded}, which carries no stale flag).
const stopped = (e: unknown) => { const x = e as HubError | null; return !!(x && (x.stale || x.cancelled || x.superseded || x.kind === 'stale')); };
// Where the server list says a new computer may land (the rows the Create drawer offers: active, or no status said,
// and not full; pages/computers/logic.ts offered). A slice is capped (free or paid platform slice: is_free_tier, or
// server.is_vm): the API sends its gauge (server.computer_capacity) only to an account session on the base host,
// never on a realm host, so a slice without a gauge may be full: 'maybe'. A dedicated server has no cap: 'room'.
function roomOf(list: unknown): SetupRoom | null {
  if (!Array.isArray(list)) return null;
  let maybe = false;
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const x = r as { status?: unknown; is_free_tier?: unknown; server?: { is_vm?: unknown; computer_capacity?: { used?: unknown; max?: unknown } | null } | null };
    const st = typeof x.status === 'string' ? x.status : '';
    if (st !== 'active' && st !== '') continue;
    const sv = x.server && typeof x.server === 'object' ? x.server : null;
    const c = sv ? sv.computer_capacity : null;
    const cap = c && typeof c.used === 'number' && typeof c.max === 'number' ? { used: c.used, max: c.max } : null;
    if (cap) { if (cap.max > 0 && cap.used >= cap.max) continue; return 'room'; }
    if (x.is_free_tier === true || sv?.is_vm === true) { maybe = true; continue; }
    return 'room';
  }
  return maybe ? 'maybe' : 'none';
}

/** What a reinstalled zero state offers beside Projects: Create only with a server or slice to create on ('room', or
 *  'maybe': a slice whose room is not said), Rent unless one is known to have room (so an account with no server, or
 *  whose server list could not be read, is never stuck). */
export function reinstalledOffers(room: SetupRoom | null | undefined): { create: boolean; rent: boolean } {
  return { create: room === 'room' || room === 'maybe', rent: room !== 'room' };
}
function refused(): HubError { return { kind: 'not_sent', notSent: true, code: 'TOKEN_SESSION_REFUSED' }; }

/** The account's setup state under `ctx` (see the contract). Rejects when a read failed (unknown), when the
 *  context moved on, or in a token session. */
export async function readSetupState(ctx: Ctx = capture()): Promise<SetupState> {
  if (!can('account')) throw refused();
  // An expired row seen on any page proves "expired" ("reinstalled" when one says host_reinstalled); none seen proves nothing unless the page is the whole list
  // (power.ts pageOf: a body without a list throws BAD_LIST). Not whole: unknown, never "provisioning" or a gate state.
  const hidden = api(containersRoute, { query: { page: 1, limit: 100, include_expired: true, include_deleting: true }, ctx }).then((r) => {
    const { rows, complete } = pageOf(r);
    const seen = (rows as Array<{ server_expired?: unknown; status?: unknown } | null>).filter((x) => !!(x && x.server_expired));
    // A reinstalled server (status host_reinstalled) says more than an ended one: its computers are gone, nothing renews them.
    if (seen.some((x) => x?.status === 'host_reinstalled')) return 'reinstalled' as const;
    if (seen.length > 0) return 'expired' as const;
    if (!complete) throw { kind: 'unavailable', status: 0, code: 'UNAVAILABLE' } as HubError;
    return null;
  });
  const gate = api(freeTierRoute, { ctx }).then((r) => (r && r.data) || null);
  // Both settle before anything is decided; a stale context wins over a failed read.
  const [h, gt] = await Promise.allSettled([hidden, gate]);
  if (!alive(ctx)) throw { kind: 'stale', stale: true } as HubError;
  for (const x of [h, gt]) if (x.status === 'rejected' && stopped(x.reason)) throw x.reason;
  if (h.status === 'rejected') throw h.reason;
  if (gt.status === 'rejected') throw gt.reason;
  const expired = h.value, g0 = gt.value;
  if (expired === 'expired') return { kind: expired };
  if (expired === 'reinstalled') {
    // Its computers are gone: whether a new one can be made at once (Create) or a server must be rented first (Rent).
    const room = await api(serversRoute, { ctx }).then((r) => roomOf(r && r.data)).catch((e: unknown) => { if (stopped(e)) throw e; return null; });
    if (!alive(ctx)) throw { kind: 'stale', stale: true } as HubError;
    return { kind: 'reinstalled', room };
  }
  const g = g0 || {}, reason = g.claim_blocked_reason;
  if (reason === 'mailbox_already_used') return { kind: 'mailbox' };
  if (reason === 'invite_required' && g.gate_enabled) return { kind: 'invite', signupCodeFailed: !!g.signup_code_failed };
  if (reason === 'pool_empty') return { kind: 'capacity' };
  if (reason !== 'already_claimed' && reason !== 'none') throw { kind: 'unavailable', status: 0, code: 'UNAVAILABLE' } as HubError;
  if (ctx.realm === 'all') return { kind: 'empty', freeSetup: reason === 'none' };
  const accountComputers = await api(accountContainersRoute, { query: { page: 1, limit: 1 }, ctx }).then((r) => {
    const { rows, complete } = pageOf(r);
    return rows.length > 0 ? true : complete ? false : null;
  }).catch((e: unknown) => { if (stopped(e)) throw e; return null; });
  // A failed account-wide read is only unknown (null) while the context lives: a context that moved on rejects.
  if (!alive(ctx)) throw { kind: 'stale', stale: true } as HubError;
  return { kind: 'empty', freeSetup: false, accountComputers };
}

/** The setup state for the page's account and realm; idle (never read) in a token session or when disabled. */
export function useSetupState(o: { enabled?: boolean } = {}): UseQueryResult<SetupState, HubError> {
  const s = useCore();
  const allowed = can('account');
  return useQuery<SetupState, HubError>({
    queryKey: [...prefix(s), 'setup-state'],
    queryFn: () => readSetupState(capture()),
    enabled: (o.enabled ?? true) && allowed,
    retry: false,
  });
}

export type SetupResult<D, R extends string> =
  | { readonly outcome: 'done'; readonly data: D }
  | { readonly outcome: Exclude<Outcome, 'done'>; readonly reason?: R; readonly error?: HubError };

function failure<R extends string>(e: unknown, reason: (x: HubError) => R): { outcome: Exclude<Outcome, 'done'>; reason?: R; error: HubError } {
  const x = (e || {}) as HubError;
  // A cancelled 2FA prompt is quiet, as a context that moved on (the old failed(): stale).
  const outcome = x.cancelled && outcomeOf(x, true) !== 'pending' ? 'stale' : outcomeOf(x, true);
  return outcome === 'failed' || outcome === 'not_sent' ? { outcome, reason: reason(x), error: x } : { outcome, error: x };
}

/** Redeems an invite code (see the contract). Never rejects. */
export async function redeemInvite(code: unknown): Promise<SetupResult<'claimed' | 'capacity' | 'refresh', 'empty' | 'mailbox' | 'rate' | 'invalid' | 'generic'>> {
  if (!can('account')) return { outcome: 'not_sent', error: refused() };
  const c = String(code == null ? '' : code).trim().toUpperCase();
  if (!c) return { outcome: 'not_sent', reason: 'empty' };
  try {
    const r = await api(redeemRoute, { body: { code: c } });
    const d = (r && r.data) || {};
    return { outcome: 'done', data: d.server ? 'claimed' : d.claim_blocked_reason === 'pool_empty' ? 'capacity' : 'refresh' };
  } catch (e) {
    return failure(e, (x) => (x.code === 'FREE_TIER_MAILBOX_ALREADY_USED' ? 'mailbox' : x.status === 429 ? 'rate' : x.status === 400 ? 'invalid' : 'generic'));
  }
}

const RETRY_MS = 60000;
// The server's minute is per account: each account's own minute (keyed strictly by the account that pressed;
// another account, e.g. from another tab without a bump, never waits on it, and nothing one account's request
// does touches another's). An account change or a sign-out (a bump whose reason does not keep account state)
// resets them all.
const retryUntil = new Map<string, { until: number }>();
const ACCOUNTLESS = '\u0000';
const ownerKey = (): string => snapshot().account ?? ACCOUNTLESS;
onBump((reason) => { if (!keepsChanges(reason)) retryUntil.clear(); });
/** Milliseconds until retrySetup may send again (0 = now), for the shown account. */
export function retrySetupWait(): number { const m = retryUntil.get(ownerKey()); return m ? Math.max(0, m.until - Date.now()) : 0; }

/** Takes the shown account's retry minute for one press, or null while it runs. core's retrySetup and Home's locked
 *  retry take it, so those two share one minute per account. `release` is for a request
 *  that provably never went out: it frees this claim only (never a later press's, never another account's). */
export function claimRetryMinute(): { release: () => void } | null {
  if (retrySetupWait()) return null;
  const owner = ownerKey(), mine = { until: Date.now() + RETRY_MS };
  retryUntil.set(owner, mine);
  return { release: () => { if (retryUntil.get(owner) === mine) retryUntil.delete(owner); } };
}

/** Asks the server to set the account's computer up again (see the contract). Never rejects. */
export async function retrySetup(): Promise<SetupResult<'blocked' | 'valid' | 'queued', 'cooldown' | 'invite' | 'mailbox' | 'generic'>> {
  if (!can('account')) return { outcome: 'not_sent', error: refused() };
  const claim = claimRetryMinute();
  if (!claim) return { outcome: 'not_sent', reason: 'cooldown' };
  try {
    const r = await api(retrySetupRoute, { body: {} });
    const d = (r && r.data) || {};
    const b = d.blocked_reason;
    // support_required is the current name; admin_recovery_required the older one
    return { outcome: 'done', data: b === 'support_required' || b === 'admin_recovery_required' ? 'blocked' : d.computer ? 'valid' : 'queued' };
  } catch (e) {
    const x = (e || {}) as HubError;
    if (x.notSent) claim.release();
    return failure(x, (y) => (y.code === 'FREE_TIER_INVITE_REQUIRED' ? 'invite' : y.code === 'FREE_TIER_MAILBOX_ALREADY_USED' ? 'mailbox' : 'generic'));
  }
}

/** Fixture rules for readSetupState's answer `kind` (for pages' fixture states). The answer depends on the view
 *  as the read's does. 'empty' (claim reason none) answers 'empty' with free setup on All realms. 'provisioning'
 *  stands for the free server claimed (already_claimed): no read answers 'provisioning' today, so it answers
 *  'empty' without free setup; the key stays for the pages' existing fixture states. In a named realm both answer
 *  'empty' without free setup (the free computer never lands in a realm). accountComputers: what the account-wide list
 *  shows for 'empty' in a realm (default: no computer). servers: what the server list shows, for 'reinstalled':
 *  true a dedicated server ('room'), 'slice' a free slice without its gauge ('maybe'), default none ('none'). */
export function setupFixtures(kind: SetupKind, o: { signupCodeFailed?: boolean; accountComputers?: boolean; servers?: boolean | 'slice' } = {}): FixtureRule[] {
  const gate: Record<SetupKind, Record<string, unknown>> = {
    expired: {},
    reinstalled: {},
    invite: { gate_enabled: true, claim_blocked_reason: 'invite_required', signup_code_failed: !!o.signupCodeFailed },
    capacity: { gate_enabled: true, claim_blocked_reason: 'pool_empty' },
    mailbox: { claim_blocked_reason: 'mailbox_already_used' },
    provisioning: { claim_blocked_reason: 'already_claimed' },
    empty: { claim_blocked_reason: 'none' },
  };
  return [
    // Only setup's own check (it asks for expired and deleting rows): the computer list falls through to its own rule.
    reply(containersRoute, { status: 200, body: { data: { computers: kind === 'expired' ? [{ server_expired: true }] : kind === 'reinstalled' ? [{ server_expired: true, status: 'host_reinstalled' }] : [] } } }, { when: (req) => req.query.include_expired === 'true' }),
    reply(freeTierRoute, { status: 200, body: { data: gate[kind] } }),
    reply(accountContainersRoute, { status: 200, body: { data: { computers: o.accountComputers ? [{}] : [] } } }),
    reply(serversRoute, { status: 200, body: { data: o.servers === 'slice' ? [{ status: 'active', is_free_tier: true, server: { id: 's2', name: 'ash-3', is_vm: true } }] : o.servers ? [{ id: 'r1', status: 'active', server: { id: 's1', name: 'n12', is_vm: false } }] : [] } }),
  ];
}

/** The setup retry marks forgotten (session disposal, dispose.ts; tests). */
export function resetSetup(): void { retryUntil.clear(); }

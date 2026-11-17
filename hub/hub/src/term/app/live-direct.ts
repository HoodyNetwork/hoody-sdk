// The records of the direct api() changes: the
// changes core sends with a plain api() call, outside `guarded` and outside an attempt hold, so core writes no record
// of them. Row 6 refuses a change without a durable record of its own; this gives each LISTED send site one, and
// nothing else. The live wiring calls it; nothing here sends.
//
//   - Listed by SEND SITE, not by route: the same route can be sent from a site that already keeps a record
//     (POST /auth/tokens from the Keys page under its `key.create` attempt hold; redeem and retry-setup from the
//     computers page under `guarded` with setupLocks). Each site names its one route; another route is refused.
//   - The record is a core attempt hold (attempts.ts holdAttempt) in core's change store, so row 6's recordKept reads
//     it like any other (live-records.ts) and there is no second journal. It is written and read back BEFORE the send;
//     a lock already held (another send of the site, or one left by a crash) refuses this one unsent: never resent.
//     Locks: the agent sign-in per computer (its project in the meta); the boot-token mint per mint, by its op id, with
//     the token's full name (alias) in the meta; the alias write one per account.
//   - After the send: a definite answer releases the hold; an unknown one (5xx, a lost answer, a pending refusal)
//     keeps it, so the next mount shows it pending and the site's recovery owner reads it back (never a resend).
//   - Recovery (recoverDirectChanges, run by the live boot with the store writable, again when the holds change): a
//     held record whose request is no longer out is freed only by a read that proves where things stand:
//       realm-alias-write: the alias map read back, by a read that started after the PUT could no longer land (the
//         boot-token-mint clock below; a younger record is kept, and a new alias write is refused HELD meanwhile). A
//         read alone proves no timing: a late PUT may still land after it. The first write of the map (none stored
//         yet) carries no If-Match, so a late one would land over a map written since; once a map exists, each PUT
//         carries the etag it read, so a late one lands at most once and never over a rename it did not see (412).
//       agent-bootstrap: a status read of that computer's agent that shows it signed in (agentLoginOf 'ready', or
//         'account': signed in to another account). Signed out or no identity yet may be the sign-in still under way.
//       boot-token-mint: its alias already in the kept boot keys (the mint finished and its id was kept); else
//         the account's tokens listed: every token of that exact name is revoked, then the record freed. An empty list
//         frees it only when the list read started after the POST could no longer land: later than the end of its
//         request (this process: the unknown answer; an earlier process: before this one opened the store, whose lock
//         that process held until it ended) plus the client's request deadline plus BOOT_LAND_MARGIN_MS. A younger
//         record is kept, like a failed read, and blocks new mints (boot-producer.ts).
//     A failed read keeps the record; nothing is ever sent again.
// Not listed, so refused by row 6 (NOT_DURABLE): core/setup.ts redeemInvite and retrySetup (no caller sends through
// them; the computers page sends both routes under `guarded`), and any direct api() change added later.
import { attemptFor, heldAttempts, holdAttempt, type AttemptHold, type HeldAttempt, type HoldCode } from '../../core/attempts';
import { agentSignInRoutes } from '../../core/agent-signin';
import { tokenMintRoute } from '../../core/boot-token';
import { vaultKeyPutRoute } from '../../core/realm';
import type { HoldRef } from '../../core/change-store';
import type { Route } from '../../core/routes';
import type { StoreMode } from './live-records';

export type DirectSite = 'boot-token-mint' | 'agent-bootstrap' | 'realm-alias-write';

interface SiteRow {
  /** The one route this site sends (by identity). */
  readonly route: Route;
  /** What the lock names besides the site: a computer, a mint, or nothing (one per account). */
  readonly per: 'computer' | 'mint' | 'account';
  /** Who reads a pending one back after a crash (by name; wired with the site). */
  readonly recovery: string;
}

/** The census of direct api() changes the terminal may send: send site → route, record, recovery owner. */
export const DIRECT_SITES: Readonly<Record<DirectSite, SiteRow>> = Object.freeze({
  // core/boot-token.ts mint (agentBootToken, through the terminal producer): a boot token may exist server-side;
  // recovery finds it by its full name and revokes it (boot-token cleanup).
  'boot-token-mint': Object.freeze({ route: tokenMintRoute as Route, per: 'mint', recovery: 'boot-token cleanup (kept boot keys, else list tokens by full name, revoke a stray boot token)' }),
  // core/agent-signin.ts signInAgent: the agent may be signed in; recovery reads GET /hoody/auth/status on that computer
  // (the project is the record's meta).
  'agent-bootstrap': Object.freeze({ route: agentSignInRoutes.bootstrap as Route, per: 'computer', recovery: 'agent sign-in status read (GET /hoody/auth/status)' }),
  // core/realm.ts setRealmAlias: the alias map may be written; recovery reads the vault key back.
  'realm-alias-write': Object.freeze({ route: vaultKeyPutRoute as Route, per: 'account', recovery: 'realm alias read-back (GET /vault/keys/hoody.realm-aliases)' }),
});

const ID = /^[0-9a-f]{24}$/;
const BY = 'term.direct';
const PREFIX = 'term.direct.';
const lockOf = (site: DirectSite, part: string | null): string => `${PREFIX}${site}${part === null ? '' : ':' + part}`;

/** A boot-token mint's op id: unique per mint, inside the server's alias charset. */
export const BOOT_OP = /^[a-z0-9]{10}$/;
/** The full name of the terminal's boot token minted under `op` (core's 'hoody-agent auto ' prefix, as the Tokens
 *  drawer classifies it). */
export const bootAliasOf = (op: string): string => `hoody-agent auto term ${op}`;
/** The lock prefix of every boot-token mint record (the producer refuses a mint while one is held). */
export const BOOT_MINT_LOCK_PREFIX = lockOf('boot-token-mint', '');
/** After the end of a mint's request and the client's deadline, the margin before an empty token list proves it never
 *  landed. */
export const BOOT_LAND_MARGIN_MS = 60_000;

/** The computer a per-computer site sends to (its project and its own id, both 24 lower-case hex). */
export interface DirectTarget { readonly project: string; readonly computer: string }
/** One boot-token mint (its op id; the alias is derived from it). */
export interface MintTarget { readonly op: string }

export type DirectHoldResult =
  | { readonly ok: true; readonly record: HoldRef; readonly hold: AttemptHold }
  /** NOT_LISTED: no such site, or another route than the site's own. TARGET: the agent sign-in without its project and
   *  computer ids, a mint without its op id, or the alias write given either.
   *  Otherwise core's hold refusal (HELD: another or an unfinished send of this site). Nothing was sent. */
  | { readonly ok: false; readonly code: 'NOT_LISTED' | 'TARGET' | HoldCode };

/** The record of one direct change, written and read back before the send. Its `record` is what row 6 is given. */
export async function holdDirectChange(site: DirectSite, route: Route, target: DirectTarget | MintTarget | null = null): Promise<DirectHoldResult> {
  // An inherited name ('toString', '__proto__') finds no row of its own route, so it is refused here too.
  const row = (DIRECT_SITES as Readonly<Record<string, SiteRow | undefined>>)[site];
  if (!row || row.route !== route) return { ok: false, code: 'NOT_LISTED' };
  let project: unknown, computer: unknown, op: unknown;
  try {
    const t = target as Partial<DirectTarget & MintTarget> | null;
    project = t?.project; computer = t?.computer; op = t?.op;
  } catch { return { ok: false, code: 'TARGET' }; }
  let part: string | null = null, meta: Record<string, string> | undefined;
  if (row.per === 'computer') {
    if (!(typeof project === 'string' && ID.test(project) && typeof computer === 'string' && ID.test(computer) && op === undefined)) return { ok: false, code: 'TARGET' };
    part = computer; meta = { project };
  } else if (row.per === 'mint') {
    if (!(typeof op === 'string' && BOOT_OP.test(op) && project === undefined && computer === undefined)) return { ok: false, code: 'TARGET' };
    part = op; meta = { alias: bootAliasOf(op) };
  } else if (target !== null) return { ok: false, code: 'TARGET' };
  const got = await holdAttempt(lockOf(site, part), meta ? { by: BY, meta } : { by: BY });
  if (!got.ok) return { ok: false, code: got.code };
  // An alias write is judged from the end of its own request (a mint is noted by its producer: noteMintHold).
  if (row.per === 'account') heldHere.add(got.hold.id);
  return { ok: true, record: Object.freeze({ id: got.hold.id, token: got.hold.incarnation }), hold: got.hold };
}

// When this process's boot-token mints and alias writes ended with an unknown outcome (record id → time), and the ids
// it holds: the recovery's clock for its own records. A record of an earlier process is judged from when this one
// opened the store.
const endedAt = new Map<string, number>();
const heldHere = new Set<string>();

/** After the send: a definite answer frees the record; an unknown outcome keeps it held (pending, read back later). */
export function settleDirectChange(hold: AttemptHold, outcome: 'definite' | 'unknown', now: number = Date.now()): void {
  if (outcome === 'definite') { heldHere.delete(hold.id); hold.release(); }
  else { if (heldHere.has(hold.id)) endedAt.set(hold.id, now); hold.sent(); }
}
/** Marks a hold as this process's boot-token mint (boot-producer.ts, right after holdDirectChange). */
export function noteMintHold(hold: AttemptHold): void { heldHere.add(hold.id); }
/** Process restart, for tests. */
export function resetDirectMemory(): void { endedAt.clear(); heldHere.clear(); }

/** One of the account's tokens as the token list names it. */
export interface ListedToken { readonly id: string; readonly alias: string }

/** What a recovery owner may ask (the live boot wires them over core: realm.ts readRealmAliases, one status read of
 *  agentSignInRoutes.status for that computer, the token list and revoke routes, the kept boot keys). */
export interface DirectRecoveryDeps {
  /** Reads the alias map now; rejects when no answer came. */
  readonly readAliases: () => Promise<unknown>;
  /** One status read of that computer's agent: 'answered' when its 2xx answer shows the agent signed in (to the account,
   *  or to another one), else 'unread' (signed out, no identity yet, a body it cannot read, no answer, a refusal, a 5xx). */
  readonly agentStatus: (project: string, computer: string) => Promise<'answered' | 'unread'>;
  /** The full names in the kept boot keys (boot-producer.ts readBootKeys), or null when they cannot be read. */
  readonly bootKeyAliases: () => readonly string[] | null;
  /** The account's tokens (GET /auth/tokens, one answer); rejects unless the API answered with the whole list. */
  readonly listTokens: () => Promise<readonly ListedToken[]>;
  /** DELETE /auth/tokens/:id: 'gone' on a 2xx or a 404, else 'failed'. `mint` is the held mint record being recovered:
   *  the revoke is sent under that record, never another mint's. */
  readonly revokeToken: (id: string, mint: HeldAttempt) => Promise<'gone' | 'failed'>;
  /** The client's request deadline (its per-request timeout), and when this process opened the store. */
  readonly requestDeadlineMs: number;
  readonly storeOpenedAt: number;
  readonly now?: () => number;
}
export type DirectRecovery =
  | { readonly lock: string; readonly outcome: 'freed' }
  /** in-flight: its request may still be out. unread: the proving read got no answer. young: an empty token list, or
   *  the alias map, read while the request could still land. revoke: a matching token could not be revoked. unknown:
   *  a lock or meta this module does not name. refused/unresolved: core's free did not remove it. */
  | { readonly lock: string; readonly outcome: 'kept'; readonly why: 'in-flight' | 'unread' | 'young' | 'revoke' | 'unknown' | 'refused' | 'unresolved' };
type KeptWhy = Extract<DirectRecovery, { outcome: 'kept' }>['why'];

const metaField = (h: HeldAttempt, k: string): unknown => (h.meta && typeof h.meta === 'object' ? (h.meta as Record<string, unknown>)[k] : undefined);

/** A read that starts later than this shows where the record's request ended up: the end of that request (this
 *  process: its unknown answer, never while that has not come; an earlier process: before this one opened the store,
 *  whose lock that process held until it ended) plus the client's request deadline plus BOOT_LAND_MARGIN_MS. */
const landsBy = (h: HeldAttempt, deps: DirectRecoveryDeps): number =>
  (endedAt.get(h.id) ?? (heldHere.has(h.id) ? Infinity : deps.storeOpenedAt)) + deps.requestDeadlineMs + BOOT_LAND_MARGIN_MS;

async function proveMint(h: HeldAttempt, op: string, deps: DirectRecoveryDeps): Promise<true | KeptWhy> {
  const alias = metaField(h, 'alias');
  if (alias !== bootAliasOf(op)) return 'unknown';
  const kept = deps.bootKeyAliases();
  if (kept === null) return 'unread';
  if (kept.includes(alias)) return true;
  const now = deps.now ?? Date.now;
  const listStart = now();
  let list: readonly ListedToken[];
  try { list = await deps.listTokens(); } catch { return 'unread'; }
  const strays = list.filter((t) => t && t.alias === alias && typeof t.id === 'string' && t.id.length > 0);
  if (strays.length === 0) return listStart > landsBy(h, deps) ? true : 'young';
  for (const t of strays) {
    let r: 'gone' | 'failed';
    try { r = await deps.revokeToken(t.id, h); } catch { r = 'failed'; }
    if (r !== 'gone') return 'revoke';
  }
  return true;
}

/** Reads back every held direct change of the shown account whose request is no longer out, and frees the ones a read
 *  settles. Only with a writable store ('rw': the one Hub holding the store lock); otherwise nothing is read. */
export async function recoverDirectChanges(mode: StoreMode, deps: DirectRecoveryDeps): Promise<DirectRecovery[]> {
  if (mode !== 'rw') return [];
  const out: DirectRecovery[] = [];
  for (const h of heldAttempts()) {
    if (h.by !== BY || !h.lock.startsWith(PREFIX)) continue;
    const kept = (why: KeptWhy): void => { out.push({ lock: h.lock, outcome: 'kept', why }); };
    if (h.inFlight !== false) { kept('in-flight'); continue; }
    const [site, part, extra] = h.lock.slice(PREFIX.length).split(':');
    let proved: true | KeptWhy;
    if (extra !== undefined) proved = 'unknown';
    else if (site === 'realm-alias-write' && part === undefined) {
      const readStart = (deps.now ?? Date.now)();
      try { await deps.readAliases(); proved = readStart > landsBy(h, deps) ? true : 'young'; } catch { proved = 'unread'; }
    } else if (site === 'agent-bootstrap' && part !== undefined && ID.test(part)) {
      const project = metaField(h, 'project');
      if (typeof project !== 'string' || !ID.test(project)) proved = 'unknown';
      else {
        let r: 'answered' | 'unread';
        try { r = await deps.agentStatus(project, part); } catch { r = 'unread'; }
        proved = r === 'answered' ? true : 'unread';
      }
    } else if (site === 'boot-token-mint' && part !== undefined && BOOT_OP.test(part)) {
      try { proved = await proveMint(h, part, deps); } catch { proved = 'unread'; }
    } else proved = 'unknown';
    if (proved !== true) { kept(proved); continue; }
    const handle = attemptFor(h.id, BY);
    const freed = handle ? await handle.free('proved', { metaVersion: h.metaVersion }) : 'refused';
    if (freed === 'freed') { endedAt.delete(h.id); heldHere.delete(h.id); out.push({ lock: h.lock, outcome: 'freed' }); } else kept(freed);
  }
  return out;
}

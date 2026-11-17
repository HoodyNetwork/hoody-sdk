// realm.ts: the realm selection, switching and the account teardown.
//
// Contract:
//   - selected() is 'all' or a 24-hex id, stored in hub_realm_v1 (a sign-out purges it); any other stored
//     value reads as 'all'. "No realm" is never a selection, only the UI word for Global Bots.
//   - Every switch, account change, suspension and sign-out moves the generation (ctx.bump): nothing
//     captured before sends again or shows its late answer.
//   - switchTo(target) probes the target host first (GET /projects?page=1&limit=1, 15 s); a failure leaves
//     the selection alone and says so (onRealmNotice 'switch-failed'). A newer switch supersedes an older
//     probe. The probe is fenced by the session and generation it started under: a sign-out or account
//     change cancels it. A successful switch tears views down first (onTeardown: secrets, dialogs, the 2FA
//     prompt), then commits the selection and bumps. While work runs from this tab (leave.ts), the commit
//     asks first (askLeave, right after the probe, so work started during the probe counts): Stay ends the switch as a
//     cancel does (no commit, no notice); with nothing running it commits at once, as before. Every switch goes
//     through here (the realm menu, a ?open_realm= link, a failed switch's Try again), so this is the one guard.
//     beginSwitch(target) is the same switch as an operation: its
//     cancel() drops it while it is still the pending switch (no commit, no notice). switchRevision() moves when a
//     switch starts or the account ends, never on a refused switch or a load's fallback.
//   - load() reads the realm list (and the aliases). It commits only as the latest load with its generation alive.
//     A selection that a successful alias read leaves unlisted falls back to 'all' with a bump and a 'realm-gone'
//     notice; a failed alias read keeps the last aliases, so that check does not run. Separately, a selection
//     restored from storage at boot opens only if an explicit GET /realms list includes it, whatever the alias read
//     gave: one the alias map alone names falls back the same way, its notice marked `restored`; an answer
//     without a realm list leaves that check pending, and a switch made on this page clears it. No fallback runs
//     while a switch is pending: the switch decides, and if it fails a fresh load() decides again.
//   - endAccount(reason) runs once per page when the account this page shows is gone (sign-out here or in
//     another tab, another user, any purge): cancel a pending switch, tear down, then bump. Every purge
//     runs it first (shared.js onBeforeAuthPurge), so the order holds before storage is removed.
//   - pin(r): a token session's one realm, set once at boot: selected() is the pin, load() sends nothing,
//     switchTo and setAlias refuse unsent, hub_realm_v1 is never written.
//   - Aliases live in the vault key hoody.realm-aliases, one {realmId: alias} map; every write replaces the
//     whole map after reading it. The rules mirror the SDK sidecar (parseRealmAliases, validateRealmAliases).
//     A tab runs its renames one at a time, and refuses before any PUT (NAME_TAKEN) a name another realm has,
//     folded; until the vault has a conditional write, a rename can still be lost to another tab or device at the
//     same moment, or to this tab's earlier PUT whose answer was lost.
//   - Colours are a local device preference (hub_realm_colors).
import { api, cancelOtpPrompt, type HubError } from './api';
import { localStore } from './host-env';
import { bump, capture, gen, loggingOut, page, realm as selectedRealm, setRealm, setSwitching, alive } from './ctx';
import { defineRoute } from './routes';
import { directChange } from './live-gate';
import { askLeave, leaveCount } from './leave';
import { lossesCovered, switchLosses } from './switch-guard';
import { holds, hubApiBase, onBeforeAuthPurge, realmDomain, sessionUid, storageEntry, type AuthPurgeInfo } from './session';
import { transport } from './transport';
import { RE24 } from './realm-id';
import { parseRealmCap, type RealmCap } from './realmLimit';

const KEY = 'hub_realm_v1';
const COLORS = 'hub_realm_colors';
const ALIAS_KEY = 'hoody.realm-aliases';
export const PALETTE = ['red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type RealmColor = (typeof PALETTE)[number];
export const REALM_ALIAS_MAX_LEN = 64;
export const RESERVED_REALM_ALIASES: readonly string[] = ['all', 'none', 'every', 'any', 'global'];
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [[0x00ad, 0x00ad], [0x061c, 0x061c], [0x180e, 0x180e], [0x200b, 0x200f], [0x2028, 0x2029],
  [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0x3164, 0x3164], [0xfeff, 0xfeff], [0xe0000, 0xe007f]];
const CONTROL = /[\x00-\x1f\x7f-\x9f]/;
/** The alias rules, compared with the SDK sidecar's source by the tests. */
export const aliasRules = Object.freeze({
  key: ALIAS_KEY, maxLen: REALM_ALIAS_MAX_LEN, reserved: RESERVED_REALM_ALIASES, invisible: INVISIBLE_RANGES, idPattern: RE24.source, control: CONTROL.source,
});

// The routes realm.ts sends (the probe goes to the target's host, so it is sent through the transport).
export const realmsRoute = defineRoute<{ data?: { realm_ids?: unknown; usage?: unknown; cap?: unknown } }>({ method: 'GET', path: '/realms', scope: 'base', query: ['include_usage'] });
// The vault key routes, shared with the Vault page (@core): a key's value is a secret, so both are secret routes
// (a caller passes a scrub; a rejection keeps only status and these codes). realm_id is a 24-hex realm; Global
// sends no realm_id at all (the API refuses `realm_id=`). A PUT without metadata keeps the stored metadata.
export interface VaultKeyAnswer { data?: { key?: string; realm_id?: string; value?: unknown; metadata?: unknown; size_bytes?: number; created_at?: string; updated_at?: string } }
export const vaultKeyRoute = defineRoute<VaultKeyAnswer>({ method: 'GET', path: '/vault/keys/:key', scope: 'base', query: ['realm_id'], secret: true, codes: ['INSUFFICIENT_PERMISSIONS'] });
export const vaultKeyPutRoute = defineRoute<VaultKeyAnswer, { value: string; metadata?: Record<string, unknown> | null }>({ method: 'PUT', path: '/vault/keys/:key', scope: 'base', query: ['realm_id'], body: ['value', 'metadata'], secret: true, etagMatch: true, codes: ['VAULT_LIMIT_EXCEEDED', 'INSUFFICIENT_PERMISSIONS', 'PRECONDITION_FAILED'] });
export const probeRoute = defineRoute({ method: 'GET', path: '/projects', scope: 'realm', query: ['page', 'limit'] });

interface Usage { computers?: number }
const st = {
  list: null as string[] | null,
  usage: {} as Record<string, Usage>,
  // Use against the account's Realm limit, as the last realm list answer gave it; null: it gave none.
  cap: null as RealmCap | null,
  aliases: {} as Record<string, string>,
  colors: {} as Record<string, RealmColor>,
  switching: null as null | { target: string; token: object },
};
let pinned: string | null = null;
let ended = false;

// ---- notices and teardown listeners ----
export type RealmNotice =
  | { kind: 'realm-gone'; restored?: true }
  | { kind: 'switch-failed'; target: string; current: string }
  | { kind: 'look' };
const noticeListeners = new Set<(n: RealmNotice) => void>();
export function onRealmNotice(l: (n: RealmNotice) => void): () => void {
  noticeListeners.add(l);
  return () => { noticeListeners.delete(l); };
}
function notice(n: RealmNotice): void {
  for (const l of [...noticeListeners]) { try { l(n); } catch { /* the listener's own */ } }
}

const teardownListeners = new Set<(reason: string) => void>();
/** Views, dialogs and secret holders end here (before the generation moves). */
export function onTeardown(l: (reason: string) => void): () => void {
  teardownListeners.add(l);
  return () => { teardownListeners.delete(l); };
}

// ---- storage ----
function store(k: string, v: string | null): void {
  if (!storageEntry('local', k)) return; // an unregistered key is never written
  try { if (v === null) localStore().removeItem(k); else localStore().setItem(k, v); } catch { /* storage unavailable */ }
}
/** The stored selection: a 24-hex id, else 'all'. */
export function readSelection(): string {
  let v: string | null = null;
  try { v = localStore().getItem(KEY); } catch { v = null; }
  return v && RE24.test(v) ? v : 'all';
}
function readColors(): Record<string, RealmColor> {
  let o: unknown = null;
  const out: Record<string, RealmColor> = {};
  try { o = JSON.parse(localStore().getItem(COLORS) || 'null'); } catch { o = null; }
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (RE24.test(k) && (PALETTE as readonly unknown[]).includes(v)) out[k] = v as RealmColor;
  }
  return out;
}

/** Boot: the stored selection (or the token pin) becomes the core's realm. Returns it. */
export function initRealm(): string {
  st.colors = readColors();
  const r = pinned ?? readSelection();
  restored = pinned === null && r !== 'all';
  setRealm(r);
  return r;
}

// ---- aliases (mirrors the sidecar; keep both in step) ----
function invisible(cp: number): boolean {
  return INVISIBLE_RANGES.some(([a, b]) => cp >= a && cp <= b);
}
export function foldRealmAlias(v: string): string {
  let out = '';
  for (const ch of v) if (!invisible(ch.codePointAt(0) as number)) out += ch;
  return out.trim().toLowerCase();
}
function validAliasEntry(k: unknown, v: unknown): v is string {
  return typeof k === 'string' && RE24.test(k) && typeof v === 'string' && v.length > 0 && v.length <= REALM_ALIAS_MAX_LEN && !CONTROL.test(v);
}
/** A bad value reads as no aliases; invalid entries are dropped. */
export function parseRealmAliases(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw !== 'string' || raw === '') return out;
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return out; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (validAliasEntry(k, v)) out[k] = v;
  return out;
}
export interface AliasError { code: 'ALIAS_INVALID'; reason: 'shape' | 'id' | 'length' | 'control' | 'reserved'; id?: string; word?: string; notSent: true }
/** The clean map, or throws an AliasError. */
export function validateRealmAliases(input: unknown): Record<string, string> {
  const bad = (reason: AliasError['reason'], id?: string, word?: string): AliasError => ({ code: 'ALIAS_INVALID', reason, id, word, notSent: true });
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('shape');
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!RE24.test(k)) throw bad('id', k);
    if (v === '' || v == null) continue;
    if (!validAliasEntry(k, v)) throw bad(typeof v === 'string' && v.length > REALM_ALIAS_MAX_LEN ? 'length' : 'control', k);
    const w = foldRealmAlias(v);
    if (RESERVED_REALM_ALIASES.includes(w)) throw bad('reserved', k, w);
    out[k] = v;
  }
  return out;
}
/** Nulls an answer's copy of the key's value (the vault routes are secret). */
function dropVaultValue(r: unknown): void {
  const d = r && typeof r === 'object' ? (r as VaultKeyAnswer).data : undefined;
  if (d && typeof d === 'object' && 'value' in d) d.value = null;
}
// The alias map is not a secret, but it comes back on a secret route: the scrub copies it out, then nulls the
// answer's copy (reading it from the answer after the scrub would read null and wipe the aliases).
// onEtag: the map's ETag when the read answered with one (setAlias sends it back as If-Match).
function readAliases(ctx: ReturnType<typeof capture>, timeoutMs?: number, onEtag?: (etag: string | null) => void): Promise<Record<string, string>> {
  let raw = '';
  const scrub = (r: unknown): void => {
    const d = r && typeof r === 'object' ? (r as VaultKeyAnswer).data : undefined;
    raw = d && typeof d === 'object' && typeof d.value === 'string' ? d.value : '';
    dropVaultValue(r);
  };
  return api(vaultKeyRoute, { params: { key: ALIAS_KEY }, ctx, scrub, timeoutMs, ...(onEtag ? { onEtag } : {}) }).then(() => parseRealmAliases(raw), (e: HubError) => {
    if (e && e.status === 404) return {};
    throw e;
  });
}
/** The stored alias map, read now: no map (404) is empty, and any request failure rejects. A stored value that is
 *  not a valid map reads as {} (parseRealmAliases, as for load and rename). */
export function readRealmAliases(): Promise<Record<string, string>> {
  return readAliases(capture());
}
/** The stored alias map read again and shown (a terminal mount, after an alias write whose outcome was unknown was
 *  settled by a read-back, live-direct.ts): a rename made since this read began wins over it; a failed read keeps
 *  the names as they are and rejects. */
export async function reloadRealmAliases(): Promise<void> {
  const rev = aliasRev;
  const got = await readAliases(capture());
  if (rev !== aliasRev) return;
  st.aliases = got;
  notice({ kind: 'look' });
}
/** A name another realm already has, folded as the alias rules fold; refused after the map's GET, before any PUT. */
export interface NameTakenError { code: 'NAME_TAKEN'; id: string; notSent: true; kind: 'not_sent' }
/** The map was read without a usable ETag, so no conditional write can be made; refused before any PUT. */
export interface CasRequiredError { code: 'CAS_REQUIRED'; notSent: true; kind: 'not_sent' }
// This tab's renames, one at a time: each reads the map after the previous one settled. The write carries
// If-Match with the ETag that read answered: a rename made elsewhere since, or this
// tab's own earlier PUT whose answer was lost landing in between, makes the server refuse it (412
// PRECONDITION_FAILED, nothing saved): a definite refusal, its code kept (the kit's errorWords and the Rename realms
// dialog show the conflict sentence), never retried by itself (the person reloads and decides again). A read that
// found the map but answered no usable ETag is refused before any PUT (CAS_REQUIRED, not sent): the write is never
// made unconditional. A missing map (404) is written with If-None-Match: * instead, to create it only: a map made
// since (another tab or device, or this tab's own earlier PUT whose answer was lost) is the same 412, nothing saved.
// Each rename keeps the context it was called in: one queued across a switch or sign-out is refused unsent.
// The queue itself never rejects: a failed rename does not hold up the next. Each call is bounded (ALIAS_WAIT_MS,
// plus api's slack), so a stalled answer cannot hold the queue: a GET past it rejects as any failed read (nothing
// written), a PUT past it rejects pending (it may have gone through; never shown as failed). A 2FA prompt waits
// for the person, between calls.
const ALIAS_WAIT_MS = 15000;
let aliasQueue: Promise<unknown> = Promise.resolve();
/** Rename: validate the one entry before anything is sent, then, after this tab's earlier renames: read the map,
 *  refuse a map read without a usable ETag (CAS_REQUIRED) and a name another realm has (NAME_TAKEN), change one
 *  entry, write the whole map with If-Match (no map yet: If-None-Match: *). */
export function setAlias(id: string, alias: string): Promise<Record<string, string>> {
  if (pinned !== null) return Promise.reject({ code: 'TOKEN_SESSION_REFUSED', notSent: true, kind: 'not_sent' });
  try { validateRealmAliases({ [id]: alias }); } catch (e) { return Promise.reject(e); }
  const ctx = capture();
  let etag: string | null = null;
  let found = false;
  const run = (): Promise<Record<string, string>> => readAliases(ctx, ALIAS_WAIT_MS, (e) => { found = true; etag = e; }).then((cur) => {
    if (found && !etag) throw { code: 'CAS_REQUIRED', notSent: true, kind: 'not_sent' } satisfies CasRequiredError;
    const w = foldRealmAlias(alias);
    const other = alias === '' ? undefined : Object.entries(cur).find(([k, v]) => k !== id && foldRealmAlias(v) === w)?.[0];
    if (other !== undefined) throw { code: 'NAME_TAKEN', id: other, notSent: true, kind: 'not_sent' } satisfies NameTakenError;
    const clean = validateRealmAliases({ ...cur, [id]: alias });
    // Global (no realm_id) and no metadata (the stored metadata stays): the alias write as before.
    return directChange('realm-alias-write', null, (bind) => api(vaultKeyPutRoute, { params: { key: ALIAS_KEY }, body: { value: JSON.stringify(clean) }, ctx, scrub: dropVaultValue, timeoutMs: ALIAS_WAIT_MS, ...(etag ? { ifMatch: etag } : { ifNoneMatch: '*' as const }), ...(bind ? { bind } : {}) })).then(() => {
      st.aliases = clean;
      aliasRev++;
      notice({ kind: 'look' });
      return clean;
    });
  });
  const out = aliasQueue.then(run);
  aliasQueue = out.catch(() => undefined);
  return out;
}

// ---- colours ----
export function tint(id: string): RealmColor | '' {
  if (st.colors[id]) return st.colors[id] as RealmColor;
  return RE24.test(id) ? PALETTE[parseInt(id.slice(-6), 16) % PALETTE.length] as RealmColor : '';
}
export function setTint(id: string, c: RealmColor): boolean {
  if (!RE24.test(id) || !(PALETTE as readonly string[]).includes(c)) return false;
  st.colors[id] = c;
  store(COLORS, JSON.stringify(st.colors));
  notice({ kind: 'look' });
  return true;
}

// ---- names ----
/** Never a full 24-hex id: the first and last four characters. */
export function shortId(id: string): string {
  return id.slice(0, 4) + '…' + id.slice(-4);
}
/** A realm's display name: its alias, else its short id. 'all' and 'global' are the caller's own words. */
export function aliasOf(id: string): string | null {
  return RE24.test(id) ? st.aliases[id] ?? null : null;
}
export function displayName(id: string): { kind: 'all' } | { kind: 'none' } | { kind: 'alias'; text: string } | { kind: 'short'; text: string } {
  if (id === 'all') return { kind: 'all' };
  if (id === 'global' || !id) return { kind: 'none' };
  const a = aliasOf(id);
  return a ? { kind: 'alias', text: a } : { kind: 'short', text: shortId(id) };
}
/** A row's realms: realm_ids, else a top-level realm (detached Bot URL rows, Global Bots), else bot.realm. */
export function rowRealms(row: unknown): string[] {
  const r = row as { realm_ids?: unknown; realm?: unknown; bot?: { realm?: unknown } } | null;
  if (!r) return [];
  if (Array.isArray(r.realm_ids)) return r.realm_ids.filter((x): x is string => typeof x === 'string' && RE24.test(x));
  if (typeof r.realm === 'string' && r.realm) return [r.realm];
  if (r.bot && typeof r.bot.realm === 'string' && r.bot.realm) return [r.bot.realm];
  return [];
}
export function filterRows<T>(rows: readonly T[], sel: string = selectedRealm()): T[] {
  return sel === 'all' ? rows.slice() : rows.filter((r) => rowRealms(r).includes(sel));
}
/** A 403 on a by-id call: the realm to offer ("Open in <realm>") only when it is known from loaded data. Never probes. */
export function noAccessRealm(knownRealm: string | null | undefined): string | null {
  return pinned === null && RE24.test(knownRealm || '') && knownRealm !== selectedRealm() ? (knownRealm as string) : null;
}

// ---- list and switching ----
export function list(): readonly string[] | null { return st.list; }
export function aliases(): Readonly<Record<string, string>> { return st.aliases; }
export function switching(): string | null { return st.switching ? st.switching.target : null; }
export function pinnedRealm(): string | null { return pinned; }
export function accountEnded(): boolean { return ended; }

let loadSeq = 0, aliasRev = 0;
// The selection came from storage at boot and no load has confirmed it yet, nor a switch on this page replaced it.
let restored = false;
// A load skipped a fallback because a switch was pending; a failed switch loads again.
let fallbackDeferred = false;
export async function load(): Promise<readonly string[] | null> {
  if (pinned !== null) { notice({ kind: 'look' }); return st.list; }
  const ctx = capture(), mine = ++loadSeq, rev = aliasRev;
  // null: the alias read failed (an error, not an empty map).
  const al = readAliases(ctx).then((m): Record<string, string> | null => m, () => null);
  const r = await api(realmsRoute, { query: { include_usage: true }, ctx });
  const got = await al;
  // A later load, a generation bump (a realm switch, an account change) since this one began: it commits nothing,
  // so it never undoes a switch nor replaces a newer list.
  if (mine !== loadSeq || !alive(ctx)) return st.list;
  const d = (r && r.data) || {};
  const ids = (Array.isArray(d.realm_ids) ? d.realm_ids : []).filter((x): x is string => typeof x === 'string' && RE24.test(x));
  // A failed read keeps the last aliases this tab read; a rename since this read began wins over it.
  if (got && rev === aliasRev) st.aliases = got;
  st.usage = d.usage && typeof d.usage === 'object' ? (d.usage as Record<string, Usage>) : {};
  st.cap = parseRealmCap(d);
  // A realm the alias map names is listed too (after GET /realms' own, once), so a named realm with no
  // computers yet stays selectable. Being named proves no access: the server still checks every realm call.
  st.list = [...new Set([...ids, ...Object.keys(st.aliases).filter((x) => RE24.test(x))])];
  const sel = selectedRealm();
  if (st.switching) {
    // A switch the person started decides the selection; a fallback here would bump the generation under its
    // probe and leave it stuck. If the switch fails, it loads again. A confirmation changes no selection, so it
    // still counts.
    if (Array.isArray(d.realm_ids) && (sel === 'all' || ids.includes(sel))) restored = false;
    if (sel !== 'all' && (restored || got !== null)) fallbackDeferred = true;
    notice({ kind: 'look' });
    return st.list;
  }
  // A selection restored at boot opens only if GET /realms lists it, whatever the alias read gave; one only
  // the alias map names (an empty realm, or one gone or no longer accessible: nothing local tells which) falls back.
  if (restored && sel !== 'all' && Array.isArray(d.realm_ids) && !ids.includes(sel)) {
    fallBack(st.list.includes(sel));
  } else if (got !== null && Array.isArray(d.realm_ids) && sel !== 'all' && !st.list.includes(sel)) {
    // A failed alias read proves nothing about a realm only the alias map names, and an answer without a realm_ids
    // list proves nothing about any realm: the selection stays until a read answers.
    fallBack(false);
  } else if (Array.isArray(d.realm_ids) && (sel === 'all' || ids.includes(sel))) restored = false;
  notice({ kind: 'look' });
  return st.list;
}

/** The selection falls back to all realms (a bump, one notice). */
function fallBack(wasRestored: boolean): void {
  restored = false;
  setRealm('all');
  store(KEY, 'all');
  bump('fallback');
  notice(wasRestored ? { kind: 'realm-gone', restored: true } : { kind: 'realm-gone' });
}

/** Use against the account's Realm limit (realmLimit.ts), from the last realm list answer; null when it gave none. */
export function realmCap(): RealmCap | null { return st.cap; }

/** Computers in a realm (or all of them), from the list's usage; null while unknown. */
export function count(id: string): number | null {
  const u = st.usage;
  if (id !== 'all') { const x = u[id]; return x && typeof x.computers === 'number' ? x.computers : null; }
  let n = 0;
  for (const k of Object.keys(u)) { const x = u[k]; if (x && typeof x.computers === 'number') n += x.computers; }
  return st.list ? n : null;
}

/** Views go first (onTeardown), then the 2FA prompt: a code is never typed into a context that is gone. */
export function wipe(reason: string): void {
  for (const l of [...teardownListeners]) { try { l(reason); } catch { /* the listener's own */ } }
  cancelOtpPrompt();
}

// The session fence of a probe: the page identity when there is one, else the access token's user.
function sessionFence(): () => boolean {
  const pg = page();
  if (pg) return () => holds(pg);
  const acct0 = sessionUid(null);
  return () => sessionUid(null) === acct0;
}

// A switch as an operation its caller can cancel, and a revision
// that moves whenever a switch starts or the account ends (never on a refused switch or load()'s fallback), so a
// caller can tell its own switch from one started elsewhere.
let revision = 0;
/** Moves when a switch starts (any caller) or the account ends; load()'s fallback to 'all' leaves it. */
export function switchRevision(): number { return revision; }
export interface SwitchOp {
  /** True when the selection changed. */
  readonly done: Promise<boolean>;
  /** While this is still the pending switch: drop it (no commit, no notice; done resolves false). Else nothing. */
  cancel(): void;
}
const refusedSwitch: SwitchOp = { done: Promise.resolve(false), cancel: () => undefined };

/** Probe the target, then commit. Resolves true when the selection changed. */
export function switchTo(target: string): Promise<boolean> {
  return beginSwitch(target).done;
}

/** switchTo, as an operation the caller can cancel. */
export function beginSwitch(target: string): SwitchOp {
  if (ended || pinned !== null || loggingOut()) return refusedSwitch;
  if (target !== 'all' && !RE24.test(target || '')) return refusedSwitch;
  if (target === selectedRealm() && !st.switching) return refusedSwitch;
  revision += 1;
  const me = {};
  const gen0 = gen();
  const held = sessionFence();
  st.switching = { target, token: me };
  setSwitching(target);
  const live = () => !ended && !loggingOut() && !!st.switching && st.switching.token === me && gen() === gen0 && held();
  const probe = target === 'all' || !realmDomain() ? Promise.resolve()
    : transport().hoody('GET', '/projects?page=1&limit=1', null, { base: hubApiBase(target), alive: live, timeoutMs: 15000 },
      { route: probeRoute, method: 'GET', path: '/projects', query: { page: '1', limit: '1' }, body: null });
  // A probe that ends after its generation did (a suspension, any bump) commits nothing, but a switch still
  // owned by it ends: switching never stays set. A newer switch owns
  // its own state, and a deferred fallback waits for the next live load or switch outcome.
  const stale = (): false => {
    if (st.switching && st.switching.token === me) { st.switching = null; setSwitching(null); }
    return false;
  };
  const commit = (): boolean => {
    if (!live()) return stale();
    st.switching = null;
    setSwitching(null);
    restored = false;
    fallbackDeferred = false;
    wipe('switch');
    st.cap = null; // read before the switch: the list refresh that follows brings the count that holds now
    setRealm(target);
    store(KEY, target);
    bump('switch');
    return true;
  };
  const done = probe.then((): boolean | Promise<boolean> => {
    if (!live()) return stale();
    if (leaveCount() === 0 && switchLosses().length === 0) return commit();
    // Asked for as long as this switch is the live one: cancelled or superseded, its question goes.
    const asked = (): Promise<boolean> => askLeave(live).then((ok) => {
      if (!live()) return stale();
      // Unsaved work named after the person's press (not on the question they confirmed) is asked about again,
      // checked here, in the same turn as the teardown.
      if (ok && !lossesCovered()) return asked();
      if (ok) return commit();
      // Stay: the switch ends here, as a cancel (the selection and everything running stay).
      cancel();
      return false;
    });
    return asked();
  }, () => {
    if (!live()) return stale();
    const cur = selectedRealm();
    st.switching = null;
    setSwitching(null);
    notice({ kind: 'switch-failed', target, current: cur });
    if (fallbackDeferred) { fallbackDeferred = false; load().catch(() => {}); }
    return false;
  });
  const cancel = (): void => {
    if (!st.switching || st.switching.token !== me) return;
    st.switching = null;
    setSwitching(null);
    // A fallback a load deferred under this switch is decided now, as after a failed switch.
    if (fallbackDeferred) { fallbackDeferred = false; load().catch(() => {}); }
  };
  return { done, cancel };
}

/** A token session's one realm, before Home mounts. */
export function pin(r: string): boolean {
  if (pinned !== null || ended || (r !== 'all' && !RE24.test(r || ''))) return false;
  pinned = r;
  setRealm(r);
  st.list = r === 'all' ? [] : [r];
  st.usage = {};
  st.aliases = {};
  return true;
}

/** The account this page shows is gone: once per page, cancel a switch, tear down, bump. */
export function endAccount(reason: string): boolean {
  if (ended) return false;
  ended = true;
  revision += 1;
  if (st.switching) { st.switching = null; setSwitching(null); }
  fallbackDeferred = false;
  st.cap = null; // the next account's limit is its own
  wipe(reason);
  bump(reason);
  return true;
}

let purgeHooked = false;
const purgeListeners = new Set<(info?: AuthPurgeInfo) => void>();
/** Runs `fn` on every auth purge with its info (see AuthPurgeInfo), before the account ends; a module-level
 *  subscription that every boot's hook serves. */
export function onAuthPurge(fn: (info?: AuthPurgeInfo) => void): () => void {
  purgeListeners.add(fn);
  return () => { purgeListeners.delete(fn); };
}
/** What every purge does here: tells the onAuthPurge listeners, then ends the account for `reason` (sign-out; the
 *  terminal's session disposal names its own). */
export function runAuthPurge(info?: AuthPurgeInfo, reason = 'signout'): void {
  for (const fn of [...purgeListeners]) { try { fn(info); } catch { /* a listener's own; the purge goes on */ } }
  endAccount(reason);
}
/** Boot: every purge (any path) runs runAuthPurge. Idempotent. */
export function hookPurge(): void {
  if (purgeHooked) return;
  purgeHooked = true;
  onBeforeAuthPurge((info) => { runAuthPurge(info); });
}

/** Fixture mode only (bootFixtureCore): the realm list, usage, aliases and colours known at once, nothing sent or stored. */
export function seedForFixtures(o: { list: readonly string[]; usage?: Record<string, Usage>; aliases?: Record<string, string>; colors?: Record<string, RealmColor>; cap?: RealmCap | null }): void {
  st.list = o.list.filter((x) => RE24.test(x));
  st.usage = { ...(o.usage || {}) };
  st.aliases = { ...(o.aliases || {}) };
  st.colors = { ...st.colors, ...(o.colors || {}) };
  st.cap = o.cap ?? null;
  notice({ kind: 'look' });
}

/** The realm state back to the boot state; module-level listeners stay (session disposal, dispose.ts; tests). */
export function resetRealm(): void {
  st.list = null; st.usage = {}; st.cap = null; st.aliases = {}; st.colors = {}; st.switching = null;
  pinned = null; ended = false; purgeHooked = false; restored = false; fallbackDeferred = false;
  aliasQueue = Promise.resolve();
}

// What the terminal Hub may keep on disk, and the storage seam that keeps it.
//
// The host (the CLI) opens the store's files and hands the mount a PersistArea (scripts/term/build/hub-store.ts; this
// file never touches a file). A registry key is kept ONLY when it has a row here AND its value passes that row's
// shape check; every other key stays in the session's memory and ends with the mount.
//
//   group      where            a write that cannot be kept
//   recovery   the journal      throws NOT_DURABLE (core then refuses the change unsent: attempts.ts, change-store.ts)
//   preference store.json       stays in memory for this mount (a colour or theme still works until the Hub closes)
//
// A row whose check is `null` would be a key the design keeps but whose shape is not written yet: its recovery write is
// refused (NOT_DURABLE), never kept unchecked. No row is null today (a test fails on one). A `strict` row's stored value that fails its check is not "nothing
// stored": the read throws, so core reads the store as unreadable and writes nothing over it (the AI journal: an
// entry there is the only record of a request that may have left). The passcode record (the app lock's per-account key) and the `--new-token` note are
// not here: the first comes with the passcode host, the second is the CLI's own and never passes this seam.
//
// A shape check takes the exact stored text. It names every field it allows; a field it does not name, a string over
// its bound, or anything shaped like a credential refuses the write.
import { PALETTE } from '../../core/realm';
import { RE24 } from '../../core/realm-id';
import type { KeyValueStore } from '../../core/host-env';
import { DRAFTS_MAX, SCRIPT_ASKS_MAX, validDraftRecord, validScriptAsk } from '../../core/script-asks';
import { okHandle, okRealm, seg } from '../../ask/journal';
import { validRec } from '../../ask/logic';
import { SECRET_SHAPED } from './secret-shaped';

/** The host's store, as the seam uses it (hub-store.ts HubStore has exactly these). */
export interface PersistArea {
  readonly readOnly: null | 'busy';
  journalGet(key: string): string | null;
  journalKeys(): string[];
  journalSet(key: string, value: string): void;
  journalDel(key: string): void;
  get(key: string): string | null;
  keys(): string[];
  set(key: string, value: string): void;
  del(key: string): void;
  failed(): boolean;
}

export type PersistGroup = 'recovery' | 'preference';
/** `ownScan`: the row's check scans its own strings for credential shapes (the AI journal: a computer's handle is exempt,
 *  see leavesButHandles), so setItem's whole-text scan is not run on it. */
export interface PersistRule { readonly key: string; readonly group: PersistGroup; readonly check: ((text: string) => boolean) | null; readonly strict?: true; readonly ownScan?: true }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const parse = (text: string): unknown => { try { return JSON.parse(text) as unknown; } catch { return undefined; } };
const only = (o: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(o).every((k) => allowed.includes(k));
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const time = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const opt = (v: unknown, ok: (x: unknown) => boolean): boolean => v === undefined || ok(v);

const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
/** Plain metadata a sender attached to a held send: small, flat-ish, named fields, short strings, nothing secret-shaped. */
function plainMeta(v: unknown, depth = 0): boolean {
  if (v === null || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.length <= 256 && !SECRET_SHAPED.test(v);
  if (depth >= 4) return false;
  if (Array.isArray(v)) return v.length <= 32 && v.every((x) => plainMeta(x, depth + 1));
  if (!isObj(v)) return false;
  const keys = Object.keys(v);
  return keys.length <= 32 && keys.every((k) => FIELD.test(k) && !SECRET_SHAPED.test(k) && plainMeta(v[k], depth + 1));
}

const CHANGE_FIELDS = ['id', 'pending', 'key', 'keyBytes', 'at', 'meta', 'fmt', 'sending', 'attempt', 'admitting', 'metaVersion', 'inc', 'nonce', 'oc', 't'] as const;
const idPart = (v: unknown): boolean => isObj(v) && only(v, ['id']) && str(v.id, 128);
// The API's own rule for a server name (its safe server-name pattern).
const SERVER_NAME = /^(?!\.{1,2}$)(?!-)[a-zA-Z0-9._-]+$/;
// Core's Target names a computer as {id, server_name} (core/ctx.ts): the host name of its server, never a secret.
const computerPart = (v: unknown): boolean => isObj(v) && only(v, ['id', 'server_name']) && str(v.id, 128) && opt(v.server_name, (x) => str(x, 253) && SERVER_NAME.test(x));
function changeTarget(v: unknown): boolean {
  if (v === null) return true;
  return isObj(v) && only(v, ['project', 'computer', 'container']) && idPart(v.project) && (v.computer === undefined ? computerPart(v.container) : computerPart(v.computer) && opt(v.container, computerPart));
}
/** One held change, field by field (core/change-store.ts StoredChange; the variables of a change are never part of it). */
function changeRecord(v: unknown): boolean {
  if (!isObj(v) || !only(v, CHANGE_FIELDS)) return false;
  if (!str(v.id, 1024) || SECRET_SHAPED.test(v.id) || typeof v.pending !== 'boolean' || !time(v.t)) return false;
  if (!(v.key === null || (str(v.key, 256) && !SECRET_SHAPED.test(v.key))) || !opt(v.keyBytes, (x) => str(x, 256)) || !opt(v.at, time) || !opt(v.admitting, time)) return false;
  if (!opt(v.fmt, (x) => x === 1) || !opt(v.metaVersion, (x) => Number.isSafeInteger(x) && (x as number) >= 0)) return false;
  for (const k of ['inc', 'nonce', 'oc'] as const) if (!opt(v[k], (x) => str(x, 64) && /^[A-Za-z0-9_-]+$/.test(x))) return false;
  if (!opt(v.sending, (x) => isObj(x) && only(x, ['tab', 'at']) && str(x.tab, 64) && time(x.at))) return false;
  if (!opt(v.meta, (m) => isObj(m) && only(m, ['base', 'target', 'realm', 'identity', 'by', 'page', 'across']) && opt(m.across, (x) => typeof x === 'boolean') && opt(m.page, (x) => str(x, 64) && /^[A-Za-z0-9_.-]+$/.test(x)) && str(m.base, 256) && !SECRET_SHAPED.test(m.base) && changeTarget(m.target)
    && (m.realm === null || str(m.realm, 64)) && opt(m.by, (x) => str(x, 256) && !SECRET_SHAPED.test(x)) && opt(m.identity, plainMeta))) return false;
  return opt(v.attempt, plainMeta);
}
const changes = (text: string): boolean => { const a = parse(text); return Array.isArray(a) && a.length <= 512 && a.every(changeRecord); };

const realmColors = (text: string): boolean => {
  const o = parse(text);
  return isObj(o) && Object.keys(o).length <= 256 && Object.entries(o).every(([k, v]) => RE24.test(k) && (PALETTE as readonly unknown[]).includes(v));
};
const shellPrefs = (text: string): boolean => { const o = parse(text); return isObj(o) && only(o, ['collapsed']) && opt(o.collapsed, (x) => typeof x === 'boolean'); };

const num = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): boolean => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
/** Every string of a parsed value, field names included, is free of credential shapes. The whole-text check in setItem
 *  does not see a JSON-escaped secret ("hdy_…"); the parsed strings do (titles and names are
 *  free text, checked like any string leaf). Depth is already bounded by each shape. */
const plainLeaves = (v: unknown): boolean => {
  if (typeof v === 'string') return !SECRET_SHAPED.test(v);
  if (Array.isArray(v)) return v.every(plainLeaves);
  if (isObj(v)) return Object.entries(v).every(([k, x]) => !SECRET_SHAPED.test(k) && plainLeaves(x));
  return true;
};
const listOf = (text: string, max: number, row: (v: unknown) => boolean): boolean => { const a = parse(text); return Array.isArray(a) && a.length <= max && a.every(row) && plainLeaves(a); };
const KEY_ID = /^[\w-]{16,128}$/, SHORT_ID = /^[A-Za-z0-9_-]{1,64}$/, DAYS = /^[0-9]{1,4}$/, FLIGHT = /^[\w-]{8,64}$/;
/** A title or a name: free text, bounded like core bounds it (commerce.ts validMk/validRent: 200). */
const label = (v: unknown): boolean => v == null || (typeof v === 'string' && v.length <= 200);
/** core/commerce.ts SendPhase: a claim writes `sending` before the POST, any end but a definite answer `held`. */
const sendPhase = (v: unknown): boolean => v === 'sending' || v === 'held';

/** Scripts' unsettled asks and drafts (core/script-asks.ts: its own exact-shape checks, per account). */
const scriptAsks = (text: string): boolean => {
  const o = parse(text);
  if (!plainLeaves(o)) return false;
  if (!isObj(o) || !(o.v === 1 ? only(o, ['v', 'accounts']) : o.v === 2 && only(o, ['v', 'accounts', 'drafts'])) || !isObj(o.accounts)) return false;
  const per = (m: unknown, max: number, row: (v: unknown) => boolean): boolean => isObj(m) && Object.keys(m).length <= 16
    && Object.entries(m).every(([acct, list]) => str(acct, 128) && Array.isArray(list) && list.length <= max && list.every(row));
  return per(o.accounts, SCRIPT_ASKS_MAX, validScriptAsk) && (o.v === 1 || per(o.drafts, DRAFTS_MAX, validDraftRecord));
};
// ---- the AI journal (ask/journal: storage.ts, entries.ts, records.ts, leases.ts) ----
// Each key is a core kit-io `partitioned()` document, {v: 1, a: {<account id>: value}}. The values hold identities
// only (handles, realm and session ids, request keys, phases, times): never a prompt, a reply or a hash of one.
/** A partitioned document of an account-scoped key, every account's value passing `value`. */
const partitionedDoc = (text: string, value: (v: unknown) => boolean, handles?: (o: unknown) => readonly string[]): boolean => {
  const o = parse(text);
  return isObj(o) && only(o, ['v', 'a']) && o.v === 1 && isObj(o.a) && Object.keys(o.a).length <= 16
    && Object.entries(o.a).every(([acct, v]) => str(acct, 128) && value(v)) && (handles ? leavesButHandles(o, new Set(handles(o))) : plainLeaves(o));
};
/** plainLeaves for the AI journal, whose strings carry a computer's handle (its name + ".last4"): alone (`h`) and as
 *  the head of an entry name, a record id and a lease name. A computer may be NAMED like a key ("sk-integration-tests",
 *  "hdy_staging01"), and the web keeps its records; so the handle itself is not scanned. Everything after it is, and so
 *  is every string that is not a handle or does not start with one. */
const leavesButHandles = (v: unknown, handles: ReadonlySet<string>): boolean => {
  const clean = (s: string): boolean => {
    if (handles.has(s)) return true;
    for (const h of handles) if (s.startsWith(h) && (s[h.length] === ':' || s[h.length] === '|') && !SECRET_SHAPED.test(s.slice(h.length))) return true;
    return !SECRET_SHAPED.test(s);
  };
  if (typeof v === 'string') return clean(v);
  if (Array.isArray(v)) return v.every((x) => leavesButHandles(x, handles));
  if (isObj(v)) return Object.entries(v).every(([k, x]) => clean(k) && leavesButHandles(x, handles));
  return true;
};
/** The handles a requests or records document names: the `h` of each of its rows. */
const rowHandles = (o: unknown): string[] => {
  const out: string[] = [];
  if (isObj(o) && isObj(o.a)) for (const m of Object.values(o.a)) if (isObj(m)) for (const row of Object.values(m)) if (isObj(row) && okHandle(row.h)) out.push(row.h);
  return out;
};
/** The handles a lease document names: the head of each name, up to its first ':' that leaves a session id. */
const leaseHandles = (o: unknown): string[] => {
  const out: string[] = [];
  if (isObj(o) && isObj(o.a)) for (const m of Object.values(o.a)) if (isObj(m)) for (const name of Object.keys(m)) {
    for (let at = name.indexOf(':'); at >= 0; at = name.indexOf(':', at + 1)) if (okHandle(name.slice(0, at)) && seg(name.slice(at + 1))) { out.push(name.slice(0, at)); break; }
  }
  return out;
};
const AI_KEY = /^hx-[0-9a-f]{24,32}$/, AI_ID = /^[\x21-\x7e]{1,128}$/;
const AI_KINDS: readonly unknown[] = ['create', 'turn', 'message', 'interrupt', 'stop', 'decision', 'answer'];
/** One request entry (journal/types.ts Entry as the door stores it; entries.ts validEntry), under its own name "<h>:<k>". */
const aiEntry = (name: string, v: unknown): boolean => isObj(v) && only(v, ['k', 'kind', 'h', 'r', 's', 'c', 'ct', 'g', 'gn', 'f', 'at'])
  && typeof v.k === 'string' && AI_KEY.test(v.k) && AI_KINDS.includes(v.kind) && okHandle(v.h) && okRealm(v.r) && (v.s === null || seg(v.s))
  && typeof v.c === 'string' && AI_KEY.test(v.c) && seg(v.ct) && opt(v.g, (x) => str(x, 256)) && opt(v.gn, count) && opt(v.f, (x) => x === 1) && time(v.at)
  && name === `${v.h}:${v.k}`;
/** hub_ai_req_v1: the requests that may have left, one entry per request key (entries.ts ENTRIES_MAX bounds the names). */
const aiRequests = (text: string): boolean => partitionedDoc(text, (m) => isObj(m) && Object.keys(m).length <= 1024 && Object.entries(m).every(([name, e]) => aiEntry(name, e)), rowHandles);
/** A lease's name, "<h>:<sid>": a handle and a session id may each hold ':', so any split that gives both is the name. */
const leaseName = (name: string): boolean => { for (let at = name.indexOf(':'); at >= 0; at = name.indexOf(':', at + 1)) if (okHandle(name.slice(0, at)) && seg(name.slice(at + 1))) return true; return false; };
/** hub_ai_lease_v1: {"<h>:<sid>": lease id} (leases.ts). */
const aiLeases = (text: string): boolean => partitionedDoc(text, (m) => isObj(m) && Object.keys(m).length <= 1024
  && Object.entries(m).every(([name, id]) => typeof id === 'string' && AI_ID.test(id) && leaseName(name)), leaseHandles);
/** The journal's own fields on a record (records.ts JRec); every other field is the dock record's (logic.ts AskRecord). */
const AI_REC_FIELDS: readonly string[] = ['p', 'c', 'r', 's', 't', 'k1', 'k2', 'rc', 'n', 'at', 'i', 'q', 'ph', 'l', 'k3', 'c3', 'w', 'wf', 'kw', 'kwf', 'u', 'dk', 'na', 'fk', 'da', 'dg', 'dr', 'h', 'kp', 'xb', 'xs', 'rp'];
const AI_KEY32 = /^hx-[0-9a-f]{32}$/, AI_REQ = /^hx-[0-9a-f]{24}$/;
const aiKey = (x: unknown): boolean => typeof x === 'string' && AI_KEY32.test(x);
const aiReq = (x: unknown): boolean => typeof x === 'string' && AI_REQ.test(x);
const listOfKeys = (v: unknown): boolean => opt(v, (l) => Array.isArray(l) && l.length <= 64 && l.every(aiKey));
const mapOf = (v: unknown, key: (k: string) => boolean, value: (x: unknown) => boolean): boolean =>
  opt(v, (m) => isObj(m) && Object.keys(m).length <= 64 && Object.entries(m).every(([k, x]) => key(k) && value(x)));
/** One chat record, under its own id. Only the fields the journal writes; the scalar fields are what the dock's own
 *  validator reads (logic.ts validRec non-null); and every list member and map entry passes the SAME element test that
 *  validator applies (a request key, an id, a path segment), so nothing it would drop as malformed is kept. A record
 *  is NOT required to be in that validator's normal form: the journal's writers (records.ts) store empty lists,
 *  repeated keys and keys that overlap k1/k2, and each of those must be kept or that chat could not send again. */
const aiRecord = (id: string, v: unknown): boolean => {
  if (!isObj(v) || !only(v, AI_REC_FIELDS) || !okHandle(v.h)) return false;
  const r = validRec(v);
  if (!r) return false;
  for (const k of ['kp', 'xb', 'rp', 'w', 'wf'] as const) if (!opt(v[k], (x) => x === true)) return false;
  for (const k of ['k3', 'kw', 'kwf', 'dk', 'na'] as const) if (!listOfKeys(v[k])) return false;
  if (!opt(v.dg, (l) => Array.isArray(l) && l.length <= 64 && l.every(seg)) || !opt(v.u, seg)) return false;
  if (!mapOf(v.c3, aiKey, seg) || !mapOf(v.da, seg, aiReq) || !mapOf(v.dr, seg, aiReq)) return false;
  if (!opt(v.fk, (f) => isObj(f) && ((only(f, ['s', 'i']) && seg(f.s) && (f.i === null || count(f.i))) || (only(f, ['s', 'i', 'bad']) && f.s === '' && f.i === null && f.bad === true)))) return false;
  return opt(v.xs, (x) => typeof x === 'string' && AI_ID.test(x)) && id === `${v.h}|${r.r}|${r.s ?? 'create:' + r.k1}`;
};
/** hub_ai_journal_v1: the stored chats, one record per chat (records.ts: JOURNAL_RECS chats plus MARKS_MAX markers and FORKS_MAX forks). */
const aiRecords = (text: string): boolean => partitionedDoc(text, (m) => isObj(m) && Object.keys(m).length <= 256 && Object.entries(m).every(([id, r]) => aiRecord(id, r)), rowHandles);

/** hub_voice_pending_v1 (pages/bots/voice/pending.ts): per account and computer, the spoken messages whose fate is not
 *  known, as identities only: {v: 1, rows: [{realm, bot, conn, utt, at}]}. Never audio, never text. */
const VOICE_ID = /^[A-Za-z0-9_.:-]{1,64}$/, VOICE_PART = /^(?!__proto__$)[A-Za-z0-9_.:-]{1,64}$/;
const voicePending = (text: string): boolean => partitionedDoc(text, (parts) => isObj(parts) && Object.keys(parts).length <= 64 && Object.entries(parts).every(([computer, e]) =>
  VOICE_PART.test(computer) && isObj(e) && only(e, ['v', 'rows']) && e.v === 1 && Array.isArray(e.rows) && e.rows.length <= 256 && e.rows.every((r) =>
    isObj(r) && only(r, ['realm', 'bot', 'conn', 'utt', 'at']) && typeof r.realm === 'string' && VOICE_ID.test(r.realm) && typeof r.bot === 'string' && VOICE_ID.test(r.bot)
    && typeof r.conn === 'string' && AI_ID.test(r.conn) && count(r.utt) && num(r.at))));

/** A plan purchase or payment whose outcome is not known (core/commerce-pure.ts PendingEntry, plus the `phase` the
 *  claim writes: commerce.ts claimFenced and the held rewrite). */
const moneyPending = (text: string): boolean => listOf(text, 256, (e) => isObj(e) && only(e, ['kind', 'user_id', 'key', 'max_charge_cents', 'at', 'title', 'family_id', 'plan_id', 'sub_id', 'phase'])
  && str(e.user_id, 128) && str(e.key, 128) && count(e.max_charge_cents) && num(e.at) && label(e.title) && opt(e.phase, sendPhase)
  && (e.kind === 'buy' ? typeof e.family_id === 'string' && /^[0-9a-f]{24}$/.test(e.family_id) && str(e.plan_id, 64) && e.sub_id === undefined
    : e.kind === 'pay' && typeof e.sub_id === 'string' && SHORT_ID.test(e.sub_id) && e.family_id === undefined && e.plan_id === undefined));
/** A plan upgrade whose outcome is not known (core/commerce.ts:1870 UpgradeEntry, kept under its own key, so
 *  an upgrade is never sent with only a memory record). */
const moneyUpgrade = (text: string): boolean => listOf(text, 256, (e) => isObj(e) && only(e, ['kind', 'user_id', 'key', 'max_charge_cents', 'at', 'sub_id', 'plan_id', 'title', 'phase'])
  && e.kind === 'upgrade' && str(e.user_id, 128) && str(e.key, 128) && count(e.max_charge_cents) && num(e.at)
  && typeof e.sub_id === 'string' && SHORT_ID.test(e.sub_id) && str(e.plan_id, 64) && label(e.title) && opt(e.phase, sendPhase));
/** A server reservation whose outcome is not known (core/commerce.ts MarketPending). */
const marketPending = (text: string): boolean => listOf(text, 256, (e) => isObj(e) && only(e, ['user_id', 'offer_id', 'days', 'ceiling', 'key', 'at', 'name', 'retry_until', 'abandoned_at', 'flights', 'sent_at', 'sends'])
  && str(e.user_id, 128) && typeof e.offer_id === 'string' && SHORT_ID.test(e.offer_id) && typeof e.days === 'string' && DAYS.test(e.days) && count(e.ceiling)
  && typeof e.key === 'string' && KEY_ID.test(e.key) && num(e.at) && label(e.name) && opt(e.retry_until, num) && opt(e.abandoned_at, num) && opt(e.sent_at, num)
  && opt(e.flights, (f) => Array.isArray(f) && f.length <= 16 && f.every((x) => isObj(x) && only(x, ['id', 'at']) && typeof x.id === 'string' && FLIGHT.test(x.id) && num(x.at)))
  && opt(e.sends, (l) => Array.isArray(l) && l.length <= 16 && l.every((x) => typeof x === 'string' && FLIGHT.test(x))));
/** A server rental whose outcome is not known (core/commerce.ts StoredRent). */
const rentPending = (text: string): boolean => listOf(text, 1024, (e) => isObj(e) && only(e, ['user_id', 'server_id', 'name', 'days', 'at', 'dismissed', 'sending', 'attempt'])
  && str(e.user_id, 128) && typeof e.server_id === 'string' && SHORT_ID.test(e.server_id) && typeof e.days === 'string' && DAYS.test(e.days) && num(e.at)
  && typeof e.dismissed === 'boolean' && typeof e.sending === 'boolean' && typeof e.attempt === 'string' && KEY_ID.test(e.attempt) && (e.name === null || (typeof e.name === 'string' && e.name.length <= 200)));
/** A top-up whose outcome is not known (core/commerce.ts StoredTopUp: owner, key, method, amount, time). The method is a
 *  short word: commerce reads 'crypto' as crypto and any other as the card method, so an earlier record is kept. */
const topUpPending = (text: string): boolean => listOf(text, 256, (e) => isObj(e) && only(e, ['user_id', 'key', 'method', 'amount', 'at', 'sending', 'sending_at'])
  && str(e.user_id, 128) && typeof e.key === 'string' && KEY_ID.test(e.key) && str(e.method, 32) && typeof e.amount === 'string' && /^[0-9]{1,9}\.[0-9]{2}$/.test(e.amount) && num(e.at)
  && (e.sending === undefined ? e.sending_at === undefined : typeof e.sending === 'string' && KEY_ID.test(e.sending) && num(e.sending_at)));

/** hub_boot_token_ttl_days: the agent sign-in days as the Account page writes them (pages/account/logic.ts parseDays:
 *  a whole number from 1 to 365, no leading zero); the boot-token producer reads it (term/app/boot-producer.ts). */
const agentDays = (t: string): boolean => /^[1-9][0-9]{0,2}$/.test(t) && Number(t) <= 365;

/** Every key the terminal keeps. Through this seam a key not listed here stays in memory. */
export const PERSISTED: readonly PersistRule[] = Object.freeze([
  { key: 'hub.v3.changes', group: 'recovery', check: changes },
  { key: 'hub.v3.script-asks', group: 'recovery', check: scriptAsks, strict: true },
  { key: 'hub_voice_pending_v1', group: 'recovery', check: voicePending, strict: true },
  { key: 'hub_ai_req_v1', group: 'recovery', check: aiRequests, strict: true, ownScan: true },
  { key: 'hub_ai_lease_v1', group: 'recovery', check: aiLeases, strict: true, ownScan: true },
  { key: 'hub_ai_journal_v1', group: 'recovery', check: aiRecords, strict: true, ownScan: true },
  { key: 'hub_money_pending', group: 'recovery', check: moneyPending },
  { key: 'hub_money_upgrade', group: 'recovery', check: moneyUpgrade },
  { key: 'hub_market_pending', group: 'recovery', check: marketPending },
  { key: 'hub.v3.topup_pending', group: 'recovery', check: topUpPending },
  { key: 'hub.v3.rent_pending', group: 'recovery', check: rentPending },
  { key: 'hub_realm_colors', group: 'preference', check: realmColors },
  { key: 'hub.v3.shell', group: 'preference', check: shellPrefs },
  { key: 'hub_theme_v1', group: 'preference', check: (t) => t === 'light' || t === 'dark' },
  { key: 'hub_hl_v1', group: 'preference', check: (t) => /^[a-z][a-z0-9-]{0,23}$/.test(t) },
  { key: 'hub_boot_token_ttl_days', group: 'preference', check: agentDays },
]);
const RULES = new Map(PERSISTED.map((r) => [r.key, r]));
export const persistRule = (key: string): PersistRule | null => RULES.get(key) ?? null;

/** What core's holds read as "this write is not durable" (the change is then refused unsent). */
export class NotDurable extends Error {
  readonly code = 'NOT_DURABLE';
  constructor(readonly why: 'shape' | 'read-only' | 'failed' | 'unchecked') { super('NOT_DURABLE'); this.name = 'NotDurable'; }
}

/**
 * The mount's local store over the host's area: a kept key reads and writes the files, every other key the memory
 * store. Synchronous, like the web's localStorage: a recovery write has reached the disk when setItem returns.
 */
export function persistentStore(memory: KeyValueStore, area: PersistArea): KeyValueStore {
  // A preference that could not be kept (shape, a read-only or failed store) lives here until the mount ends.
  const unkept = new Map<string, string | null>();
  const kept = (r: PersistRule): string | null => (r.group === 'recovery' ? area.journalGet(r.key) : unkept.has(r.key) ? unkept.get(r.key)! : area.get(r.key));
  const names = (): string[] => {
    const out = new Set<string>();
    for (let i = 0; i < memory.length; i++) { const k = memory.key(i); if (k !== null && !RULES.has(k)) out.add(k); }
    for (const r of PERSISTED) if (kept(r) !== null) out.add(r.key);
    return [...out];
  };
  const refusal = (): NotDurable['why'] | null => (area.readOnly ? 'read-only' : area.failed() ? 'failed' : null);
  return {
    getItem(k) {
      const r = RULES.get(String(k));
      if (!r) return memory.getItem(k);
      const v = kept(r);
      // What is on disk is checked on the way out too: a value this build would not have written is not handed to core.
      if (v === null || !r.check || r.check(v) || unkept.has(r.key)) return v;
      if (r.strict) throw new NotDurable('shape');
      return null;
    },
    setItem(k, v) {
      const key = String(k), value = String(v);
      const r = RULES.get(key);
      if (!r) { memory.setItem(key, value); return; }
      const why: NotDurable['why'] | null = r.check === null ? 'unchecked' : !r.check(value) || (!r.ownScan && SECRET_SHAPED.test(value)) ? 'shape' : refusal();
      if (r.group === 'recovery') {
        if (why) throw new NotDurable(why);
        try { area.journalSet(key, value); } catch { throw new NotDurable('failed'); }
        return;
      }
      if (!why) { try { area.set(key, value); unkept.delete(key); return; } catch { /* kept in memory below */ } }
      unkept.set(key, value);
    },
    removeItem(k) {
      const key = String(k);
      const r = RULES.get(key);
      if (!r) { memory.removeItem(key); return; }
      if (r.group === 'recovery') {
        if (area.journalGet(key) === null) return;
        const why = refusal();
        if (why) throw new NotDurable(why);
        try { area.journalDel(key); } catch { throw new NotDurable('failed'); }
        return;
      }
      if (!refusal()) { try { area.del(key); unkept.delete(key); return; } catch { /* hidden for this mount below */ } }
      unkept.set(key, null);
    },
    // Remove all local data (core/local-wipe.ts) asks this first: a removal the store cannot make would only hide a
    // preference for the mount (removeItem above), and the wipe's read-back would take it for gone. 'failed' first: a
    // mount with no usable store reads as read-only AND failed (live-wire.ts seamArea), and no other Hub is to blame.
    cannotDelete: () => (area.failed() ? 'failed' : area.readOnly ? 'busy' : null),
    // Every key, from the disk too. A store that cannot delete removes nothing and throws; a delete that fails throws
    // once the others were tried, and its key still reads back. Never hidden for the mount only.
    clear() {
      const why = refusal();
      if (why) throw new NotDurable(why);
      let failed = false;
      for (const r of PERSISTED) {
        try {
          if (r.group === 'recovery') { if (area.journalGet(r.key) !== null) area.journalDel(r.key); continue; }
          unkept.delete(r.key);
          if (area.get(r.key) !== null) area.del(r.key);
        } catch { failed = true; }
      }
      for (let i = memory.length - 1; i >= 0; i--) { const k = memory.key(i); if (k !== null) memory.removeItem(k); }
      if (failed) throw new NotDurable('failed');
    },
    key: (i) => names()[i] ?? null,
    get length() { return names().length; },
  };
}

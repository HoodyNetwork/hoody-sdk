// logic.ts: the Ask flow's rules without DOM, network or React: explicit account, computer and realm bindings
// through seen state. The engine (engine.ts) draws from this and owns every request; this file
// only decides. logic.test.ts pins each rule.
//
//   readiness(version, status, account)  whether the selected computer's agent may take a task: the session
//       contract it needs (turn_idempotency, session_state, gate_envelope available), then the login. A
//       connected agent must report the captured Hub account, an owner fingerprint and a known restriction;
//       connected:true alone proves nothing, and another account is never replaced. A logged-out agent
//       (auth_active false) or a rejected login of this same account is 'login'.
//   realmAuth(status, realm, probe)  whether a signed-in agent can act in a 24-hex session realm. probe is
//       GET /computers?realm= (it resolves the realm's token, read-only); the status read after it reports
//       realm_isolation_by_realm. 'renew' is a same-account sign-in.
//   realmFor(input)  the session realm. 'all' becomes the pin, Global (unpinned, unrestricted) or the one realm
//       the login and the computer share. Several shared realms are offered, never picked; 'all' is never a
//       session realm, and nothing here switches the agent's realm.
//   prompt(recipe, opts) / checkText(text)  the exact message sent. Recipes are fixed English with one
//       `Reply in <language>.` line; a custom message is sent unchanged.
//   createBody / checkStarted / turnBody / confirmBody / answerBody / cancelBody  the exact request bodies, and
//       the binding a created session must report before anything is sent to it.
//   reduce(state, action)  folds stream frames, replay, /state snapshots, receipts and decision answers into
//       one view. Frames are deduplicated by (incarnation, seq) and filtered by the envelope turn_id; nothing
//       before the turn id is known is applied, only buffered. Gates are addressed by the envelope's string
//       gate id, never the payload's daemon number.
//   resultLink(text, expect, guard)  the only promotable result: the final response's last nonempty line,
//       exactly https://<the captured computer's exec-1 host><recipe path>.
//   store helpers  hub_ask_v1, bounded per account, holding operation references only: no prompt, reply,
//       token, gate detail or result URL.
import type { SignInResult } from '@core';
import { addEdit, editOf, settleEdit, withoutContent, type Edit } from './edits';
import * as A from './attach';
import { clean, scrubSecrets } from './code';

export type Rec = Record<string, unknown>;

const REALM = /^[0-9a-f]{24}$/;
// Session, turn and gate ids are opaque path segments: never anything that could leave the path.
const SEG = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KEY = /^hx-[0-9a-f]{32}$/;
const REQ = /^hx-[0-9a-f]{24}$/;
const NONCE = /^[a-z0-9]{10}$/;
const INC = /^[A-Za-z0-9._:-]{1,128}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
export const MAX_TEXT = 4000;
export const MAX_REASON = 500;
const MAX_REPLY = 200000;
const MAX_STEPS = 200;
const MAX_BUFFER = 512;
// computer_binding (with session_protocol_version >= 3) says the gateway reads the renamed `computer` member of a create. A gateway
// without it ignores the member and runs the session on its own computer, so a create is never sent to one.
export const MIN_SESSION_PROTOCOL = 3;
export const REQUIRED_CAPS: readonly string[] = ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'];
export const STORE_KEY = 'hub_ask_v1';
/** After this many failed reconnects the flow polls receipt, state and replay instead. */
export const POLL_AFTER = 3;

export function isObj(v: unknown): v is Rec {
  return !!v && typeof v === 'object';
}
export function own(o: unknown, k: string): boolean {
  return isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function is(re: RegExp, v: unknown): v is string {
  return typeof v === 'string' && re.test(v);
}
export function seg(v: unknown): v is string {
  return typeof v === 'string' && SEG.test(v);
}
export function safeInt(v: unknown): v is number {
  return typeof v === 'number' && Math.floor(v) === v && v >= 0 && v <= 9007199254740991;
}
function hex(bytes: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += ((bytes[i] ?? 0) < 16 ? '0' : '') + ((bytes[i] ?? 0) & 255).toString(16);
  return s;
}

// ── identifiers ─────────────────────────────────────────────────────────────
// The caller supplies the random bytes (crypto.getRandomValues), so this file stays pure. Each operation gets
// its own key: k1 for the create, k2 for the turn, never derived from each other.
export function newKey(bytes: ArrayLike<number> | null | undefined): string | null {
  return bytes && bytes.length === 16 ? 'hx-' + hex(bytes) : null;
}
export function newRequestId(bytes: ArrayLike<number> | null | undefined): string | null {
  return bytes && bytes.length === 12 ? 'hx-' + hex(bytes) : null;
}
// Ten [a-z0-9] characters: the recipe's own path, so it never lands on an existing route.
const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newNonce(bytes: ArrayLike<number> | null | undefined): string | null {
  if (!bytes || bytes.length !== 10) return null;
  let s = '';
  for (let i = 0; i < 10; i++) s += ALNUM.charAt(((bytes[i] ?? 0) & 255) % 36);
  return s;
}

// ── recipes and the prompt ──────────────────────────────────────────────────
// The language line is the only locale-derived text in a recipe, from this allowlist.
export const LANGS: Readonly<Record<string, string>> = {
  en: 'English', ar: 'Arabic', br: 'Brazilian Portuguese', bs: 'Bosnian', da: 'Danish', de: 'German',
  es: 'Spanish', fr: 'French', ja: 'Japanese', ko: 'Korean', no: 'Norwegian', pl: 'Polish',
  ru: 'Russian', th: 'Thai', zh: 'Simplified Chinese', zht: 'Traditional Chinese',
};
export function language(lang: unknown): string {
  return typeof lang === 'string' && own(LANGS, lang) ? (LANGS[lang] as string) : 'English';
}

export type RecipeId = 'dashboard' | 'hello';
export interface Recipe { readonly id: RecipeId; readonly file: string; readonly ack: boolean; readonly name: string }
// The default recipe publishes a snapshot of the user's real computers (display name, state,
// size, server region) as Exec static HTML; Review requires the acknowledgement (ack) because anyone with the
// link can read it. The greeting endpoint is the second recipe.
export const RECIPES: Readonly<Record<RecipeId, Recipe>> = {
  dashboard: { id: 'dashboard', file: 'dashboard', ack: true, name: 'Hub: My computers' },
  hello: { id: 'hello', file: 'hello', ack: false, name: 'Hub: Greeting endpoint' },
};
function recipe(id: unknown): Recipe | null {
  return typeof id === 'string' && own(RECIPES, id) ? RECIPES[id as RecipeId] : null;
}
export function recipePath(id: unknown, nonce: unknown): string | null {
  const r = recipe(id);
  return r && is(NONCE, nonce) ? '/api/hoody-start-' + nonce + '/' + r.file : null;
}
function publishLines(r: Recipe, nonce: string): string[] {
  const f = r.file;
  return [
    'Publish it with Hoody Exec instance 1 on this computer as a new script at',
    'api/hoody-start-' + nonce + '/' + f + '.js, answering at',
    '/api/hoody-start-' + nonce + '/' + f + '. Use the default serverless mode.',
    // Exec's return contract (hoody-exec's response types: it serves a returned object as
    // JSON and a string that starts as HTML as text/html).
    'The script must return the finished page as one string that starts with',
    '<!DOCTYPE html>; Exec serves that as text/html. Do not return an object such as',
    '{status, headers, body}: Exec sends any returned object as JSON.',
    'Do not replace existing files or services, and do not change link permissions.',
  ];
}
const CLOSE = [
  'Check that the link answers with Content-Type text/html and shows the page itself, not JSON.',
  'If you cannot finish, explain what remains.',
  'End your final reply with the full HTTPS link on its own line.',
];
/** The exact text a recipe sends, or null. */
export function prompt(id: unknown, o: { nonce?: unknown; lang?: unknown; realm?: unknown } = {}): string | null {
  const r = recipe(id);
  if (!r || !is(NONCE, o.nonce)) return null;
  if (o.realm !== 'global' && !is(REALM, o.realm)) return null;
  let lines: string[];
  if (r.id === 'dashboard') {
    lines = [
      // No realm id in any prompt (the page must not carry one): the session is already bound to it.
      'Build a one-page HTML dashboard of my Hoody computers ' + (o.realm === 'global' ? 'in my account.' : "in this session's realm."),
      'Title it "My computers".',
      '',
      'Read my computer list once, now. Embed only these four fields per computer: its',
      'display name, its current state, its size and its server region. No other field',
      "goes into the script's data or the page: no server or host names, computer, project",
      'or realm IDs, addresses, links to my computers or their programs, tokens, keys,',
      'passwords or email addresses. Show the time of this snapshot.',
      '',
      'The page must be static HTML: it must not call the Hoody API, read credentials or',
      'load anything from the network when it is opened.',
      '',
    ].concat(publishLines(r, o.nonce));
  } else {
    lines = [
      'Make a small greeting endpoint on this computer.',
      'It answers with a short HTML page that says "Hello from Hoody" and shows the',
      'time the request was answered.',
      'Do not include tokens, keys, passwords, account details, server or host names,',
      'computer, project or realm IDs, addresses or links to my computers in the page.',
      '',
    ].concat(publishLines(r, o.nonce));
  }
  return lines.concat([''], CLOSE, ['Reply in ' + language(o.lang) + '.']).join('\n');
}

// A custom message is sent byte for byte as typed. The bound counts code points, the same unit the composer's
// counter shows.
export function textLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0xd800 || c > 0xdbff) n++;
  }
  return n;
}
export function checkText(s: unknown): 'EMPTY' | 'TOO_LONG' | null {
  if (typeof s !== 'string' || !/\S/.test(s)) return 'EMPTY';
  if (textLength(s) > MAX_TEXT) return 'TOO_LONG';
  return null;
}

// ── readiness ──────────────────────────────────────────────────────────────
export type Readiness =
  | { state: 'unsupported' }
  | { state: 'identity' }
  | { state: 'otherAccount' }
  | { state: 'login'; renew: boolean; pinned: string | null }
  | { state: 'ready'; owner: string; restricted: boolean; loginRealms: string[] | null; pinned: string | null };

/** /version lists the capability as supported and available. */
export function capOn(version: unknown, name: string): boolean {
  const caps = isObj(version) && Array.isArray(version.capabilities) ? (version.capabilities as unknown[]) : [];
  for (const c of caps) if (isObj(c) && c.name === name && c.supported === true && c.available === true) return true;
  return false;
}
/** /version reports session protocol 3 or later (the first that reads `computer`). */
export function protocolOk(version: unknown): boolean {
  const v = isObj(version) ? version.session_protocol_version : undefined;
  return typeof v === 'number' && Number.isInteger(v) && v >= MIN_SESSION_PROTOCOL;
}
/** The gateway binds a session to the computer a create names: session protocol 3 or later AND `computer_binding` supported and
 *  available. Below that it ignores the `computer` member and runs the session on its own computer (ask/data.ts gatedCreate). */
export function bindsComputer(version: unknown): boolean {
  return protocolOk(version) && capOn(version, 'computer_binding');
}
/** Every capability a task needs, including the computer binding at session protocol 3 or later. */
export function capsOk(version: unknown): boolean {
  return bindsComputer(version) && REQUIRED_CAPS.every((c) => capOn(version, c));
}
function pinOf(version: unknown, status: unknown): string | null {
  const p = isObj(version) ? version.pinned_realm : undefined;
  if (typeof p === 'string' && (REALM.test(p) || p === 'global')) return p;
  const r = isObj(status) ? status.realm : undefined;
  if (isObj(r) && r.pinned === true && typeof r.id === 'string' && (REALM.test(r.id) || r.id === 'global')) return r.id;
  return null;
}
export function readiness(version: unknown, status: unknown, account: unknown): Readiness {
  if (!capsOk(version)) return { state: 'unsupported' };
  if (!isObj(status) || typeof account !== 'string' || !account) return { state: 'identity' };
  const acct = status.account_id == null ? '' : String(status.account_id);
  const rejected = isObj(status.last_error) && status.last_error.credential_rejected === true;
  // Another account first: a signed-out agent that still names another account is refused here, not offered
  // a sign-in the agent would refuse (agent_login_conflict).
  if (acct && acct !== account) return { state: 'otherAccount' };
  if (status.auth_active !== true) return { state: 'login', renew: false, pinned: pinOf(version, status) };
  if (rejected) return acct === account ? { state: 'login', renew: true, pinned: pinOf(version, status) } : { state: 'identity' };
  if (!acct || status.identity_unavailable === true || typeof status.owner_fingerprint !== 'string' || !status.owner_fingerprint) return { state: 'identity' };
  if (status.restriction !== 'none' && status.restriction !== 'realms') return { state: 'identity' };
  const restricted = status.restriction === 'realms';
  const ids = Array.isArray(status.realm_ids) ? (status.realm_ids as unknown[]).filter((r): r is string => is(REALM, r)) : [];
  if (restricted && !ids.length) return { state: 'identity' };
  return { state: 'ready', owner: status.owner_fingerprint, restricted, loginRealms: restricted ? ids : null, pinned: pinOf(version, status) };
}

/** A read's settle result: {ok, b} or {ok:false, e}. */
export interface Settled<T = unknown> { ok: boolean; b?: T; e?: unknown }

// probeFault(probe) → true when the realm read failed without deciding anything about the realm token: no
// answer, superseded, network 0, anything outside 4xx (a 302 or 304 included), 404/405, 429, or 403 forbidden
// (the Source IP Guard). Its own error decides (readView), before any status field: a signed-out reread must
// not turn such a failure into a sign-in.
export function probeFault(probe: unknown): boolean {
  if (!isObj(probe)) return true;
  if (probe.ok) return false;
  const e = probe.e;
  if (!isObj(e) || e.stale || e.superseded || e.pending) return true;
  const st = e.status;
  if (typeof st !== 'number' || st < 400 || st >= 500 || st === 429 || st === 404 || st === 405) return true;
  return st === 403 && e.code === 'forbidden';
}

// realmAuth(status, realm, probe) → 'ok' | 'renew' | 'update' | 'read'. 'read' means the probe's own error
// decides (readView). Global needs no realm token. A refused realm token (a 4xx on the probe that is not a
// probeFault, or the realm reported unavailable) is 'renew', except the reason a new login cannot fix: the
// agent's own components disagree (sidecar_permissions_mismatch), 'update'.
export function realmAuth(status: unknown, realm: unknown, probe: unknown): 'ok' | 'renew' | 'update' | 'read' {
  if (!is(REALM, realm)) return 'ok';
  const by = isObj(status) ? status.realm_isolation_by_realm : undefined;
  const row = own(by, realm) ? (by as Rec)[realm] : null;
  const down = isObj(row) && row.state === 'unavailable';
  if (down && (row as Rec).reason === 'sidecar_permissions_mismatch') return 'update';
  if (!isObj(probe)) return 'read';
  if (probe.ok) return down ? 'renew' : 'ok';
  return probeFault(probe) ? 'read' : 'renew';
}

// ── realm rule ─────────────────────────────────────────────────────────────
export interface RealmInput {
  selected?: unknown;
  pinned?: string | null;
  restricted?: boolean;
  loginRealms?: readonly string[] | null;
  /** The computer row's realm_ids; null = not known. */
  computerRealms?: readonly string[] | null;
  picked?: string | null;
}
export type RealmPick =
  | { realm: string; shown?: true }
  | { choices: string[] }
  | { error: 'PINNED'; pinned: string }
  | { error: 'NOT_ALLOWED' | 'NOT_MEMBER' | 'NONE' | 'UNKNOWN' };
function allowedBy(i: RealmInput, r: string): boolean {
  if (r === 'global') return !i.restricted;
  if (i.restricted && (!Array.isArray(i.loginRealms) || !i.loginRealms.includes(r))) return false;
  return true;
}
function memberOf(i: RealmInput, r: string): boolean | null {
  if (r === 'global') return true;
  return Array.isArray(i.computerRealms) ? i.computerRealms.includes(r) : null;
}
export function realmFor(input: RealmInput | null | undefined): RealmPick {
  const i = input || {};
  const sel = i.selected, pin = i.pinned || null;
  if (pin !== null && pin !== 'global' && !REALM.test(pin)) return { error: 'UNKNOWN' };
  // A named realm, or Global named explicitly (a chat bound to Global): the same pin, login and membership rules.
  if (sel === 'global' || is(REALM, sel)) {
    if (pin && pin !== sel) return { error: 'PINNED', pinned: pin };
    if (!allowedBy(i, sel)) return { error: 'NOT_ALLOWED' };
    const m = memberOf(i, sel);
    if (m === null) return { error: 'UNKNOWN' };
    return m ? { realm: sel } : { error: 'NOT_MEMBER' };
  }
  if (sel !== 'all') return { error: 'UNKNOWN' };
  if (pin) {
    if (!allowedBy(i, pin)) return { error: 'NOT_ALLOWED' };
    const pm = memberOf(i, pin);
    if (pm === null) return { error: 'UNKNOWN' };
    return pm ? { realm: pin, shown: true } : { error: 'NOT_MEMBER' };
  }
  if (!i.restricted) return { realm: 'global', shown: true };
  if (!Array.isArray(i.computerRealms) || !Array.isArray(i.loginRealms)) return { error: 'UNKNOWN' };
  const cr = i.computerRealms;
  const both = i.loginRealms.filter((r) => REALM.test(r) && cr.includes(r));
  if (!both.length) return { error: 'NONE' };
  if (both.length === 1) return { realm: both[0] as string, shown: true };
  if (i.picked != null) return both.includes(i.picked) ? { realm: i.picked, shown: true } : { error: 'UNKNOWN' };
  return { choices: both };
}

// ── request bodies ─────────────────────────────────────────────────────────
export interface CreateBody {
  realm: string;
  computer: string;
  /** The chat's agent (New chat); absent: the agent's own default agent. */
  agent?: string;
  tool_mode: 'standard';
  dir_scope: 'home';
  /** Claude Code runs the chat: backend 'acp' with delegated_agent 'claude'. */
  backend?: 'acp';
  delegated_agent?: 'claude';
  /** Claude Code's model; absent: Claude Code's own default. */
  delegated_model?: string;
  /** provider/model; absent (Ask) leaves the agent's own default and the body's bytes unchanged. */
  model?: string;
  /** An absolute folder on the computer; absent: the home folder. Also asserted in expected_binding. */
  cwd?: string;
  approval: { mode: 'default' | 'always' };
  /** Helper approvals park for a person: every Hub chat, never saved, resent on reopen. */
  helper_gates?: true;
  expected_binding: { realm: string; computer: string; cwd?: string };
}
/** What a chat is created with beyond its place. The Hub never sends follow_realm_backend: the backend
 *  is always explicit (engine.ts dockOpts reads the realm default first). No options: the body of today's callers, byte for byte (ask/io.test.ts:34). */
export interface CreateOpts {
  agent?: string;
  /** Hoody models: provider/model. */
  model?: string;
  /** Claude Code runs the chat: its model, or '' for Claude Code's own default. */
  claude?: { model: string };
  cwd?: string;
  /** Strict approvals: approval {mode: 'always'}. */
  strict?: boolean;
  helperGates?: boolean;
}
/** The body of a fork: a create that branches from a live session (fork.ts builds it). It carries none of agent, tool_mode, dir_scope
 *  or approval: a fork inherits them, and the agent refuses an agent beside a fork. */
export interface ForkBody {
  realm: string;
  computer: string;
  expected_binding: { realm: string; computer: string };
  fork: string;
  /** 0-based turn to copy through (explicit 0 is the first turn); absent: through the parent's last turn. */
  fork_turn_idx?: number;
}
/** A model id as the agent names it: provider/model. */
const MODEL = /^[a-z0-9][a-z0-9._-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._:\/-]{0,127}$/;
/** An agent name as the agent's definitions name it. */
const AGENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** An absolute folder: starts with '/', no NUL, no `..` segment, bounded. */
function absFolder(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 4096 && v.startsWith('/') && !v.includes('\u0000') && !v.split('/').includes('..');
}
export function createBody(realm: unknown, container: unknown, opts?: CreateOpts): CreateBody | null {
  if ((realm !== 'global' && !is(REALM, realm)) || !seg(container)) return null;
  const o = opts ?? {};
  if (o.model !== undefined && !is(MODEL, o.model)) return null;
  if (o.agent !== undefined && !is(AGENT, o.agent)) return null;
  if (o.claude !== undefined && (o.model !== undefined || typeof o.claude.model !== 'string' || (o.claude.model !== '' && !is(MODEL, o.claude.model)))) return null;
  if (o.cwd !== undefined && !absFolder(o.cwd)) return null;
  // Key order is the wire order; with no options it is exactly today's body (ask/io.test.ts:34).
  const b: CreateBody = { realm: realm as string, computer: container } as CreateBody;
  if (o.agent !== undefined) b.agent = o.agent;
  b.tool_mode = 'standard';
  b.dir_scope = 'home';
  if (o.claude !== undefined) {
    b.backend = 'acp';
    b.delegated_agent = 'claude';
    if (o.claude.model !== '') b.delegated_model = o.claude.model;
  }
  if (o.cwd !== undefined) b.cwd = o.cwd;
  b.approval = { mode: o.strict === true ? 'always' : 'default' };
  if (o.helperGates === true) b.helper_gates = true;
  b.expected_binding = o.cwd !== undefined ? { realm: realm as string, computer: container, cwd: o.cwd } : { realm: realm as string, computer: container };
  if (o.model !== undefined) b.model = o.model;
  return b;
}
// The created session must report the captured binding before a turn is sent to it. The agent spells its own
// computer as '' (its self-binding, computer_id omitted), so an absent or '' computer_id or the captured id both mean
// "this computer"; Global is 'global' only. owner is readiness().owner.
//   'MISSING'  the reply does not carry the evidence (no `started`, a realm_selector that is not a non-empty string, a
//              computer_id that is present and not a string, a retired container_id of any kind, an owner_fingerprint that is not a string): nothing is
//              proven either way, so the create stays unknown (C9).
//   'MISMATCH' well-formed evidence that names another binding.
function sameRealm(want: string, got: string): boolean {
  const g = got.trim().toLowerCase();
  return g === want.toLowerCase() || (want === 'global' && g === 'global');
}
export function checkStarted(res: unknown, want: { realm: string; container: string; owner: string }): 'MISSING' | 'MISMATCH' | null {
  const s = isObj(res) ? res.started : undefined;
  if (!isObj(res) || !seg(res.session_id) || !isObj(s)) return 'MISSING';
  if (typeof s.realm_selector !== 'string' || s.realm_selector.trim() === '') return 'MISSING';
  if (own(s, 'computer_id') && typeof s.computer_id !== 'string') return 'MISSING';
  // The retired spelling is never evidence: a reply carrying `container_id` (alone or beside `computer_id`) came from a gateway that
  // does not bind by the renamed member, and reading it as "this computer" would accept another computer's session.
  if (own(s, 'container_id')) return 'MISSING';
  if (typeof s.owner_fingerprint !== 'string') return 'MISSING';
  if (!sameRealm(want.realm, s.realm_selector)) return 'MISMATCH';
  const c = own(s, 'computer_id') ? (s.computer_id as string) : '';
  if (c !== '' && c !== want.container) return 'MISMATCH';
  if (s.owner_fingerprint !== want.owner) return 'MISMATCH';
  return null;
}
/** The turn body: the typed text (checked against MAX_TEXT), then any text files as fenced blocks, and any images
 *  as attachments (attach.ts holds their limits, checked when they were added). */
export function turnBody(text: unknown, files?: readonly A.TextFile[], imgs?: readonly A.Img[]): { text: string; attachments?: A.WireImage[] } | null {
  if (typeof text !== 'string' || checkText(text)) return null;
  const full = A.messageText(text, files);
  return imgs && imgs.length ? { text: full, attachments: A.wire(imgs) } : { text: full };
}
export function cancelBody(turnId: unknown): { turn_id: string } | null {
  return seg(turnId) ? { turn_id: turnId } : null;
}

export interface Question { id: string; category: string; question: string; options: string[] }
export interface Gate {
  kind: 'confirm' | 'question';
  invalid?: true;
  id: string;
  generation: number;
  cause: string;
  risk: string;
  leaseRequired: boolean;
  /** The daemon's number, kept to match event.gate_resolved and never sent. */
  dnum: number | null;
  blocked?: 'policy';
  // confirm
  tool?: string;
  params?: Rec | null;
  detail?: string;
  dirs?: string[];
  offerSession?: boolean;
  dirAccess?: boolean;
  // question
  question?: string;
  options?: string[];
  placeholder?: string;
  questions?: Question[];
}
export type Choice = 'once' | 'session' | 'deny';
export interface ConfirmBody {
  gate_id: string;
  generation: number;
  approved: boolean;
  remember: false;
  request_id: string;
  session_scope?: true;
  reason?: string;
  /** The approver lease's generation, when this page holds the lease: the agent's own check. */
  lease_generation?: number;
}
// choice: 'once' | 'session' | 'deny'. Every decision is one-shot (remember:false); 'session' adds
// session_scope only when the gate offered it. persist_dirs and trust_computer are never sent.
export function confirmBody(gate: Partial<Gate> | null | undefined, choice: unknown, requestId: unknown, reason?: unknown): ConfirmBody | null {
  if (!gate || gate.kind !== 'confirm' || !seg(gate.id) || !safeInt(gate.generation) || !is(REQ, requestId)) return null;
  if (choice !== 'once' && choice !== 'session' && choice !== 'deny') return null;
  if (choice === 'session' && gate.offerSession !== true) return null;
  const b: ConfirmBody = { gate_id: gate.id, generation: gate.generation, approved: choice !== 'deny', remember: false, request_id: requestId };
  if (choice === 'session') b.session_scope = true;
  if (choice === 'deny' && typeof reason === 'string' && /\S/.test(reason)) {
    if (textLength(reason) > MAX_REASON) return null;
    b.reason = reason;
  }
  return b;
}
export interface AnswerBody { gate_id: string; generation: number; answer?: string; answers?: Record<string, string> }
// answer: a string for a single question, or {questionId: answer} for a batch (every question).
export function answerBody(gate: Partial<Gate> | null | undefined, answer: unknown): AnswerBody | null {
  if (!gate || gate.kind !== 'question' || !seg(gate.id) || !safeInt(gate.generation)) return null;
  const b: AnswerBody = { gate_id: gate.id, generation: gate.generation };
  if (gate.questions) {
    if (!isObj(answer)) return null;
    const out: Record<string, string> = {};
    for (const q of gate.questions) {
      const v = own(answer, q.id) ? answer[q.id] : null;
      if (typeof v !== 'string' || !/\S/.test(v)) return null;
      out[q.id] = v;
    }
    b.answers = out;
    return b;
  }
  if (typeof answer !== 'string' || !/\S/.test(answer)) return null;
  b.answer = answer;
  return b;
}

export interface Cursor { since: number; incarnation: string }
// A receipt's stream_url, accepted only as this session's own stream route with a numeric cursor and an
// incarnation token: never an arbitrary URL from a response.
export function streamCursor(url: unknown, sid: unknown): Cursor | null {
  if (typeof url !== 'string' || !seg(sid)) return null;
  const m = /^\/api\/v1\/agent\/sessions\/([^/?#]+)\/stream\?since=(\d{1,15})&incarnation=([A-Za-z0-9._:-]{1,128})$/.exec(url);
  if (!m || m[1] !== sid) return null;
  return { since: parseInt(m[2] as string, 10), incarnation: m[3] as string };
}
export function streamPath(sid: unknown, cur: Partial<Cursor> | null | undefined): string | null {
  if (!seg(sid)) return null;
  let p = '/sessions/' + sid + '/stream';
  if (cur && safeInt(cur.since) && is(INC, cur.incarnation)) p += '?since=' + cur.since + '&incarnation=' + encodeURIComponent(cur.incarnation);
  return p;
}

// ── gates ──────────────────────────────────────────────────────────────────
// gateOf(ref, kind, payload): the answerable identity is ref {id, generation} (the frame envelope's gate, or
// /state's pending_gate_ref); payload is the event's own fields, shown only as text.
function strList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (let i = 0; i < v.length && out.length < max; i++) if (typeof v[i] === 'string') out.push(v[i] as string);
  return out;
}
function invalidGate(kind: Gate['kind']): Gate {
  return { kind, invalid: true, id: '', generation: -1, cause: '', risk: '', leaseRequired: false, dnum: null };
}
export function gateOf(ref: unknown, kind: Gate['kind'], payload: unknown): Gate {
  const p: Rec = isObj(payload) ? payload : {};
  if (!isObj(ref) || !seg(ref.id) || !safeInt(ref.generation)) return invalidGate(kind);
  const g: Gate = {
    kind, id: ref.id, generation: ref.generation,
    cause: str(ref.gate_cause || p.gate_cause), risk: str(ref.risk || p.risk),
    leaseRequired: p.lease_required === true || ref.lease_required === true,
    dnum: null,
  };
  if (kind === 'confirm') {
    g.dnum = safeInt(p.gate_id) ? p.gate_id : null;
    g.tool = str(p.tool_name || ref.tool_name);
    g.params = isObj(p.params) ? p.params : null;
    g.detail = str(p.detail);
    g.dirs = strList(p.requested_dirs, 16);
    g.offerSession = p.offer_session_allow === true;
    g.dirAccess = g.cause === 'dir_access' || g.dirs.length > 0;
  } else {
    g.dnum = safeInt(p.question_id) ? p.question_id : null;
    g.question = str(p.question);
    g.options = strList(p.options, 32);
    g.placeholder = str(p.placeholder);
    if (Array.isArray(p.questions) && p.questions.length) {
      const qs: Question[] = [];
      for (let i = 0; i < p.questions.length && i < 16; i++) {
        const q = p.questions[i] as unknown;
        if (!isObj(q) || !seg(q.id)) return invalidGate(kind);
        qs.push({ id: q.id, category: str(q.category), question: str(q.question), options: strList(q.options, 32) });
      }
      g.questions = qs;
    }
  }
  // The Hub holds no approver lease: a gate that requires one is decided in the Agent.
  if (g.leaseRequired) g.blocked = 'policy';
  return g;
}

// ── the reducer ────────────────────────────────────────────────────────────
/** n: the step's number in the turn (0-based, counts past the bound); seg: the reply segment that follows it; at/end:
 *  when its call and result arrived live (ms), absent for replayed frames. A failed step keeps why (the first visible
 *  line the tool answered, controls removed, credentials masked, bounded; the column cleans and cuts it again),
 *  held (hooks that cover the tool are held: not trusted yet, or their trust cannot be checked) or unknown (it may have
 *  run: its result never came back). */
/** A picture a step saved on the computer, as its tool's result names it. */
export interface StepPic { path: string; name: string; bytes?: number }
export interface Step { id: string; name: string; summary: string; ok: boolean | null; n: number; seg: number; at?: number; end?: number; why?: string; held?: true; unknown?: true; pics?: StepPic[] }

// The image tool's result is JSON naming the files it saved: {images: [{path, width, height, bytes}], ...}. Only that tool's
// successful result is read, only as JSON of a bounded size, and only paths that are one picture file directly inside a
// folder named generated-images (where the tool saves): absolute, no '..' or control character, a plain file name with a
// picture's extension. Anything else names no picture. A path is never taken from any other text.
const PIC_TOOL = 'generate_image', PIC_JSON_MAX = 65536, PIC_MAX = 8;
const PIC_PATH = /^(?:\/[^\/\u0000-\u001f\u007f]{1,255}){1,40}\/generated-images\/([A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:png|jpe?g|gif|webp))$/;
export function picsOf(tool: string, r: Record<string, unknown>): Pick<Step, 'pics'> {
  if (tool !== PIC_TOOL || r.is_error === true || typeof r.output !== 'string' || r.output.length > PIC_JSON_MAX) return {};
  let v: unknown;
  try { v = JSON.parse(r.output); } catch { return {}; }
  if (!isObj(v) || !Array.isArray(v.images)) return {};
  const pics: StepPic[] = [];
  for (const x of v.images as unknown[]) {
    if (pics.length >= PIC_MAX) break;
    if (!isObj(x) || typeof x.path !== 'string' || x.path.length > 4096) continue;
    const m = PIC_PATH.exec(x.path);
    if (!m || x.path.split('/').some((p) => p === '..' || p === '.') || pics.some((p) => p.path === x.path)) continue;
    pics.push({ path: x.path, name: m[1] as string, ...(typeof x.bytes === 'number' && Number.isSafeInteger(x.bytes) && x.bytes > 0 ? { bytes: x.bytes } : {}) });
  }
  return pics.length ? { pics } : {};
}

const WHY_MAX = 300, WHY_LINE = 8192;
// The daemon's transcript keeps a held or unknown result's text but not always its error_code (some history blocks
// are built without it), so a reopened conversation also reads these exact daemon texts: the ended
// tool result, the unanswered tool result, the delegated held-or-unknown result,
// and the held hook's deny text (every form ends its first sentence group with the same don't-retry line).
const UNKNOWN_TEXT = /^\[no result: the (?:turn ended|agent restarted) before this tool finished; it may have run\b/;
const UNKNOWN_DELEGATED = 'The turn ended before this call reported its result. It may have run';
const HELD_TEXT = /^Blocked: [^\n]*Don't retry this tool or try another route to the same effect; tell the person\b/;
// A failed step's reason has credential-shaped parts masked (best effort; it is shown only to the person whose
// computer wrote it). The JWT mask is a linear function (maskJwt); the masks run on one line of at most WHY_LINE
// characters, so their work stays small on hostile text (a longer line is not masked or shown at all). A header's
// value is masked to the end of the line, a quoted value to its closing quote (an escaped quote does not close it; the
// end of the line when it has none), never only its first word.
const SECRET_KEY = String.raw`(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|secret|token|password|passwd|pwd|pass)`;
const FLAG = String.raw`(?:password|passwd|pass|token|secret|api-?key|auth|auth-token|access-token)`;
const KEYS = String.raw`(?:(?:proxy-)?authorization|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|secret|token|password|passwd|pwd)`;
// One shell-style argument: quoted fragments (an escaped JSON quote, \", counts as a quote) and bare characters run
// together up to whitespace ('alpha'"beta" is one argument). Each fragment starts on a different character, so a match
// never backtracks; an unclosed quote runs to the end of the line.
const ARG = String.raw`(?:\\"(?:[^\\\n]|\\[^"\n])*(?:\\")?|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|[^\s"'])+`;
type Mask = [RegExp, string | ((m: string) => string)];
// The JWT mask, as s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '•••') gives it, in
// linear time: that pattern restarts at every '-' of a long run (quadratic on 'eyJ-eyJ-…'). Called once per maximal
// run of [A-Za-z0-9_.-]; in each dot-separated part only the first 'eyJ' at a word boundary can start a match (a later
// one has a shorter first segment and the same parts after it), and a match ends with the part two dots on.
export function maskJwt(chain: string): string {
  const parts = chain.split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const r = parts[i] ?? '';
    let p = r.indexOf('eyJ');
    while (p > 0 && r[p - 1] !== '-') p = r.indexOf('eyJ', p + 1);
    if (p >= 0 && r.length - p - 3 >= 8 && (parts[i + 1] ?? '').length >= 8 && (parts[i + 2] ?? '').length >= 4) {
      out.push(r.slice(0, p) + '•••');
      i += 2;
    } else out.push(r);
  }
  return out.join('.');
}
const TOKENS: Mask[] = [
  // The password runs to its '@' however long it is: it can hold no '/', so each run is scanned from one scheme only.
  // Neither part holds '?' or '#': an '@' in a query or fragment after host:port is not a password's end.
  [/\b([a-z][a-z0-9+.-]{0,20}:\/\/)[^\s/@:'"?#]{1,200}:[^\s/@'"?#]+@/gi, '$1•••@'],
  [/\b(?:hdy_[0-9a-f_]{8,}|sk-[A-Za-z0-9_-]{16,}|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})/g, '•••'],
  [/[A-Za-z0-9_.-]+/g, maskJwt],
  [/\b[A-Za-z0-9+_-]{40,}={0,2}/g, '•••'],
  [/\b[0-9a-f]{32,}\b/gi, '•••'],
  [/\b([0-9a-f]{4})[0-9a-f]{20}\b/gi, '$1…'],
];
const TEXT_MASKS: Mask[] = [
  // Cookie as a whole key: a key that only ends in it after a hyphen ("fortune-cookie") is ordinary text. A letter
  // before it is no boundary: taking a control out can glue the key to the word before it ('note\u0000Cookie: …').
  [/(?<!-)(set-cookie|cookie)(\\?["']?\s*:\s*)[^\n]+/gi, '$1$2•••'],
  // An Authorization value is a secret whatever its scheme ('ApiKey …', 'Digest …'): masked to the end of the line.
  [/((?:proxy-)?authorization)(\\?["']?\s*:\s*)[^\n]+/gi, '$1$2•••'],
  [/\bX-Hoody-[A-Za-z0-9-]{1,60}(?:\s*:[^\n]*)?/gi, '•••'],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}/gi, '$1 •••'],
  // Quoted values take the same no-boundary rule as the unquoted mask below.
  [new RegExp(String.raw`(${SECRET_KEY}\\?["']?\s*[:=]\s*)(?=\\?["'])${ARG}`, 'gi'), '$1•••'],
  // A long flag may be glued to the word before it (a control taken out); a short one needs whitespace before it.
  [new RegExp(String.raw`((?:(?:^|\s)-|(?<!-)--)${FLAG})(?:=|\s+)${ARG}`, 'gi'), '$1 •••'],
  [/\b(session(?:id|_id)?|sid|csrftoken|connect\.sid|jsessionid|phpsessid)=[^\s;&,]{3,}/gi, '$1=•••'],
  // No word boundary before the key: taking a control out can glue it to the word before it ('note\u0000password=…' reads
  // 'notepassword=…'). A name that only ends in a key (subtoken=…) is masked too, on purpose.
  // The value runs to whitespace or a quote: '&', ',' and ';' can be part of a password, so they do not end it.
  [new RegExp(String.raw`(${KEYS})(\\?["']?\s*[:=]\s*\\?["']?)[^\s"'\\]{3,}`, 'gi'), '$1$2•••'],
  ...TOKENS,
];
export function maskSecrets(line: string): string {
  let out = line;
  for (const [re, to] of TEXT_MASKS) out = typeof to === 'string' ? out.replace(re, to) : out.replace(re, to);
  return out;
}
// Terminal escapes (OSC to its terminator, CSI) out of a bounded window before clean() bounds the text, so a long
// escape never spends the whole budget meant for the visible reason.
// An OSC is removed only when it ends on its own line; an unterminated one is left to clean(), which keeps the lines after it.
const ESCAPES = /\u001b\][^\u0007\u001b\n]*(?:\u0007|\u001b\\)|\u001b\[[0-?]*[ -/]*[@-~]/g;
const WHY_WINDOW = 65536;
/** A tool result's ok and failure facts, from a live event.tool_result or a history tool_result block. */
export function resultOf(r: Record<string, unknown>): Pick<Step, 'ok' | 'why' | 'held' | 'unknown'> {
  if (r.is_error !== true) return { ok: true };
  const out: Pick<Step, 'ok' | 'why' | 'held' | 'unknown'> = { ok: false };
  const text = typeof r.output === 'string' ? r.output : '', code = typeof r.error_code === 'string' ? r.error_code : '';
  if (code === 'hook_held' || (!code && HELD_TEXT.test(text))) out.held = true;
  else if (code === 'outcome_unknown' || (!code && (UNKNOWN_TEXT.test(text) || text.startsWith(UNKNOWN_DELEGATED)))) out.unknown = true;
  else {
    // The window ends at its last whole line (none when the first line alone is longer): a line cut at the window
    // could hold the start of a credential whose end was not read.
    let win = text.slice(0, WHY_WINDOW);
    if (text.length > WHY_WINDOW) win = win.slice(0, Math.max(0, win.lastIndexOf('\n')));
    // Escapes and controls (zero-width included) go from the whole window first, with no length cut (a control could
    // split a credential), so an escape-only line never hides the reason under it. Then the first visible line, whole:
    // no mask can start on the blank lines before it, so masking it alone hides what masking the whole text would on
    // it. Longer than WHY_LINE it is not shown (never masked or shown in part); otherwise masked, then cut. The line shown
    // is read again from the window with its keys hidden as written: taking an escape or a control out can join a key to
    // the word before it, where the mask no longer finds its start.
    const firstOf = (w: string): string => clean(w.replace(ESCAPES, ''), 0, { code: true }).text.split('\n').find((x) => x.trim() !== '') ?? '';
    const line = firstOf(win).length > WHY_LINE ? '' : maskSecrets(firstOf(scrubSecrets(win))).trim();
    if (line) out.why = line.slice(0, WHY_MAX);
  }
  return out;
}
export interface Envelope { seq: number; incarnation?: string; turn_id?: string; gate?: unknown; event: { type: string; data?: unknown } }
export interface Decision { requestId: string; gateId: string; generation: number }
export interface Terminal { state: 'completed' | 'failed' | 'cancelled' | 'interrupted'; code: string; retryAt: string | null; effects: boolean }
export interface AskState {
  turnId: string | null;
  /** A turn the session started for a command: its frames may carry no turn_id, so untagged frames are its too. */
  loose: boolean;
  inc: string | null;
  seq: number;
  buffer: Envelope[];
  segs: string[];
  replyLen: number;
  cut: boolean;
  steps: Step[];
  stepsTotal: number;
  /** The edit tools' calls of this turn, from their inputs (edits.ts): its own list, outside the steps' window. Memory only. */
  edits: Edit[];
  /** Files that ran and that the turn's `edits` pushed out past its cap (edits.ts addEdit): a count only. */
  editsLost: number;
  /** Settled calls that left `edits` (edits.ts TurnEdits): a replay of one is not a new call. */
  editsSeen: Set<string>;
  /** Calls that failed (edits.ts TurnEdits): a replay of one is not a new call. */
  editsFailed: Set<string>;
  gate: Gate | null;
  gateSrc: 'event' | 'state' | null;
  gateAt: number | null;
  decision: Decision | null;
  onceOnly: boolean;
  resolved: { outcome: string; mine: boolean } | null;
  error: { code: string; retryAt: string | null } | null;
  cost: number | null;
  /** One entry per foreground response this turn's event.stream_done frames reported (same filter as `cost`: not background, no
   *  helper), in arrival order. A frame whose four counts are not all whole non-negative numbers adds none and is counted in
   *  `responsesSkipped` instead (a count is never guessed). Frames are deduplicated by (incarnation, seq) before they get here. */
  responses: ResponseCounts[];
  responsesSkipped: number;
  done: { outcome: string; code: string } | null;
  discarded: boolean;
  terminal: Terminal | null;
  stopping: boolean;
  /** A Stop whose cancellation got no answer, and whose turn never showed it ended in the reads after it: whether the Stop took is
   *  not known (C9). Stop stays held for the turn (never sent again), the turn is no longer said to be stopping, and the chat offers
   *  Check again, a read of the turn's receipt. */
  stopUnsure?: true;
  resync: boolean;
  gap: boolean;
  /** The turn cleared the conversation (event.clear, the agent's /clear): what was shown is gone, so the history is read again
   *  when it ends. */
  cleared: boolean;
  /** The agent is compacting the conversation (event.compaction_started, until event.compacted or the next sign of the model or
   *  the turn's end): the working row says so instead of a generic line. */
  compacting: boolean;
  ended: boolean;
  // Incarnations only move forward: `epoch` counts the moves, `retired` holds the ones left behind (anything
  // that names one is dropped), `gateRev` counts every change of the gate, the decision or their outcome (a
  // reply stamped with an older one cannot speak for the gate).
  epoch: number;
  retired: string[];
  gateRev: number;
  replyDropped: boolean;
  stateLeftOut: boolean;
  // Gates (kind:number) of this incarnation known to have ended: a snapshot or replay older than that cannot
  // bring one back.
  closed: string[];
  /** A gate of the session closed after the current text: the next text starts a new paragraph. */
  gapNext: boolean;
}

/** The token counts of one model response, named as the usage rows name them. */
export interface ResponseCounts { input: number; output: number; cacheRead: number; cacheWrite: number }

export function initial(o: { turnId?: unknown; inc?: unknown; seq?: unknown; loose?: boolean } = {}): AskState {
  return {
    turnId: seg(o.turnId) ? o.turnId : null,
    loose: o.loose === true,
    inc: is(INC, o.inc) ? o.inc : null,
    seq: safeInt(o.seq) ? o.seq : 0,
    buffer: [], segs: [''], replyLen: 0, cut: false,
    steps: [], stepsTotal: 0, edits: [], editsLost: 0, editsSeen: new Set(), editsFailed: new Set(),
    gate: null, gateSrc: null, gateAt: null, decision: null, onceOnly: false, resolved: null,
    error: null, cost: null, responses: [], responsesSkipped: 0,
    done: null, discarded: false, terminal: null,
    stopping: false, resync: false, gap: false, cleared: false, compacting: false, ended: false,
    epoch: 0, retired: [], gateRev: 0, replyDropped: false, stateLeftOut: false,
    closed: [], gapNext: false,
  };
}
/** The state for the conversation's next turn on the same connection: the stream position, the incarnation history
 *  and the closed gates carry over; everything of the turn starts empty. */
export function nextTurn(prev: AskState, o: { turnId?: unknown; loose?: boolean } = {}): AskState {
  const s = initial({ turnId: o.turnId, loose: o.loose });
  s.inc = prev.inc; s.seq = prev.seq; s.epoch = prev.epoch; s.retired = prev.retired.slice(); s.closed = prev.closed.slice(); s.gateRev = prev.gateRev + 1;
  return s;
}
function copy(s: AskState): AskState {
  return { ...s, retired: s.retired.slice(), closed: s.closed.slice(), segs: s.segs.slice(), steps: s.steps.slice(), edits: s.edits.slice(), editsSeen: new Set(s.editsSeen), editsFailed: new Set(s.editsFailed), buffer: s.buffer.slice(), responses: s.responses.slice() };
}

function appendText(s: AskState, text: unknown): void {
  if (typeof text !== 'string' || !text) return;
  let t = text;
  const room = MAX_REPLY - s.replyLen;
  if (room <= 0) { s.cut = true; return; }
  if (s.gapNext) {
    // The text before the gate and the text after it are two paragraphs, as the agent wrote them around the wait.
    s.gapNext = false;
    const cur = s.segs[s.segs.length - 1] as string;
    if (cur && !/\n\s*\n\s*$/.test(cur) && !/^\s*\n/.test(t)) t = '\n\n' + t;
  }
  if (t.length > room) { t = t.slice(0, room); s.cut = true; }
  s.segs[s.segs.length - 1] += t;
  s.replyLen += t.length;
}

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
/** The four counts of one event.stream_done (the daemon's cache_creation_tokens is the usage rows' cache_write_tokens), or null
 *  when any is missing or not a whole non-negative number. */
function responseCounts(d: Rec): ResponseCounts | null {
  const { input_tokens: input, output_tokens: output, cache_read_tokens: cacheRead, cache_creation_tokens: cacheWrite } = d;
  return whole(input) && whole(output) && whole(cacheRead) && whole(cacheWrite) ? { input, output, cacheRead, cacheWrite } : null;
}

function onEvent(s: AskState, env: Envelope, now?: number): void {
  const ev = env.event, d: Rec = isObj(ev.data) ? ev.data : {};
  switch (ev.type) {
    case 'event.stream_chunk':
      if (!d.helper_id) { appendText(s, d.text); s.compacting = false; }
      return;
    case 'event.thinking_chunk':
      if (!d.helper_id) s.compacting = false;
      return;
    case 'event.compaction_started':
      if (!d.helper_id) s.compacting = true;
      return;
    case 'event.compacted':
      s.compacting = false;
      return;
    case 'event.tool_call': {
      if (d.helper_id) return;
      s.compacting = false;
      // A tool call closes the response before it: only the text after the last one is final.
      if (s.segs[s.segs.length - 1] !== '') s.segs.push('');
      s.gapNext = false;
      const st: Step = { id: str(d.tool_id), name: str(d.name), summary: str(d.summary), ok: null, n: s.stepsTotal, seg: s.segs.length - 1 };
      if (safeInt(now)) st.at = now;
      s.stepsTotal++;
      s.steps.push(st);
      if (s.steps.length > MAX_STEPS) s.steps.shift();
      const e = editOf(st.id, st.name, d.arguments);
      if (e) addEdit(s, e);
      return;
    }
    case 'event.tool_result':
      if (!d.helper_id) settleEdit(s, str(d.tool_id), resultOf(d));
      for (let i = s.steps.length - 1; i >= 0; i--) {
        const st = s.steps[i] as Step;
        if (st.id && st.id === d.tool_id) { s.steps[i] = { ...st, ...resultOf(d), ...picsOf(st.name, d) }; if (safeInt(now) && st.at !== undefined) (s.steps[i] as Step).end = now; break; }
      }
      return;
    case 'event.confirm_request':
    case 'event.user_question': {
      const kind = ev.type === 'event.confirm_request' ? 'confirm' : 'question';
      const ng = gateOf(env.gate, kind, d);
      // An opening event is evidence like any other: a gate that was resolved, or refused as gone (a 409), is
      // closed and does not open again.
      if (!ng.invalid && ng.dnum !== null && isClosed(s, kind, ng.dnum, null)) return;
      // The same gate (id and generation) that the card already holds, seen again by its opening event (a
      // snapshot showed it first), is not a new gate: an answer in flight or of unknown outcome stays pending.
      const same = !ng.invalid && !!s.gate && !s.gate.invalid && s.gate.kind === kind && s.gate.id === ng.id && s.gate.generation === ng.generation;
      // A snapshot showed the gate the card holds as pending at its watermark: another gate that opened at or
      // before that watermark is over (the agent holds one at a time), so its opening event, seen late in a
      // replay, does not replace it.
      if (!same && s.gate && s.gateSrc === 'state' && s.gateAt !== null && env.seq <= s.gateAt) return;
      s.gate = ng;
      s.gateSrc = 'event'; s.gateAt = env.seq; // opened by the event at this seq
      if (!same) { s.decision = null; s.onceOnly = false; }
      if (s.gate.invalid) s.resync = true;
      return;
    }
    case 'event.gate_resolved': {
      const g = s.gate;
      const num = d.kind === 'confirm' ? d.gate_id : d.question_id;
      markClosed(s, str(d.kind), num, env.seq); // even when the card never saw it open
      if (!d.helper_id && s.segs[s.segs.length - 1] !== '') s.gapNext = true;
      if (g && !g.invalid && g.kind === d.kind && g.dnum !== null && g.dnum === num) {
        s.resolved = { outcome: str(d.outcome), mine: !!(s.decision && d.request_id && d.request_id === s.decision.requestId) };
        if (d.session_scope_applied === false) s.onceOnly = true;
        s.gate = null;
        s.decision = null;
      }
      return;
    }
    case 'event.error':
      s.compacting = false;
      s.error = { code: str(d.code), retryAt: RFC3339.test(str(d.retry_at)) ? (d.retry_at as string) : null };
      return;
    case 'event.stream_done':
      if (d.background !== true && !d.helper_id && typeof d.cost_usd === 'number' && isFinite(d.cost_usd) && d.cost_usd >= 0) s.cost = (s.cost || 0) + d.cost_usd;
      // usage_only is a turn total beyond the requests (a delegated agent's foreground subagents and auxiliary calls): no model request of the session's own.
      if (d.background !== true && !d.helper_id && d.usage_only !== true) {
        const c = responseCounts(d);
        if (c) s.responses.push(c); else s.responsesSkipped++;
      }
      return;
    case 'event.agent_done':
      // The turn stopped running: its receipt, not this frame, says how it ended.
      s.done = { outcome: str(d.outcome), code: str(d.error_code) };
      s.gate = null;
      s.compacting = false;
      return;
    case 'event.turn_discarded':
      s.discarded = true;
      return;
    case 'event.clear':
      s.cleared = true;
      return;
  }
}

// The session was attached again: a different history whose seq restarts at 1, and whose gates have new ids
// (the agent refuses an old one). Nothing of the old incarnation is actionable any more.
function newIncarnation(s: AskState, inc: string): void {
  if (s.inc && !s.retired.includes(s.inc)) { s.retired.push(s.inc); if (s.retired.length > 32) s.retired.shift(); }
  s.epoch++;
  s.inc = inc; s.seq = 0; s.closed = [];
  s.gate = null; s.gateSrc = null; s.gateAt = null;
  s.decision = null; s.onceOnly = false;
  s.buffer = [];
  s.compacting = false;
  // The counts belong to the history left behind: the new one reports its own responses, and its own tool calls (edits.ts).
  s.responses = []; s.responsesSkipped = 0; s.edits = []; s.editsLost = 0; s.editsSeen = new Set(); s.editsFailed = new Set();
}

// closed holds "kind:num" (a 409 refused it: no seq) or "kind:num@seq" (an event at that seq resolved it). A
// snapshot taken at or after that seq is newer than the event and is not contradicted by it.
function markClosed(s: AskState, kind: string, num: unknown, seq?: unknown): void {
  if (num === null || num === undefined) return;
  const k = kind + ':' + String(num) + (safeInt(seq) ? '@' + seq : '');
  if (!s.closed.includes(k)) { s.closed.push(k); if (s.closed.length > 64) s.closed.shift(); }
}
function isClosed(s: AskState, kind: string, num: unknown, wm: number | null | undefined): boolean {
  if (num === null || num === undefined) return false;
  const base = kind + ':' + String(num);
  for (const c of s.closed) {
    if (c === base) return true;
    if (c.indexOf(base + '@') === 0 && (wm === null || wm === undefined || parseInt(c.slice(base.length + 1), 10) > wm)) return true;
  }
  return false;
}
// The first incarnation the card hears of is a change of what it knows as well: a read begun before it may
// belong to any history, so the epoch moves.
function learn(s: AskState, inc: string): void {
  if (!s.inc) { s.inc = inc; s.epoch++; }
}
function isRetired(s: AskState, inc: string): boolean {
  return !!inc && s.retired.includes(inc);
}

function onEnvelope(s: AskState, envIn: unknown, now?: number): void {
  if (!isObj(envIn) || !safeInt(envIn.seq) || envIn.seq < 1) return;
  const ev = envIn.event;
  if (!isObj(ev) || typeof ev.type !== 'string' || ev.type.indexOf('event.') !== 0) return;
  const env = envIn as unknown as Envelope;
  const inc = str(env.incarnation);
  if (inc && !INC.test(inc)) return;
  if (isRetired(s, inc)) return; // a frame of a history that was left behind
  if (inc && s.inc && inc !== s.inc) {
    newIncarnation(s, inc); s.resync = true;
  } else if (inc) {
    learn(s, inc);
  }
  if (env.seq <= s.seq) return;
  s.seq = env.seq;
  if (!s.turnId) {
    if (s.buffer.length >= MAX_BUFFER) { s.resync = true; return; }
    // A write's content is never kept (edits.ts): a call held here keeps its length only.
    const d = env.event.data;
    s.buffer.push(env.event.type === 'event.tool_call' && isObj(d) && isObj(d.arguments) ? { ...env, event: { ...env.event, data: { ...d, arguments: withoutContent(d.arguments) } } } : env);
    return;
  }
  if (env.turn_id !== s.turnId && !(s.loose && env.turn_id === undefined)) return;
  onEvent(s, env, now);
}

// Applies buffered frames for the now-known turn. Their seq was already accepted.
function flush(s: AskState): void {
  const b = s.buffer;
  s.buffer = [];
  for (const e of b) if (e.turn_id === s.turnId || (s.loose && e.turn_id === undefined)) onEvent(s, e);
}

// Codes of a refused decision that say the gate it named is not the one parked: ended, answered, cancelled or
// changed.
const GATE_GONE: Readonly<Record<string, 1>> = { stale_gate: 1, no_pending_gate: 1, gate_already_resolved: 1, gate_already_answered: 1, gate_cancelled: 1 };
export const GATE_GONE_CODES: readonly string[] = Object.keys(GATE_GONE);
// A decision answered 404 proves nothing: a session the gateway reaped (/confirm and /answer serve a live session only, and the
// not-live answer becomes 404 not_found) and a session hidden from this caller answer the same. The page reads the session back
// instead of calling it refused; the journal's reply rule says the same (journal/proof.ts).
export function decisionProvesNothing(status: unknown): boolean { return status === 404; }
const TERMINAL_STATES: Readonly<Record<string, 1>> = { completed: 1, failed: 1, cancelled: 1, interrupted: 1 };
export function isTerminalState(v: unknown): v is Terminal['state'] {
  return typeof v === 'string' && own(TERMINAL_STATES, v);
}

// Does the replay hold an event AFTER the snapshot (seq above its watermark; any seq when there is none) that
// ends the gate (kind, dnum)? gate_resolved for it, the turn's agent_done, or another gate opened after the
// snapshot (the gate was replaced).
function replayEnds(s: AskState, body: unknown, kind: string, dnum: number, wm: number | null): boolean {
  const evs = isObj(body) && Array.isArray(body.events) ? (body.events as unknown[]) : [];
  const binc = isObj(body) ? str(body.incarnation) : '';
  for (const env of evs) {
    const ev = isObj(env) ? env.event : undefined;
    if (!isObj(env) || !safeInt(env.seq) || !isObj(ev) || typeof ev.type !== 'string') continue;
    if (wm !== null && env.seq <= wm) continue;
    const einc = str(env.incarnation) || binc;
    if (s.inc && einc && einc !== s.inc) continue;
    if (s.turnId && env.turn_id !== s.turnId && !(s.loose && env.turn_id === undefined)) continue;
    const d: Rec = isObj(ev.data) ? ev.data : {};
    if (ev.type === 'event.agent_done') return true;
    if (ev.type === 'event.gate_resolved' && d.kind === kind && (kind === 'confirm' ? d.gate_id : d.question_id) === dnum) return true;
    if ((ev.type === 'event.confirm_request' || ev.type === 'event.user_question') && wm !== null) {
      const k2 = ev.type === 'event.confirm_request' ? 'confirm' : 'question';
      const n2 = k2 === 'confirm' ? d.gate_id : d.question_id;
      if (k2 !== kind || n2 !== dnum) return true;
    }
  }
  return false;
}

export type Action =
  /** An SSE frame: name is the event line, data the parsed JSON. */
  | { type: 'frame'; name: string; data: unknown; now?: number }
  /** The accepted turn's id. */
  | { type: 'turn'; turnId: unknown }
  /** GET /replay; turnSince is /state's turn_since. */
  | { type: 'replay'; body: unknown; turnSince?: number }
  /** GET /state, ordered against the events by its {incarnation, seq} watermark; replay is the GET /replay body
   *  read beside it (events after the snapshot can end its gate). */
  | { type: 'state'; body: unknown; replay?: unknown }
  /** A durable turn receipt. */
  | { type: 'receipt'; body: unknown }
  /** A decision for the shown gate went out; requestId is also the local decision id. */
  | { type: 'decide'; requestId: unknown }
  /** The answer to that decision (status 200 or an error status with body). It applies only while the same
   *  decision is in flight on the same gate and generation. */
  | { type: 'decided'; requestId: string; gateId: string; generation: number; status: number | undefined; body: unknown }
  /** The reads of a recovery, applied together or not at all, stamped with the epoch and gate revision. */
  | { type: 'reply'; epoch: number; rev: number; receipt?: unknown; replay?: unknown; state?: unknown; turnSince?: number }
  /** Stop was sent. */
  | { type: 'stop' }
  /** The agent refused that Stop definitely: the turn it named is still running. A refusal of an earlier turn's Stop (it came
   *  after that turn ended and another began) names another turn and changes nothing. */
  | { type: 'stopRefused'; turnId: string | null }
  | { type: 'stopUnsure'; turnId: string }
  /** A follow-up reached the running turn: the text after it starts a new segment. */
  | { type: 'split' }
  /** Reads were applied; the stream can reopen. */
  | { type: 'resynced' };

/** Whether a /state body is a snapshot the reducer's `state` step can evaluate whole: an incarnation that names one and a safe-integer
 *  seq (its watermark), and a pending gate that is either named by neither field or built by the step (an object `pending_gate` of a
 *  known type under a `pending_gate_ref` that gives a valid id and generation). Anything else (null, empty, no watermark, a ref without
 *  its gate, a negative seq, a bad incarnation) is ignored by the step, or half applied: it proves nothing about a gate, so a caller
 *  that erases stored evidence on a snapshot (the GitHub run's stored decision) asks this first. It reads the same fields the step reads. */
export function stateUsable(body: unknown): boolean {
  if (!isObj(body)) return false;
  const inc = str(body.incarnation);
  if (!inc || !INC.test(inc) || !safeInt(body.seq)) return false;
  const ref = body.pending_gate_ref, pg = body.pending_gate;
  if (ref === undefined || ref === null) return true;
  if (!isObj(pg)) return false;
  const kind = pg.type === 'question' ? 'question' : pg.type === 'confirm' ? 'confirm' : null;
  return kind !== null && !gateOf(ref, kind, pg).invalid;
}

function gateSig(s: AskState): string {
  const g = s.gate;
  return (g ? [g.kind, g.id, g.generation, g.invalid ? 1 : 0, g.dnum].join(':') : '-') + '|' + (s.decision ? s.decision.requestId : '-') + '|' + (s.done ? 'd' : '') + (s.terminal ? 't' : '');
}
/** The one place the card reconciles anything: (state, frame | reply | answer | ...) → state. */
export function reduce(st: AskState, a: Action | null | undefined): AskState {
  const s = copy(st);
  step(s, a);
  if (gateSig(st) !== gateSig(s) || st.resolved !== s.resolved) s.gateRev = st.gateRev + 1;
  return s;
}
function step(s: AskState, a: Action | null | undefined): AskState {
  if (!isObj(a)) return s;
  switch (a.type) {
    case 'frame': {
      const d = a.data;
      if (a.name === 'replay_boundary') {
        const inc = isObj(d) ? str(d.incarnation) : '';
        if (isRetired(s, inc)) return s;
        if (inc && INC.test(inc) && s.inc && inc !== s.inc) { newIncarnation(s, inc); s.resync = true; } else if (inc && INC.test(inc)) learn(s, inc);
        return s;
      }
      if (a.name === 'lagged') { s.resync = true; if (isObj(d) && d.code === 'replay_gap') s.gap = true; return s; }
      if (a.name === 'end') { s.ended = true; return s; }
      // A taxonomy frame: the SSE name is the type without its prefix.
      if (!isObj(d) || !isObj(d.event) || typeof d.event.type !== 'string' || 'event.' + a.name !== d.event.type) return s;
      onEnvelope(s, d, a.now);
      return s;
    }
    case 'turn':
      if (!seg(a.turnId) || (s.turnId && s.turnId !== a.turnId)) return s;
      if (!s.turnId) { s.turnId = a.turnId; flush(s); }
      return s;
    case 'replay': {
      const b = a.body;
      if (!isObj(b)) return s;
      const rinc = str(b.incarnation);
      if (isRetired(s, rinc)) return s; // the replay of a history that was left behind
      if (rinc && INC.test(rinc) && s.inc && rinc !== s.inc) { newIncarnation(s, rinc); s.gap = true; } else if (rinc && INC.test(rinc)) learn(s, rinc);
      const min = safeInt(b.min_seq) ? b.min_seq : 0;
      if (safeInt(a.turnSince) ? min > a.turnSince + 1 : min > s.seq + 1) s.gap = true;
      const evs = Array.isArray(b.events) ? (b.events as unknown[]) : [];
      for (const e of evs) onEnvelope(s, e);
      return s;
    }
    case 'state': {
      const sb = a.body;
      if (!isObj(sb)) return s;
      // The snapshot's watermark ({incarnation, seq}, taken before the snapshot itself) orders it against the
      // events: it is comparable only within the incarnation the events belong to. Only positive evidence removes
      // a gate; a missing event or a missing watermark never does.
      const sinc = str(sb.incarnation);
      if (isRetired(s, sinc)) { s.stateLeftOut = true; return s; }
      if (sinc && INC.test(sinc) && s.inc && sinc !== s.inc) {
        // A snapshot of another incarnation than the events: beside a replay it is the odd one out (the next read
        // settles it); alone it is the newer history, adopted like a replay of it.
        if (isObj(a.replay) && str(a.replay.incarnation)) { s.stateLeftOut = true; return s; }
        newIncarnation(s, sinc); s.gap = true;
      }
      if (sinc && INC.test(sinc)) learn(s, sinc);
      const wm = safeInt(sb.seq) && sinc && s.inc && sinc === s.inc ? sb.seq : null;
      const ref = sb.pending_gate_ref, pg = sb.pending_gate;
      if (ref && isObj(pg)) {
        const kind = pg.type === 'question' ? 'question' : pg.type === 'confirm' ? 'confirm' : null;
        if (!kind) return s;
        const g = gateOf(ref, kind, pg);
        // A gate the snapshot holds stays unless the replay holds an event after the snapshot that resolved,
        // closed or replaced it.
        if (!g.invalid && g.dnum !== null && (isClosed(s, kind, g.dnum, wm) || replayEnds(s, a.replay, kind, g.dnum, wm))) return s;
        // /state's pending_gate.generation is the daemon's lease generation, not the gate's.
        if (!s.gate || s.gate.id !== g.id || s.gate.generation !== g.generation) { s.gate = g; s.gateSrc = 'state'; s.gateAt = wm; s.decision = null; }
        else if (s.gateSrc === 'state' && wm !== null && (s.gateAt === null || wm > s.gateAt)) s.gateAt = wm;
      } else if (!ref && s.gate) {
        // No gate in the snapshot: gone only when the snapshot is provably not older than the gate.
        const gone = s.gateSrc === 'event' ? wm !== null && s.gateAt !== null && wm >= s.gateAt : wm === null || s.gateAt === null || wm >= s.gateAt;
        if (gone) { s.gate = null; s.decision = null; }
      }
      return s;
    }
    case 'receipt': {
      const r = a.body;
      if (!isObj(r) || !s.turnId || r.turn_id !== s.turnId) return s;
      if (isTerminalState(r.state)) {
        s.terminal = {
          state: r.state, code: str(r.error_code),
          retryAt: RFC3339.test(str(r.retry_at)) ? (r.retry_at as string) : null,
          effects: r.effects_may_have_occurred === true,
        };
        s.gate = null;
        s.decision = null;
        s.stopping = false;
      }
      return s;
    }
    case 'decide':
      if (!s.gate || s.gate.invalid || !is(REQ, a.requestId)) return s;
      s.decision = { requestId: a.requestId, gateId: s.gate.id, generation: s.gate.generation };
      return s;
    case 'decided': {
      const dn = s.decision;
      if (!dn || a.requestId !== dn.requestId || a.gateId !== dn.gateId || a.generation !== dn.generation) return s;
      const body: Rec = isObj(a.body) ? a.body : {};
      if (a.status === 200) {
        if (body.session_scope_applied === false) s.onceOnly = true;
        s.resolved = { outcome: 'answered', mine: true };
        if (s.gate) markClosed(s, s.gate.kind, s.gate.dnum);
        s.gate = null;
        s.decision = null;
        return s;
      }
      const e: Rec = isObj(body.error) ? body.error : body;
      const code = str(e.code), det: Rec = isObj(e.details) ? e.details : {};
      if (code === 'gate_decision_pending') return s; // still pending: read back from the session, never resent
      if (code === 'gate_already_resolved' && det.request_id && det.request_id === dn.requestId) {
        s.resolved = { outcome: 'answered', mine: true };
        if (s.gate) markClosed(s, s.gate.kind, s.gate.dnum);
        s.gate = null;
        s.decision = null;
        return s;
      }
      // A definite refusal that names the gate gone or changed is positive evidence: it goes at once. Anything
      // else is read again, never re-decided on the user's behalf.
      if (own(GATE_GONE, code) && typeof a.status === 'number' && a.status >= 400 && a.status < 500) {
        if (s.gate) markClosed(s, s.gate.kind, s.gate.dnum);
        s.gate = null;
      }
      s.decision = null;
      s.resync = true;
      return s;
    }
    case 'reply': {
      // Stamped with the incarnation epoch and the gate revision current at dispatch: if the stream has moved to
      // another incarnation since, the whole reply is dropped (the caller reads again); if only the gate moved,
      // the snapshot is left out and the receipt and the replay, which are ordered by seq, still count.
      s.replyDropped = false; s.stateLeftOut = false;
      if (a.epoch !== s.epoch) { s.replyDropped = true; return s; }
      if (a.receipt) step(s, { type: 'receipt', body: a.receipt });
      if (a.replay) step(s, { type: 'replay', body: a.replay, turnSince: a.turnSince });
      if (a.state) {
        if (a.rev === s.gateRev) step(s, { type: 'state', body: a.state, replay: a.replay || null });
        else s.stateLeftOut = true;
      }
      // A snapshot taken before the replay's oldest event says nothing about what came in between: it is applied
      // as far as it goes, and read again.
      const as = a.state, ar = a.replay;
      if (isObj(as) && isObj(ar) && str(as.incarnation) && str(as.incarnation) === str(ar.incarnation) && safeInt(as.seq) && safeInt(ar.min_seq) && as.seq + 1 < ar.min_seq) s.stateLeftOut = true;
      return s;
    }
    case 'stop':
      if (s.turnId && !s.terminal && !s.stopUnsure) s.stopping = true;
      return s;
    case 'stopRefused':
      if (s.turnId === a.turnId && !s.terminal) s.stopping = false;
      return s;
    case 'stopUnsure':
      if (s.turnId === a.turnId && !s.terminal && s.stopping) { s.stopping = false; s.stopUnsure = true; }
      return s;
    case 'split':
      if (s.segs[s.segs.length - 1] !== '') s.segs.push('');
      s.gapNext = false;
      return s;
    case 'resynced':
      s.resync = false;
      s.ended = false;
      return s;
  }
  return s;
}

export type Phase = 'working' | 'waiting' | 'stopping' | 'finishing' | Terminal['state'];
// phase(state) → 'finishing' means the turn stopped running and its receipt is being read.
export function phase(s: AskState): Phase {
  if (s.terminal) return s.terminal.state;
  if (s.done || s.discarded) return 'finishing';
  if (s.stopping) return 'stopping';
  if (s.gate) return 'waiting';
  return 'working';
}
/** The final response: the text after the last tool call. */
export function reply(s: AskState): string {
  return s.segs[s.segs.length - 1] ?? '';
}

// The final response of a persisted conversation (GET /sessions/{id}/transcript): the text of the last
// assistant message after its last tool call, or '' when that message ends in a tool call (or there is none).
export function transcriptReply(body: unknown): string {
  const ms = isObj(body) && Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
  for (let i = ms.length - 1; i >= 0; i--) {
    const m = ms[i];
    if (!isObj(m) || m.role !== 'assistant' || !Array.isArray(m.blocks)) continue;
    let out = '';
    for (const b of m.blocks as unknown[]) {
      if (!isObj(b)) continue;
      if (b.kind === 'tool_use') out = '';
      else if (b.kind === 'text' && typeof b.text === 'string') out += b.text;
    }
    return out.length > MAX_REPLY ? out.slice(0, MAX_REPLY) : out;
  }
  return '';
}

// ── result link ────────────────────────────────────────────────────────────
/** The checks of HubEmbedGuard the result link delegates to (bound host, secrets, the exec host template). */
export interface Guard {
  expectedHost: (catalog: unknown, service: string, ids: { project_id: string; id: string; server_name?: string }, index: number, domain: string) => string;
  boundUrl: (url: string, host: string) => boolean;
  secretIn: (url: string) => boolean;
}
// The exec-1 host of the captured computer, through HubEmbedGuard.expectedHost's label checks.
const EXEC_CAT = {
  host: { template: 'https://{projectId}-{computerId}-{segment}.{serverName}.{computersDomain}' },
  services: { exec: { segment: 'exec-{index}', index: { min: 1, max: 1 } } },
};
export function execHost(project: { id: string } | null, container: { id: string; server_name?: string } | null, domain: string, guard: Guard | null): string {
  if (!guard || !project || !container) return '';
  return guard.expectedHost(EXEC_CAT, 'exec', { project_id: project.id, id: container.id, server_name: container.server_name }, 1, domain);
}
// resultLink(text, {host, path}, guard) → the URL, or null. The candidate must be exactly https://<host><path>,
// optionally wrapped in one pair of <> or backticks, and must also pass the guard's bound-host and secret checks.
export function resultLink(text: unknown, expect: { host?: string; path?: string } | null, guard: Guard | null): string | null {
  if (typeof text !== 'string' || !expect || !expect.host || !expect.path || !guard) return null;
  const lines = text.split(/\r\n|\r|\n/);
  let line = '';
  for (let i = lines.length - 1; i >= 0; i--) if (/\S/.test(lines[i] as string)) { line = (lines[i] as string).trim(); break; }
  const m = /^<([^<>]*)>$/.exec(line) || /^`([^`]*)`$/.exec(line);
  const c = m ? (m[1] as string) : line;
  if (c !== 'https://' + expect.host + expect.path) return null;
  if (/[\u0000-\u0020\u007f\\%]/.test(c)) return null;
  if (!guard.boundUrl(c, expect.host) || guard.secretIn(c)) return null;
  let u: URL;
  try { u = new URL(c); } catch { return null; }
  if (u.pathname !== expect.path || u.search || u.hash) return null;
  return c;
}

/** The words the person's own "New conversation" asks first, or null when it goes at once: a running task keeps running; a first message that
 *  may have gone through (its Check lives only in this conversation, C9) goes out of view. A running task's words win. */
export function newAsk(running: boolean, unsure: boolean): 'ask.newConfirm' | 'ask.newConfirmUnsure' | null {
  return running ? 'ask.newConfirm' : unsure ? 'ask.newConfirmUnsure' : null;
}
// ── outcome texts ──────────────────────────────────────────────────────────
// Keys into strings.en.json ("ask.*").
const CODE_KEYS: Readonly<Record<string, string>> = {
  no_credentials: 'ask.noModel', session_unconfigured: 'ask.noModel', model_unavailable: 'ask.noModel',
  rate_limit: 'ask.rateLimited', quota_wait_too_long: 'ask.rateLimited',
  approval_policy_unsatisfiable: 'ask.policyChanged',
  context_overflow: 'ask.tooLong',
};
export function failureKey(code: unknown): string {
  return typeof code === 'string' && own(CODE_KEYS, code) ? (CODE_KEYS[code] as string) : 'ask.failed';
}

export interface ErrorView { key?: string; unknown?: true; consumed?: true; drop?: true }
// A mutation's error → {key, unknown?, consumed?}. unknown: it may have gone through, so nothing is sent again
// under a new key. consumed: a definite create refusal used up its key. drop: the context that sent it is gone
// (stale or superseded refusal); render nothing.
export function errorView(e: unknown): ErrorView {
  if (!isObj(e)) return { key: 'ask.unknown', unknown: true };
  if (e.pending) return { key: 'ask.unknown', unknown: true };
  if (e.stale || e.superseded) return { drop: true };
  if (e.framed) return { key: 'ask.framed' };
  if (e.notSent) return { key: 'ask.failed' };
  const st = e.status, code = str(e.code);
  if (typeof st !== 'number' || st === 0) return { key: 'ask.unknown', unknown: true };
  if (code === 'admission_unconfirmed' || st >= 500) return { key: 'ask.unknown', unknown: true };
  if (code === 'binding_mismatch') return { key: 'ask.bindingFailed', consumed: true };
  // The realm's default is Claude Code and it can't start there: nothing was created.
  if (code === 'delegated_agent_unavailable') return { key: 'claude', consumed: true };
  if (code === 'gate_parked' || code === 'turn_in_flight' || code === 'session_busy') return { key: 'ask.busy' };
  if (/^realm_|^invalid_realm$/.test(code)) return { key: 'ask.realmNeeded', consumed: true };
  if (st === 404) return { key: 'ask.gone', consumed: true };
  if (st === 403 && code === 'forbidden') return { key: 'ask.accessRefused', consumed: true };
  return { key: 'ask.failed', consumed: true };
}
// A preflight or recovery read's error. A failed fetch may be a CORS-hidden refusal, so it is "cannot reach",
// never a diagnosis; an access refusal is named only from the response's code.
export function readView(e: unknown): ErrorView {
  if (!isObj(e)) return { key: 'ask.unreachable' };
  if (e.stale || e.superseded) return { drop: true };
  if (e.status === 403 && e.code === 'forbidden') return { key: 'ask.accessRefused' };
  if (e.status === 404 || e.status === 405) return { key: 'ask.unsupported' };
  return { key: 'ask.unreachable' };
}
// What core's sign-in (signInAgent: one sign-in path for every place) means for a message that waits on it.
// 'hold': it may have gone through (signed in, unknown, or dropped when the Hub moved away), so no second sign-in for that
// computer (C9). 'prove': the agent's own status decides, and a not-ready read after it says "may have been signed in", never
// "could not". 'stale' (core dropped the call: the Hub showed another computer, or the context died) goes no further: no read,
// no session; the message reads not sent, with "may have been signed in". Anything else is a refusal made before or instead of a
// change: the message was not sent, with the same words as the shared box.
export type SignInView = { prove: true; hold: true } | { prove: false; hold: boolean; key: string };
export function signInView(r: SignInResult): SignInView {
  if (r.kind === 'signedIn' || r.kind === 'unknown') return { prove: true, hold: true };
  if (r.kind === 'stale') return { prove: false, hold: true, key: 'ask.signUnknown' };
  if (r.kind === 'notAllowed') return { prove: false, hold: false, key: r.reason === 'otherAccount' ? 'ask.otherAccount' : r.reason === 'admin' ? 'ask.signAdmin' : 'ask.signShared' };
  switch (r.reason) {
    case 'key': return { prove: false, hold: false, key: 'ask.signInInAgent' };
    case 'disabled': return { prove: false, hold: false, key: 'ask.signNotOffered' };
    case 'cancelled': return { prove: false, hold: false, key: 'ask.signCancelled' };
    case 'busy': return { prove: false, hold: false, key: 'ask.signBusy' };
    default: return { prove: false, hold: false, key: 'ask.signFail' };
  }
}

// ── storage: hub_ask_v1 ────────────────────────────────────────────────────
// {v:1, a:{<account>: [rec, …]}}, newest first, at most MAX_RECS per account; a (project, computer,
// realm) may hold several, its current one first (conv.ts). rec = {p, c, r, s, t, k1, k2, k3, c3, w, kw, dk, da, dg, dr, rc, n, at, i, q, ph, l, f}: ids, the operation keys (k3: the follow-ups
// not settled yet, an answer lost or a queued receipt, each kept until it commits, is superseded or refused; c3:
// the command id a queued receipt named for such a key;
// w: the turn key k2 was sent and no turn id answered it yet; kw: earlier turn keys sent with w that a newer turn
// key replaced before anything settled them (another tab sent the newer one), kept until settled or dismissed;
// dk: dismissed keys; da: decisions sent and not settled, gate id → request id; dg: gates a page saw end; dr: per gate, the request id a page saw refused while the gate stayed answerable: the
// evidence other tabs read), the recipe id
// ('custom' for a typed message) and nonce, the time, the stream cursor, the last phase, the page language the
// prompt was built in (a preset's body is rebuilt from rc, n, r and l for a same-key retry) and f, whether the
// create asked to follow the realm's backend (kept only when true); wf, whether k2's request carried images or text
// files (never which: their bytes are never stored), and kwf the same for kw keys. Malformed records are dropped one by one.
export const MAX_RECS = 8;
const ACCT = /^(?!__proto__$)[A-Za-z0-9_-]{1,64}$/;
export const PHASES = ['opening', 'sending', 'working', 'waiting', 'stopping', 'finishing', 'completed', 'failed', 'cancelled', 'interrupted', 'unknown', 'gone'] as const;
export type RecPhase = (typeof PHASES)[number];
export interface AskRecord {
  p: string;
  c: string;
  r: string;
  s: string | null;
  t: string | null;
  k1: string;
  k2: string;
  rc: RecipeId | 'custom';
  n: string | null;
  at: number;
  i: string | null;
  q: number;
  ph: RecPhase;
  l: string;
  /** Keys of follow-ups not yet settled (a lost answer or a queued receipt), oldest first, at most K3_MAX. */
  k3?: string[];
  /** The command id a k3 key's queued receipt named (key → id): after a reload that row is read back by its id. */
  c3?: Record<string, string>;
  w?: true;
  /** The request under k2 carried files: after a reload its row never takes retyped text alone. */
  wf?: true;
  /** Turn keys sent (w) that a newer turn key replaced before they settled, oldest first (a new turn key waits
   *  while K3_MAX are unsettled; at most JOURNAL_MAX stored): each stays a text-less row until a page settles it or
   *  the person dismisses it. */
  kw?: string[];
  /** The kw keys whose request carried files (as wf for k2): after a reload their rows never take retyped text. */
  kwf?: string[];
  /** The turn (its id) whose failure the agent's turn list could not confirm when the conversation was read back:
   *  while it is still the record's turn, Recent reads unknown, never Failed or Done; the next read checks again. */
  u?: string;
  /** Keys the person dismissed (any tab): a save never brings back their row, w or live phase. Only the last K3_MAX
   *  are kept; an older tombstone falls out. */
  dk?: string[];
  /** Keys PROVEN never to have reached the agent (the first-message claim under the chat lock that moved or dismissed a key no turn
   *  or entry held, or a fenced/refused turn key). The only evidence of non-admission: a dismissal (dk) is a decision and proves
   *  nothing, since the person may stop tracking an admitted request. Only the last K3_MAX are kept. */
  na?: string[];
  /** A fork: the chat this record's create was asked to branch from (parent session id) and the 0-based turn it copies through
   *  (null: the whole chat). Part of the record's identity with k1 and s: no save drops or changes it. A fork has no first message:
   *  k2 is minted to keep the record well-formed and is never sent. `bad`: the stored identity could not be read (the parent and turn are
   *  unknown): the record is kept as an unresolved fork that only its key can settle, and it blocks a new fork until it is resolved. */
  fk?: { s: string; i: number | null; bad?: true };
  /** Decisions sent and not settled yet (gate id → request id; a new decision waits while K3_MAX are unsettled; at
   *  most JOURNAL_MAX stored): no tab decides those gates again until the agent's evidence settles them. */
  da?: Record<string, string>;
  /** Gates (their da keys) a page saw end (a decision answered, or the gate ended), newest last, at most SETTLED_MAX:
   *  a tab still showing one keeps its card closed until its own read settles it, and a tab that sent a decision on
   *  it never stores that again. A request id missing from da without its gate in dg or itself in dr is not settled
   *  (a stale whole-record write may have dropped it). */
  dg?: string[];
  /** Per gate (gate id → request id), the latest decision a page saw refused definitely while the gate stayed
   *  answerable: a tab holding it lets it go and offers the card again. Cleared when a page sees the gate end; at
   *  most SETTLED_MAX gates. */
  dr?: Record<string, string>;
}
export interface AskStore { v: 1; a: Record<string, AskRecord[]> }

export const K3_MAX = 8;
/** Room the stored kw and da keep: K3_MAX is the admission limit (no new one goes past it); two tabs at that
 *  limit at once can briefly hold more, which are kept rather than dropped. */
export const JOURNAL_MAX = 2 * K3_MAX;
/** Room the settled request ids (dg) and the refused decisions (dr, gates) keep. */
export const SETTLED_MAX = 2 * JOURNAL_MAX;
export function validRec(x: unknown): AskRecord | null {
  if (!isObj(x) || Array.isArray(x)) return null;
  if (!seg(x.p) || !seg(x.c) || (x.r !== 'global' && !is(REALM, x.r))) return null;
  if (x.s !== null && !seg(x.s)) return null;
  if (x.t !== null && !seg(x.t)) return null;
  if (!is(KEY, x.k1) || !is(KEY, x.k2) || x.k1 === x.k2) return null;
  if (x.rc !== 'custom' && !recipe(x.rc)) return null;
  if (x.rc === 'custom' ? x.n !== null : !is(NONCE, x.n)) return null;
  if (!safeInt(x.at) || !safeInt(x.q) || (x.i !== null && !is(INC, x.i)) || !(PHASES as readonly unknown[]).includes(x.ph) || typeof x.l !== 'string' || !own(LANGS, x.l)) return null;
  const r: AskRecord = {
    p: x.p, c: x.c, r: x.r as string, s: x.s as string | null, t: x.t as string | null, k1: x.k1, k2: x.k2,
    rc: x.rc as AskRecord['rc'], n: x.n as string | null, at: x.at, i: x.i as string | null, q: x.q, ph: x.ph as RecPhase, l: x.l,
  };
  // A single string is the earlier one-slot form.
  const k3 = (Array.isArray(x.k3) ? x.k3 : [x.k3]).filter((k, i, a): k is string => is(KEY, k) && k !== x.k1 && k !== x.k2 && a.indexOf(k) === i).slice(-K3_MAX);
  if (k3.length) r.k3 = k3;
  if (k3.length && isObj(x.c3) && !Array.isArray(x.c3)) {
    const c3: Record<string, string> = {};
    for (const k of k3) if (own(x.c3, k) && seg(x.c3[k])) c3[k] = x.c3[k] as string;
    if (Object.keys(c3).length) r.c3 = c3;
  }
  if (x.w === true) r.w = true;
  if (x.wf === true) r.wf = true;
  if (seg(x.u)) r.u = x.u as string;
  const kw = (Array.isArray(x.kw) ? x.kw : []).filter((k, i, a): k is string => is(KEY, k) && k !== x.k1 && k !== x.k2 && !k3.includes(k) && a.indexOf(k) === i).slice(-JOURNAL_MAX);
  if (kw.length) r.kw = kw;
  const kwf = (Array.isArray(x.kwf) ? x.kwf : []).filter((k, i, a): k is string => typeof k === 'string' && kw.includes(k) && a.indexOf(k) === i);
  if (kwf.length) r.kwf = kwf;
  const dk = (Array.isArray(x.dk) ? x.dk : []).filter((k, i, a): k is string => is(KEY, k) && a.indexOf(k) === i).slice(-K3_MAX);
  if (dk.length) r.dk = dk;
  const na = (Array.isArray(x.na) ? x.na : []).filter((k, i, a): k is string => is(KEY, k) && a.indexOf(k) === i).slice(-K3_MAX);
  if (na.length) r.na = na;
  // A stored fork identity that cannot be read is NOT dropped (the record would become a phantom first-message chat): it is kept as an
  // unresolved fork whose parent and turn are unknown, which only a read of its key can settle.
  if (x.fk !== undefined) {
    r.fk = isObj(x.fk) && !Array.isArray(x.fk) && seg(x.fk.s) && (x.fk.i === null || (typeof x.fk.i === 'number' && Number.isSafeInteger(x.fk.i) && x.fk.i >= 0))
      ? { s: x.fk.s as string, i: x.fk.i as number | null }
      : { s: '', i: null, bad: true };
  }
  if (isObj(x.da) && !Array.isArray(x.da)) {
    const da: Record<string, string> = {};
    for (const k of Object.keys(x.da).slice(-JOURNAL_MAX)) if (seg(k) && is(REQ, (x.da as Rec)[k])) da[k] = (x.da as Rec)[k] as string;
    if (Object.keys(da).length) r.da = da;
  }
  const dg = (Array.isArray(x.dg) ? x.dg : []).filter((k, i, a): k is string => seg(k) && a.indexOf(k) === i).slice(-SETTLED_MAX);
  if (dg.length) r.dg = dg;
  if (isObj(x.dr) && !Array.isArray(x.dr)) {
    const dr: Record<string, string> = {};
    for (const k of Object.keys(x.dr).slice(-SETTLED_MAX)) if (seg(k) && is(REQ, (x.dr as Rec)[k])) dr[k] = (x.dr as Rec)[k] as string;
    if (Object.keys(dr).length) r.dr = dr;
  }
  return r;
}
export function parseStore(raw: unknown): AskStore {
  let d: unknown;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : null; } catch { d = null; }
  const out: AskStore = { v: 1, a: {} };
  if (!isObj(d) || d.v !== 1 || !isObj(d.a) || Array.isArray(d.a)) return out;
  const a = d.a;
  for (const k in a) {
    if (!own(a, k) || !ACCT.test(k) || !Array.isArray(a[k])) continue;
    const src = a[k] as unknown[];
    const list: AskRecord[] = [];
    for (let i = 0; i < src.length && list.length < MAX_RECS; i++) { const r = validRec(src[i]); if (r) list.push(r); }
    if (list.length) out.a[k] = list;
  }
  return out;
}
export function findRec(store: AskStore | null, account: string | null | undefined, p: string, c: string, r: string): AskRecord | null {
  const list = store && ACCT.test(account || '') && own(store.a, account as string) ? (store.a[account as string] as AskRecord[]) : [];
  for (const x of list) if (x.p === p && x.c === c && x.r === r) return x;
  return null;
}
/** A new store with rec first (replacing its slot), or null for an invalid record or account. */
export function putRec(store: AskStore | null, account: string | null | undefined, rec: unknown): AskStore | null {
  const r = validRec(rec);
  if (!r || !ACCT.test(account || '')) return null;
  const out: AskStore = { v: 1, a: {} };
  const src = store && store.a ? store.a : {};
  for (const k in src) if (own(src, k)) out.a[k] = (src[k] as AskRecord[]).slice();
  const acct = account as string;
  const list = (out.a[acct] || []).filter((x) => !(x.p === r.p && x.c === r.c && x.r === r.r));
  list.unshift(r);
  out.a[acct] = list.slice(0, MAX_RECS);
  return out;
}

// Reconnect backoff in ms (the flow adds jitter): 1 s doubling to 30 s.
export function backoff(n: number): number {
  return Math.min(30000, 1000 * Math.pow(2, Math.max(0, Math.min(n, 15))));
}

// Read-back judges for the Bots page's changes: for each change, which fresh read proves it was applied, and what stays
// unknown. Pure functions only: nothing here reads the network, the clock or a store. The page's held changes use the `stopDelegate`
// and `botAction` entries (data.ts PROVES); the other entries are read-back rules no press of the page uses.
//
// Each change has one entry (BOT_PROOFS[key], the key is the first argument of data.ts `useChange`). An entry is split the
// way the shared hold hook takes it (defineChecker(read, validate, judge)):
//   validate(answers, identity) -> parsed | null   null = malformed, empty, or about another Bot, link, key or computer.
//   judge(identity, parsed)     -> 'applied' | undefined   only ever runs on a validated answer.
//   proves(identity, answers)   = validate, then judge. This is core's `proves` option as it is today.
// `identity(vars)` is what the held row records (ids, the action, the baseline the press saw, digests of typed text, never a
// secret). `lockKey(vars)` is the entity only (Bot, link, key, computer): two different presses on one entity share a lock.
// `reads` are the page-source read keys, in the order `answers` come. `kind(identity)` says, per press, whether a read can
// prove it at all ('state') or nothing can ('none': Check cannot confirm it, only a warned Dismiss frees it).
//
// Rules every judge keeps:
//   - It judges only answers it validated. An answer about another Bot, link, key or computer, or one that does not carry
//     the identity it is judged by, is unknown. A Bot is identified by its view's own id and uid, a link and a key by their
//     own ids, a delegate by its own session id. Where an answer cannot echo the Bot or computer it is about (a log, an
//     archive, a chat-app list, a computer's Bot list), the read is made for that one Bot or computer and the selector's
//     `ok` marker is required (true only when the raw answer was well formed); for a Bot that is also confirmed by a view
//     of the same refresh with the press's uid. That is request-path provenance: it is not an echo, and the migration must
//     keep one refresh per proof (see WIRING).
//   - The selectors' defaults (a missing field read as false, 0, 'strict', true, 'idle', 'telegram') would manufacture
//     facts, so a judge never reads a selected value the raw answer did not carry: the selectors add `ok` (view, log,
//     archive, channels, computer lists) or a typed null (see WIRING), and the link index is built from the raw answer.
//   - 'applied' means the intended state holds now and sending the change again would be pointless or impossible: the
//     target is gone, or the target state is unique to the change (one live key name per link, one link per Bot, one
//     running turn). A change that is only "a value that differs from the one the press saw" (a new session id after a
//     reset, a new rotation time, a new channel of a kind) is NOT tied to this send, since another writer produces the same
//     read: those presses are kind 'none'.
//   - 'not_applied' is never returned. No Bots route has a key-based receipt, so no read can prove that a request did not
//     arrive; "nothing changed yet" stays unknown and only a warned Dismiss frees it.
//   - Absence is a proof only from a read that says it is whole (`hasMore` false, `suspended` 0, `complete`). Presence needs
//     none. An empty uid or id never identifies anything.
//
// WIRING (what the page's reads and presses do not carry yet; the hook's migration adds it). The raw checks are code, not
// prose: each select adds the marker its `raw*Ok` function below computes from the RAW answer (the selects' own defaults
// turn a missing field into false, 0, 'strict', null or idle, and a judge cannot tell that from a fact):
//   - computerBots: `ok: rawListOk(raw)`, `computerId` (the computer asked), `suspended: raw.suspended_count`. Today a
//     malformed raw answer becomes `{ rows: [], hasMore: false }` and a missing count becomes 0.
//   - view: `ok: rawViewOk(raw)` and `sessionId: raw.session_id` (null when absent). The view also needs `pending_gate`
//     present (null, or a gate with a gate id and generation): a gate the select hides reads as no gate.
//   - log: `ok: rawLogOk(raw)`; today a malformed answer becomes `hasOlder: false`.
//   - channels: `ok: rawChannelsOk(raw)`, `complete` (`meta.total` <= the rows read) and each channel's `enabled` from the
//     raw `effective.enabled.value` (a missing one is not "on"; rawChannelsOk then fails).
//   - delegates (done for stopDelegate: data.ts delegateOf): each delegate adds `idle: rawDelegateIdle(raw)`: true only for an open delegate with no open gate whose
//     session reported an `idle` step. A missing, `gate`, `model` or `tool` step is not idle (today they read idle).
//   - delegates, the open read: the Work tab's list asks `state=open&limit=0` (data.ts: every open task, one answer, never closed
//     history in the way and never cut at a page). A stop that closes is therefore proved by a second read, `delegatesClosedProof`: GET /bots/:id/delegates
//     ?state=closed&page=n&limit=CLOSED_PROOF_PAGE, one answer per page (the agent lists them by when each was opened, so the task
//     just closed can be on any page), the pages being `closedPagesFor(closed count)`, mounted only while a stop is pending. The open
//     list not showing a task is no proof it closed. Wired: data.ts `useStopDelegate` mounts the `delegatesClosedProof` pages only while
//     a stop is held, and Check again re-reads them with the open list.
//   - linkIndex: GET /bot-urls (first page, limit 100) answered as `toLinkIndex(raw.bot_urls, raw.next_cursor)`, built from
//     the raw array, never from the Bot-keyed `link` map (that map keeps one link per Bot key and drops the rest).
//   - archive: a new read (GET /bots/:id/archive?limit=1) answering `{ [botKey]: { ok: rawArchiveOk(raw), rows, more } }`.
//   - presses put their baseline into the vars: `uid` for every Bot action, gate, turn and link create and repoint (the
//     Bot's own uid), `logSeq` (newest row shown) for forget, `suspended` for resume, `knownKeyIds` for mintKey,
//     `revision` for settings and guardrails, `turnId` for stopTurn. A press without its baseline judges nothing.
import { stringOrEmpty as str } from '@core';
import { botIdFromName, parseBotKey } from '../logic';

export type Verdict = 'applied' | 'not_applied' | undefined;
export type Answers = readonly (readonly unknown[])[];
type Rec = Record<string, unknown>;

export type BotChangeKey = 'loadOlder' | 'createBot' | 'saveSettings' | 'saveGuardrails' | 'decideGate' | 'stopTurn' | 'botAction' | 'createLink' | 'patchLink' | 'panic' | 'repoint' | 'mintKey' | 'rotateKey' | 'keyChange' | 'stopDelegate' | 'channelChange' | 'channelsPause' | 'keyRevokeAll' | 'sendMessage';

export interface BotProof {
  readonly reads: readonly string[];
  /** The entry-level answer: 'state' when some press of it can be proved by a read ('none' is decided per press by `kind`). */
  readonly proofBy: 'state' | 'none';
  /** The answer of this change carries a secret shown once: keep it out of anything shown or logged. */
  readonly secretAnswer: boolean;
  /** The entity only (Bot, link, key, computer, gate). Never a field value or the action of a patch. */
  lockKey(vars: Rec): Rec;
  /** What the hold records: non-secret facts the judge needs. Typed text is a digest. */
  identity(vars: Rec): Rec;
  /** A shared resource this change acts on besides its own entity (the Bot's one running turn), or undefined. */
  serializeOn?(vars: Rec): Rec | undefined;
  /** Whether a read can confirm this press at all ('none': Check cannot confirm it, only Dismiss frees it). */
  kind(identity: unknown): 'state' | 'none';
  validate(answers: Answers, identity: unknown): unknown;
  judge(identity: unknown, parsed: unknown): Verdict;
  proves(identity: unknown, answers: Answers): Verdict;
}

// ── small pure helpers ────────────────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === 'string');
const optStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * A 64-bit digest (two 32-bit FNV-style halves) of a text: equality of the person's own non-secret text. It hides nothing and
 * resists nothing: never use it for a secret, and no proof here rests on one.
 */
export function digest(s: string): string {
  let a = 0x811c9dc5;
  let b = (0x01000193 ^ 0xdeadbeef) >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}
/** The digest of a text as the agent keeps a Bot's name, role and model: trimmed. */
const textKey = (v: unknown): string => digest(str(v).trim());
/** The digest of a text exactly as sent: the route stores it verbatim (a Bot URL key's name and notes). */
const exactKey = (v: unknown): string => digest(str(v));
/** A set of names as one comparable string: trimmed, unique, sorted (empty means "any"). */
const setKey = (v: readonly string[] | null | undefined): string => [...new Set((v ?? []).map((s) => s.trim()).filter((s) => s !== ''))].sort().join('\n');
const sameTime = (a: string | null, b: string | null): boolean => {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
};
/** The agent's own text cleaning for a Bot's instructions: line breaks as \n, odd spaces as ' ', control and format characters dropped, then trimmed. */
export function cleanInstructions(v: unknown): string {
  const t = str(v).replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd').replace(/\r\n/g, '\n');
  let out = '';
  for (const ch of t) {
    if (ch === '\n' || ch === '\t' || ch === ' ') out += ch;
    else if (ch === '\r' || ch === '\u0085' || ch === '\v' || ch === '\f' || /[\u2028\u2029]/.test(ch)) out += '\n';
    else if (/\p{Zs}/u.test(ch)) out += ' ';
    else if (/[\p{Cc}\p{Cf}]/u.test(ch) || '\u034f\u115f\u1160\u3164\uffa0\u2800'.includes(ch)) continue;
    else out += ch;
  }
  return out.trim();
}
/**
 * The route refuses instructions holding a control character other than a line break or a tab, or any invisible format
 * character, BEFORE it cleans them. Such a press changed nothing, so a view whose text equals the cleaned form proves nothing
 * about it (another write may have moved the revision). A text over the length cap or spelling a tag is refused too, but the
 * stored text could never equal its cleaned form, so those need no check here.
 */
export function instructionsRefused(v: unknown): boolean {
  for (const ch of str(v)) {
    if (/\p{Cf}/u.test(ch)) return true;
    if (/\p{Cc}/u.test(ch) && !'\n\t\r\v\f\u0085'.includes(ch)) return true;
  }
  return false;
}
/** What a refused instructions text is recorded as: it can match no view. */
const REFUSED = 'refused';
const instructionsKey = (v: unknown): string => (instructionsRefused(v) ? REFUSED : digest(cleanInstructions(v)));

// ── the raw checks the selects must run (see WIRING): one per read, on the agent's raw answer ──────────

const GUARD_MODES: readonly string[] = ['strict', 'lenient', 'off'];

/** A Bot view (GET /bots/:id) carrying every field a proof reads, each of the right type. */
export function rawViewOk(raw: unknown): boolean {
  if (!isObj(raw)) return false;
  const g = raw.pending_gate;
  const gateOk = g === null || (isObj(g) && typeof g.gate_id === 'string' && g.gate_id !== '' && typeof g.generation === 'number' && Number.isFinite(g.generation));
  return (
    typeof raw.id === 'string' && raw.id !== '' && typeof raw.uid === 'string' && raw.uid !== '' &&
    typeof raw.name === 'string' && typeof raw.role === 'string' && typeof raw.instructions === 'string' && typeof raw.model === 'string' &&
    typeof raw.yolo === 'boolean' && typeof raw.turn_running === 'boolean' && isCount(raw.revision) &&
    typeof raw.guardrail_check === 'string' && GUARD_MODES.includes(raw.guardrail_check) && typeof raw.guardrails === 'string' &&
    isStrArray(raw.allowed_computers) && isStrArray(raw.allowed_agents) && 'pending_gate' in raw && gateOk
  );
}

/** One computer's Bot list (GET /bots): every row has an id and a realm (a uid unless another program owns it) and the counts are numbers. */
export function rawListOk(raw: unknown): boolean {
  if (!isObj(raw) || !Array.isArray(raw.items) || !isObj(raw.meta) || !isCount(raw.meta.total) || !isCount(raw.suspended_count)) return false;
  return raw.items.every((r) => isObj(r) && typeof r.id === 'string' && r.id !== '' && typeof r.realm === 'string' && r.realm !== '' && ((typeof r.uid === 'string' && r.uid !== '') || r.owned_elsewhere === true));
}

/** A log tail (GET /bots/:id/log). */
export function rawLogOk(raw: unknown): boolean {
  return isObj(raw) && Array.isArray(raw.items) && typeof raw.has_more === 'boolean' && raw.items.every((r) => isObj(r) && typeof r.seq === 'number' && Number.isFinite(r.seq));
}

/** The one-row archive read (GET /bots/:id/archive?limit=1). */
export function rawArchiveOk(raw: unknown): boolean {
  return isObj(raw) && Array.isArray(raw.items) && typeof raw.has_more === 'boolean';
}

/** A chat app list (GET /bots/:id/channels): every channel has an id and a boolean `effective.enabled.value`; `meta.total` is a count. */
export function rawChannelsOk(raw: unknown): boolean {
  if (!isObj(raw) || !Array.isArray(raw.items) || !isObj(raw.meta) || !isCount(raw.meta.total)) return false;
  return raw.items.every((c) => {
    if (!isObj(c) || typeof c.id !== 'string' || c.id === '' || !isObj(c.effective) || !isObj(c.effective.enabled)) return false;
    return typeof c.effective.enabled.value === 'boolean';
  });
}

/** One delegate row (GET /bots/:id/delegates): true only when it is open, has no open gate, and its session reported an idle step. */
export function rawDelegateIdle(raw: unknown): boolean {
  return isObj(raw) && raw.state === 'open' && Array.isArray(raw.open_gates) && raw.open_gates.length === 0 && isObj(raw.current_step) && raw.current_step.kind === 'idle';
}

const answersOf = (answers: Answers, i: number): unknown[] => (Array.isArray(answers) && Array.isArray(answers[i]) ? (answers[i] as unknown[]) : []);

// ── what an answer must look like (structural; the page's own types satisfy these) ─────────────────────

/** The Bot's view read: `{ [botKey]: view }`. The Bot's own id and uid are in the view, not just the key it was asked under. */
interface ViewFacts {
  id: string;
  uid: string;
  name: string;
  role: string;
  instructions: string;
  model: string;
  yolo: boolean;
  guardrailCheck: string;
  allowedComputers: string[] | null;
  allowedAgents: string[] | null;
  guardrails: string[];
  guardrailRevision: number;
  gate: { id: string; generation: number } | null;
  turnRunning: boolean;
  turnId: string | null;
  /** WIRING: the Bot's own session id (GET /bots/:id `session_id`); null while it has none. */
  sessionId: string | null;
  /** The worker policy of the view; null when the view carries none (an agent that does not report it proves nothing about it). */
  workers: { backend: string; allowed: string[]; agent: string; model: string } | null;
}

/** A view the select marked well formed (`ok`) and whose own fields are of the right type; anything else is no view. */
function viewOf(v: unknown): ViewFacts | null {
  if (!isObj(v) || v.ok !== true || typeof v.id !== 'string' || v.id === '' || typeof v.uid !== 'string' || v.uid === '') return null;
  if (typeof v.turnRunning !== 'boolean' || typeof v.yolo !== 'boolean' || typeof v.guardrailCheck !== 'string' || !GUARD_MODES.includes(v.guardrailCheck) || !isCount(v.guardrailRevision)) return null;
  if (typeof v.name !== 'string' || typeof v.role !== 'string' || typeof v.instructions !== 'string' || typeof v.model !== 'string' || !isStrArray(v.guardrails)) return null;
  if ((v.allowedComputers !== null && !isStrArray(v.allowedComputers)) || (v.allowedAgents !== null && !isStrArray(v.allowedAgents))) return null;
  const g = v.gate;
  if (g !== null && g !== undefined && !(isObj(g) && typeof g.id === 'string' && g.id !== '' && typeof g.generation === 'number')) return null;
  return {
    id: v.id,
    uid: v.uid,
    name: v.name,
    role: v.role,
    instructions: v.instructions,
    model: v.model,
    yolo: v.yolo,
    guardrailCheck: v.guardrailCheck,
    allowedComputers: v.allowedComputers as string[] | null,
    allowedAgents: v.allowedAgents as string[] | null,
    guardrails: v.guardrails,
    guardrailRevision: v.guardrailRevision,
    gate: g ? { id: (g as Rec).id as string, generation: (g as Rec).generation as number } : null,
    turnRunning: v.turnRunning,
    turnId: optStr(v.turnId),
    sessionId: optStr(v.sessionId),
    workers: workersFacts(v.workers),
  };
}

/** The worker policy of a view when it is a known, well formed one. */
function workersFacts(w: unknown): ViewFacts['workers'] {
  if (!isObj(w) || w.known !== true || typeof w.backend !== 'string' || !isStrArray(w.allowed) || typeof w.agent !== 'string' || typeof w.model !== 'string') return null;
  // The default is one of the allowed backends: a policy that says otherwise is no policy to prove anything with.
  if (w.allowed.length === 0 || !w.allowed.includes(w.backend)) return null;
  return { backend: w.backend, allowed: w.allowed, agent: w.agent, model: w.model };
}

/** The view of this Bot from reads[i]: its own id and uid must be the Bot's. An empty uid names no incarnation: no view. */
function pickView(answers: Answers, i: number, botKey: string, uid: string): ViewFacts | null {
  const p = parseBotKey(botKey);
  if (!p || uid === '') return null;
  for (const a of answersOf(answers, i)) {
    if (!isObj(a)) continue;
    const v = viewOf(a[botKey]);
    if (v && v.id === p.id && v.uid === uid) return v;
  }
  return null;
}

/** One computer's Bots read. WIRING: `computerId` and `ok` come from the select (see the header). */
interface ListFacts {
  rows: Array<{ key: string; id: string; uid: string; name: string; computerId: string }>;
  /** The list's count of suspended Bots (they are omitted from the rows): a non-negative integer, or -1 when it carries none. A row's uid is '' only for a Bot another program owns. */
  suspended: number;
  hasMore: boolean;
}

function pickList(answers: Answers, i: number, computerId: string): ListFacts | null {
  if (computerId === '') return null;
  for (const a of answersOf(answers, i)) {
    if (!isObj(a) || a.ok !== true || str(a.computerId) !== computerId || !Array.isArray(a.rows) || typeof a.hasMore !== 'boolean') continue;
    const rows: ListFacts['rows'] = [];
    let good = true;
    for (const r of a.rows) {
      if (!isObj(r) || typeof r.key !== 'string' || r.key === '' || typeof r.id !== 'string' || r.id === '' || typeof r.uid !== 'string') { good = false; break; }
      rows.push({ key: r.key, id: r.id, uid: r.uid, name: str(r.name), computerId: str(r.computerId) });
    }
    if (!good) continue;
    return { rows, suspended: isCount(a.suspended) ? a.suspended : -1, hasMore: a.hasMore };
  }
  return null;
}

/** One live key of a link, as the agent's API lists it. */
export interface KeyFacts {
  id: string;
  name: string;
  enabled: boolean;
  allowlist: string[];
  expiresAt: string | null;
  notes: string;
  /** The note for the key's holder; '' when none or when the answer carried none. */
  holderNote?: string;
  rotatedAt: string | null;
}
/** One Bot URL. A detached link has `botKey` and `botUid` ''. */
export interface LinkFacts {
  id: string;
  botKey: string;
  botUid: string;
  label: string;
  ownerEnabled: boolean;
  cors: boolean;
  limits: Record<string, number>;
  /** False when the raw link carried no key list: `keys` is then [] and says nothing. */
  keysKnown: boolean;
  keys: KeyFacts[];
}
/** Every Bot URL, with whether the list is whole. WIRING: a `linkIndex` read (GET /bot-urls) built by `toLinkIndex`. */
export interface LinkIndex {
  complete: boolean;
  links: LinkFacts[];
}

function keyFromRaw(k: unknown): KeyFacts | null {
  if (!isObj(k) || typeof k.id !== 'string' || k.id === '' || typeof k.name !== 'string' || typeof k.enabled !== 'boolean') return null;
  if (!isStrArray(k.ipv4_allow) || !('rotated_at' in k) || !(k.rotated_at === null || typeof k.rotated_at === 'string')) return null;
  if (!(k.expires_at === null || typeof k.expires_at === 'string') || !(k.notes === null || typeof k.notes === 'string')) return null;
  // The agent omits holder_note when a key has none: absent and null are no note, but a value of any other type is a malformed key, never an empty note.
  if (k.holder_note !== undefined && k.holder_note !== null && typeof k.holder_note !== 'string') return null;
  return { id: k.id, name: k.name, enabled: k.enabled, allowlist: k.ipv4_allow, expiresAt: k.expires_at as string | null, notes: (k.notes as string | null) ?? '', holderNote: typeof k.holder_note === 'string' ? k.holder_note : '', rotatedAt: k.rotated_at as string | null };
}

function linkFromRaw(u: unknown): LinkFacts | null {
  if (!isObj(u) || typeof u.id !== 'string' || u.id === '' || typeof u.owner_enabled !== 'boolean' || typeof u.cors !== 'boolean' || !isObj(u.limits)) return null;
  let botKey = '';
  let botUid = '';
  if (u.bot !== null) {
    const b = u.bot;
    if (!isObj(b) || typeof b.realm !== 'string' || typeof b.id !== 'string' || typeof b.uid !== 'string' || b.realm === '' || b.id === '' || b.uid === '' || typeof u.computer_id !== 'string' || u.computer_id === '') return null;
    botKey = `${u.computer_id}~${b.realm}~${b.id}`;
    botUid = b.uid;
  }
  let keys: KeyFacts[] = [];
  const keysKnown = Array.isArray(u.keys);
  if (Array.isArray(u.keys)) {
    for (const raw of u.keys) {
      if (isObj(raw) && raw.status === 'revoked') continue;
      const k = keyFromRaw(raw);
      if (!k) return null;
      keys.push(k);
    }
  } else keys = [];
  return {
    id: u.id,
    botKey,
    botUid,
    label: str(u.label),
    ownerEnabled: u.owner_enabled,
    cors: u.cors,
    limits: Object.fromEntries(Object.entries(u.limits).filter((e): e is [string, number] => typeof e[1] === 'number')),
    keysKnown,
    keys,
  };
}

/**
 * Builds the index from the raw `data.bot_urls` array and `data.next_cursor` of the FIRST page (limit 100, no cursor). Every
 * link is kept (a Bot URL is unique per Bot uid, not per Bot key; detached links have no key). The index is whole only when
 * the cursor is exactly null (a missing field, as in a malformed answer, is not whole) and every link read was well formed:
 * a malformed link is left out and the index is then not whole, so no absence is proved from it.
 */
export function toLinkIndex(botUrls: unknown, nextCursor: unknown): LinkIndex {
  if (!Array.isArray(botUrls)) return { complete: false, links: [] };
  const links: LinkFacts[] = [];
  let whole = nextCursor === null;
  for (const u of botUrls) {
    const l = linkFromRaw(u);
    if (l) links.push(l);
    else whole = false;
  }
  return { complete: whole, links };
}

const isKeyFacts = (k: unknown): k is KeyFacts =>
  isObj(k) && typeof k.id === 'string' && k.id !== '' && typeof k.name === 'string' && typeof k.enabled === 'boolean' && isStrArray(k.allowlist) && (k.expiresAt === null || typeof k.expiresAt === 'string') && typeof k.notes === 'string' && (k.holderNote === undefined || typeof k.holderNote === 'string') && (k.rotatedAt === null || typeof k.rotatedAt === 'string');
const isLinkFacts = (l: unknown): l is LinkFacts =>
  isObj(l) && typeof l.id === 'string' && l.id !== '' && typeof l.botKey === 'string' && typeof l.botUid === 'string' && typeof l.label === 'string' && typeof l.ownerEnabled === 'boolean' && typeof l.cors === 'boolean' &&
  isObj(l.limits) && Object.values(l.limits).every((n) => typeof n === 'number') && typeof l.keysKnown === 'boolean' && Array.isArray(l.keys) && l.keys.every(isKeyFacts) && (l.keysKnown || l.keys.length === 0);

/** The index of reads[i]; a link of a malformed shape makes the whole answer no index. */
function pickLinks(answers: Answers, i: number): LinkIndex | null {
  for (const a of answersOf(answers, i)) {
    if (!isObj(a) || typeof a.complete !== 'boolean' || !Array.isArray(a.links) || !a.links.every(isLinkFacts)) continue;
    return { complete: a.complete, links: a.links as LinkFacts[] };
  }
  return null;
}

/** The log tail read: `{ [botKey]: { ok, rows, hasOlder } }`. The Bot is checked through its view (a second read). */
function pickLog(answers: Answers, i: number, botKey: string): { seqs: number[]; hasOlder: boolean } | null {
  for (const a of answersOf(answers, i)) {
    if (!isObj(a)) continue;
    const p = a[botKey];
    if (!isObj(p) || p.ok !== true || !Array.isArray(p.rows) || typeof p.hasOlder !== 'boolean') continue;
    if (!p.rows.every((r) => isObj(r) && typeof r.seq === 'number' && Number.isFinite(r.seq))) continue;
    return { seqs: p.rows.map((r) => (r as Rec).seq as number), hasOlder: p.hasOlder };
  }
  return null;
}

/** WIRING: a new `archive` read (GET /bots/:id/archive?limit=1): `{ [botKey]: { ok, rows, more } }`. */
function pickArchive(answers: Answers, i: number, botKey: string): { rows: number; more: boolean } | null {
  for (const a of answersOf(answers, i)) {
    if (!isObj(a)) continue;
    const p = a[botKey];
    if (isObj(p) && p.ok === true && isCount(p.rows) && typeof p.more === 'boolean') return { rows: p.rows, more: p.more };
  }
  return null;
}

/** The chat apps read: `{ [botKey]: { ok, channels, complete } }`. A channel of a malformed shape makes the answer no list. */
interface ChannelFacts {
  id: string;
  enabled: boolean;
}
function pickChannels(answers: Answers, i: number, botKey: string): { channels: ChannelFacts[]; complete: boolean } | null {
  for (const a of answersOf(answers, i)) {
    if (!isObj(a)) continue;
    const p = a[botKey];
    if (!isObj(p) || p.ok !== true || !Array.isArray(p.channels) || typeof p.complete !== 'boolean') continue;
    if (!p.channels.every((c) => isObj(c) && typeof c.id === 'string' && c.id !== '' && typeof c.enabled === 'boolean')) continue;
    return { channels: (p.channels as Rec[]).map((c) => ({ id: c.id as string, enabled: c.enabled as boolean })), complete: p.complete };
  }
  return null;
}

/** Closed tasks one `delegatesClosedProof` read brings, and the most pages it reads (a Bot with more closed tasks than that may leave a stop-with-close unproven, never wrongly proved). */
export const CLOSED_PROOF_PAGE = 500;
export const CLOSED_PROOF_MAX_PAGES = 20;
/** The pages of a Bot's closed list for its count: 1..n, capped. No count, or none closed, is no page. */
export const closedPagesFor = (count: number | undefined): number[] =>
  count !== undefined && Number.isFinite(count) && count > 0 ? Array.from({ length: Math.min(CLOSED_PROOF_MAX_PAGES, Math.ceil(count / CLOSED_PROOF_PAGE)) }, (_, i) => i + 1) : [];

/** The states a task row can have (the page's own `Delegate.state`); any other value is a malformed row. */
const DELEGATE_STATES: readonly string[] = ['working', 'waiting', 'idle', 'stopping', 'closed'];
const delegateRow = (d: unknown): d is Rec & { sessionId: string; state: string; idle: boolean } =>
  isObj(d) && typeof d.sessionId === 'string' && d.sessionId !== '' && typeof d.state === 'string' && DELEGATE_STATES.includes(d.state) && typeof d.idle === 'boolean';

/** Every task of the Bot in every answer of read `i` (the closed list comes in pages, one answer each), the well formed ones only. */
function pickAllDelegates(answers: Answers, i: number, botKey: string): DelegateFacts[] {
  const out: DelegateFacts[] = [];
  for (const a of answersOf(answers, i)) {
    if (!isObj(a)) continue;
    const p = a[botKey];
    if (!Array.isArray(p)) continue;
    for (const d of p) if (delegateRow(d)) out.push({ sessionId: d.sessionId, state: d.state, idle: d.idle });
  }
  return out;
}

/** The task list read. `idle` is `rawDelegateIdle(raw)`: affirmatively reported idle, with no open gate. */
interface DelegateFacts {
  sessionId: string;
  state: string;
  idle: boolean;
}
function pickDelegates(answers: Answers, i: number, botKey: string): DelegateFacts[] | null {
  for (const a of answersOf(answers, i)) {
    if (!isObj(a)) continue;
    const p = a[botKey];
    if (!Array.isArray(p) || !p.every(delegateRow)) continue;
    return (p as Rec[]).map((d) => ({ sessionId: d.sessionId as string, state: d.state as string, idle: d.idle as boolean }));
  }
  return null;
}

const idOf = (v: Rec): { botKey: string; uid: string } => ({ botKey: str(v.botKey), uid: str(v.uid) });

// ── the table ──────────────────────────────────────────────────────────────────────────────

interface Spec<I extends Rec, P> {
  reads: readonly string[];
  proofBy?: 'state' | 'none';
  secretAnswer: boolean;
  lockKey(vars: Rec): Rec;
  identity(vars: Rec): I;
  serializeOn?(vars: Rec): Rec | undefined;
  kind?(identity: I): 'state' | 'none';
  validate(answers: Answers, identity: I): P | null;
  judge(identity: I, parsed: P): Verdict;
}

/**
 * An entry: validate, then judge. An identity that is not an object, or is missing what the entry needs, judges nothing; no
 * input can make a judge throw (a throw would read as a failed read-back), so each step is guarded.
 */
function entry<I extends Rec, P>(s: Spec<I, P>): BotProof {
  const kind = (identity: unknown): 'state' | 'none' => {
    if (!isObj(identity)) return 'none';
    try {
      return s.kind ? s.kind(identity as I) : 'state';
    } catch {
      return 'none';
    }
  };
  const validate = (answers: Answers, identity: unknown): P | null => {
    if (!isObj(identity) || kind(identity) !== 'state') return null;
    try {
      return s.validate(answers, identity as I);
    } catch {
      return null;
    }
  };
  const judge = (identity: unknown, parsed: unknown): Verdict => {
    if (!isObj(identity) || parsed === null || parsed === undefined) return undefined;
    try {
      return s.judge(identity as I, parsed as P);
    } catch {
      return undefined;
    }
  };
  return {
    reads: s.reads,
    proofBy: s.proofBy ?? 'state',
    secretAnswer: s.secretAnswer,
    lockKey: s.lockKey,
    identity: s.identity,
    ...(s.serializeOn ? { serializeOn: s.serializeOn } : {}),
    kind,
    validate,
    judge,
    proves: (identity, answers) => {
      const p = validate(answers, identity);
      return p === null ? undefined : judge(identity, p);
    },
  };
}

const turnOf = (v: Rec): Rec => ({ resource: 'bot-turn', botKey: str(v.botKey) });

/** A GET that loads older messages: it changes nothing, so any fresh, well formed log answer of that Bot frees it. */
const loadOlder = entry<{ botKey: string }, true>({
  reads: ['log'],
  secretAnswer: false,
  lockKey: (v) => ({ botKey: str(v.botKey) }),
  identity: (v) => ({ botKey: str(v.botKey) }),
  validate: (answers, i) => (i.botKey !== '' && pickLog(answers, 0, i.botKey) ? true : null),
  judge: () => 'applied',
});

/**
 * Create a Bot. Applied: the computer's list (that computer's own, well formed answer) has a Bot with the id the name makes
 * and the same name: the name is taken, so creating it again could only fail. Unknown: no such Bot, a list of another
 * computer. This does not say this press made it, and the link and key steps of the flow are not judged here (the flow
 * reports them); the answer carries a secret when it gives the Bot a first key.
 */
const createBot = entry<{ computerId: string; id: string; name: string }, ListFacts>({
  reads: ['computerBots'],
  secretAnswer: true,
  lockKey: (v) => ({ computerId: str(v.computerId) }),
  identity: (v) => ({ computerId: str(v.computerId), id: botIdFromName(str(v.name)), name: textKey(v.name) }),
  validate: (answers, i) => (i.computerId && i.id && i.name ? pickList(answers, 0, i.computerId) : null),
  judge: (i, l) => (l.rows.some((r) => r.id === i.id && r.computerId === i.computerId && textKey(r.name) === i.name) ? 'applied' : undefined),
});

interface SettingsIdentity extends Rec {
  botKey: string;
  uid: string;
  revision: number | null;
  name: string | null;
  role: string | null;
  instructions: string | null;
  model: string | null;
  yolo: boolean | null;
  guardrailCheck: string | null;
  allowedComputers: string | null;
  allowedAgents: string | null;
  rules: string | null;
  workerBackend: string | null;
  workerAllowed: string | null;
  workerAgent: string | null;
  workerModel: string | null;
}
const rulesKey = (lines: readonly string[]): string => digest(lines.map((l) => l.trim()).filter((l) => l !== '').join('\n'));

/**
 * Save settings (PATCH) and, for the Guardrails section, the rules (PUT) after it. Every PATCH or PUT moves the Bot's
 * revision up, so the view's revision must be above the one the press saw: that ties the read to a write after the press, and
 * the fields tie it to this one. Applied: the Bot's view (its own id and uid) shows every patched field, and the rules when
 * the flow has them, at a newer revision. Unknown: a field that differs (the PATCH may have applied alone, the PUT not yet),
 * another Bot or uid, an unchanged or older revision, a press without its revision.
 */
const saveSettings = entry<SettingsIdentity, ViewFacts>({
  reads: ['view'],
  secretAnswer: false,
  lockKey: (v) => ({ botKey: str(v.botKey) }),
  identity: (v) => {
    const patch = isObj(v.patch) ? v.patch : {};
    const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(patch, k) && patch[k] !== undefined;
    return {
      ...idOf(v),
      revision: isCount(v.revision) ? v.revision : null,
      name: has('name') ? textKey(patch.name) : null,
      role: has('role') ? textKey(patch.role) : null,
      instructions: has('instructions') ? instructionsKey(patch.instructions) : null,
      model: has('model') ? str(patch.model).trim() : null,
      yolo: has('yolo') ? patch.yolo === true : null,
      guardrailCheck: has('guardrail_check') ? str(patch.guardrail_check) : null,
      allowedComputers: has('allowed_computers') ? setKey(strs(patch.allowed_computers)) : null,
      allowedAgents: has('allowed_agents') ? setKey(strs(patch.allowed_agents)) : null,
      rules: Array.isArray(v.rules) ? rulesKey(strs(v.rules)) : null,
      workerBackend: has('worker_backend') ? str(patch.worker_backend).trim() : null,
      workerAllowed: has('allowed_worker_backends') ? setKey(strs(patch.allowed_worker_backends)) : null,
      workerAgent: has('worker_delegated_agent') ? str(patch.worker_delegated_agent).trim() : null,
      workerModel: has('worker_delegated_model') ? str(patch.worker_delegated_model).trim() : null,
    };
  },
  validate: (answers, i) => {
    const touched = [i.name, i.role, i.instructions, i.model, i.yolo, i.guardrailCheck, i.allowedComputers, i.allowedAgents, i.rules, i.workerBackend, i.workerAllowed, i.workerAgent, i.workerModel].some((x) => x !== null && x !== undefined);
    return touched && typeof i.revision === 'number' ? pickView(answers, 0, i.botKey, i.uid) : null;
  },
  judge: (i, v) => {
    if (v.guardrailRevision <= (i.revision as number)) return undefined;
    if (i.name !== null && textKey(v.name) !== i.name) return undefined;
    if (i.role !== null && textKey(v.role) !== i.role) return undefined;
    if (i.instructions !== null && (i.instructions === REFUSED || instructionsKey(v.instructions) !== i.instructions)) return undefined;
    if (i.model !== null && v.model.trim() !== i.model) return undefined;
    if (i.yolo !== null && v.yolo !== i.yolo) return undefined;
    if (i.guardrailCheck !== null && v.guardrailCheck !== i.guardrailCheck) return undefined;
    if (i.allowedComputers !== null && setKey(v.allowedComputers) !== i.allowedComputers) return undefined;
    if (i.allowedAgents !== null && setKey(v.allowedAgents) !== i.allowedAgents) return undefined;
    if (i.rules !== null && rulesKey(v.guardrails) !== i.rules) return undefined;
    // The worker policy is read back as the agent reports it (effective values). A view with none proves nothing about it.
    if ([i.workerBackend, i.workerAllowed, i.workerAgent, i.workerModel].some((x) => x !== null)) {
      const w = v.workers;
      if (!w) return undefined;
      if (i.workerBackend !== null && w.backend !== i.workerBackend) return undefined;
      if (i.workerAllowed !== null && setKey(w.allowed) !== i.workerAllowed) return undefined;
      if (i.workerAgent !== null && w.agent !== i.workerAgent) return undefined;
      if (i.workerModel !== null && w.model !== i.workerModel) return undefined;
    }
    return 'applied';
  },
});

/**
 * Decide a gate. Applied: the Bot's view (its own id and the press's uid) no longer shows that gate (id and generation):
 * nothing is left to answer, whoever ended it. Unknown: the same gate still parked, no view of this Bot, a view of another
 * Bot or uid, a press without its uid. It acts on the Bot's one running turn, so it serializes with stopTurn.
 */
const decideGate = entry<{ botKey: string; uid: string; gate: string; generation: number | null }, ViewFacts>({
  reads: ['view'],
  secretAnswer: false,
  lockKey: (v) => {
    const g = isObj(v.gate) ? v.gate : null;
    return { gate: g ? str(g.id) : '', generation: g && typeof g.generation === 'number' ? g.generation : 0, botKey: str(v.botKey) };
  },
  serializeOn: turnOf,
  identity: (v) => {
    const g = isObj(v.gate) ? v.gate : null;
    return { ...idOf(v), gate: g ? str(g.id) : '', generation: g && typeof g.generation === 'number' ? g.generation : null };
  },
  validate: (answers, i) => (i.gate !== '' && typeof i.generation === 'number' ? pickView(answers, 0, i.botKey, i.uid) : null),
  judge: (i, v) => (v.gate && v.gate.id === i.gate && v.gate.generation === i.generation ? undefined : 'applied'),
});

/**
 * Stop a turn. Applied: the Bot's view (its own id and the press's uid) shows no running turn, or a running turn with a
 * different id: the turn the press named is over. Unknown: that turn still running, a running turn that names no id, a press
 * that named no turn or no uid. It acts on the Bot's one running turn (serializes with decideGate).
 */
const stopTurn = entry<{ botKey: string; uid: string; turnId: string | null }, ViewFacts>({
  reads: ['view'],
  secretAnswer: false,
  lockKey: (v) => ({ botKey: str(v.botKey) }),
  serializeOn: turnOf,
  identity: (v) => ({ ...idOf(v), turnId: optStr(v.turnId) }),
  validate: (answers, i) => (typeof i.turnId === 'string' ? pickView(answers, 0, i.botKey, i.uid) : null),
  judge: (i, v) => (!v.turnRunning || (v.turnId !== null && v.turnId !== i.turnId) ? 'applied' : undefined),
});

type ActionName = 'reset' | 'forget' | 'purge' | 'delete' | 'resume' | 'deleteLink';
const ACTIONS: readonly string[] = ['reset', 'forget', 'purge', 'delete', 'resume', 'deleteLink'];
interface ActionIdentity extends Rec {
  action: ActionName | '';
  botKey: string;
  uid: string;
  computerId: string;
  linkId: string;
  logSeq: number | null;
  suspended: number | null;
}
type ActionParsed =
  | { action: 'delete'; list: ListFacts }
  | { action: 'forget'; log: { seqs: number[]; hasOlder: boolean } }
  | { action: 'purge'; archive: { rows: number; more: boolean } }
  | { action: 'resume'; list: ListFacts }
  | { action: 'deleteLink'; index: LinkIndex };

/**
 * The Bot actions. The reads are the superset; each action uses its own:
 *   delete      applied: the computer's whole list (nothing more, no suspended Bot that could be this one) has no Bot under
 *               that key, or a row under it with a different, non-empty uid (a new incarnation). The computer is the key's.
 *   forget      applied: the log tail is whole (`hasOlder` false) and every row is newer than the newest row the press saw;
 *               the view must show the same uid. Another writer's forget gives the same read, and resending it is pointless.
 *   purge       applied: the archive read (one row) is empty with nothing more; the view must show the same uid.
 *   resume      applied: the press saw suspended Bots and the computer's own list now counts none.
 *   deleteLink  applied: the whole Bot URL index has no link with that id.
 *   reset       kind 'none': a new session id is what any reset leaves, and another reset would start another session and
 *               archive more conversation, so no read ties the change to this send.
 * Unknown for all: a read of another computer, Bot, uid or link, an incomplete list, a press without its baseline.
 */
const botAction = entry<ActionIdentity, ActionParsed>({
  reads: ['computerBots', 'log', 'view', 'archive', 'linkIndex'],
  secretAnswer: false,
  lockKey: (v) => {
    const a = str(v.action);
    const p = parseBotKey(str(v.botKey));
    if (a === 'resume') return { computerId: str(v.computerId) || p?.computerId || '' };
    if (a === 'deleteLink') return { linkId: str(v.linkId) };
    return { botKey: str(v.botKey) };
  },
  identity: (v) => {
    const p = parseBotKey(str(v.botKey));
    const asked = str(v.computerId);
    const action = ACTIONS.includes(str(v.action)) ? (str(v.action) as ActionName) : '';
    // The agent's delete (and every Bot-scoped action) goes to the computer the key names: an explicit computer that
    // disagrees with the key names nothing.
    const computerId = action === 'resume' ? asked || p?.computerId || '' : p && (asked === '' || asked === p.computerId) ? p.computerId : '';
    return {
      action,
      botKey: str(v.botKey),
      uid: str(v.uid),
      computerId,
      linkId: str(v.linkId),
      logSeq: typeof v.logSeq === 'number' && Number.isFinite(v.logSeq) ? v.logSeq : null,
      suspended: isCount(v.suspended) ? v.suspended : null,
    };
  },
  kind: (i) => (i.action === '' || i.action === 'reset' ? 'none' : 'state'),
  validate: (answers, i) => {
    switch (i.action) {
      case 'delete': {
        if (!i.uid || !i.botKey) return null;
        const list = pickList(answers, 0, i.computerId);
        return list ? { action: 'delete', list } : null;
      }
      case 'forget': {
        if (typeof i.logSeq !== 'number' || i.logSeq <= 0 || !pickView(answers, 2, i.botKey, i.uid)) return null;
        const log = pickLog(answers, 1, i.botKey);
        return log ? { action: 'forget', log } : null;
      }
      case 'purge': {
        if (!pickView(answers, 2, i.botKey, i.uid)) return null;
        const archive = pickArchive(answers, 3, i.botKey);
        return archive ? { action: 'purge', archive } : null;
      }
      case 'resume': {
        if (typeof i.suspended !== 'number' || i.suspended <= 0) return null;
        const list = pickList(answers, 0, i.computerId);
        return list ? { action: 'resume', list } : null;
      }
      case 'deleteLink': {
        if (!i.linkId) return null;
        const index = pickLinks(answers, 4);
        return index ? { action: 'deleteLink', index } : null;
      }
      default:
        return null;
    }
  },
  judge: (i, p) => {
    switch (p.action) {
      case 'delete': {
        const row = p.list.rows.find((r) => r.key === i.botKey);
        if (row) return row.uid !== '' && row.uid !== i.uid ? 'applied' : undefined;
        return !p.list.hasMore && p.list.suspended === 0 ? 'applied' : undefined;
      }
      case 'forget':
        return !p.log.hasOlder && p.log.seqs.every((q) => q > (i.logSeq as number)) ? 'applied' : undefined;
      case 'purge':
        return p.archive.rows === 0 && !p.archive.more ? 'applied' : undefined;
      case 'resume':
        return p.list.suspended === 0 ? 'applied' : undefined;
      case 'deleteLink':
        return p.index.complete && !p.index.links.some((l) => l.id === i.linkId) ? 'applied' : undefined;
    }
  },
});

/**
 * Give a Bot a link. A Bot has one live link (the agent refuses a second), so a link under that Bot's uid means a second
 * press could only fail. Applied: the Bot URL index has a link under that Bot key whose Bot uid is the press's. Unknown: no
 * link yet (a second press cannot be told from the first, so that stays a warned dismissal), a link of another uid.
 */
const createLink = entry<{ botKey: string; uid: string; label: string; cors: boolean }, LinkIndex>({
  reads: ['linkIndex'],
  secretAnswer: false,
  lockKey: (v) => ({ botKey: str(v.botKey) }),
  identity: (v) => ({ ...idOf(v), label: textKey(v.label), cors: v.cors === true }),
  validate: (answers, i) => (i.botKey && i.uid ? pickLinks(answers, 0) : null),
  judge: (i, idx) => (idx.links.some((l) => l.botKey === i.botKey && l.botUid === i.uid) ? 'applied' : undefined),
});

/**
 * Change a link. Applied: that link (by id, in the index) shows every field the press set: owner switch, CORS, each limit.
 * Unknown: the link not in the index, any field different, a press that set nothing.
 */
const patchLink = entry<{ linkId: string; enabled: boolean | null; cors: boolean | null; limits: Record<string, number> | null }, LinkFacts>({
  reads: ['linkIndex'],
  secretAnswer: false,
  lockKey: (v) => ({ linkId: str(v.linkId) }),
  identity: (v) => ({
    linkId: str(v.linkId),
    enabled: typeof v.enabled === 'boolean' ? v.enabled : null,
    cors: typeof v.cors === 'boolean' ? v.cors : null,
    limits: isObj(v.limits) ? Object.fromEntries(Object.entries(v.limits).filter((e): e is [string, number] => typeof e[1] === 'number')) : null,
  }),
  validate: (answers, i) => {
    if (!i.linkId || (i.enabled === null && i.cors === null && (!i.limits || Object.keys(i.limits).length === 0))) return null;
    return pickLinks(answers, 0)?.links.find((x) => x.id === i.linkId) ?? null;
  },
  judge: (i, l) => {
    if (typeof i.enabled === 'boolean' && l.ownerEnabled !== i.enabled) return undefined;
    if (typeof i.cors === 'boolean' && l.cors !== i.cors) return undefined;
    if (i.limits) for (const [k, n] of Object.entries(i.limits)) if (l.limits[k] !== n) return undefined;
    return 'applied';
  },
});

/** Panic. Applied: that link is off and its live key list is known and empty. Unknown: anything else. */
const panic = entry<{ linkId: string }, LinkFacts>({
  reads: ['linkIndex'],
  secretAnswer: false,
  lockKey: (v) => ({ linkId: str(v.linkId) }),
  identity: (v) => ({ linkId: str(v.linkId) }),
  validate: (answers, i) => (i.linkId ? (pickLinks(answers, 0)?.links.find((x) => x.id === i.linkId) ?? null) : null),
  judge: (_i, l) => (l.keysKnown && l.keys.length === 0 && !l.ownerEnabled ? 'applied' : undefined),
});

/**
 * Repoint a link to a Bot. Applied: that link id (globally unique) is now listed under the target Bot key, with the target
 * Bot's uid the press carried. Unknown: the link under another Bot or another uid of the same key, a press without the
 * target's uid.
 */
const repoint = entry<{ linkId: string; targetKey: string; uid: string }, LinkIndex>({
  reads: ['linkIndex'],
  secretAnswer: false,
  lockKey: (v) => ({ linkId: str(v.linkId) }),
  identity: (v) => {
    const p = parseBotKey(str(v.botKey));
    const to = str(v.computerId);
    return { linkId: str(v.linkId), targetKey: p && to ? `${to}~${p.realm}~${p.id}` : '', uid: str(v.uid) };
  },
  validate: (answers, i) => (i.linkId && i.targetKey && i.uid ? pickLinks(answers, 0) : null),
  judge: (i, idx) => (idx.links.some((l) => l.id === i.linkId && l.botKey === i.targetKey && l.botUid === i.uid) ? 'applied' : undefined),
});

interface KeyFields {
  name: string;
  allow: string;
  /** The expiry the press set (null: none); undefined when an edit left it alone (not compared). */
  expires: string | null | undefined;
  notes: string;
  /** The holder note the press set (a digest); null when the press left it untouched (an edit that did not change it). */
  holder: string | null;
}
/**
 * A key's name and notes are stored exactly as sent (the notes verbatim, the name case-insensitively unique per link).
 * Hoody API stores the holder note normalized: line breaks (CRLF, CR, U+2028/9) folded to \n, invisible and control characters
 * dropped, trimmed. The form sends it trimmed, so the common note is stored as sent; one the API changed further (pasted CRLF or
 * invisible characters) reads back different and the press stays unknown, never a false 'applied'.
 * An untouched holder note is not compared on an edit; on a new key it means none.
 */
const keyFields = (f: unknown, untouchedIsNone = false): KeyFields | null => (isObj(f) ? { name: exactKey(f.name), allow: setKey(strs(f.allowlist)), expires: f.expiresAt === undefined && !untouchedIsNone ? undefined : optStr(f.expiresAt), notes: exactKey(f.notes), holder: typeof f.holderNote === 'string' ? exactKey(f.holderNote) : untouchedIsNone ? exactKey('') : null } : null);
const keyMatches = (k: KeyFacts, f: KeyFields): boolean => exactKey(k.name) === f.name && setKey(k.allowlist) === f.allow && (f.expires === undefined || sameTime(k.expiresAt, f.expires)) && exactKey(k.notes) === f.notes && (f.holder === null || exactKey(k.holderNote ?? '') === f.holder);

/**
 * Mint a key. A live key name is unique per link (case-insensitively), so a second mint of the same name could only be
 * refused. Applied: the link lists a key that was not among the keys the press saw (`knownKeyIds`) and has the name,
 * allowlist, expiry and notes the press set. That says the key exists, not that this press made it, and the secret was shown
 * once and is lost with the answer: the page must say so (rotate the key for a new one). Unknown: no new matching key, a
 * link whose key list is unknown, a press without its known ids.
 */
const mintKey = entry<{ linkId: string; fields: KeyFields | null; known: string[] | null }, LinkFacts>({
  reads: ['linkIndex'],
  secretAnswer: true,
  lockKey: (v) => ({ linkId: str(v.linkId) }),
  identity: (v) => ({ linkId: str(v.linkId), fields: keyFields(v, true), known: Array.isArray(v.knownKeyIds) ? [...new Set(strs(v.knownKeyIds))].sort() : null }),
  validate: (answers, i) => {
    if (!i.linkId || !i.fields || i.fields.name === exactKey('') || !Array.isArray(i.known)) return null;
    const l = pickLinks(answers, 0)?.links.find((x) => x.id === i.linkId);
    return l && l.keysKnown ? l : null;
  },
  judge: (i, l) => {
    const known = new Set(i.known as string[]);
    return l.keys.some((k) => !known.has(k.id) && keyMatches(k, i.fields as KeyFields)) ? 'applied' : undefined;
  },
});

/**
 * Rotate a key. kind 'none': a new rotation time is what any rotation leaves, and another rotation would issue another
 * secret and end the one in use, so no read ties the change to this send. The new secret is lost with the answer.
 */
const rotateKey = entry<{ linkId: string; keyId: string }, never>({
  reads: [],
  proofBy: 'none',
  secretAnswer: true,
  lockKey: (v) => ({ linkId: str(v.linkId), keyId: str(v.keyId) }),
  identity: (v) => ({ linkId: str(v.linkId), keyId: str(v.keyId) }),
  kind: () => 'none',
  validate: () => null,
  judge: () => undefined,
});

/**
 * A message about a task, sent to the Bot. kind 'none': the agent writes the log row at acceptance, but a lost answer leaves this page without the
 * message id, and the same words may have been sent before, so no row can be tied to this send. The lock is per task, ids only (never the text).
 */
const sendMessage = entry<{ botKey: string; sessionId: string }, never>({
  reads: [],
  proofBy: 'none',
  secretAnswer: false,
  lockKey: (v) => ({ botKey: str(v.botKey), sessionId: str(v.sessionId) }),
  identity: (v) => ({ botKey: str(v.botKey), sessionId: str(v.sessionId) }),
  kind: () => 'none',
  validate: () => null,
  judge: () => undefined,
});

/**
 * Pause, resume, revoke or edit a key.
 *   pause / resume  applied: the key is listed and is off / on.
 *   revoke          applied: the link is listed with a known key list and the key is not in it.
 *   edit            applied: the key shows the name, allowlist, expiry and notes the press set.
 * Unknown: the link or key unlisted (for pause, resume, edit), any difference.
 */
const keyChange = entry<{ linkId: string; keyId: string; action: string; fields: KeyFields | null }, { link: LinkFacts; key: KeyFacts | null }>({
  reads: ['linkIndex'],
  secretAnswer: false,
  lockKey: (v) => ({ linkId: str(v.linkId), keyId: str(v.keyId) }),
  identity: (v) => ({ linkId: str(v.linkId), keyId: str(v.keyId), action: str(v.action), fields: str(v.action) === 'edit' ? keyFields(v.fields) : null }),
  kind: (i) => (['pause', 'resume', 'revoke', 'edit'].includes(str(i.action)) ? 'state' : 'none'),
  validate: (answers, i) => {
    if (!i.linkId || !i.keyId) return null;
    const link = pickLinks(answers, 0)?.links.find((x) => x.id === i.linkId);
    return link ? { link, key: link.keys.find((x) => x.id === i.keyId) ?? null } : null;
  },
  judge: (i, p) => {
    switch (i.action) {
      case 'pause':
        return p.key && !p.key.enabled ? 'applied' : undefined;
      case 'resume':
        return p.key && p.key.enabled ? 'applied' : undefined;
      case 'revoke':
        return !p.key && p.link.keysKnown ? 'applied' : undefined;
      case 'edit':
        return p.key && i.fields && keyMatches(p.key, i.fields) ? 'applied' : undefined;
      default:
        return undefined;
    }
  },
});

/**
 * Stop a task. The session id is the task's own identity. Applied: that session (the answer's own) is listed closed (the closed
 * list read while the stop is pending, every page of it, since the agent lists the closed ones by when they were opened), or (for a stop
 * that does not close it) its session is in the open list and reported an idle step with no open gate (`idle`). Unknown: the
 * session in neither list, or past the pages the closed read covers; working, waiting, in a gate step, or an open session that
 * has not reported its step. A session missing from the open list is not proof it closed (it may have gone another way): only
 * the closed list shows it closed.
 */
const stopDelegate = entry<{ botKey: string; sessionId: string; close: boolean }, DelegateFacts>({
  reads: ['delegates', 'delegatesClosedProof'],
  secretAnswer: false,
  lockKey: (v) => ({ botKey: str(v.botKey), sessionId: str(v.sessionId) }),
  identity: (v) => ({ botKey: str(v.botKey), sessionId: str(v.sessionId), close: v.close === true }),
  validate: (answers, i) => {
    if (!i.botKey || !i.sessionId) return null;
    // Closure is proved by the closed read alone, on any page, whatever the open read shows; the open read (which lists no closed
    // row) only serves a stop that does not close.
    const closed = pickAllDelegates(answers, 1, i.botKey).find((x) => x.sessionId === i.sessionId && x.state === 'closed');
    if (closed) return closed;
    return pickDelegates(answers, 0, i.botKey)?.find((x) => x.sessionId === i.sessionId && x.state !== 'closed') ?? null;
  },
  judge: (i, d) => {
    if (d.state === 'closed') return 'applied';
    return !i.close && d.state === 'idle' && d.idle ? 'applied' : undefined;
  },
});

/**
 * Chat app changes, by action.
 *   enable/disable  applied: the channel (its id is its own identity) is listed and is on / off.
 *   remove          applied: the Bot's channel list is whole and the channel is not in it; the view must show the same
 *                   uid (a channel list does not echo its Bot).
 *   create:<kind>   kind 'none': a new channel of that kind with that label is what any create leaves; another writer's
 *                   gives the same read and nothing in it carries the credentials this press sent.
 *   credentials, ownerCode: nothing readable changes (a replaced token, a code shown once): kind 'none', always unknown.
 *   rename, homeSet, homeClear, chatApprove, chatMute, chatForget, personAdd, personEdit, personRemove, invite, webhookRemove,
 *   settings, chatSettings, botSettings: kind 'none'. A read after the change shows the result, but not that this press made it
 *   (another writer's change reads the same), so only Check again's re-read and a dismiss free a lost answer; nothing is resent.
 */
const channelChange = entry<{ botKey: string; uid: string; action: string; channelId: string }, { channels: ChannelFacts[]; complete: boolean }>({
  reads: ['channels', 'view'],
  secretAnswer: true,
  lockKey: (v) => ({ botKey: str(v.botKey), channelId: str(v.channelId) }),
  identity: (v) => ({ ...idOf(v), action: str(v.action), channelId: str(v.channelId) }),
  kind: (i) => (['enable', 'disable', 'remove'].includes(str(i.action)) ? 'state' : 'none'),
  validate: (answers, i) => {
    if (!i.botKey || !i.channelId) return null;
    if (i.action === 'remove' && !pickView(answers, 1, i.botKey, i.uid)) return null;
    return pickChannels(answers, 0, i.botKey);
  },
  judge: (i, c) => {
    if (i.action === 'enable' || i.action === 'disable') {
      const x = c.channels.find((y) => y.id === i.channelId);
      return x && x.enabled === (i.action === 'enable') ? 'applied' : undefined;
    }
    return c.complete && !c.channels.some((y) => y.id === i.channelId) ? 'applied' : undefined;
  },
});

/**
 * Pause all / Resume all chat apps. Applied: the Bot's channel settings read (its `ok` marker: the answer carried the
 * effective pause state) shows the state the press wanted, and the view of the same refresh shows the uid the press carried
 * (a Bot made again under the same name is another Bot). The Bot-level setting is unique to the change: a second writer
 * wanting the same state leaves the same read, and sending it again would be pointless. One lock for pause and resume alike.
 */
const channelsPause = entry<{ botKey: string; uid: string; paused: boolean }, { paused: boolean }>({
  reads: ['channelSettings', 'channels', 'view'],
  secretAnswer: false,
  lockKey: (v) => ({ botKey: str(v.botKey) }),
  identity: (v) => ({ botKey: str(v.botKey), uid: str(v.uid), paused: v.paused === true }),
  validate: (answers, i) => {
    if (!i.botKey || !pickView(answers, 2, i.botKey, i.uid)) return null;
    for (const a of answersOf(answers, 0)) {
      const p = isObj(a) ? a[i.botKey] : undefined;
      if (isObj(p) && p.ok === true && typeof p.paused === 'boolean') return { paused: p.paused };
    }
    return null;
  },
  judge: (i, s) => (s.paused === i.paused ? 'applied' : undefined),
});

/**
 * Revoke every key of a link. Applied: the link (its own id) is listed whole with its keys known and none left. A key minted
 * since reads as a key and stays unknown; a link not listed (one page) or with an unknown key list proves nothing.
 */
const keyRevokeAll = entry<{ linkId: string }, LinkFacts>({
  reads: ['linkIndex'],
  secretAnswer: false,
  lockKey: (v) => ({ linkId: str(v.linkId) }),
  identity: (v) => ({ linkId: str(v.linkId) }),
  validate: (answers, i) => (i.linkId ? (pickLinks(answers, 0)?.links.find((x) => x.id === i.linkId) ?? null) : null),
  judge: (_i, l) => (l.keysKnown && l.keys.length === 0 ? 'applied' : undefined),
});

/** One table of the entries, by the change's key (data.ts `useChange` first argument). `saveGuardrails` is `saveSettings` with rules. */
export const BOT_PROOFS: { readonly [K in BotChangeKey]: BotProof } = {
  loadOlder,
  createBot,
  saveSettings,
  saveGuardrails: saveSettings,
  decideGate,
  stopTurn,
  botAction,
  createLink,
  patchLink,
  panic,
  repoint,
  mintKey,
  rotateKey,
  keyChange,
  stopDelegate,
  channelChange,
  channelsPause,
  keyRevokeAll,
  sendMessage,
};

export const proofFor = (key: string): BotProof | undefined => (Object.prototype.hasOwnProperty.call(BOT_PROOFS, key) ? BOT_PROOFS[key as BotChangeKey] : undefined);

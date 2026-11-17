// The hooks of Settings → Rules & hooks: what listHooks says, which settings file each
// hook is in, when a hook may be changed, the bodies of the guarded writes and the proof of a write whose answer was lost.
// No words and no requests live here.
//
// A hook carries no scope. Its `source` is the settings FILE it was declared in, and `files` maps each scope to its path (the
// agent compares them the same way). A hook is changed only when exactly one file names it; anything else is read-only with
// the reason. The agent still validates every write; the checks here keep an obviously wrong one from leaving.
import { findHidden } from './hidden';
import { SCOPES, whenOf, type RuleScope } from './logic';

export const HOOK_EVENTS = ['Notification', 'PostToolUse', 'PreCompact', 'PreToolUse', 'SessionEnd', 'SessionStart', 'Stop', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit'] as const;

/** One hook as listHooks shows it. `matcher` '' is the wildcard group. */
export interface HookRow {
  event: string;
  matcher: string;
  command: string;
  timeout: number | null;
  /** The settings file that declares it. */
  source: string;
  /** Switched off by itself (the encoding the agent writes for "off"); it never runs. */
  disabled: boolean;
  label: string;
  description: string;
  /** The hook's condition over the acting agent's calls of its turn (call_when; Stop and SubagentStop only), verbatim; [] is none. */
  when: string[];
  /** The agent sent a condition this page cannot carry whole: the hook keeps it in place, but a replace (which writes a new hook) is
   *  refused, since it would drop it. */
  whenBad: boolean;
  /** The agent turned it off because its command or matcher holds a character a screen does not show: where it is in its
   *  file, so it can be deleted by place. null for every other hook, and for one whose place the agent did not send whole. */
  hidden: HookPlace | null;
  /** Whether what the hook RUNS ON, as the agent sent it whole (event, matcher, command), holds a character a screen does not show, or
   *  its condition cannot be read (and so not checked). Its label and description are only shown (marked), never run, so
   *  they do not count (ZWJ emoji, ZWNJ and RLM are real text in a name). */
  rawHidden: boolean;
  /** The agent turned it off for this reason (`disabled_reason`, as sent; '' none). A hook it turned off is never toggled or edited
   *  here: its text as listed is not the text in the file. */
  agentOff: string;
}
/**
 * Where a hook the agent turned off for hidden characters is: its matcher group's index and its
 * own index in the file's list for the event, the matcher EXACTLY as listed (marked, "*" kept: the agent compares the marked text of
 * the group's own matcher, so a folded one names nothing) and the class the agent named. The command is the row's own, as listed.
 */
export interface HookPlace { matcherIndex: number; index: number; matcher: string; cls: string }
/** The reason the agent gives for a hook it turned off for hidden characters. */
export const HIDDEN_REASON = 'hidden_characters';
/** The events a hook with a condition may have (the agent refuses `when` on any other). */
export const WHEN_EVENTS: readonly string[] = ['Stop', 'SubagentStop'];
export interface HookFile { scope: RuleScope; path: string; exists: boolean; setsDisableAll: boolean }
/** The agent's trust verdict for the hooks it would run. `unverifiable` is the list of targets it cannot check (empty: none); a
 *  non-empty list is what makes an acknowledgement a high-risk one. */
export interface HookTrust { state: string; hash: string; reason: string; unverifiable: readonly string[]; ackedBy: string }
/** How many unverifiable targets, and how long each, the page carries: past either the read is refused whole, because the person
 *  is asked to trust exactly the list shown and a cut list would hide part of it. */
export const UNVERIFIABLE_MAX = 100;
export const TARGET_MAX = 1000;
export interface HooksBlock {
  hooks: HookRow[];
  /** The kill switch is on in the settings now (every hook is off whatever its own state). */
  killed: boolean;
  files: HookFile[];
  /** The running chats were started with other hooks than the settings hold now. */
  stale: boolean;
  warnings: string[];
  trust: HookTrust;
}

/** A hooks block with the place it was read for. */
export interface HooksRead { block: HooksBlock; realm: string; cwd: string | null }

const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const isScope = (x: unknown): x is RuleScope => typeof x === 'string' && (SCOPES as readonly string[]).includes(x);
const str = (x: unknown, max: number): string => (typeof x === 'string' ? x.slice(0, max) : '');
/** An identity field (event, matcher, command) is kept VERBATIM: a write names a hook by exactly these, so a cut value could name another
 *  hook. Only a field past this size is not carried at all (the hook is read-only), never cut. */
export const IDENTITY_MAX = 4096;

/** The matcher the agent groups by: nothing and "*" are the one wildcard group. */
export const matcherKey = (m: string): string => (m === '*' ? '' : m);
/** A settings path compared as the agent does for its own table: slashes collapsed, no trailing slash. */
export const cleanPath = (p: string): string => { const q = p.replace(/\/{2,}/g, '/'); return q.length > 1 ? q.replace(/\/+$/, '') : q; };

/** A place index the agent can take: a whole number, 0 or more. */
const place = (x: unknown): number | null => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : null);

/** A hook's place, read ONLY when the agent says it turned the hook off for hidden characters: position fields on any other row are
 *  ignored, so no ordinary hook is ever deleted by place. A place not sent whole is no place (the hook is then not deleted here). */
function placeOf(r: Record<string, unknown>, reason: string): HookPlace | null {
  if (reason !== HIDDEN_REASON || r.disabled !== true) return null;
  const mi = place(r.matcher_index);
  const i = place(r.index);
  if (mi === null || i === null) return null;
  return { matcherIndex: mi, index: i, matcher: typeof r.matcher === 'string' ? r.matcher : '', cls: str(r.hidden_class, 200) };
}

/** Whether a field as the agent sent it, whole (before any cut), holds a character a screen does not show. */
const rawHolds = (x: unknown): boolean => typeof x === 'string' && findHidden(x) !== null;

function hookOf(x: unknown): HookRow | null {
  const r = rec(x);
  if (!r || typeof r.event !== 'string' || r.event === '' || typeof r.command !== 'string') return null;
  const t = r.timeout;
  const when = whenOf(r.when);
  const reason = typeof r.disabled_reason === 'string' ? r.disabled_reason.slice(0, 200) : '';
  return {
    event: r.event, matcher: matcherKey(typeof r.matcher === 'string' ? r.matcher : ''), command: r.command, timeout: typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : null,
    source: str(r.source, 4096), disabled: r.disabled === true || reason !== '', label: str(r.label, 200), description: str(r.description, 1000),
    when: when ?? [], whenBad: when === null, hidden: placeOf(r, reason), agentOff: reason,
    // A condition the page cannot read cannot be checked for one either: it counts as holding one (fail closed).
    rawHidden: [r.event, r.matcher, r.command].some(rawHolds) || when === null,
  };
}

/** The agent's list of unverifiable targets (absent or null: none). null when it is not a list of short strings. */
function unverifiableOf(x: unknown): readonly string[] | null {
  if (x === undefined || x === null) return [];
  if (!Array.isArray(x) || x.length > UNVERIFIABLE_MAX) return null;
  const out: string[] = [];
  for (const t of x) {
    if (typeof t !== 'string' || t === '' || t.length > TARGET_MAX) return null;
    out.push(t);
  }
  return out;
}

/**
 * The reply of listHooks. null when it cannot be read as a whole: a hook left out of a list that a person then acts on would
 * make a missing hook look removed, so a partial block is never returned.
 */
export function hooksBlockOf(raw: unknown): HooksBlock | null {
  const r = rec(raw);
  const live = rec(r?.live);
  if (!r || r.status !== 'ok' || !live) return null;
  const list = live.hooks === undefined || live.hooks === null ? [] : live.hooks;
  if (!Array.isArray(list)) return null;
  const hooks: HookRow[] = [];
  for (const x of list) {
    const h = hookOf(x);
    if (!h) return null;
    hooks.push(h);
  }
  const files: HookFile[] = [];
  const rf = r.files === undefined || r.files === null ? [] : r.files;
  if (!Array.isArray(rf)) return null;
  for (const x of rf) {
    const f = rec(x);
    if (!f || !isScope(f.scope) || typeof f.path !== 'string' || f.path === '') return null;
    if (files.some((y) => y.scope === f.scope)) return null;
    files.push({ scope: f.scope, path: f.path, exists: f.exists === true, setsDisableAll: f.sets_disable_all === true });
  }
  const tr = rec(r.trust);
  const targets = unverifiableOf(tr?.unverifiable);
  if (!targets) return null;
  const trust: HookTrust = { state: typeof tr?.state === 'string' ? tr.state : 'none', hash: str(tr?.hash, 200), reason: str(tr?.reason, 500), unverifiable: targets, ackedBy: str(tr?.acked_by, 200) };
  // Whole, never cut or counted down: a proof reads them to know which file the loader skipped (the path can sit anywhere in the text,
  // and the project layer's warning comes after however many the user layer wrote). Only a DISPLAY cuts them.
  const warnings = Array.isArray(live.warnings) ? (live.warnings as unknown[]).filter((w): w is string => typeof w === 'string') : [];
  return { hooks, killed: live.disabled === true, files, stale: r.stale === true, warnings, trust };
}

/** The scope whose file declared this hook: the one file whose path is its source. null when none or more than one does. */
export function scopeOf(b: HooksBlock, h: HookRow): RuleScope | null {
  if (h.source === '') return null;
  const hit = b.files.filter((f) => cleanPath(f.path) === cleanPath(h.source));
  return hit.length === 1 ? hit[0]!.scope : null;
}

export type NoChange = 'unplaced' | 'folder' | 'empty' | 'long' | 'twin' | 'ascii' | 'hidden' | 'agent' | 'hiddenText' | 'whenBad' | 'noPlace';
export type Changeable = { ok: true; scope: RuleScope } | { ok: false; why: NoChange };
/** Whether a hook can be NAMED by a write: the agent reads an empty command as "every command of the group", and a field it cannot carry
 *  whole would name another hook, so such a hook is never written to. */
export function nameable(h: HookRef): NoChange | null {
  if (h.command === '') return 'empty';
  if (NON_ASCII.test(h.matcher)) return 'ascii';
  if (h.event.length > IDENTITY_MAX || h.matcher.length > IDENTITY_MAX || h.command.length > IDENTITY_MAX) return 'long';
  return null;
}
/**
 * Whether this hook may be changed from this place. A Realm place (no folder) changes the realm's own hooks only; a folder
 * place changes all three files. A hook in a file the place does not own is read-only: choose its folder first. A hook that cannot be
 * named whole (empty command, a field too long) is read-only whatever the place.
 */
export function canChange(b: HooksBlock, h: HookRow, cwd: string | undefined): Changeable {
  const scope = scopeOf(b, h);
  if (scope === null) return { ok: false, why: 'unplaced' };
  // A hook the agent turned off is listed by text that is not the file's (marked), so the triple cannot name it: never toggled or edited.
  if (h.agentOff !== '') return { ok: false, why: h.agentOff === HIDDEN_REASON ? 'hidden' : 'agent' };
  const bad = nameable(h);
  if (bad) return { ok: false, why: bad };
  if (scope !== 'user' && cwd === undefined) return { ok: false, why: 'folder' };
  // Another hook of the same file the agent cannot tell from this one: a toggle would reach the first of them and a delete all of them.
  // A hook whose file is not known counts as possibly the same file.
  if (b.hooks.some((o) => o !== h && sameHook(o, h) && (scopeOf(b, o) === scope || scopeOf(b, o) === null))) return { ok: false, why: 'twin' };
  return { ok: true, scope };
}

/**
 * Whether a hook the agent turned off for hidden characters may be deleted from this place, by its place (the only write it takes).
 * The scope and folder rules are canChange's; the twin rule is not needed (the agent removes only the hidden hook at that place
 * whose marked text is the one sent, and never a hook it runs). A row without a place is never deleted here.
 */
export function canRemoveHidden(b: HooksBlock, h: HookRow, cwd: string | undefined): Changeable {
  // The agent turned it off for hidden characters but did not say where it is (an agent that lists no place): only an agent can remove it.
  if (!h.hidden) return { ok: false, why: h.agentOff === HIDDEN_REASON ? 'noPlace' : h.agentOff === '' ? 'hidden' : 'agent' };
  const scope = scopeOf(b, h);
  if (scope === null) return { ok: false, why: 'unplaced' };
  const bad = placeable(h);
  if (bad) return { ok: false, why: bad };
  if (scope !== 'user' && cwd === undefined) return { ok: false, why: 'folder' };
  return { ok: true, scope };
}
/**
 * Whether what a hook runs on (its event, matcher, command or a condition atom) holds a character a screen does not show
 * (the agent's classes). The agent turns such a hook off and lists it marked; an older agent lists it raw and still runs it.
 * Such a hook is never toggled or edited here (an edit form would hold the raw character unseen, and turning it on would run text the
 * person cannot read): it can only be deleted. Its label and description are shown marked and never run, so they do not lock it.
 */
export function hidesText(h: Pick<HookRow, 'event' | 'matcher' | 'command' | 'when'> & { rawHidden?: boolean }): boolean {
  // rawHidden: the agent's whole fields or an unreadable condition; the rest: the row as kept.
  return h.rawHidden === true || [h.event, h.matcher, h.command, ...h.when].some((x) => findHidden(x) !== null);
}
/**
 * Whether a delete by place can name this hook: the agent requires the command. No length bound: the agent removes
 * only the entry at that place whose marked text is exactly the text sent, so a long text cannot reach another hook, and a hook padded
 * with hidden characters (each marks to eight units) must stay removable. The hold records a digest of the text, never the text.
 */
export function placeable(h: { command: string; hidden: HookPlace | null }): NoChange | null {
  return !h.hidden || h.command === '' ? 'empty' : null;
}
/**
 * A bounded name for a hook's text in the hold record, for every op (core keeps each record under its size cap): two FNV-1a hashes over the
 * UTF-16 units, plus the length. It only tells holds apart; nothing is checked against it. The @core barrel exports no synchronous
 * digest (fallbackDigest is core-internal and pages import the barrels only), so this one is local.
 */
export function placeDigest(text: string): string {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 0x2c1b3c6e) >>> 0;
  }
  return `${text.length}:${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** Which scopes' kill switch this place may set. */
export function killScopes(b: HooksBlock, cwd: string | undefined): RuleScope[] {
  return b.files.map((f) => f.scope).filter((s) => s === 'user' || cwd !== undefined);
}

export interface HookRef { event: string; matcher: string; command: string }
export const refOf = (h: HookRow): HookRef => ({ event: h.event, matcher: h.matcher, command: h.command });

/**
 * The agent names a hook by event + a CANONICAL matcher + the exact command: trimmed; "" and "*"
 * one wildcard; a plain name ([A-Za-z0-9_]+) an exact tool, where a Claude Code alias stands for the tools it covers ("Bash" = "bash",
 * "Glob" = "LS"); anything else is its own trimmed text. A toggle reaches the FIRST group of the same canonical matcher and a delete EVERY
 * one, so two rows the agent cannot tell apart are one target to it. CC_ALIASES mirrors the agent's alias sets: a plain name with a
 * capital letter that is not in it may be an alias this copy lacks, so it is treated as possibly equal to any plain name (fails closed).
 */
const CC_ALIASES: Record<string, string> = {
  Bash: 'bash', Edit: 'edit_file,edit_minified_file', MultiEdit: 'edit_file,edit_minified_file', Write: 'write_file,write_minified_file', Delete: 'delete_file',
  Read: 'read_file,read_minified_file', Glob: 'glob_files', LS: 'glob_files', Grep: 'grep', Task: 'spawn_agent', TodoWrite: 'todo_write',
  TodoRead: 'todo_read', WebSearch: 'web_search', WebFetch: 'web_fetch',
};
const PLAIN = /^[A-Za-z0-9_]+$/;
/** Go's strings.TrimSpace trims Unicode White_Space (U+0085, U+00A0, ...) and keeps U+FEFF; JavaScript's trim() trims U+FEFF and keeps U+0085.
 *  The two cannot be made to agree here, so the page trims ASCII whitespace only (the same in both) and gives up on any matcher with a
 *  character outside printable ASCII (a non-ASCII or control character): such a matcher is never written to, and may be the twin of ANY other matcher of the same event and command. */
const NON_ASCII = /[^\x20-\x7e\t\n\v\f\r]/;
const ASCII_SPACE = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g;
/** The trim the agent applies to a matcher, restricted to ASCII whitespace (see above). */
export const asciiTrim = (s: string): string => s.replace(ASCII_SPACE, '');
/** A canonical form for comparing, the unknown-plain marker, or the marker of a matcher that cannot be compared at all. */
function canonMatcher(m: string): string {
  if (NON_ASCII.test(m)) return '?any';
  const t = m.replace(ASCII_SPACE, '');
  if (t === '' || t === '*') return 'wild:';
  const a = Object.prototype.hasOwnProperty.call(CC_ALIASES, t) ? CC_ALIASES[t] : undefined;
  if (a !== undefined) return `set:${a}`;
  if (PLAIN.test(t)) return /[A-Z]/.test(t) ? '?plain' : `set:${t}`;
  return `raw:${t}`;
}
/** Whether the agent may take two matchers for one group. Unsure counts as yes (and a matcher with a non-ASCII character is unsure about everything). */
export function sameMatcher(a: string, b: string): boolean {
  const x = canonMatcher(a);
  const y = canonMatcher(b);
  if (x === '?any' || y === '?any') return true;
  if (x === '?plain') return y === '?plain' || y.startsWith('set:');
  if (y === '?plain') return x.startsWith('set:');
  return x === y;
}
/** Two hook rows the agent cannot tell apart (same event, same exact command, matchers it may take for one group). */
export const sameHook = (a: HookRef, b: HookRef): boolean => a.event === b.event && a.command === b.command && sameMatcher(a.matcher, b.matcher);

export interface BaseArgs { sessionId: string; nonce: string; scope: RuleScope }
/**
 * A toggle names the hook by event + matcher + the exact command and says the state wanted (`disabled`). The matcher is left out
 * for the wildcard group. It never names a shipped hook and never leaves the command out (that would address a whole group).
 */
export function toggleBody(a: BaseArgs & { hook: HookRef; disabled: boolean }) {
  return {
    session_id: a.sessionId, nonce: a.nonce, scope: a.scope, event: a.hook.event,
    ...(matcherKey(a.hook.matcher) !== '' ? { matcher: a.hook.matcher } : {}), command: a.hook.command, disabled: a.disabled,
  };
}
/** A delete names the hook by event + matcher + the exact command: never the command left out (that deletes every command of the group). */
export function deleteBody(a: BaseArgs & { hook: HookRef }) {
  return {
    session_id: a.sessionId, nonce: a.nonce, scope: a.scope, event: a.hook.event,
    ...(matcherKey(a.hook.matcher) !== '' ? { matcher: a.hook.matcher } : {}), command: a.hook.command,
  };
}
/**
 * A delete by place (the agent's hooks.delete, the position form): event, the group's index and the hook's index, and the matcher
 * and command exactly as the agent listed them. The matcher is always sent, "" and "*" included, never folded. Only a hook the
 * agent turned off for hidden characters is ever named this way.
 */
export function placeDeleteBody(a: BaseArgs & { event: string; command: string; place: HookPlace }) {
  return {
    session_id: a.sessionId, nonce: a.nonce, scope: a.scope, event: a.event,
    matcher: a.place.matcher, command: a.command, matcher_index: a.place.matcherIndex, index: a.place.index,
  };
}
/** `value` is always sent: the agent reads an absent value as false, which switches the kill switch OFF. */
export function disableAllBody(a: BaseArgs & { value: boolean }) {
  return { session_id: a.sessionId, nonce: a.nonce, scope: a.scope, value: a.value };
}

/**
 * What one add or update of a hook says. `timeout` is ALWAYS sent, whole seconds (0: the agent's default for the event): an update
 * that leaves it out DELETES the stored one. `name` and `description` are left out when empty (an update keeps what it has; a new hook
 * needs both). The matcher is left out for the wildcard group.
 */
export interface UpsertFields { event: string; matcher: string; command: string; timeout: number; name?: string; description?: string; when?: string[] }
/** An upsert names the hook by event + matcher + the exact command; a different command is a different hook. */
export function upsertBody(a: BaseArgs & { fields: UpsertFields }) {
  const f = a.fields;
  return {
    session_id: a.sessionId, nonce: a.nonce, scope: a.scope, event: f.event,
    ...(matcherKey(f.matcher) !== '' ? { matcher: f.matcher } : {}), command: f.command, timeout: f.timeout,
    ...(f.name ? { name: f.name } : {}), ...(f.description ? { description: f.description } : {}),
    // Only the add of a replace carries a condition (the old hook's). An update in place leaves `when` out, and the agent keeps the stored
    // condition when the key is absent.
    ...(f.when && f.when.length > 0 ? { when: [...f.when] } : {}),
  };
}
/** A test runs one UNSAVED command now (the inline form): no hook is named and nothing is written. */
export function testBody(a: { sessionId: string; event: string; command: string; timeout: number }) {
  return { session_id: a.sessionId, event: a.event, command: a.command, ...(a.timeout > 0 ? { timeout: a.timeout } : {}) };
}

export type HookOp = 'toggle' | 'delete' | 'disable_all' | 'upsert' | 'trust';
/** The nonce op of each write that mints one. A trust acknowledgement takes no nonce (it presents the reviewed hash). */
export const OP_OF: Record<Exclude<HookOp, 'trust'>, 'toggle' | 'delete' | 'set_disabled' | 'upsert'> = { toggle: 'toggle', delete: 'delete', disable_all: 'set_disabled', upsert: 'upsert' };

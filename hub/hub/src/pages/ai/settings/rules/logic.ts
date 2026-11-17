// The checked rules of Settings → Rules & safety: what the agent's rules block says, which
// settings scope each rule is in, when a scope may be edited, and the checks the Hub makes before it sends anything. No
// words and no requests live here.
//
// A write replaces ONE scope's COMPLETE list (setHookRules), so the Hub edits a scope only when it can show that list whole:
// the read must be complete (`rules_complete`), the scope's revision must be there, and every rule must say which scope it
// is in (the agent adds `scope` to each rule row; the Hub never guesses it from the `source` path). A read that cannot meet that
// is shown read-only with its reason. The agent still validates everything on its side; the checks here only keep an
// obviously wrong list from being sent.
export const SCOPES = ['user', 'project', 'local'] as const;
export type RuleScope = (typeof SCOPES)[number];
export const KINDS = ['limit', 'check_in', 'guidance', 'playbook'] as const;
export type RuleKind = (typeof KINDS)[number];
/** A scope holds at most 32 checked rules and 32 prompt (guidance and playbook) rules, counted apart. */
export const CAP = 32;
export const MAX_TEXT = 500;
const MAX_TOOLS = 32;
const MAX_AGENTS = 16;
const MAX_NAME = 128;

/** One rule as the agent stores it (what a write sends back). `when`: the rule's condition over the acting agent's calls of its turn
 *  (call_when; checked rules only), kept verbatim; [] is no condition. The page shows it and carries it, and never edits it. */
export interface Rule { id: string; text: string; kind: RuleKind; tools: string[]; agents: string[]; when: string[] }
/** A rule as a read shows it: where it lives (null: the agent did not say) and, for a project or local rule, its folder.
 *  `whenBad`: the agent sent a condition this page cannot carry whole, so the rule's scope is read only (a write would drop it). */
export interface RuleRow extends Rule { scope: RuleScope | null; folder: string | null; whenBad: boolean }
export interface ExecGrant { containerId: string; realm: string; name: string }
export interface RulesBlock {
  rules: RuleRow[];
  /** Each scope the read could read, with the revision a write to it is checked against. */
  revisions: Partial<Record<RuleScope, string>>;
  /** `rules_complete` and no rule warning: `rules` holds every rule the files declare. */
  complete: boolean;
  warnings: string[];
  timeoutMs: number | null;
  /** The user scope's per-container exec trust grants, shown and never written by this page. */
  execTrust: ExecGrant[];
}

const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const isKind = (x: unknown): x is RuleKind => typeof x === 'string' && (KINDS as readonly string[]).includes(x);
const isScope = (x: unknown): x is RuleScope => typeof x === 'string' && (SCOPES as readonly string[]).includes(x);
const strings = (x: unknown): string[] | null => (Array.isArray(x) && x.every((s) => typeof s === 'string') ? (x as string[]) : null);

/** The agent's bounds on a condition (the agent's maxWhenAtoms and maxWhenAtomBytes; an empty atom
 *  is refused). The agent checks each atom's syntax; the page only refuses what it could not send back whole. */
export const WHEN_ATOMS_MAX = 8;
export const WHEN_ATOM_BYTES_MAX = 1024;
const whenEnc = new TextEncoder();
/** A condition as read: absent or null is none ([]); a list of 1..8 non-empty strings of at most 1024 bytes is kept verbatim. null:
 *  any other shape (the row is then read only, never sent without it). Shared with the hooks (hooks.ts). */
export function whenOf(x: unknown): string[] | null {
  if (x === undefined || x === null) return [];
  const a = strings(x);
  if (!a || a.length > WHEN_ATOMS_MAX || a.some((w) => w === '' || whenEnc.encode(w).length > WHEN_ATOM_BYTES_MAX)) return null;
  return [...a];
}
const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
/** The call_when capability (GET /version): only an agent that lists it reads `when`; one that does not would ignore it. */
export const CALL_WHEN = 'call_when';
/** Whether any rule of the list carries a condition, so its write needs an agent that lists call_when. */
export const listHasWhen = (list: readonly Rule[]): boolean => list.some((r) => r.when.length > 0);

function rowOf(x: unknown): RuleRow | null {
  const r = rec(x);
  if (!r || typeof r.id !== 'string' || typeof r.text !== 'string' || !isKind(r.kind)) return null;
  const tools = r.tools === undefined ? [] : strings(r.tools);
  const agents = r.agents === undefined ? [] : strings(r.agents);
  if (!tools || !agents) return null;
  const folder = typeof r.folder === 'string' && r.folder.startsWith('/') && r.folder.length <= 4096 ? r.folder : null;
  const when = whenOf(r.when);
  return { id: r.id, text: r.text, kind: r.kind, tools: [...tools], agents: [...agents], when: when ?? [], scope: isScope(r.scope) ? r.scope : null, folder, whenBad: when === null };
}

/**
 * The `rules` block of getHookRules or listHooks. null when it cannot be read as a whole: an unreadable rule would be left
 * out of a list that a write then replaces, so a partial block is never returned.
 */
export function rulesBlockOf(raw: unknown): RulesBlock | null {
  const b = rec(rec(raw)?.rules);
  if (!b || !Array.isArray(b.live)) return null;
  const rules: RuleRow[] = [];
  for (const x of b.live as unknown[]) {
    const r = rowOf(x);
    if (!r) return null;
    rules.push(r);
  }
  const revisions: Partial<Record<RuleScope, string>> = {};
  const scopes = b.scopes === undefined ? [] : b.scopes;
  if (!Array.isArray(scopes)) return null;
  for (const s of scopes as unknown[]) {
    const e = rec(s);
    if (!e || !isScope(e.scope) || typeof e.revision !== 'string' || e.revision === '' || e.revision.length > 200) return null;
    if (revisions[e.scope] !== undefined) return null;
    revisions[e.scope] = e.revision;
  }
  const ruleWarnings = b.rule_warnings === undefined ? [] : b.rule_warnings;
  const complete = b.rules_complete === true && Array.isArray(ruleWarnings) && ruleWarnings.length === 0;
  const warnings = strings(b.warnings) ?? [];
  const execTrust: ExecGrant[] = [];
  for (const g of Array.isArray(b.exec_trust) ? (b.exec_trust as unknown[]) : []) {
    const e = rec(g);
    if (e && typeof e.computer_id === 'string' && typeof e.realm === 'string') execTrust.push({ containerId: e.computer_id, realm: e.realm, name: typeof e.name === 'string' ? e.name : '' });
  }
  const t = b.timeout_ms;
  return { rules, revisions, complete, warnings: warnings.map((w) => w.slice(0, 500)).slice(0, 20), timeoutMs: typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : null, execTrust };
}

export type NoEdit = 'incomplete' | 'no_revision' | 'unplaced' | 'folder' | 'when';
export type Editable = { ok: true } | { ok: false; why: NoEdit };

/** A read that asked for no folder reads one layer, the user scope: its rules need no `scope` to be placed. */
const userOnly = (b: RulesBlock): boolean => Object.keys(b.revisions).every((k) => k === 'user');
/** Where a rule is saved. `cwd`: the folder the read was made for (undefined or null: none). Only a read that asked for NO folder
 *  may place a rule that states no scope, and only as the user scope; a folder read never does. */
export const placed = (b: RulesBlock, r: RuleRow, cwd?: string | null): RuleScope | null => {
  if (r.scope !== null) return r.scope;
  return (cwd === undefined || cwd === null) && userOnly(b) ? 'user' : null;
};

/** Whether `scope` of this read may be edited, and if not why. `cwd`: the folder the read was made for (undefined: none). */
export function canEdit(b: RulesBlock, scope: RuleScope, cwd: string | undefined): Editable {
  if (!b.complete) return { ok: false, why: 'incomplete' };
  if (b.revisions[scope] === undefined) return { ok: false, why: 'no_revision' };
  if (b.rules.some((r) => placed(b, r, cwd) === null)) return { ok: false, why: 'unplaced' };
  // A folder scope whose rules name another folder than the one this read was made for is not the list the person asked about.
  if (scope !== 'user' && b.rules.some((r) => r.scope === scope && r.folder !== null && cwd !== undefined && r.folder !== cwd)) return { ok: false, why: 'folder' };
  // A rule whose condition the page cannot carry whole: the write replaces the whole list, so it would drop that condition.
  if (b.rules.some((r) => r.whenBad && placed(b, r, cwd) === scope)) return { ok: false, why: 'when' };
  return { ok: true };
}

/** The rules of one scope, in the agent's order, as plain rules. */
export function scopeRules(b: RulesBlock, scope: RuleScope, cwd?: string | null): Rule[] {
  return b.rules.filter((r) => placed(b, r, cwd) === scope).map(({ id, text, kind, tools, agents, when }) => ({ id, text, kind, tools: [...tools], agents: [...agents], when: [...when] }));
}

const checked = (k: RuleKind) => k === 'limit' || k === 'check_in';
export function capsOf(list: readonly Rule[]): { checked: number; prompt: number } {
  let c = 0, p = 0;
  for (const r of list) { if (checked(r.kind)) c++; else p++; }
  return { checked: c, prompt: p };
}

export type RuleProblem = 'id' | 'text_empty' | 'text_long' | 'text_lines' | 'text_control' | 'text_format' | 'kind' | 'tools_prompt' | 'when_prompt' | 'tools_many' | 'tool_name' | 'agents_many' | 'agent_name' | 'duplicate' | 'cap_checked' | 'cap_prompt';
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TOOL = /^[A-Za-z0-9_]+$/;
const AGENT = /^[a-z0-9][a-z0-9_-]*$/;
// The agent refuses every control character in a rule's text, a line break and a tab among them:
// below U+0020, U+007F, U+0080 to U+009F, and in a guidance or
// playbook text every invisible format character too (Unicode Cf).
const LINES = /[\t\n\r]/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const FORMAT = /\p{Cf}/u;

/** What is wrong with adding `r` to `others` (the scope's other rules: the one being edited is not among them), or null. */
export function ruleProblem(others: readonly Rule[], r: Rule): RuleProblem | null {
  if (!ID.test(r.id)) return 'id';
  if (!isKind(r.kind)) return 'kind';
  if (r.text.trim() === '') return 'text_empty';
  if ([...r.text].length > MAX_TEXT) return 'text_long';
  if (LINES.test(r.text)) return 'text_lines';
  if (CONTROL.test(r.text)) return 'text_control';
  if (!checked(r.kind) && FORMAT.test(r.text)) return 'text_format';
  if (!checked(r.kind) && r.tools.length > 0) return 'tools_prompt';
  // A condition belongs to a checked rule only (the agent refuses it on guidance and playbooks).
  if (!checked(r.kind) && r.when.length > 0) return 'when_prompt';
  if (r.tools.length > MAX_TOOLS) return 'tools_many';
  if (r.tools.some((t) => t.length > MAX_NAME || !TOOL.test(t))) return 'tool_name';
  if (r.agents.length > MAX_AGENTS) return 'agents_many';
  if (r.agents.some((a, i) => a.length > MAX_NAME || !AGENT.test(a) || r.agents.indexOf(a) !== i)) return 'agent_name';
  if (others.some((o) => o.id === r.id)) return 'duplicate';
  const c = capsOf(others);
  if (checked(r.kind) ? c.checked >= CAP : c.prompt >= CAP) return checked(r.kind) ? 'cap_checked' : 'cap_prompt';
  return null;
}

/** An id the list does not hold, valid by the agent's shape. */
export function newRuleId(others: readonly Rule[]): string {
  for (let i = 0; i < 64; i++) {
    const id = `rule-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
    if (!others.some((o) => o.id === id)) return id;
  }
  return `rule-${Date.now().toString(36)}`;
}

/** The nonce of a minted write intent. */
export function nonceOf(raw: unknown): string | null {
  const r = rec(raw);
  if (!r || r.status !== 'ok') return null;
  const n = r.nonce;
  return typeof n === 'string' && n.length >= 1 && n.length <= 512 ? n : null;
}

export interface WriteArgs { sessionId: string; nonce: string; scope: RuleScope; revision: string; rules: readonly Rule[] }

/** One rule as a write sends it: a rule with a condition carries `when` verbatim; one without carries no `when` key at all. */
export type SentRule = Omit<Rule, 'when'> & { when?: string[] };
/** The body of one rules write: the session, its nonce, the scope, the scope's COMPLETE list and the revision it was read
 *  at. It carries no exec_trust (grants stay as they are) and no timeout. A list with a condition is sent only to an agent that lists
 *  call_when (data.ts checks that before the nonce). */
export function writeBody(a: WriteArgs): { session_id: string; nonce: string; scope: RuleScope; expected_revision: string; rules: SentRule[] } {
  return {
    session_id: a.sessionId, nonce: a.nonce, scope: a.scope, expected_revision: a.revision,
    rules: a.rules.map(({ id, text, kind, tools, agents, when }) => ({ id, text, kind, tools: [...tools], agents: [...agents], ...(when.length > 0 ? { when: [...when] } : {}) })),
  };
}

export interface Written { revision: string; warnings: string[] }
/** A write's answer as the page's success: ok and the scope's new revision. Anything else is unreadable (null): the write may have applied. */
export function writtenOf(raw: unknown): Written | null {
  const r = rec(raw);
  if (!r || r.status !== 'ok' || typeof r.revision !== 'string' || r.revision === '' || r.revision.length > 200) return null;
  const w = Array.isArray(r.warnings) ? (r.warnings as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 500)).slice(0, 20) : [];
  return { revision: r.revision, warnings: w };
}

const same = (a: Rule, b: Rule): boolean =>
  a.id === b.id && a.text === b.text && a.kind === b.kind && sameList(a.tools, b.tools) && sameList(a.agents, b.agents) && sameList(a.when ?? [], b.when ?? []);

/** A rules block with the place it was read for: the realm and the folder (null: none asked). A proof only counts a read of the
 *  same place as the write: the user scope is the realm's, a project or local scope is the folder's. */
export interface Read { block: RulesBlock; realm: string; cwd: string | null }

/**
 * What a lost write is judged by: a fresh COMPLETE read of the same realm (and, for a project or local scope, the same folder)
 * whose scope shows exactly the list that was sent, in that order, under a revision other than the one the write was made
 * against. A read that is incomplete, lacks the scope, or still shows the old revision proves nothing, and neither does a
 * different list (someone else may have written). The page never says "not saved".
 */
export function rulesProved(identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined {
  const id = rec(identity);
  if (!id || !isScope(id.scope) || typeof id.revision !== 'string' || id.revision === '' || !Array.isArray(id.rules)) return undefined;
  if (typeof id.realm !== 'string' || id.realm === '') return undefined;
  const cwd = typeof id.cwd === 'string' ? id.cwd : null;
  const want = id.rules as Rule[];
  for (const a of answers[0] ?? []) {
    const r = a as Read | null;
    const b = r?.block;
    if (!r || !b || typeof b !== 'object' || !b.complete || !Array.isArray(b.rules) || !b.revisions) continue;
    if (r.realm !== id.realm) continue;
    if (id.scope !== 'user' && (cwd === null || r.cwd !== cwd)) continue;
    const rev = b.revisions[id.scope];
    if (rev === undefined || rev === id.revision) continue;
    // The read must be one the page would let a person edit: complete, every rule placed, no rule naming another folder.
    if (!canEdit(b, id.scope, r.cwd ?? undefined).ok) continue;
    const have = scopeRules(b, id.scope, r.cwd);
    if (have.length === want.length && have.every((x, i) => same(x, want[i]!))) return 'applied';
  }
  return undefined;
}

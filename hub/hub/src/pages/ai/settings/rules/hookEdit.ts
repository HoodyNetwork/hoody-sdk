// The hook editor's rules, pure: what a draft is checked for, and what one press of Save will do.
// No words and no requests live here.
//
// The agent names a hook by event + canonical matcher + the exact command. Changing any of those makes a DIFFERENT hook: the editor
// then adds the new one and deletes the old one (two guarded writes, never one). A change of the label, the description or the timeout
// leaves the identity alone and is one write in place. A draft whose identity the agent might take for another hook is refused before
// anything is minted: the add could overwrite that hook, or the delete could remove the one just added.
import {
  HOOK_EVENTS, WHEN_EVENTS, asciiTrim, canChange, matcherKey, nameable, refOf, sameHook, scopeOf, killScopes,
  type HookRef, type HookRow, type HooksBlock, type NoChange, type UpsertFields,
} from './hooks';
import { findHidden, stripHidden, turnsDirection } from './hidden';
import type { RuleScope } from './logic';

export const NAME_MAX = 80;
export const DESC_MAX = 500;
export const TIMEOUT_MAX = 86400;
const enc = new TextEncoder();
/** The agent bounds both by BYTES. */
const bytes = (s: string): number => enc.encode(s).length;

/** What the dialog's fields hold. `timeout` is whole seconds, empty for the agent's default for the event. */
export interface HookDraft { event: string; matcher: string; command: string; timeout: string; name: string; description: string }
export type DraftProblem = 'event' | 'command' | 'timeout' | 'name_missing' | 'name_line' | 'name_bidi' | 'name_long' | 'desc_missing' | 'desc_bidi' | 'desc_long';
/** `when_event`: the replace moves a hook with a condition to an event that takes none. `when`: the old hook's condition could not be read
 *  whole, so the new hook could not carry it. */
export type Refusal = NoChange | 'collision' | 'ambiguous' | 'off' | 'scope' | 'gone' | 'when' | 'when_event';
export type PlanStep = { op: 'upsert'; fields: UpsertFields } | { op: 'delete'; hook: HookRef };
export type PlanKind = 'create' | 'update' | 'replace';
export type Plan =
  | { ok: true; kind: PlanKind; scope: RuleScope; steps: PlanStep[] }
  | { ok: false; why: 'invalid'; problems: DraftProblem[] }
  | { ok: false; why: Refusal };

/** The draft a hook starts from (or an empty one for a new hook). Its name and description start without hidden characters
 *  (stripHidden): a field would hold them unseen, and the save writes the clean text. The editor says so under each field (strippedOf).
 *  A hook whose event, matcher, command or condition holds one is never edited (hidesText). */
export function draftOf(h: HookRow | null): HookDraft {
  return h
    ? { event: h.event, matcher: h.matcher, command: h.command, timeout: h.timeout === null ? '' : String(h.timeout), name: stripHidden(h.label), description: stripHidden(h.description) }
    : { event: HOOK_EVENTS[3], matcher: '', command: '', timeout: '', name: '', description: '' };
}

/** Which of the hook's name and description lost hidden characters in its draft (draftOf). */
export const strippedOf = (h: HookRow | null): { name: boolean; description: boolean } => ({
  name: h !== null && findHidden(h.label) !== null,
  description: h !== null && findHidden(h.description) !== null,
});

/** The identity a draft names: the matcher as the agent stores it (trimmed, the wildcard as nothing). */
export const identityOf = (d: HookDraft): HookRef => ({ event: d.event, matcher: matcherKey(asciiTrim(d.matcher)), command: d.command });
/** Exactly the same hook, spelled the same way after the trim the agent does too. */
export const exactSame = (a: HookRef, b: HookRef): boolean => a.event === b.event && a.command === b.command && matcherKey(asciiTrim(a.matcher)) === matcherKey(asciiTrim(b.matcher));

/** The timeout as sent: always a number (the agent DELETES a stored timeout when an update leaves it out); null when it is not whole seconds in range. */
export function timeoutOf(s: string): number | null {
  const t = s.trim();
  if (t === '') return 0;
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n <= TIMEOUT_MAX ? n : null;
}

/** Fields that name the hook or run it: wrong, nothing else is worth judging. */
function identityProblems(d: HookDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (!(HOOK_EVENTS as readonly string[]).includes(d.event)) out.push('event');
  if (d.command.trim() === '') out.push('command');
  if (timeoutOf(d.timeout) === null) out.push('timeout');
  return out;
}
/** The label and description: both required for a NEW hook (a create, or the add of a replace); an update in place keeps what it has when they are left empty.
 *  Either one holding a character that turns the text's direction is refused, never stripped: the person removes it (the form shows it marked). */
function metaProblems(d: HookDraft, kind: PlanKind): DraftProblem[] {
  const out: DraftProblem[] = [];
  const name = d.name.trim();
  const desc = d.description.trim();
  const need = kind !== 'update';
  if (name === '') { if (need) out.push('name_missing'); } else if (/[\r\n]/.test(name)) out.push('name_line'); else if (turnsDirection(name)) out.push('name_bidi'); else if (bytes(name) > NAME_MAX) out.push('name_long');
  if (desc === '') { if (need) out.push('desc_missing'); } else if (turnsDirection(desc)) out.push('desc_bidi'); else if (bytes(desc) > DESC_MAX) out.push('desc_long');
  return out;
}

/**
 * What one press of Save does. `old` is the hook being edited (null: a new hook, written to `scopeForNew`). The scope of an edit is the
 * file the hook is in; an edit never moves a hook to another file.
 */
export function planOf(block: HooksBlock, edited: HookRow | null, draft: HookDraft, cwd: string | undefined, scopeForNew: RuleScope | null): Plan {
  const found = edited ? locate(block, edited) : null;
  if (typeof found === 'string') return { ok: false, why: found };
  const old = found;
  let scope: RuleScope;
  if (old) {
    const c = canChange(block, old, cwd);
    if (!c.ok) return { ok: false, why: c.why };
    scope = c.scope;
  } else {
    if (scopeForNew === null || !killScopes(block, cwd).includes(scopeForNew)) return { ok: false, why: 'scope' };
    scope = scopeForNew;
  }
  const nw = identityOf(draft);
  const kind: PlanKind = !old ? 'create' : exactSame(old, nw) ? 'update' : 'replace';
  const named = identityProblems(draft);
  if (named.length > 0) return { ok: false, why: 'invalid', problems: named };
  const bad = nameable(nw);
  if (bad) return { ok: false, why: bad };
  // Another hook of that file (or one whose file is not known) the agent may take for the new identity: the add would overwrite it in
  // place, or it is not clear which hook a delete would reach. The old hook itself counts too unless it is exactly the same hook.
  const shared = (o: HookRow): boolean => { const s = scopeOf(block, o); return s === scope || s === null; };
  for (const o of block.hooks) {
    if (o === old || !shared(o) || !sameHook(o, nw)) continue;
    return { ok: false, why: exactSame(o, nw) ? 'collision' : 'ambiguous' };
  }
  if (old && kind === 'replace' && sameHook(old, nw)) return { ok: false, why: 'ambiguous' };
  // The new hook arrives ON: replacing a hook that is OFF would turn it on.
  if (old && kind === 'replace' && old.disabled) return { ok: false, why: 'off' };
  // The add of a replace is a new hook: it carries the old one's condition, which needs it whole and an event that takes one.
  if (old && kind === 'replace' && old.whenBad) return { ok: false, why: 'when' };
  if (old && kind === 'replace' && old.when.length > 0 && !WHEN_EVENTS.includes(nw.event)) return { ok: false, why: 'when_event' };
  // Last: a refusal says more than a missing label.
  const meta = metaProblems(draft, kind);
  if (meta.length > 0) return { ok: false, why: 'invalid', problems: meta };
  const name = draft.name.trim();
  const desc = draft.description.trim();
  const fields: UpsertFields = {
    event: nw.event, matcher: nw.matcher, command: nw.command, timeout: timeoutOf(draft.timeout) as number,
    ...(name !== '' ? { name } : {}), ...(desc !== '' ? { description: desc } : {}),
    ...(old && kind === 'replace' && old.when.length > 0 ? { when: [...old.when] } : {}),
  };
  return { ok: true, kind, scope, steps: kind === 'replace' ? [{ op: 'upsert', fields }, { op: 'delete', hook: refOf(old!) }] : [{ op: 'upsert', fields }] };
}

/**
 * The row of `block` that is the hook `h` (a row of an earlier read): same file, same event, matcher and exact command. A hook is found
 * by what it is, never by where it sits or which object holds it: a list read again can put other hooks in front of it. Two exact copies
 * in one file cannot be told apart.
 */
export function locate(block: HooksBlock, h: HookRow): HookRow | 'gone' | 'ambiguous' {
  const hits = block.hooks.filter((o) => o.source === h.source && exactSame(o, h));
  if (hits.length === 0) return 'gone';
  return hits.length === 1 ? hits[0]! : 'ambiguous';
}

/**
 * The delete of the old hook of a replace, asked for again by the person: judged on `block`, a list read just before, never on the plan
 * that was saved. The delete names the hook found there, and only when nothing the agent could take for it (it removes every group of
 * the canonical matcher) has appeared since.
 */
export function removeOf(block: HooksBlock, old: HookRow, cwd: string | undefined): { ok: true; step: PlanStep } | { ok: false; why: NoChange | 'gone' | 'ambiguous' } {
  const cur = locate(block, old);
  if (typeof cur === 'string') return { ok: false, why: cur };
  const c = canChange(block, cur, cwd);
  if (!c.ok) return { ok: false, why: c.why };
  return { ok: true, step: { op: 'delete', hook: refOf(cur) } };
}

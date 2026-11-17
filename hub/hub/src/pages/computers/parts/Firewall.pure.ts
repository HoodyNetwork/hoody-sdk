// The firewall section's pure part (split out of Firewall.tsx so the terminal build shares it; the design notes are at
// the top of Firewall.tsx): read problems, the shown order, refusals, the blocked-rule helpers and the access pill.
// Firewall.tsx re-exports the public names; unreadableIn, T and Outcome are for Firewall.tsx.
import type { Tone, useStrings } from '@kit';
import { exactKey, matchesOf, type Direction, type FwList, type FwRule } from './Firewall.logic';
import type { NoInternetState } from './NoInternet.logic';
import type strings from './Firewall.strings.en.json';

/** What a failed read means to the person. */
export type ReadProblem = 'denied' | 'busy' | 'gone' | 'other';
export function readProblem(e: unknown): ReadProblem {
  const x = (e ?? {}) as { status?: unknown; code?: unknown };
  if (x.status === 403) return 'denied';
  if (x.status === 503 || x.status === 429) return 'busy';
  if (x.status === 404) return 'gone';
  return 'other';
}

/** Blocks and refusals first (they apply first), then allows; the API's order otherwise. Each keeps its index in
 *  the API's list of its direction (a delete is judged against that order). */
export const shownOrder = (rs: readonly FwRule[]): FwRule[] => [...rs.filter((r) => r.action !== 'allow'), ...rs.filter((r) => r.action === 'allow')];

export type T = ReturnType<typeof useStrings<typeof strings>>;
export type Outcome = { outcome: string; code?: string; status?: number; data?: unknown };
type Refusal = 'wait' | 'invalid' | 'full' | 'finalizing' | 'gone' | 'busy' | 'denied' | 'rate' | 'other';
/** A definite refusal in plain words (nothing was changed). */
export function refusalOf(r: { code?: string; status?: number }): Refusal {
  const c = r.code ?? '';
  // Core held it back, unsent, behind another change still being checked (its hold may be one this page cannot show).
  if (c === 'READ_BACK_FIRST' || c === 'HELD_BY_OTHER') return 'wait';
  // Both spellings of the limit codes are accepted: a pre-rename API still answers CONTAINER_*.
  if (c === 'COMPUTER_FIREWALL_RULE_LIMIT' || c === 'COMPUTER_FIREWALL_BYTES_LIMIT' || c === 'CONTAINER_FIREWALL_RULE_LIMIT' || c === 'CONTAINER_FIREWALL_BYTES_LIMIT') return 'full';
  if (c === 'computer_finalizing' || c === 'container_finalizing') return 'finalizing';
  if (c === 'RULE_NOT_FOUND' || r.status === 404) return 'gone';
  if (r.status === 409) return 'gone';
  if (r.status === 503) return 'busy';
  if (r.status === 429) return 'rate';
  if (r.status === 403) return 'denied';
  if (r.status === 400 || r.status === 422 || c === 'INVALID_RULE_DEFINITION') return 'invalid';
  return 'other';
}

export const unreadableIn = (l: FwList, d: Direction): number => (d === 'ingress' ? l.unreadableIn : l.unreadableOut);
/** Why this rule cannot be named for a delete or a switch in the list as read now, or null; with the later rules
 *  the same fields also match. The rule is looked up by its literal identity in THIS list (never by a saved row
 *  index: a re-read may have moved it), so the rule judged is the rule whose fields are sent. A switch needs the rule
 *  alone (its proof needs that); a delete needs it first. */
export function namedBlocked(l: FwList, rule: FwRule, op: 'remove' | 'toggle'): { why: 'unreadable' | 'gone' | 'notFirst' | 'shared' | null; others: number } {
  if (unreadableIn(l, rule.direction) > 0) return { why: 'unreadable', others: 0 };
  const list = l[rule.direction];
  const index = list.findIndex((r) => exactKey(r) === exactKey(rule));
  if (index < 0) return { why: 'gone', others: 0 };
  const m = matchesOf(list, index, op);
  if (!m.first) return { why: 'notFirst', others: m.others };
  return { why: op === 'toggle' && m.others > 0 ? 'shared' : null, others: m.others };
}
/** Why a switch of this rule cannot be sent now, or null. */
export function toggleBlocked(l: FwList, rule: FwRule): 'unreadable' | 'shared' | null {
  const b = namedBlocked(l, rule, 'toggle').why;
  return b === 'unreadable' ? 'unreadable' : b ? 'shared' : null;
}

/** The read state in words and tone: normal internet is never a danger tone. */
export function accessPill(ni: NoInternetState): { tone: Tone; key: 'ni.allowed' | 'ni.blockedState' | 'ni.partlyState' | 'ni.unknownState' } {
  if (ni === 'off') return { tone: 'ok', key: 'ni.allowed' };
  if (ni === 'on') return { tone: 'danger', key: 'ni.blockedState' };
  return { tone: 'warn', key: ni === 'partial' ? 'ni.partlyState' : 'ni.unknownState' };
}

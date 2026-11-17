// One spec's readiness from the evidence: the catalogue rules in their order
// (catalogueReadiness: gone, needs_key, ready, unknown), and Claude Code rows from the scoped Claude read.
import { claudeModelOf } from '../agent/claude';
import type { ClaudeSet } from '../agent/types';
import { catalogueReadiness, isClaudeMember, obj, prefixOf } from './catalogue';
import type { Evidence } from './read';
import type { Catalogue, Ready } from './types';

const CLAUDE_STATE = { ready: 'ready', setup: 'needs_key', unknown: 'unknown', absent: 'gone' } as const;

/** The readiness of one Claude Code spec against an ok Claude read. */
function claudeReadiness(set: ClaudeSet, model: string): Ready | 'gone' {
  const r = CLAUDE_STATE[set.state];
  if (r === 'gone' || model === '') return r;
  return set.models.some((m) => m.id === model) ? r : 'gone';
}

/**
 * The Claude Code members of an ensemble that a Claude read (`set`, an ok read) shows need setup or are gone.
 * No read (null) proves nothing: the catalogue cannot tell a Claude member's state.
 */
export function claudeMembersNeedingSetup(cat: Catalogue, set: ClaudeSet | null, spec: string): string[] {
  if (!set || prefixOf(spec) !== 'fusion') return [];
  const row = cat.bySpec[spec];
  const members = obj(row) && Array.isArray(row.members) ? (row.members as unknown[]).filter((m): m is string => typeof m === 'string') : [];
  return members.filter((m) => {
    const model = isClaudeMember(m) ? claudeModelOf(m) : null;
    if (model === null) return false;
    const r = claudeReadiness(set, model);
    return r === 'needs_key' || r === 'gone';
  });
}

/** claudeMembersNeedingSetup over the evidence: only an ok catalogue and an ok Claude read prove anything. */
export function claudeMemberProblems(ev: Evidence, spec: string): string[] {
  if (ev.catalogue.state !== 'ok' || !ev.claude || ev.claude.state !== 'ok') return [];
  return claudeMembersNeedingSetup(ev.catalogue.value.cat, ev.claude.value, spec);
}

/**
 * ready | needs_key | unknown | gone. A part that is not ok proves nothing: unknown (judge refuses a loading part
 * before asking). Claude Code rows: the Claude read's state; a model it does not list is gone (Claude's default always is listed).
 */
export function readinessOf(ev: Evidence, spec: string): Ready | 'gone' {
  const claude = claudeModelOf(spec);
  if (claude !== null) return ev.claude && ev.claude.state === 'ok' ? claudeReadiness(ev.claude.value, claude) : 'unknown';
  if (ev.catalogue.state !== 'ok') return 'unknown';
  const r = catalogueReadiness(ev.catalogue.value.cat, spec);
  // Claude Code members: a member the Claude read shows needs setup or is gone makes the ensemble need setup.
  return r !== 'gone' && r !== 'needs_key' && claudeMemberProblems(ev, spec).length ? 'needs_key' : r;
}

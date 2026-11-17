// Claude Code on a computer, read from GET /acp/agents: whether it can run (the claude row of `report.agents`), and
// the models and efforts the agent accepts for it (the answer's `claude_code`, the set its model routes validate
// with). Nothing here lists Claude models. An agent without the field offers Claude's default only, with no effort.
import { obj, rows } from '../providers/catalogue';
import type { Obj, Settled } from '../providers/types';
import { CLAUDE, EFFORTS, type ClaudeSet, type Effort } from './types';

// A model id as the agent's Claude Code routes take it (claude-opus-5-5, sonnet, claude-sonnet-4-5[1m]).
const ID_RE = /^[a-z0-9][a-z0-9._[\]-]{0,99}$/i;
const MAX_MODELS = 64;

/** A label as shown: control characters removed, whitespace folded, at most 80 characters; '' when nothing is left. */
function label(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function setOf(raw: unknown): Pick<ClaudeSet, 'models' | 'efforts'> {
  const out: Pick<ClaudeSet, 'models' | 'efforts'> = { models: [], efforts: [] };
  if (!obj(raw)) return out;
  const seen = new Set<string>();
  const add = (id: unknown, name: unknown) => {
    if (typeof id !== 'string' || !ID_RE.test(id) || seen.has(id.toLowerCase()) || out.models.length >= MAX_MODELS) return;
    seen.add(id.toLowerCase());
    out.models.push({ id, label: label(name) || id });
  };
  for (const m of Array.isArray(raw.models) ? raw.models : []) {
    if (typeof m === 'string') add(m, m);
    else if (obj(m)) add(m.id, m.label ?? m.display_name);
  }
  for (const a of Array.isArray(raw.aliases) ? raw.aliases : []) add(a, a);
  // Only levels the session's effort route takes, in its order.
  const said = new Set((Array.isArray(raw.efforts) ? raw.efforts : []).filter((e): e is string => typeof e === 'string'));
  out.efforts = EFFORTS.filter((e: Effort) => said.has(e));
  return out;
}

/** The settled GET /acp/agents read as a ClaudeSet. A failed read is 'unknown' with Claude's default only. */
export function claudeSetOf(r: Settled<unknown> | null): ClaudeSet {
  if (!r || !r.ok) {
    // An agent without the Claude Code routes at all.
    if (r && !r.ok && r.err.status === 404) return { state: 'absent', models: [], efforts: [] };
    return { state: 'unknown', models: [], efforts: [] };
  }
  const report = obj(r.body) ? r.body.report : null;
  const row = rows<Obj>(report, 'agents').find((a) => obj(a) && a.name === 'claude');
  if (!row) return { state: 'absent', models: [], efforts: [] };
  const set = setOf(obj(r.body) ? r.body.claude_code : null);
  const state = row.enabled === true && row.startable === true ? 'ready' : row.enabled === true || row.installed === true || row.enabled === false ? 'setup' : 'unknown';
  return { state, ...set };
}

/** The picker spec of a Claude Code model ('' = Claude's default). */
export function claudeSpec(model: string): string {
  return model ? `${CLAUDE}/${model}` : CLAUDE;
}

/** The Claude Code model a picker spec names: '' for Claude's default, null when the spec is not a Claude Code pick. */
export function claudeModelOf(spec: string): string | null {
  if (spec === CLAUDE) return '';
  if (!spec.startsWith(CLAUDE + '/')) return null;
  const m = spec.slice(CLAUDE.length + 1);
  return ID_RE.test(m) ? m : null;
}

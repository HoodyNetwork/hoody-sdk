// The Agents index and overview: GET /agents rows as the page reads them,
// their groups and their words. Read only: the editors (tools, source) live in tools.ts and source.ts.
import { isRecord } from '@core';

export type Provenance = 'user' | 'project' | 'user (shipped default)' | 'shipped default (embedded)' | 'product-owned (read-only)';
const PROVENANCES: readonly string[] = ['user', 'project', 'user (shipped default)', 'shipped default (embedded)', 'product-owned (read-only)'];

/** A list of names as the agent reports it: null when the key is absent (absent and empty mean different things). */
export type NameList = readonly string[] | null;

export interface AgentRow {
  name: string;
  description: string;
  /** The definition file; empty for a shipped default the realm has no file for. */
  path: string;
  /** null: a value this Hub does not know (shown as the agent wrote it, never guessed). */
  provenance: Provenance | null;
  provenanceRaw: string;
  /** Hoody owns the definition: read-only here, only its model can change (on the agent's own model route). */
  productOwned: boolean;
  /** A file of the person's own (user or project layer, not an unmodified shipped copy). */
  yours: boolean;
  /** Empty: inherits the chat's model. */
  model: string;
  effort: string;
  maxTurns: number | null;
  labels: readonly string[];
  tools: NameList;
  strict: boolean;
  mcpTools: NameList;
  skills: NameList;
  unknownTools: readonly string[];
  unknownSkills: readonly string[];
  missingVsDefault: readonly string[];
  isDefault: boolean;
}

const NAME = /^[a-z0-9][a-z0-9_-]*$/;

// The read is strict (C9): a field of the wrong type, or a row or list that breaks the contract, makes the whole
// answer malformed, so the page says it could not read the agents instead of showing fewer rows or a default the
// agent never reported. Absent stays absent; an empty list stays empty.
class Malformed extends Error {}
const bad = (): never => {
  throw new Malformed();
};
const text = (v: unknown): string => (v === undefined ? '' : typeof v === 'string' ? v : bad());
const flag = (v: unknown): boolean => (v === undefined ? false : typeof v === 'boolean' ? v : bad());
const strings = (v: unknown): string[] => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : bad());
const opt = (v: unknown): string[] => (v === undefined ? [] : strings(v));
const list = (v: unknown): NameList => (v === undefined ? null : strings(v));

function rowOf(v: unknown): AgentRow {
  if (!isRecord(v) || typeof v.name !== 'string' || !NAME.test(v.name)) return bad();
  const raw = text(v.provenance);
  const provenance = PROVENANCES.includes(raw) ? (raw as Provenance) : null;
  const turns = v.max_turns;
  if (turns !== undefined && !(typeof turns === 'number' && Number.isInteger(turns) && turns > 0)) bad();
  return {
    name: v.name,
    description: text(v.description),
    path: text(v.path),
    provenance,
    provenanceRaw: raw,
    productOwned: provenance === 'product-owned (read-only)',
    yours: provenance === 'user' || provenance === 'project',
    model: text(v.model),
    effort: text(v.effort),
    maxTurns: typeof turns === 'number' ? turns : null,
    labels: opt(v.labels),
    tools: list(v.tools),
    strict: flag(v.strict_tools),
    mcpTools: list(v.mcp_tools),
    skills: list(v.skills),
    unknownTools: opt(v.unknown_tools),
    unknownSkills: opt(v.unknown_skills),
    missingVsDefault: opt(v.missing_vs_default),
    isDefault: flag(v.is_configured_default),
  };
}

/** The rows of a GET /agents answer ({items}), sorted by name; null when the answer is malformed (never "no agents"). */
export function agentsOf(body: unknown): AgentRow[] | null {
  if (!isRecord(body) || !Array.isArray(body.items)) return null;
  try {
    const rows = body.items.map(rowOf);
    if (new Set(rows.map((r) => r.name)).size !== rows.length) return null;
    return rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  } catch (e) {
    if (e instanceof Malformed) return null;
    throw e;
  }
}

/** Where an agent comes from, as the list's Where filter spells it (short ids; the URL keeps them). */
export const WHERE = ['yours', 'project', 'modified', 'bundled', 'builtin'] as const;
export type Where = (typeof WHERE)[number];
const WHERE_OF: Record<Provenance, Where> = {
  user: 'yours',
  project: 'project',
  'user (shipped default)': 'modified',
  'shipped default (embedded)': 'bundled',
  'product-owned (read-only)': 'builtin',
};
/** The row's place, or null for a provenance this Hub does not know (it is in no Where filter option). */
export function whereOf(r: Pick<AgentRow, 'provenance'>): Where | null {
  return r.provenance ? WHERE_OF[r.provenance] : null;
}

/** The tool list in one word: a count, every tool, Hoody's default set (strict without a list) or none. */
export type ToolsWord = { kind: 'count'; count: number } | { kind: 'every' } | { kind: 'default' } | { kind: 'none' };
export function toolsWord(r: Pick<AgentRow, 'tools' | 'strict'>): ToolsWord {
  if (r.tools === null) return r.strict ? { kind: 'default' } : { kind: 'every' };
  return r.tools.length ? { kind: 'count', count: r.tools.length } : { kind: 'none' };
}

// Groups in index order (Core, Coding, Yours, Diagnostics, Memory); any other label follows by name,
// then agents without a label.
const ORDER = ['core', 'coding', 'yours', 'diagnostics', 'memory'];
export const OTHER = '';
export function groupOf(r: AgentRow): string {
  return r.yours ? 'yours' : (r.labels[0] ?? OTHER);
}
export function groupAgents(rows: readonly AgentRow[]): Array<{ group: string; rows: AgentRow[] }> {
  const by = new Map<string, AgentRow[]>();
  for (const r of rows) {
    const g = groupOf(r);
    by.set(g, [...(by.get(g) ?? []), r]);
  }
  const rank = (g: string) => (g === OTHER ? ORDER.length + 2 : ORDER.includes(g) ? ORDER.indexOf(g) : ORDER.length + 1);
  return [...by.keys()]
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map((group) => ({ group, rows: by.get(group) ?? [] }));
}

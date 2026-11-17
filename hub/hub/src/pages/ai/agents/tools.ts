// The Agent tools editor's logic: the catalogue as the
// page reads it, the ticks an agent row starts from, the groups the editor shows, the one setAgentTools body a save sends,
// what a fresh list must show to prove a save whose answer was lost, and how far an agent's tools reach (the New chat line).
// Pure: no React, no requests.
import { isRecord } from '@core';
import type { AgentRow } from './logic';
import { CATEGORY_ORDER, categoryOf, type Category } from './toolGroups';

/** One tool of the agent's catalogue (GET /tools). */
export interface CatalogTool {
  name: string;
  description: string;
  /** The agent marks it read-only (IsReadOnlyTool): it changes nothing. */
  readOnly: boolean;
}

const TOOL = /^[a-z0-9][a-z0-9_]*$/;

/** The catalogue of a GET /tools answer ({items, meta.total}), in the agent's order; null when the answer is malformed or
 *  not the whole catalogue (C9: a short or odd answer never reads as "these are all the tools"). */
export function catalogueOf(body: unknown): CatalogTool[] | null {
  if (!isRecord(body) || !Array.isArray(body.items) || !isRecord(body.meta) || body.meta.total !== body.items.length) return null;
  const out: CatalogTool[] = [];
  const seen = new Set<string>();
  for (const it of body.items) {
    if (!isRecord(it) || typeof it.name !== 'string' || !TOOL.test(it.name) || seen.has(it.name)) return null;
    if (it.description !== undefined && typeof it.description !== 'string') return null;
    if (typeof it.read_only !== 'boolean') return null;
    seen.add(it.name);
    out.push({ name: it.name, description: typeof it.description === 'string' ? it.description : '', readOnly: it.read_only });
  }
  return out;
}

/** What the agent's tools line holds now, as the editor starts from it. */
export type ToolsBase =
  | { kind: 'every' } //    no line, not strict: every tool
  | { kind: 'default' } //  no line, strict: Hoody's default tools (the agent does not list them)
  | { kind: 'none' } //     `tools: none` (present and empty)
  | { kind: 'list'; names: readonly string[] };

export function baseOf(r: Pick<AgentRow, 'tools' | 'strict'>): ToolsBase {
  if (r.tools === null) return r.strict ? { kind: 'default' } : { kind: 'every' };
  return r.tools.length ? { kind: 'list', names: r.tools } : { kind: 'none' };
}

/** The ticks a row starts from: every catalogue tool for "every tool", none for "default" and "none", else its list. */
export function tickedOf(r: Pick<AgentRow, 'tools' | 'strict'>, cat: readonly CatalogTool[]): string[] {
  const b = baseOf(r);
  if (b.kind === 'every') return cat.map((t) => t.name);
  return b.kind === 'list' ? [...new Set(b.names)] : [];
}

/** Names the row's list holds that the catalogue does not (kept, shown apart, never added from here). */
export function othersOf(r: Pick<AgentRow, 'tools'>, cat: readonly CatalogTool[]): string[] {
  const known = new Set(cat.map((t) => t.name));
  return r.tools === null ? [] : [...new Set(r.tools.filter((n) => !known.has(n)))].sort();
}

export const sameSet = (a: Iterable<string>, b: Iterable<string>): boolean => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((n) => y.has(n));
};

/** The same tools line and strict switch (what the ticks were based on is still what the agent holds). */
export function sameTools(a: Pick<AgentRow, 'tools' | 'strict'>, b: Pick<AgentRow, 'tools' | 'strict'>): boolean {
  if (a.strict !== b.strict) return false;
  if (a.tools === null || b.tools === null) return a.tools === b.tools;
  return sameSet(a.tools, b.tools);
}

/** The agent's categories (toolGroups.ts, in its order), then `more` (catalogue tools the Hub's copy does not know yet: never
 *  dropped) and `other` (names in the agent's file that the catalogue does not know). */
export type GroupId = Category | 'more' | 'other';
export const GROUP_IDS: readonly GroupId[] = [...CATEGORY_ORDER, 'more', 'other'];
/** Changed: only the lines whose tick differs from the ticks the editor started from (what the agent holds). */
/** `acts`: the catalogue tools that can change things (not read only); names the catalogue lacks are never in it. */
export type Filter = 'all' | 'on' | 'off' | 'changed' | 'acts';
/** Where a search found a line: its shown name, else its id, else the agent's description (null: no search). */
export type Hit = 'label' | 'id' | 'description' | null;
/** One tool line: `name` is the tool's id (what is saved), `label` the name it shows (the English name, else the id). */
export interface ToolLine { name: string; label: string; description: string; readOnly: boolean; on: boolean; changed: boolean; hit: Hit }
/** One group: on/total, read-only, changed and `names` over the whole group (All on / All off act on every name of it), `lines`
 *  narrowed by the search and the filter. */
export interface ToolGroup { id: GroupId; on: number; total: number; readOnly: number; changed: number; names: string[]; lines: ToolLine[] }

const hitOf = (q: string, l: Omit<ToolLine, 'hit'>): Hit | false => {
  if (!q) return null;
  if (l.label.toLowerCase().includes(q)) return 'label';
  if (l.name.toLowerCase().includes(q)) return 'id';
  return l.description.toLowerCase().includes(q) ? 'description' : false;
};
const shows = (f: Filter, l: ToolLine, other: boolean): boolean =>
  f === 'all' || (f === 'changed' ? l.changed : f === 'acts' ? !other && !l.readOnly : (f === 'on') === l.on);

/** The editor's groups (the agent's categories, More tools, Not tools here), each in catalogue order, with its counts over the
 *  whole group and its lines narrowed by the search (shown name, id or description) and the All/On/Off/Changed/acts filter.
 *  `saved`: the ticks the editor started from. `labelOf`: the name a tool shows (its id when there is none). An empty group
 *  is left out. */
export function groupsOf(
  cat: readonly CatalogTool[], others: readonly string[], ticked: ReadonlySet<string>, saved: ReadonlySet<string>, query: string, filter: Filter,
  labelOf: (tool: string) => string = (tool) => tool,
): ToolGroup[] {
  const q = query.trim().toLowerCase();
  const line = (name: string, description: string, readOnly: boolean): Omit<ToolLine, 'hit'> => ({
    name, label: labelOf(name), description, readOnly, on: ticked.has(name), changed: ticked.has(name) !== saved.has(name),
  });
  const all = new Map<GroupId, Array<Omit<ToolLine, 'hit'>>>(GROUP_IDS.map((id) => [id, []]));
  for (const t of cat) all.get(categoryOf(t.name) ?? 'more')!.push(line(t.name, t.description, t.readOnly));
  all.set('other', others.map((n) => line(n, '', false)));
  return GROUP_IDS.flatMap((id) => {
    const lines = all.get(id)!;
    if (lines.length === 0) return [];
    const shown: ToolLine[] = [];
    for (const l of lines) {
      const hit = hitOf(q, l);
      if (hit !== false && shows(filter, { ...l, hit }, id === 'other')) shown.push({ ...l, hit });
    }
    return [{
      id,
      on: lines.filter((l) => l.on).length,
      total: lines.length,
      readOnly: lines.filter((l) => l.readOnly).length,
      changed: lines.filter((l) => l.changed).length,
      names: lines.map((l) => l.name),
      lines: shown,
    }];
  });
}

/** The filter's counts over the lines the search leaves (groups read with the filter All). */
export function countsOf(groups: readonly ToolGroup[]): Record<Filter, number> {
  const lines = groups.flatMap((g) => g.lines);
  const on = lines.filter((l) => l.on).length;
  const acts = groups.filter((g) => g.id !== 'other').flatMap((g) => g.lines).filter((l) => !l.readOnly).length;
  return { all: lines.length, on, off: lines.length - on, changed: lines.filter((l) => l.changed).length, acts };
}

/** The ticks that differ from the saved ones: turned on and turned off, each sorted. */
export function changesOf(ticked: ReadonlySet<string>, saved: ReadonlySet<string>): { on: string[]; off: string[] } {
  return { on: [...ticked].filter((n) => !saved.has(n)).sort(), off: [...saved].filter((n) => !ticked.has(n)).sort() };
}

/** How many tools the agent holds now, for the reach card: null for Hoody's default tools (the agent does not list them). Every
 *  tool counts the catalogue (also ones added later, which the words say). */
export function countOf(r: Pick<AgentRow, 'tools' | 'strict'>, cat: readonly CatalogTool[]): number | null {
  const b = baseOf(r);
  if (b.kind === 'default') return null;
  if (b.kind === 'every') return cat.length;
  return b.kind === 'none' ? 0 : new Set(b.names).size;
}

/** What one save sends and how its button reads: strict with nothing ticked writes `tools: none` (never a bare empty list,
 *  which would give a strict agent Hoody's default tools); not strict with nothing ticked removes the line, which means every
 *  tool, so it asks first; otherwise the ticked list (catalogue order, then other names). */
export type SaveKind = 'list' | 'none' | 'every';
export interface ToolsSave { kind: SaveKind; tools: string[]; none: boolean; confirm: boolean }
export function saveOf(strict: boolean, ticked: ReadonlySet<string>, cat: readonly CatalogTool[]): ToolsSave {
  if (ticked.size === 0) return strict ? { kind: 'none', tools: [], none: true, confirm: false } : { kind: 'every', tools: [], none: false, confirm: true };
  const order = cat.map((t) => t.name).filter((n) => ticked.has(n));
  const rest = [...ticked].filter((n) => !order.includes(n)).sort();
  return { kind: 'list', tools: [...order, ...rest], none: false, confirm: false };
}

/** How many tools a save leaves the agent with (every tool: the catalogue). */
export const saveCountOf = (s: ToolsSave, cat: readonly CatalogTool[]): number => (s.kind === 'every' ? cat.length : s.tools.length);

/** The request body of a save: `none` only when it is true. */
export const bodyOf = (s: ToolsSave): { tools: string[]; none?: true } => (s.none ? { tools: [], none: true } : { tools: s.tools });

/** What a held save names: where it went, which agent, and what it wrote. `whole`: a list that is the whole catalogue on an
 *  agent that is not strict, which the agent writes as no line (every tool). */
export interface ToolsIdentity { computer: string; realm: string; name: string; kind: SaveKind; tools: string[]; whole: boolean }

export function identityOf(at: { computer: string; realm: string }, name: string, strict: boolean, s: ToolsSave, cat: readonly CatalogTool[]): ToolsIdentity {
  const whole = s.kind === 'list' && !strict && sameSet(s.tools, cat.map((t) => t.name));
  return { computer: at.computer, realm: at.realm, name, kind: s.kind, tools: [...s.tools].sort(), whole };
}

/** Does this row show what the save wrote? none: present and empty; every: no line on an agent that is not strict; list: the
 *  same names (or, for a whole-catalogue list on an agent that is not strict, no line). */
export function rowShows(id: Pick<ToolsIdentity, 'kind' | 'tools' | 'whole'>, r: Pick<AgentRow, 'tools' | 'strict'>): boolean {
  if (id.kind === 'none') return r.tools !== null && r.tools.length === 0;
  if (id.kind === 'every') return r.tools === null && !r.strict;
  if (r.tools === null) return id.whole && !r.strict;
  return r.tools.length > 0 && sameSet(r.tools, id.tools);
}

/** A fresh list proves a lost save only by showing what it wrote (applied). Nothing proves it was not written: a slow save may
 *  still land, so any other answer keeps it unknown. `answers[0]` holds the fresh GET /agents answers of the save's computer
 *  (core holds a save in the realm it was sent in, and reads it back there). */
export function toolsProved(identity: unknown, answers: readonly (readonly unknown[])[], parse: (raw: unknown) => readonly AgentRow[] | null): 'applied' | undefined {
  if (!isRecord(identity) || typeof identity.name !== 'string' || !Array.isArray(identity.tools)) return undefined;
  const kind = identity.kind;
  if (kind !== 'list' && kind !== 'none' && kind !== 'every') return undefined;
  const id = { kind, tools: identity.tools.map(String), whole: identity.whole === true } as const;
  for (const raw of answers[0] ?? []) {
    const rows = parse(raw);
    const row = rows?.find((r) => r.name === identity.name);
    if (row && rowShows(id, row)) return 'applied';
  }
  return undefined;
}

/** How far an agent's tools reach, for the New chat line: none (`tools: none`: zero tools, strict or not), read (a strict
 *  list of read-only built-ins and no MCP tool), acts (anything else that is known), unknown (Hoody's default set: the agent
 *  does not list it). Never less than the agent may do: a list on an agent that is not strict is only a base (the agent adds
 *  workflow, skill and every MCP tool), an `mcp_tools` entry may act, and a name the catalogue does not know counts as acting. */
export type Reach = 'none' | 'read' | 'acts' | 'unknown';
export function reachOf(r: Pick<AgentRow, 'tools' | 'strict' | 'mcpTools'>, cat: readonly CatalogTool[]): Reach {
  const b = baseOf(r);
  if (b.kind === 'none') return 'none';
  if (b.kind === 'default') return 'unknown';
  if (b.kind === 'every' || !r.strict) return 'acts';
  if (r.mcpTools !== null && r.mcpTools.length > 0) return 'acts';
  const ro = new Map(cat.map((t) => [t.name, t.readOnly]));
  return b.names.every((n) => ro.get(n) === true) ? 'read' : 'acts';
}

/** Would saving these ticks change what the agent holds? Compared as what the save writes (not as ticks): a strict agent on
 *  Hoody's default tools and one with `tools: none` both start with nothing ticked, but only one of them holds none. */
export function wouldChange(r: Pick<AgentRow, 'tools' | 'strict'>, s: ToolsSave, cat: readonly CatalogTool[]): boolean {
  return !rowShows(identityOf({ computer: '', realm: '' }, '', r.strict, s, cat), r);
}

/** `chat` (Just chat) after someone changed it: its file is theirs, not the shipped copy. */
export const changedChat = (r: Pick<AgentRow, 'name' | 'provenance'>): boolean => r.name === 'chat' && (r.provenance === 'user' || r.provenance === 'project');

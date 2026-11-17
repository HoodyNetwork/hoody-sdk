// Fake agent answers for the Agent tools editor, for the tests: one store per computer, so a save changes what the
// next GET /agents shows. PATCH /agents/:name/tools writes as the agent does: `{tools: [], none: true}` writes
// `tools: none` (present, empty); a bare `[]` removes the line; a list that is the whole catalogue on an agent that is not
// strict is written as no line; a product-owned agent or a tool the catalogue and the file do not know is refused (400).
//   set: 'lost' writes and answers a gateway error (unknown); 'notApplied' answers it without writing; 'refuse' answers 400.
import { answers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { routes } from '../routes';
import { toolsRoutes } from './toolsApi';

export interface ToolsAgent {
  name: string;
  provenance?: string;
  strict_tools?: boolean;
  /** Absent: no tools line. */
  tools?: string[];
  description?: string;
}

// What each fixture tool's own description says (the agent's text, shown as it is).
const WORDS = {
  read: 'Read a file.\nMore lines.',
  grep: 'Search file contents.',
  glob: 'Find files by name.',
  write: 'Write a file.',
  bash: 'Run a shell command.',
  spawn: 'Start a helper agent.',
};

export const TOOL_CATALOGUE = [
  { name: 'read_file', description: WORDS.read, input_schema: {}, read_only: true },
  { name: 'grep', description: WORDS.grep, input_schema: {}, read_only: true },
  { name: 'glob_files', description: WORDS.glob, input_schema: {}, read_only: true },
  { name: 'write_file', description: WORDS.write, input_schema: {}, read_only: false },
  { name: 'bash', description: WORDS.bash, input_schema: {}, read_only: false },
  { name: 'spawn_agent', description: WORDS.spawn, input_schema: {}, read_only: false },
];

export const toolsSeed = (): ToolsAgent[] => [
  { name: 'helper', provenance: 'user', strict_tools: true, tools: ['read_file', 'bash'] },
  { name: 'loose', provenance: 'user', tools: ['read_file', 'grep'] },
  { name: 'wide', provenance: 'user' },
  { name: 'strictdef', provenance: 'user', strict_tools: true },
  { name: 'odd', provenance: 'project', tools: ['read_file', 'legacy_x'] },
  { name: 'chat', provenance: 'user', tools: [] },
  { name: 'shipchat', provenance: 'user (shipped default)', tools: [] },
  { name: 'bot', provenance: 'product-owned (read-only)', tools: ['bash'] },
];

export interface ToolsOpts {
  seed?: ToolsAgent[];
  set?: 'lost' | 'notApplied' | 'refuse';
  /** A failed GET /agents (500) while this answers true. */
  listFails?: () => boolean;
  /** Changes the store right before a list read (another tab, the file's editor); `r` says which computer it is for. */
  beforeList?: (store: ToolsAgent[], n: number, r: FixtureRequest) => void;
  /** Delays the nth list answer (ms). */
  listDelay?: (n: number) => number;
  /** GET /tools answers this body instead. */
  catalogueBody?: unknown;
  onSend?: (r: FixtureRequest) => void;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function toolsRules(o: ToolsOpts = {}): FixtureRule[] {
  const stores = new Map<string, ToolsAgent[]>();
  const storeOf = (r: FixtureRequest): ToolsAgent[] => {
    const id = r.target?.container.id ?? '';
    let st = stores.get(id);
    if (!st) stores.set(id, (st = (o.seed ?? toolsSeed()).map((a) => ({ ...a, ...(a.tools ? { tools: [...a.tools] } : {}) }))));
    return st;
  };
  let lists = 0;
  return [
    reply(routes.agents, (r) => {
      o.onSend?.(r);
      const store = storeOf(r);
      const n = ++lists;
      o.beforeList?.(store, n, r);
      if (o.listFails?.()) return answers.refused(500, 'internal_error');
      const items = store.map((a) => ({ ...a, ...(a.tools ? { tools: [...a.tools] } : {}) }));
      return answers.ok({ items, meta: { total: items.length } }, o.listDelay?.(n));
    }),
    reply(toolsRoutes.catalogue, (r) => {
      o.onSend?.(r);
      if (o.catalogueBody !== undefined) return answers.ok(o.catalogueBody);
      return answers.ok({ items: TOOL_CATALOGUE, meta: { total: TOOL_CATALOGUE.length } });
    }),
    reply(toolsRoutes.set, (r) => {
      o.onSend?.(r);
      if (o.set === 'refuse') return answers.refused(400, 'bad_request');
      if (o.set === 'notApplied') return answers.pending5xx();
      const store = storeOf(r);
      const name = r.path.split('/')[2] ?? '';
      const a = store.find((x) => x.name === name);
      if (!a) return answers.refused(404, 'not_found');
      if (a.provenance === 'product-owned (read-only)') return answers.refused(400, 'bad_request');
      const b = rec(r.body);
      const tools = Array.isArray(b.tools) ? b.tools.map(String) : null;
      if (!tools) return answers.refused(400, 'bad_request');
      if (b.none === true && tools.length) return answers.refused(400, 'bad_request');
      const known = new Set([...TOOL_CATALOGUE.map((t) => t.name), ...(a.tools ?? [])]);
      if (tools.some((t) => !known.has(t))) return answers.refused(400, 'bad_request');
      const whole = !a.strict_tools && TOOL_CATALOGUE.every((t) => tools.includes(t.name)) && tools.length === TOOL_CATALOGUE.length;
      if (b.none === true) a.tools = [];
      else if (tools.length === 0 || whole) delete a.tools;
      else a.tools = tools;
      if (a.provenance === 'user (shipped default)') a.provenance = 'user';
      return o.set === 'lost' ? answers.pending5xx() : answers.ok({ status: 'ok', name, tools: a.tools ?? [] });
    }),
  ];
}

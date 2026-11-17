// The Tools editor's names and groups are the agent's own. GET /tools sends no alias and no category, so the Hub keeps a
// copy: toolNames.strings.en.json (each tool's English name) and toolGroups.ts (the agent's categories, in its order).
// The local checks always run: every known tool has one name, no two tools share a name, the two files list the same
// tools. The comparison with the agent's Go source (its alias table, its category table
// and their order) needs HUB_AGENT_SRC, else the agent's source in the monorepo this Hub sits in
// (monorepoPath); a tree that cannot see the agent skips only that part, with a loud reason. A name is the agent's alias
// in Hub sentence case (each word after the first lowercased unless it holds two or more capitals: OpenAPI, SDKs),
// except the OVERRIDES below, where the alias names an internal part the Hub calls something else, or where two names
// would differ only by a final "s".
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { CATEGORY_ORDER, KNOWN_TOOLS, categoryOf } from './toolGroups';
import names from './toolNames.strings.en.json';

const OVERRIDES: Record<string, string> = {
  hoody_exec_scripts: 'Manage scripts',
  hoody_exec_logs: 'Script logs',
  hoody_exec_monitor: 'Script health',
  hoody_exec_packages: 'Script packages',
  hoody_exec_state: 'Script storage',
  hoody_exec_openapi: 'Script OpenAPI',
  hoody_exec_sdk: 'Script SDKs',
  hoody_exec_system: 'Script runner',
  hoody_daemon_programs: 'Programs',
  hoody_daemon_control: 'Program control',
  hoody_cron: 'Schedules',
  propose_cron_entry: 'Propose schedule',
  lsp_query: 'Code navigation',
  todo_write: 'Update chat todos',
  todo_read: 'Read chat todos',
};

const table = names as Record<string, string>;
const idsOfTable = Object.keys(table).map((k) => k.replace(/^name\./, ''));

describe('the Hub copy of the tool names and groups', () => {
  it('every known tool has exactly one name, and the names file lists the known tools in category order', () => {
    expect(Object.keys(table).every((k) => k.startsWith('name.'))).toBe(true);
    expect(idsOfTable).toEqual([...KNOWN_TOOLS]);
  });
  it('no two tools share a name, and no name is blank or a raw id', () => {
    const values = Object.values(table);
    expect(new Set(values.map((v) => v.toLowerCase())).size).toBe(values.length);
    for (const [k, v] of Object.entries(table)) {
      expect(v.trim()).toBe(v);
      expect(v).not.toBe('');
      expect(v).not.toBe(k.replace(/^name\./, ''));
    }
  });
  it('every override names a known tool', () => {
    for (const id of Object.keys(OVERRIDES)) expect(categoryOf(id)).not.toBeNull();
  });
});

const AGENT = monorepoPath(process.env.HUB_AGENT_SRC, 'hoody-kit', 'hoody-agent');
const DAEMON = AGENT === null ? null : `${AGENT}/internal/daemon`;
const HAVE = DAEMON !== null && existsSync(`${DAEMON}/tool_aliases.go`) && existsSync(`${DAEMON}/tool_categories.go`);
if (!HAVE) console.error(`toolNames.agent.test.ts: agent comparison SKIPPED: no agent source at ${AGENT ?? 'any known place'} (set HUB_AGENT_SRC); the tool names and groups are not pinned to the agent in this run`);
const go = (f: string) => readFileSync(`${DAEMON}/${f}`, 'utf8');

/** The pairs of a Go `var name = map[string]string{"a": "b", ...}` literal, in source order. */
function mapPairs(src: string, name: string): Array<[string, string]> {
  const m = new RegExp(`var ${name} = map\\[string\\]\\w+\\{([\\s\\S]*?)\\n\\}`).exec(src);
  if (!m) throw new Error(`no ${name} in the agent source`);
  const pairs = [...m[1]!.matchAll(/^\s*"([a-z0-9_]+)":\s*"([^"]*)"/gm)].map((x): [string, string] => [x[1]!, x[2]!]);
  if (pairs.length === 0) throw new Error(`${name} has no entries`);
  return pairs;
}

const sentenceCase = (alias: string) => alias.split(' ').map((w, i) => (i === 0 || [...w].filter((c) => c >= 'A' && c <= 'Z').length > 1 ? w : w.toLowerCase())).join(' ');

describe.skipIf(!HAVE)('the Hub copy matches the agent source', () => {
  it('the categories and their order are toolCategoryOrder', () => {
    const m = /var toolCategoryOrder = \[\]string\{([^}]*)\}/.exec(go('tool_categories.go'));
    expect(m).not.toBeNull();
    expect([...m![1]!.matchAll(/"(\w+)"/g)].map((x) => x[1])).toEqual([...CATEGORY_ORDER]);
  });
  it('every tool sits in the category toolCategories gives it, and the Hub knows exactly those tools', () => {
    const cats = mapPairs(go('tool_categories.go'), 'toolCategories');
    for (const [id, c] of cats) expect([id, categoryOf(id)]).toEqual([id, c]);
    expect([...KNOWN_TOOLS].sort()).toEqual(cats.map(([id]) => id).sort());
  });
  it('every name is the agent alias in sentence case, except the listed overrides', () => {
    const aliases = new Map(mapPairs(go('tool_aliases.go'), 'toolAliases'));
    for (const id of KNOWN_TOOLS) {
      const alias = aliases.get(id);
      expect([id, alias === undefined]).toEqual([id, false]);
      expect([id, table[`name.${id}`]]).toEqual([id, OVERRIDES[id] ?? sentenceCase(alias!)]);
    }
  });
});

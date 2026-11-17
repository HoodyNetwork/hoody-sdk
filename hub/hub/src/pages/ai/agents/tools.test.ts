// Tools editor logic: the catalogue read strictly, the ticks a row starts from, groups and counts, the one body a save sends, what a
// fresh list must show to prove a lost save, and how far an agent's tools reach.
import { describe, expect, it } from 'vitest';
import { agentsOf, type AgentRow } from './logic';
import {
  GROUP_IDS, baseOf, bodyOf, catalogueOf, changedChat, changesOf, countOf, countsOf, groupsOf, identityOf, othersOf, reachOf, rowShows, sameTools, saveCountOf, saveOf, tickedOf, toolsProved, wouldChange,
  type CatalogTool,
} from './tools';
import { TOOL_CATALOGUE } from './toolsFixtures';

const cat = catalogueOf({ items: TOOL_CATALOGUE, meta: { total: TOOL_CATALOGUE.length } })!;
const row = (o: Partial<AgentRow>): AgentRow => ({ ...agentsOf({ items: [{ name: 'a' }] })![0]!, ...o });
const at = { computer: 'c1', realm: 'global' };

describe('catalogueOf', () => {
  it('reads the whole catalogue in order', () => {
    expect(cat.map((t) => t.name)).toEqual(TOOL_CATALOGUE.map((t) => t.name));
    expect(cat[0]).toEqual({ name: 'read_file', description: 'Read a file.\nMore lines.', readOnly: true });
  });
  it.each([
    ['short (total says more)', { items: TOOL_CATALOGUE.slice(1), meta: { total: TOOL_CATALOGUE.length } }],
    ['no meta', { items: TOOL_CATALOGUE }],
    ['not a list', { items: {} , meta: { total: 0 } }],
    ['duplicate name', { items: [TOOL_CATALOGUE[0], TOOL_CATALOGUE[0]], meta: { total: 2 } }],
    ['bad name', { items: [{ ...TOOL_CATALOGUE[0], name: 'Bad Name' }], meta: { total: 1 } }],
    ['read_only missing', { items: [{ name: 'x', description: '' }], meta: { total: 1 } }],
    ['description not text', { items: [{ name: 'x', description: 3, read_only: true }], meta: { total: 1 } }],
  ])('refuses a %s answer', (_, body) => {
    expect(catalogueOf(body)).toBeNull();
  });
});

describe('base and ticks', () => {
  it('no line: every (not strict) or default (strict); empty: none', () => {
    expect(baseOf(row({ tools: null }))).toEqual({ kind: 'every' });
    expect(baseOf(row({ tools: null, strict: true }))).toEqual({ kind: 'default' });
    expect(baseOf(row({ tools: [] }))).toEqual({ kind: 'none' });
    expect(tickedOf(row({ tools: null }), cat)).toEqual(cat.map((t) => t.name));
    expect(tickedOf(row({ tools: null, strict: true }), cat)).toEqual([]);
    expect(tickedOf(row({ tools: [] }), cat)).toEqual([]);
    expect(tickedOf(row({ tools: ['bash', 'bash'] }), cat)).toEqual(['bash']);
  });
  it('other names are the list minus the catalogue, sorted', () => {
    expect(othersOf(row({ tools: ['zz', 'bash', 'aa'] }), cat)).toEqual(['aa', 'zz']);
    expect(othersOf(row({ tools: null }), cat)).toEqual([]);
  });
  it('sameTools compares strict and the set, keeping absent apart from empty', () => {
    expect(sameTools(row({ tools: ['a', 'b'] }), row({ tools: ['b', 'a'] }))).toBe(true);
    expect(sameTools(row({ tools: null }), row({ tools: [] }))).toBe(false);
    expect(sameTools(row({ tools: ['a'], strict: true }), row({ tools: ['a'] }))).toBe(false);
  });
});

describe('groupsOf', () => {
  const ticked = new Set(['read_file', 'bash']);
  const lines = (g: ReturnType<typeof groupsOf>) => g.map((x) => [x.id, x.lines.map((l) => l.name)]);
  it("groups by the agent's categories in its order (catalogue order inside), counts over the whole group, drops empty groups", () => {
    const g = groupsOf(cat, [], ticked, ticked, '', 'all');
    expect(g.map((x) => [x.id, x.on, x.total, x.readOnly, x.changed])).toEqual([['coding', 2, 5, 3, 0], ['agents', 0, 1, 0, 0]]);
    expect(lines(g)).toEqual([['coding', ['read_file', 'grep', 'glob_files', 'write_file', 'bash']], ['agents', ['spawn_agent']]]);
  });
  it('a catalogue tool the Hub does not know goes to More tools (never dropped); a name the catalogue lacks to Not tools here', () => {
    const more = [...cat, { name: 'zz_new_tool', description: 'Something new.', readOnly: false }];
    const g = groupsOf(more, ['legacy'], ticked, ticked, '', 'all');
    expect(g.map((x) => [x.id, x.names])).toEqual([
      ['coding', ['read_file', 'grep', 'glob_files', 'write_file', 'bash']], ['agents', ['spawn_agent']], ['more', ['zz_new_tool']], ['other', ['legacy']],
    ]);
    expect(GROUP_IDS).toEqual(['coding', 'agents', 'web', 'todos', 'automation', 'memory', 'logs', 'fleet', 'more', 'other']);
  });
  it('search and filter narrow lines, not counts', () => {
    const g = groupsOf(cat, ['legacy'], ticked, ticked, 'FILE', 'on');
    expect(g.map((x) => [x.id, x.lines.map((l) => l.name), x.total])).toEqual([['coding', ['read_file'], 5], ['agents', [], 1], ['other', [], 1]]);
    expect(groupsOf(cat, [], ticked, ticked, '', 'off').flatMap((x) => x.lines.map((l) => l.name))).toEqual(['grep', 'glob_files', 'write_file', 'spawn_agent']);
  });
  it('names hold the whole group whatever the search and filter leave (All on / All off act on them)', () => {
    const g = groupsOf(cat, ['legacy'], ticked, ticked, 'zzz', 'on');
    expect(g.map((x) => [x.id, x.names, x.lines])).toEqual([['coding', ['read_file', 'grep', 'glob_files', 'write_file', 'bash'], []], ['agents', ['spawn_agent'], []], ['other', ['legacy'], []]]);
  });
  it('Changed shows only the ticks that differ from the saved ones; each line and group says whether it changed', () => {
    const saved = new Set(['read_file', 'grep']);
    const g = groupsOf(cat, [], ticked, saved, '', 'changed');
    expect(g.flatMap((x) => x.lines.map((l) => [l.name, l.on, l.changed]))).toEqual([['grep', false, true], ['bash', true, true]]);
    expect(g.map((x) => [x.id, x.changed])).toEqual([['coding', 2], ['agents', 0]]);
    expect(groupsOf(cat, [], ticked, saved, '', 'all').flatMap((x) => x.lines.filter((l) => !l.changed).map((l) => l.name))).toEqual(['read_file', 'glob_files', 'write_file', 'spawn_agent']);
  });
  it("the search matches the shown name, the id and the agent's description, and says where it found the line", () => {
    const names: Record<string, string> = { read_file: 'Read file', grep: 'Search text', bash: 'Shell' };
    const labelOf = (tool: string) => names[tool] ?? tool;
    const hits = (q: string) => groupsOf(cat, [], ticked, ticked, q, 'all', labelOf).flatMap((x) => x.lines.map((l) => [l.name, l.label, l.hit]));
    expect(hits('search text')).toEqual([['grep', 'Search text', 'label']]);
    expect(hits('GREP')).toEqual([['grep', 'Search text', 'id']]);
    expect(hits('shell command')).toEqual([['bash', 'Shell', 'description']]);
    expect(hits('')).toHaveLength(6);
    expect(hits('').every(([, , hit]) => hit === null)).toBe(true);
  });
});

describe('countsOf / changesOf / countOf / saveCountOf', () => {
  it('counts the filter over the lines the search leaves', () => {
    const saved = new Set(['read_file']);
    expect(countsOf(groupsOf(cat, [], new Set(['read_file', 'bash']), saved, '', 'all'))).toEqual({ all: 6, on: 2, off: 4, changed: 1, acts: 3 });
    expect(countsOf(groupsOf(cat, [], new Set(['read_file', 'bash']), saved, 'file', 'all'))).toEqual({ all: 4, on: 1, off: 3, changed: 0, acts: 1 });
  });
  it('changesOf lists turned on and turned off, sorted', () => {
    expect(changesOf(new Set(['b', 'x', 'a']), new Set(['a', 'z', 'y']))).toEqual({ on: ['b', 'x'], off: ['y', 'z'] });
    expect(changesOf(new Set(['a']), new Set(['a']))).toEqual({ on: [], off: [] });
  });
  it('countOf: the catalogue for every tool, null for the default tools, 0 for none, else the distinct names', () => {
    expect(countOf(row({ tools: null }), cat)).toBe(6);
    expect(countOf(row({ tools: null, strict: true }), cat)).toBeNull();
    expect(countOf(row({ tools: [] }), cat)).toBe(0);
    expect(countOf(row({ tools: ['bash', 'bash', 'legacy'] }), cat)).toBe(2);
  });
  it('saveCountOf: the catalogue for every tool, else the tools it writes', () => {
    expect(saveCountOf(saveOf(false, new Set(), cat), cat)).toBe(6);
    expect(saveCountOf(saveOf(true, new Set(), cat), cat)).toBe(0);
    expect(saveCountOf(saveOf(true, new Set(['bash', 'legacy']), cat), cat)).toBe(2);
  });
});

describe('saveOf / bodyOf', () => {
  it('strict and nothing ticked writes none (never a bare [])', () => {
    const s = saveOf(true, new Set(), cat);
    expect(s).toMatchObject({ kind: 'none', confirm: false });
    expect(bodyOf(s)).toEqual({ tools: [], none: true });
  });
  it('not strict and nothing ticked removes the line (every tool) and asks first', () => {
    const s = saveOf(false, new Set(), cat);
    expect(s).toMatchObject({ kind: 'every', confirm: true });
    expect(bodyOf(s)).toEqual({ tools: [] });
  });
  it('a list goes in catalogue order, other names after, sorted; none is never sent on a list', () => {
    const s = saveOf(true, new Set(['zz', 'bash', 'aa', 'read_file']), cat);
    expect(bodyOf(s)).toEqual({ tools: ['read_file', 'bash', 'aa', 'zz'] });
  });
});

describe('proof of a lost save', () => {
  const list = (tools: unknown, strict = false) => ({ items: [{ name: 'a', ...(tools === undefined ? {} : { tools }), strict_tools: strict }] });
  it('none is shown only by a present empty list', () => {
    const id = identityOf(at, 'a', true, saveOf(true, new Set(), cat), cat);
    expect(toolsProved(id, [[list([], true)]], agentsOf)).toBe('applied');
    expect(toolsProved(id, [[list(undefined, true)]], agentsOf)).toBeUndefined();
  });
  it('every is shown only by no line on an agent that is not strict', () => {
    const id = identityOf(at, 'a', false, saveOf(false, new Set(), cat), cat);
    expect(toolsProved(id, [[list(undefined)]], agentsOf)).toBe('applied');
    expect(toolsProved(id, [[list([])]], agentsOf)).toBeUndefined();
    expect(toolsProved(id, [[list(undefined, true)]], agentsOf)).toBeUndefined();
  });
  it('a list is shown by the same names; a whole-catalogue list on an agent that is not strict also by no line', () => {
    const id = identityOf(at, 'a', false, saveOf(false, new Set(['bash', 'grep']), cat), cat);
    expect(toolsProved(id, [[list(['grep', 'bash'])]], agentsOf)).toBe('applied');
    expect(toolsProved(id, [[list(['grep'])]], agentsOf)).toBeUndefined();
    expect(toolsProved(id, [[list(undefined)]], agentsOf)).toBeUndefined();
    const whole = identityOf(at, 'a', false, saveOf(false, new Set(cat.map((t) => t.name)), cat), cat);
    expect(whole.whole).toBe(true);
    expect(toolsProved(whole, [[list(undefined)]], agentsOf)).toBe('applied');
    const strictWhole = identityOf(at, 'a', true, saveOf(true, new Set(cat.map((t) => t.name)), cat), cat);
    expect(strictWhole.whole).toBe(false);
    expect(rowShows(strictWhole, row({ tools: null, strict: true }))).toBe(false);
  });
  it('nothing else proves anything: other agent, malformed answer, no answers, malformed identity', () => {
    const id = identityOf(at, 'a', true, saveOf(true, new Set(), cat), cat);
    expect(toolsProved(id, [[{ items: [{ name: 'b', tools: [] }] }]], agentsOf)).toBeUndefined();
    expect(toolsProved(id, [[{ items: 'x' }]], agentsOf)).toBeUndefined();
    expect(toolsProved(id, [], agentsOf)).toBeUndefined();
    expect(toolsProved({ ...id, kind: 'odd' }, [[list([], true)]], agentsOf)).toBeUndefined();
    expect(toolsProved(null, [[list([], true)]], agentsOf)).toBeUndefined();
  });
});

describe('reachOf / changedChat', () => {
  it('none, read, acts, unknown; an unknown name counts as acting', () => {
    expect(reachOf(row({ tools: [] }), cat)).toBe('none');
    expect(reachOf(row({ tools: [], mcpTools: ['srv/*'] }), cat)).toBe('none');
    expect(reachOf(row({ tools: ['grep', 'glob_files'], strict: true }), cat)).toBe('read');
    expect(reachOf(row({ tools: ['grep', 'glob_files'], strict: true, mcpTools: [] }), cat)).toBe('read');
    expect(reachOf(row({ tools: ['grep', 'bash'], strict: true }), cat)).toBe('acts');
    expect(reachOf(row({ tools: ['grep', 'mystery'], strict: true }), cat)).toBe('acts');
    expect(reachOf(row({ tools: null }), cat)).toBe('acts');
    expect(reachOf(row({ tools: null, strict: true }), cat)).toBe('unknown');
    const none: CatalogTool[] = [];
    expect(reachOf(row({ tools: ['grep'], strict: true }), none)).toBe('acts');
  });
  it('never "changes nothing" for a list that is only a base, or with an MCP tool', () => {
    // Not strict: the agent adds workflow, skill and every MCP tool to the list.
    expect(reachOf(row({ tools: ['read_file'] }), cat)).toBe('acts');
    // Strict with an mcp_tools entry: that tool may act.
    expect(reachOf(row({ tools: ['read_file'], strict: true, mcpTools: ['viewkit/view_patch'] }), cat)).toBe('acts');
  });
  it('wouldChange compares what the save writes, not ticks', () => {
    expect(wouldChange(row({ tools: null, strict: true }), saveOf(true, new Set(), cat), cat)).toBe(true);
    expect(wouldChange(row({ tools: [], strict: true }), saveOf(true, new Set(), cat), cat)).toBe(false);
    expect(wouldChange(row({ tools: [] }), saveOf(false, new Set(), cat), cat)).toBe(true);
    expect(wouldChange(row({ tools: null }), saveOf(false, new Set(cat.map((t) => t.name)), cat), cat)).toBe(false);
    expect(wouldChange(row({ tools: ['grep', 'bash'] }), saveOf(false, new Set(['bash', 'grep']), cat), cat)).toBe(false);
  });
  it('only a chat file of the person\'s own is changed', () => {
    expect(changedChat(row({ name: 'chat', provenance: 'user' }))).toBe(true);
    expect(changedChat(row({ name: 'chat', provenance: 'project' }))).toBe(true);
    expect(changedChat(row({ name: 'chat', provenance: 'user (shipped default)' }))).toBe(false);
    expect(changedChat(row({ name: 'other', provenance: 'user' }))).toBe(false);
  });
});

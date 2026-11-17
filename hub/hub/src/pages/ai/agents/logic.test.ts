// The Agents index reads GET /agents as the contract writes it ({items}), keeps absent and empty lists
// apart, groups Core, Coding, Yours, Diagnostics, Memory first, and never reads a failed answer as "no agents".
import { describe, expect, it } from 'vitest';
import { agentsOf, groupAgents, toolsWord } from './logic';

const items = [
  { name: 'general', labels: ['core'], provenance: 'shipped default (embedded)', tools: ['read_file', 'bash'], is_configured_default: true, spawn_advertised: true },
  { name: 'bot', labels: ['core'], provenance: 'product-owned (read-only)', strict_tools: true, tools: ['dispatch'], spawn_advertised: false },
  { name: 'reviewer', labels: ['coding'], provenance: 'user (shipped default)', spawn_advertised: true },
  { name: 'shop-support', labels: ['core'], provenance: 'user', description: 'Answers shop questions', tools: [], spawn_advertised: true },
  { name: 'logs', labels: ['diagnostics'], provenance: 'shipped default (embedded)', spawn_advertised: true },
  { name: 'memory-curator', labels: ['memory'], provenance: 'shipped default (embedded)', spawn_advertised: true },
  { name: 'agent-editor', labels: ['editors'], provenance: 'shipped default (embedded)', spawn_advertised: true },
  { name: 'loose', provenance: 'project', spawn_advertised: true },
  { name: 'plain', provenance: 'shipped default (embedded)', spawn_advertised: true },
];

describe('agentsOf', () => {
  it('reads {items}, sorted by name', () => {
    const rows = agentsOf({ items, meta: { total: 9 } });
    expect(rows?.map((r) => r.name)).toEqual(['agent-editor', 'bot', 'general', 'logs', 'loose', 'memory-curator', 'plain', 'reviewer', 'shop-support']);
  });
  it('a row or field that breaks the contract makes the whole answer malformed (null), never fewer rows or a default', () => {
    const bad: unknown[] = [
      null,
      { model: 'x' },
      { name: 'Bad Name' },
      { name: 'general' }, // a repeat of a listed name
      { name: 'x', tools: 'read_file' },
      { name: 'x', tools: ['read_file', 7] },
      { name: 'x', strict_tools: 'yes' },
      { name: 'x', skills: {} },
      { name: 'x', mcp_tools: 'srv/*' },
      { name: 'x', labels: 'core' },
      { name: 'x', max_turns: 2.5 },
      { name: 'x', description: 3 },
    ];
    for (const b of bad) expect(agentsOf({ items: [...items, b] }), JSON.stringify(b)).toBeNull();
  });
  it('an answer that is not a list is null (a failed read), never an empty list', () => {
    expect(agentsOf({ agents: items })).toBeNull();
    expect(agentsOf(null)).toBeNull();
    expect(agentsOf({ items: [] })).toEqual([]);
  });
  it('keeps an absent list (null) apart from an empty one', () => {
    const rows = agentsOf({ items: [{ name: 'a', skills: [], mcp_tools: [] }, { name: 'b' }] }) ?? [];
    expect(rows[0]).toMatchObject({ skills: [], mcpTools: [], tools: null });
    expect(rows[1]).toMatchObject({ skills: null, mcpTools: null, tools: null });
  });
  it('only user and project files are yours; product-owned is marked read-only', () => {
    const rows = agentsOf({ items }) ?? [];
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect([by['shop-support']?.yours, by.loose?.yours, by.reviewer?.yours, by.general?.yours]).toEqual([true, true, false, false]);
    expect([by.bot?.productOwned, by.general?.productOwned]).toEqual([true, false]);
  });
  it('an unknown provenance is kept as written and not guessed', () => {
    const [r] = agentsOf({ items: [{ name: 'x', provenance: 'somewhere new' }] }) ?? [];
    expect(r).toMatchObject({ provenance: null, provenanceRaw: 'somewhere new', yours: false, productOwned: false });
  });
});

describe('toolsWord', () => {
  it('absent = every tool, unless strict (Hoody default set); empty = none; else a count', () => {
    expect(toolsWord({ tools: null, strict: false })).toEqual({ kind: 'every' });
    expect(toolsWord({ tools: null, strict: true })).toEqual({ kind: 'default' });
    expect(toolsWord({ tools: [], strict: true })).toEqual({ kind: 'none' });
    expect(toolsWord({ tools: ['a', 'b'], strict: false })).toEqual({ kind: 'count', count: 2 });
  });
});

describe('groupAgents', () => {
  it('Core, Coding, Yours, Diagnostics, Memory first, then other labels by name, then agents without a label', () => {
    const groups = groupAgents(agentsOf({ items }) ?? []);
    expect(groups.map((g) => g.group)).toEqual(['core', 'coding', 'yours', 'diagnostics', 'memory', 'editors', '']);
    expect(groups.find((g) => g.group === 'yours')?.rows.map((r) => r.name)).toEqual(['loose', 'shop-support']);
    expect(groups.find((g) => g.group === 'core')?.rows.map((r) => r.name)).toEqual(['bot', 'general']);
  });
});

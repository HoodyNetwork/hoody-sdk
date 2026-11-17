// The capability line's one rule: "Chat only" only for an agent that has no built-in tool AND no MCP tool, by the Agents page's
// own reading of the definition (a missing line is "every" or "default", never "none").
import { describe, expect, it } from 'vitest';
import type { AgentRow } from '../agents/logic';
import { chatAgent, hasNoTools } from './capability';

const row = (o: Partial<Pick<AgentRow, 'tools' | 'mcpTools' | 'strict' | 'name'>>) => ({ name: 'a', tools: null, mcpTools: null, strict: false, ...o }) as AgentRow;

describe('hasNoTools', () => {
  it('an empty tool line and an empty MCP line: no tools', () => {
    expect(hasNoTools(row({ tools: [], mcpTools: [] }))).toBe(true);
  });
  it('an empty tool line on a strict agent with no MCP line: no tools (strict without a line means none)', () => {
    expect(hasNoTools(row({ tools: [], mcpTools: null, strict: true }))).toBe(true);
  });
  it('an empty tool line on an agent that is not strict and has no MCP line: it still has every MCP tool', () => {
    expect(hasNoTools(row({ tools: [], mcpTools: null, strict: false }))).toBe(false);
  });
  it('no tool line at all is every tool or the default ones, never none', () => {
    expect(hasNoTools(row({ tools: null, mcpTools: [] }))).toBe(false);
    expect(hasNoTools(row({ tools: null, mcpTools: [], strict: true }))).toBe(false);
  });
  it('any listed tool, built-in or MCP, is a tool', () => {
    expect(hasNoTools(row({ tools: ['read_file'], mcpTools: [] }))).toBe(false);
    expect(hasNoTools(row({ tools: [], mcpTools: ['github.search'] }))).toBe(false);
  });
});

describe('chatAgent', () => {
  it('finds the chat\'s agent by its exact name; nothing while the list is unread, the name empty or not listed', () => {
    const rows = [row({ name: 'chat' }), row({ name: 'general' })];
    expect(chatAgent(rows, 'chat')?.name).toBe('chat');
    expect(chatAgent(undefined, 'chat')).toBeUndefined();
    expect(chatAgent(rows, '')).toBeUndefined();
    expect(chatAgent(rows, 'Chat')).toBeUndefined();
  });
});

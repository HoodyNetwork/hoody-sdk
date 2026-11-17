// The header's capability line for an open chat: what its agent can do, from the agent's own definition (GET /agents), never
// guessed. Today it says one thing: a chat whose agent has no tools at all (no built-in tool and no MCP tool, by the same rules the
// Agents page uses to say "No tools") answers in the chat only. Any other agent, an agent this computer does not list, or a list
// not read yet: no line.
import type { AgentRow } from '../agents/logic';
import { toolsWord } from '../agents/logic';

/** The agent has no built-in tool and no MCP tool (Agents page words: "No tools", MCP "none"). */
export function hasNoTools(r: Pick<AgentRow, 'tools' | 'mcpTools' | 'strict'>): boolean {
  if (toolsWord(r).kind !== 'none') return false;
  // MCP: no line means every MCP tool unless the agent is strict; an empty line means none.
  return r.mcpTools === null ? r.strict : r.mcpTools.length === 0;
}

/** The chat's agent by name in the computer's list; undefined while the list is unread or the agent is not on it. */
export function chatAgent(rows: readonly AgentRow[] | undefined, name: string): AgentRow | undefined {
  if (!rows || !name) return undefined;
  return rows.find((r) => r.name === name);
}

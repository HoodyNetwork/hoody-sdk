// The Agent tools editor's requests, declared once with core's defineRoute:
//   - setAgentTools: PATCH /agents/:name/tools with the whole list (one per save). toggleAgentTool is never called: it cannot
//     ask for a state, so a lost answer or a second tab flips a tool back. A 4xx is the agent's refusal before any write (an
//     unknown tool, a product-owned agent, an agent that is gone). A 500 or a lost answer may have written: unknown.
//   - listTools: GET /tools, the agent's catalogue. It has no realm (the agent refuses one there).
// The change lives in the agents list's own source (data.ts), so its read-back is the list the page shows.
import { defineRoute, type LiveChange, type Target } from '@core';
import { agentsOf } from './logic';
import { bodyOf, toolsProved, type ToolsIdentity, type ToolsSave } from './tools';

export const toolsRoutes = {
  set: defineRoute<unknown, { tools: string[]; none?: true }>({ method: 'PATCH', path: '/agents/:name/tools', scope: 'agent', realm: 'realm', body: ['tools', 'none'] }),
  catalogue: defineRoute({ method: 'GET', path: '/tools', scope: 'agent', realm: 'none' }),
} as const;

/** The lock of a tools save: one held save per agent on a computer (the realm is in core's scope). */
export const TOOLS_LOCK = 'agent.tools';

/** One save: where it goes, the agent, what it writes, and the identity a held save shows. */
export interface ToolsVars { target: Target; realm: string; name: string; save: ToolsSave; identity: ToolsIdentity }

export const toolsChange: LiveChange<ToolsVars> = {
  route: toolsRoutes.set,
  input: (v) => ({ target: v.target, realm: v.realm, params: { name: v.name }, body: bodyOf(v.save) }),
  reads: ['list'],
  lock: TOOLS_LOCK,
  lockKey: (v) => ({ computer: v.target.container.id, name: v.name }),
  identity: (v) => v.identity,
  select: () => undefined,
  proves: (identity, answers) => toolsProved(identity, answers, agentsOf),
};

// Fake agent answers for New chat's tests: the chat list's (parts/fixtures.chats), the agents and the tool
// catalogue (agents/toolsFixtures), and Claude Code: GET /acp/agents, GET /acp/default and the version's capabilities.
import { answers, providers, reply, type FixtureRequest, type FixtureRule } from '@core';
import { toolsRoutes } from '../agents/toolsApi';
import { toolsRules, type ToolsAgent } from '../agents/toolsFixtures';
import { chatRoutes } from '../parts/data';
import { chatRules, type ChatRuleOpts } from '../parts/fixtures.chats';
import { routes } from '../routes';

export interface NewChatOpts extends ChatRuleOpts {
  agents?: ToolsAgent[];
  agentsFail?: boolean;
  /** GET /agents fails (500) while this is on; a test may switch it. */
  agentsDown?: { on: boolean };
  /** GET /agents answers 200 with this body (not an agent list). */
  agentsBody?: unknown;
  /** GET /tools fails (500) while this is on. */
  toolsDown?: { on: boolean };
  /** GET /tools answers 200 with this body. */
  toolsBody?: unknown;
  /** GET /sessions/cwds fails (500) while this is on. */
  cwdsDown?: { on: boolean };
  /** GET /sessions/cwds answers 200 with this body. */
  cwdsBody?: unknown;
  /** GET /acp/agents answers 200 with this body. */
  acpBody?: unknown;
  /** Claude Code's row on the computer; absent: no claude row (unavailable). */
  claude?: { installed?: boolean; logged_in?: 'logged_in' | 'logged_out'; enabled?: boolean; startable?: boolean } | null;
  /** GET /acp/default's delegated agent ('claude' or ''); undefined: the agent reports no acp_default capability. */
  acpDefault?: string;
  acpFails?: boolean;
}

export const newChatSeed = (): ToolsAgent[] => [
  { name: 'chat', provenance: 'shipped default (embedded)', tools: [] },
  { name: 'general', provenance: 'shipped default (embedded)' },
  { name: 'reviewer', provenance: 'shipped default (embedded)', strict_tools: true, tools: ['read_file', 'grep'] },
  { name: 'mine', provenance: 'user', tools: ['bash'] },
  { name: 'bot', provenance: 'product-owned (read-only)', tools: ['bash'] },
  { name: 'script-writer', provenance: 'product-owned (read-only)', tools: ['bash'] },
];

export function newChatRules(o: NewChatOpts = {}): FixtureRule[] {
  const see = (r: FixtureRequest) => o.onSend?.(r);
  return [
    ...(o.agentsBody !== undefined ? [reply(routes.agents, (r) => (see(r), answers.ok(o.agentsBody)))] : []),
    reply(toolsRoutes.catalogue, (r) => (see(r), answers.refused(500, 'internal_error')), { when: () => !!o.toolsDown?.on }),
    reply(chatRoutes.cwds, (r) => (see(r), answers.refused(500, 'internal_error')), { when: () => !!o.cwdsDown?.on }),
    ...(o.cwdsBody !== undefined ? [reply(chatRoutes.cwds, (r) => (see(r), answers.ok(o.cwdsBody)))] : []),
    ...(o.acpBody !== undefined ? [reply(routes.acp, (r) => (see(r), answers.ok(o.acpBody)))] : []),
    ...chatRules(o),
    ...toolsRules({
      seed: o.agents ?? newChatSeed(),
      ...(o.onSend ? { onSend: o.onSend } : {}),
      listFails: () => !!o.agentsFail || !!o.agentsDown?.on,
      ...(o.toolsBody !== undefined ? { catalogueBody: o.toolsBody } : {}),
    }),
    reply(providers.providerRoutes.version, (r) => {
      see(r);
      return answers.ok({ capabilities: o.acpDefault === undefined ? [] : [{ name: providers.CAPS.acpDefault, supported: true, available: true }] });
    }),
    reply(routes.acp, (r) => {
      see(r);
      if (o.acpFails) return answers.refused(500, 'internal_error');
      const c = o.claude;
      const agents = c ? [{ name: 'claude', installed: c.installed ?? true, logged_in: c.logged_in ?? 'logged_in', enabled: c.enabled ?? true, startable: c.startable ?? true }] : [];
      return answers.ok({ status: 'ok', report: { agents } });
    }),
    reply(routes.acpDefault, (r) => {
      see(r);
      return answers.ok({ delegated_agent: o.acpDefault ?? '' });
    }),
  ];
}

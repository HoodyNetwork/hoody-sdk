// Every request the AI models page may send, declared once with core's defineRoute (the page's
// allow-list). Agent routes go to the computer's agent; the terminal routes go to a
// Hoody Kit program on the computer (index 0 reads, a setup terminal's own host sends).
import { agent, botsListRoute, defineRoute, inRunBand, inRunHeld, providers } from '@core';

const PAGE = ['page', 'limit'] as const;
const P = '/providers/:pid';
const T = '/api/v1/terminal';
// Follow-ups reach a setup terminal in the launch band, or in the old band (15001-19999) one made before; a create
// only in the band (terminal and display ids up to 9999).
const term = (n: number) => n === 0 || inRunHeld(n);

export const routes = {
  // The provider and model routes are @core's; the page adds its own.
  ...providers.providerRoutes,
  customCreate: defineRoute({ method: 'POST', path: '/providers', scope: 'agent', realm: 'none', body: ['id', 'model_prefix', 'display_name', 'wire_format', 'base_url', 'models'], idem: true }),
  customPatch: defineRoute({ method: 'PATCH', path: P, scope: 'agent', realm: 'none', body: ['display_name', 'wire_format', 'base_url', 'models'] }),
  customDelete: defineRoute({ method: 'DELETE', path: P, scope: 'agent', realm: 'none' }),
  usage: defineRoute({ method: 'GET', path: '/usage/by-model', scope: 'agent', realm: 'none', query: ['since'] }),
  jev: defineRoute({ method: 'GET', path: '/jev/settings', scope: 'agent', realm: 'opt' }),
  jevPut: defineRoute({ method: 'PUT', path: '/jev/settings', scope: 'agent', realm: 'opt', body: ['enabled', 'model'] }),
  jevModels: defineRoute({ method: 'GET', path: '/jev/models', scope: 'agent', realm: 'none' }),
  agents: defineRoute({ method: 'GET', path: '/agents', scope: 'agent', realm: 'realm', query: PAGE }),
  agentModel: defineRoute({ method: 'PATCH', path: '/agents/:name/model', scope: 'agent', realm: 'realm', body: ['model'] }),
  agentEffort: defineRoute({ method: 'PATCH', path: '/agents/:name/effort', scope: 'agent', realm: 'realm', body: ['effort'] }),
  acp: agent.agentRoutes.acp,
  acpEnabled: defineRoute({ method: 'PUT', path: '/acp/agents/claude/enabled', scope: 'agent', realm: 'realm', body: ['enabled'] }),
  acpDefault: defineRoute({ method: 'GET', path: '/acp/default', scope: 'agent', realm: 'realm' }),
  acpDefaultPut: defineRoute({ method: 'PUT', path: '/acp/default', scope: 'agent', realm: 'realm', body: ['delegated_agent'] }),
  bots: botsListRoute,
  termCaps: defineRoute({ method: 'GET', path: `${T}/capabilities`, scope: 'kit', kit: 'terminal', index: 0 }),
  termSessions: defineRoute({ method: 'GET', path: `${T}/sessions`, scope: 'kit', kit: 'terminal', index: 0 }),
  termCreate: defineRoute({ method: 'POST', path: `${T}/create`, scope: 'kit', kit: 'terminal', index: (n: number) => inRunBand(n), query: ['terminal_id'], body: ['terminal_id', 'exclusive', 'user', 'wait_until_display'] }),
  termWait: defineRoute({ method: 'POST', path: `${T}/wait`, scope: 'kit', kit: 'terminal', index: term, body: ['mode', 'debounce_ms', 'timeout_ms'] }),
  termWrite: defineRoute({ method: 'POST', path: `${T}/write`, scope: 'kit', kit: 'terminal', index: term, body: ['input', 'enter'] }),
  termDelete: defineRoute({ method: 'DELETE', path: `${T}/:n`, scope: 'kit', kit: 'terminal', index: term, query: ['incarnation'] }),
} as const;

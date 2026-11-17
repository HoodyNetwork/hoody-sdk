// The conversation-settings requests, declared once with core's defineRoute. They go to the computer's agent in the
// captured realm, like Ask's own session routes; Ask keeps the session lifecycle (create, turns, stream).
import { defineRoute } from '../routes';
import type { Effort, Verbosity } from './types';

export const agentRoutes = {
  session: defineRoute({ method: 'GET', path: '/sessions/:id', scope: 'agent', timeoutMs: 20000 }),
  approval: defineRoute({ method: 'GET', path: '/sessions/:id/approval', scope: 'agent', timeoutMs: 20000 }),
  effort: defineRoute<unknown, { effort: Effort | '' }>({ method: 'PATCH', path: '/sessions/:id/effort', scope: 'agent', body: ['effort'] }),
  verbosity: defineRoute<unknown, { level: Verbosity }>({ method: 'PATCH', path: '/sessions/:id/verbosity', scope: 'agent', body: ['level'] }),
  yolo: defineRoute<unknown, { enabled: boolean }>({ method: 'PATCH', path: '/sessions/:id/yolo', scope: 'agent', body: ['enabled'] }),
  // Claude Code's state on this computer, and (newer agents) the models and efforts it accepts.
  acp: defineRoute({ method: 'GET', path: '/acp/agents', scope: 'agent', realm: 'realm' }),
} as const;

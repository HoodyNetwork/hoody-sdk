// The provider and model requests, declared once with core's defineRoute.
// They go to the computer's agent; the AI page adds its own routes beside these.
import { versionRoute } from '../kit-io';
import { defineRoute } from '../routes';

const MIB = 1024 * 1024;
const PAGE = ['page', 'limit'] as const;
const P = '/providers/:pid';
const OA = '/providers/openai/auth';
// A provider's own sign-in job (OpenRouter's PKCE flow: the person pastes back the code of the page they were sent to).
const PO = `${P}/auth/oauth`;

export const providerRoutes = {
  version: versionRoute,
  providers: defineRoute({ method: 'GET', path: '/providers', scope: 'agent', realm: 'none', query: PAGE }),
  provider: defineRoute({ method: 'GET', path: P, scope: 'agent', realm: 'none' }),
  auth: defineRoute({ method: 'GET', path: `${P}/auth`, scope: 'agent', realm: 'none' }),
  // The one GET /models every page reads (AI, Bots, Logs' Explain): the union of their query keys, and Logs'
  // 4 MiB answer budget (a computer with many providers lists hundreds of models).
  models: defineRoute({ method: 'GET', path: '/models', scope: 'agent', realm: 'none', query: ['ready', 'provider', ...PAGE], maxBytes: 4 * MIB }),
  keyPut: defineRoute({ method: 'PUT', path: `${P}/auth/api-key`, scope: 'agent', realm: 'none', body: ['api_key', 'check', 'if_definition_rev'], secret: ['api_key'] }),
  keyDelete: defineRoute({ method: 'DELETE', path: `${P}/auth/api-key`, scope: 'agent', realm: 'none' }),
  authTest: defineRoute({ method: 'POST', path: `${P}/auth/test`, scope: 'agent', realm: 'none' }),
  authDefault: defineRoute({ method: 'PUT', path: `${P}/auth/default`, scope: 'agent', realm: 'none', body: ['default'] }),
  oauthStart: defineRoute({ method: 'POST', path: `${OA}/oauth`, scope: 'agent', realm: 'none', body: ['method'], idem: true, secret: true }),
  oauthPoll: defineRoute({ method: 'GET', path: `${OA}/oauth/:job`, scope: 'agent', realm: 'none', secret: true }),
  oauthCancel: defineRoute({ method: 'DELETE', path: `${OA}/oauth/:job`, scope: 'agent', realm: 'none' }),
  signOut: defineRoute({ method: 'DELETE', path: `${OA}/oauth`, scope: 'agent', realm: 'none' }),
  // Not secret: the start sends nothing and answers a job id and OpenRouter's sign-in address, whose PKCE challenge is
  // public by design. A secret route's refusal is rebuilt without details, and the 409's job_id is what lets the Hub
  // follow a sign-in already waiting (oauth_in_progress).
  pkceStart: defineRoute({ method: 'POST', path: PO, scope: 'agent', realm: 'none', body: [], idem: true }),
  pkcePoll: defineRoute({ method: 'GET', path: `${PO}/:job`, scope: 'agent', realm: 'none', secret: true }),
  pkceCode: defineRoute({ method: 'POST', path: `${PO}/:job/code`, scope: 'agent', realm: 'none', body: ['code'], secret: ['code'] }),
  pkceCancel: defineRoute({ method: 'DELETE', path: `${PO}/:job`, scope: 'agent', realm: 'none' }),
} as const;

// The instructions requests of AI → Knowledge → Instructions, declared once with core's
// defineRoute. Both go to the computer's agent in the realm named by the call (the top bar's; never All realms: core refuses that
// unsent). The answer is what a session of that realm puts in its system prompt, never the flat home that PATCH /settings writes.
import { defineRoute } from '@core';

export const instructionsRoutes = {
  /** {text, enabled, revision}. An unreadable settings file is 500 store_failed, never empty. */
  get: defineRoute({ method: 'GET', path: '/settings/agent-instructions', scope: 'agent', realm: 'realm' }),
  /** Text and on/off together, checked against the revision read (in the body): 409 revision_conflict (details.current_revision)
   *  or instructions_overridden (details.fields, the realm's settings.local.json would keep winning) write nothing. */
  put: defineRoute<unknown, { text: string; enabled: boolean; expected_revision: string }>({
    method: 'PUT', path: '/settings/agent-instructions', scope: 'agent', realm: 'realm', body: ['text', 'enabled', 'expected_revision'],
    cas: { via: 'body', keys: ['expected_revision'] }, refuses: ['revision_conflict', 'instructions_overridden'],
  }),
} as const;

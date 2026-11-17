// Every request the logs page may make, declared once. Nothing leaves the page except through a
// route declared here (core refuses anything else unsent). Every logs kit is
// `<kit>-1` on the computer; kit reads carry no credentials, the agent's own rows do (core decides).
import { defineRoute, providers } from '@core';
import { FILTER_KEYS } from './rules';
import { completionOk } from './explain';

const KIB = 1024;
const MIB = 1024 * KIB;

export const routes = {
  // the logs kit: the computer's own record of visits, Bot calls and proxy decisions
  list: defineRoute({
    method: 'GET', path: '/_logs', scope: 'kit', kit: 'logs', index: 1,
    query: [...FILTER_KEYS, 'beforeId', 'afterId', 'limit'], maxBytes: 4 * MIB,
  }),
  stats: defineRoute({
    method: 'GET', path: '/_logs/stats', scope: 'kit', kit: 'logs', index: 1,
    query: [...FILTER_KEYS, 'bucketMs'], maxBytes: MIB,
  }),
  // Live: never reconnects; the controller resumes through afterId.
  tail: defineRoute({
    method: 'GET', path: '/_logs/stream', scope: 'kit', kit: 'logs', index: 1,
    query: ['source', 'kind', 'serviceName', 'excludeService', 'level', 'afterId'],
    stream: { id: 512 * KIB, noId: 4 * MIB }, maxBytes: 64 * MIB,
  }),
  // the computer's daemon: program list and one program's output
  programs: defineRoute({ method: 'GET', path: '/api/v1/daemon/programs', scope: 'kit', kit: 'daemon', index: 1, maxBytes: 4 * MIB }),
  programLogs: defineRoute({
    method: 'GET', path: '/api/v1/daemon/programs/:id/logs', scope: 'kit', kit: 'daemon', index: 1,
    query: ['type', 'lines', 'port'], maxBytes: 4 * MIB,
  }),
  // the computer's exec kit: runs of one script and one run's recent output
  runs: defineRoute({
    method: 'GET', path: '/api/v1/exec/logs/executions', scope: 'kit', kit: 'exec', index: 1,
    query: ['scriptPath', 'status', 'since', 'until', 'limit', 'before'], maxBytes: MIB,
  }),
  health: defineRoute({ method: 'GET', path: '/api/v1/exec/health', scope: 'kit', kit: 'exec', index: 1, maxBytes: MIB }),
  runOutput: defineRoute({
    method: 'POST', path: '/api/v1/exec/logs/read', scope: 'kit', kit: 'exec', index: 1,
    body: ['executionId', 'lines'], maxBytes: 4 * MIB,
  }),
  // the computer's agent: its own log (the AI helper source); the agent refuses any realm on /logs*
  helper: defineRoute({
    method: 'GET', path: '/logs', scope: 'agent', realm: 'none',
    query: ['since', 'until', 'text', 'min_level', 'before_seq', 'limit'], maxBytes: 4 * MIB,
  }),
  helperExport: defineRoute({
    method: 'GET', path: '/logs/export', scope: 'agent', realm: 'none',
    query: ['since', 'until', 'text', 'min_level', 'limit', 'format'], maxBytes: 8 * MIB,
  }),
  // changes (the realm host) and account activity (the base host)
  changes: defineRoute({
    method: 'GET', path: '/events', scope: 'realm',
    query: ['computer_id', 'start_date', 'end_date', 'sort_by', 'sort_order', 'limit', 'offset'],
  }),
  account: defineRoute({
    method: 'GET', path: '/users/auth/activity', scope: 'base',
    query: ['page', 'limit', 'start_date', 'end_date', 'min_status', 'method'],
  }),
  // Explain: models, the configured default's model, and one tool-free completion. The completion
  // route admits only the body explain.ts builds.
  models: providers.providerRoutes.models,
  agents: defineRoute({ method: 'GET', path: '/agents', scope: 'agent', realm: 'realm', maxBytes: 4 * MIB }),
  complete: defineRoute({
    method: 'POST', path: '/completions', scope: 'agent', realm: 'none',
    body: ['model', 'system', 'messages', 'settings', 'timeout_ms'], maxBytes: 256 * KIB, timeoutMs: 65000,
    guard: (req) => completionOk({ body: req.body }),
  }),
} as const;

export type Routes = typeof routes;

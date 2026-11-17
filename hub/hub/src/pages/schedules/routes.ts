// The routes of the schedules page, declared once (kits: cron, exec, curl; the daemon overview; the agent's loops).
import { defineRoute } from '@core';
import type { RawCronRun } from './logic';

// ── Declared routes ──────────────────────────────────────────────────────────────────

const CRON = '/api/v1/cron';
const ENTRY = `${CRON}/users/:user/entries`;
const EDIT = ['schedule', 'command', 'name', 'comment', 'expires_at', 'enabled'] as const;

export const routes = {
  // commands (cron kit)
  health: defineRoute({ method: 'GET', path: `${CRON}/health`, scope: 'kit', kit: 'cron', index: 1 }),
  info: defineRoute({ method: 'GET', path: `${CRON}/info`, scope: 'kit', kit: 'cron', index: 1 }),
  entries: defineRoute({ method: 'GET', path: `${CRON}/entries`, scope: 'kit', kit: 'cron', index: 1, query: ['page', 'limit'], framed: false, maxBytes: 4 * 1048576 }),
  create: defineRoute({ method: 'POST', path: ENTRY, scope: 'kit', kit: 'cron', index: 1, body: [...EDIT], secret: ['command'] }),
  edit: defineRoute({ method: 'PATCH', path: `${ENTRY}/:id`, scope: 'kit', kit: 'cron', index: 1, body: [...EDIT, 'clear_expiration', 'expected_revision'], secret: ['command'] }),
  remove: defineRoute({ method: 'DELETE', path: `${ENTRY}/:id`, scope: 'kit', kit: 'cron', index: 1, query: ['expected_revision'] }),
  run: defineRoute({ method: 'POST', path: `${ENTRY}/:id/run`, scope: 'kit', kit: 'cron', index: 1, body: ['expected_revision'], idem: true }),
  runs: defineRoute<{ runs: RawCronRun[] }>({ method: 'GET', path: `${CRON}/runs`, scope: 'kit', kit: 'cron', index: 1, query: ['user', 'entry_id', 'limit', 'before', 'run_id', 'key'] }),
  describe: defineRoute<{ next_runs?: string[]; error?: string }>({ method: 'POST', path: `${CRON}/schedule/describe`, scope: 'kit', kit: 'cron', index: 1, body: ['schedule'] }),
  // scripts (exec kit)
  execList: defineRoute({ method: 'GET', path: '/api/v1/exec/schedules/list', scope: 'kit', kit: 'exec', index: 1 }),
  execTrigger: defineRoute({ method: 'POST', path: '/api/v1/exec/schedules/trigger', scope: 'kit', kit: 'exec', index: 1, body: ['scriptPath', 'force', 'wait'], idem: true }),
  execHistory: defineRoute({ method: 'GET', path: '/api/v1/exec/schedules/history', scope: 'kit', kit: 'exec', index: 1, query: ['scriptPath', 'limit', 'idem', 'runId'], framed: false }),
  // web requests (curl kit)
  curlList: defineRoute({ method: 'GET', path: '/api/v1/curl/schedule', scope: 'kit', kit: 'curl', index: 1, framed: false, maxBytes: 4 * 1048576 }),
  curlEdit: defineRoute({ method: 'PATCH', path: '/api/v1/curl/schedule/:id', scope: 'kit', kit: 'curl', index: 1, body: ['cron'] }),
  curlRemove: defineRoute({ method: 'DELETE', path: '/api/v1/curl/schedule/:id', scope: 'kit', kit: 'curl', index: 1 }),
  curlToggle: defineRoute({ method: 'PATCH', path: '/api/v1/curl/schedule/:id/toggle', scope: 'kit', kit: 'curl', index: 1, body: ['enabled'] }),
  curlJobs: defineRoute({ method: 'GET', path: '/api/v1/curl/jobs', scope: 'kit', kit: 'curl', index: 1, query: ['schedule_id', 'limit'], framed: false }),
  userEntries: defineRoute({ method: 'GET', path: `${ENTRY}`, scope: 'kit', kit: 'cron', index: 1, query: ['page', 'limit'], framed: false, maxBytes: 4 * 1048576 }),
  entryGet: defineRoute({ method: 'GET', path: `${ENTRY}/:id`, scope: 'kit', kit: 'cron', index: 1, framed: false }),
  loopPatch: defineRoute({ method: 'PATCH', path: '/sessions/:sid/loops/:loop', scope: 'agent', realm: 'realm', body: ['paused'] }),
  loopRun: defineRoute({ method: 'POST', path: '/sessions/:sid/loops/:loop/run-now', scope: 'agent', realm: 'realm', idem: true }),
  loopDelete: defineRoute({ method: 'DELETE', path: '/sessions/:sid/loops/:loop', scope: 'agent', realm: 'realm' }),
  loops: defineRoute({ method: 'GET', path: '/loops', scope: 'agent', realm: 'list', framed: false }),
  // the daemon's overview gates which sources are read
  overview: defineRoute({ method: 'GET', path: '/api/v1/daemon/programs/overview', scope: 'kit', kit: 'daemon', index: 1 }),
} as const;


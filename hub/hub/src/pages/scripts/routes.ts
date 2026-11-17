// Every request the scripts page may make, declared once. Nothing leaves the page except through a
// route declared here (KIT / AGENT / BASE rows).
//
// Changes are never retried and never resent: a lost answer is read back (ops/settle by opId for kit writes,
// the Idempotency-Key replay for agent writes).
import { agentSignInRoutes, aliasRoutes, defineRoute, execIndex } from '@core';
import { INSTANTIATE_CODES, WRITE_CODES, WRITE_UNKNOWN_CODES } from './new/liveErrors';
import type { EnvKeys, ResolveAnswer, ScriptFile, Summary, TestsDoc, Usage, Validation, Version, WriteResult } from './types';

const MIB = 1 << 20;
// Any Exec folder 1..9999 (the page's ?exec=): no default, so every call names the folder its path or the page is in.
const exec = { scope: 'kit', kit: 'exec', index: execIndex } as const;

export const routes = {
  // Exec kit reads
  health: defineRoute({ method: 'GET', path: '/api/v1/exec/health', ...exec }),
  list: defineRoute({ method: 'GET', path: '/api/v1/exec/scripts/list', ...exec, query: ['recursive', 'metadata', 'include_comments'], maxBytes: 4 * MIB }),
  read: defineRoute<ScriptFile>({ method: 'GET', path: '/api/v1/exec/scripts/read', ...exec, query: ['path'], maxBytes: 4 * MIB }),
  validate: defineRoute<Validation>({ method: 'POST', path: '/api/v1/exec/validate/script', ...exec, body: ['code', 'language'], maxBytes: 2 * MIB }),
  resolve: defineRoute<ResolveAnswer>({ method: 'POST', path: '/api/v1/exec/route/resolve', ...exec, body: ['path', 'hostname', 'execId', 'omit'] }),
  history: defineRoute<{ versions: Version[]; cursor?: string }>({ method: 'GET', path: '/api/v1/exec/scripts/history', ...exec, query: ['path', 'limit', 'cursor'] }),
  historyRead: defineRoute<ScriptFile>({ method: 'GET', path: '/api/v1/exec/scripts/history/read', ...exec, query: ['path', 'version'], maxBytes: 4 * MIB }),
  deleted: defineRoute({ method: 'GET', path: '/api/v1/exec/scripts/history/deleted', ...exec }),
  envKeys: defineRoute<EnvKeys>({ method: 'GET', path: '/api/v1/exec/env/keys', ...exec, query: ['scriptPath'] }),
  summary: defineRoute<{ scripts: Summary[] }>({ method: 'GET', path: '/api/v1/exec/monitor/scripts-summary', ...exec }),
  usage: defineRoute<Usage>({ method: 'GET', path: '/api/v1/exec/monitor/script-usage', ...exec, query: ['scriptPath'] }),
  executions: defineRoute({ method: 'GET', path: '/api/v1/exec/logs/executions', ...exec, query: ['scriptPath', 'status', 'since', 'until', 'limit', 'before'] }),
  tests: defineRoute<TestsDoc>({ method: 'GET', path: '/api/v1/exec/tests/list', ...exec, query: ['scriptPath'] }),
  // a test request to the script's own address (kit-io run: any path under /, never the kit's own API)
  runGet: defineRoute({ method: 'GET', path: '/', ...exec, run: true }),
  runPost: defineRoute({ method: 'POST', path: '/', ...exec, run: true }),
  // Exec kit changes (each carries an opId so a lost answer is settled, never resent). Each goes through hoody-exec's ops journal,
  // whose 409 OP_IN_PROGRESS / OP_OUTCOME_UNKNOWN for a repeated op (cause in details.code, read by core's errorOf) is an unknown
  // outcome, never a refusal: every such route lists them as unknownCodes.
  write: defineRoute<WriteResult>({ method: 'POST', path: '/api/v1/exec/scripts/write', ...exec, body: ['path', 'content', 'ifRevision', 'opId', 'note', 'expectRoute'], secret: ['content'], codes: WRITE_CODES, unknownCodes: WRITE_UNKNOWN_CODES }),
  restore: defineRoute<WriteResult>({ method: 'POST', path: '/api/v1/exec/scripts/restore', ...exec, body: ['path', 'version', 'ifRevision', 'opId', 'note', 'expectRoute'], unknownCodes: WRITE_UNKNOWN_CODES }),
  settle: defineRoute({ method: 'POST', path: '/api/v1/exec/ops/settle', ...exec, body: ['opId', 'sentAfter'] }),
  comments: defineRoute<WriteResult>({ method: 'PUT', path: '/api/v1/exec/magic-comments/update', ...exec, body: ['path', 'ifRevision', 'opId', 'comments'], secret: ['comments'] , codes: ['BAD_REVISION', 'REVISION_MISMATCH', 'SCRIPT_BUSY'], unknownCodes: WRITE_UNKNOWN_CODES }),
  // The magic comments of one script, driven by hoody-exec itself: the field list (schema), the stored values (read, secrets shown as
  // [REDACTED]) and a dry run of the same update (nothing is written; it is the computer's own check of a proposed set).
  commentsSchema: defineRoute({ method: 'GET', path: '/api/v1/exec/magic-comments/schema', ...exec, maxBytes: MIB }),
  commentsRead: defineRoute({ method: 'GET', path: '/api/v1/exec/magic-comments/read', ...exec, query: ['path'], maxBytes: MIB }),
  commentsDry: defineRoute({ method: 'PUT', path: '/api/v1/exec/magic-comments/update', ...exec, body: ['path', 'ifRevision', 'comments', 'dry_run'], secret: ['comments'], codes: ['BAD_REVISION', 'REVISION_MISMATCH', 'SCRIPT_BUSY'] }),
  // Magic comments over code the page holds (a new script's, before it is written): exec's own reading of the header, and the
  // lines its serializer writes for a set of values, answered as edits by line. Stateless: nothing is read or written on disk.
  commentsParse: defineRoute({ method: 'POST', path: '/api/v1/exec/magic-comments/parse', ...exec, body: ['text'], secret: ['text'], maxBytes: MIB }),
  commentsPrint: defineRoute({ method: 'POST', path: '/api/v1/exec/magic-comments/print', ...exec, body: ['text', 'set'], secret: ['text', 'set'], maxBytes: MIB }),
  remove: defineRoute({ method: 'DELETE', path: '/api/v1/exec/scripts/delete', ...exec, query: ['path', 'confirm', 'ifRevision', 'opId', 'keepCopy', 'expectRoute'], unknownCodes: WRITE_UNKNOWN_CODES }),
  // Its own refusals of what was typed (hoody-exec: 400 INVALID_ENV_KEY, 400 INVALID_ENV_VALUE, 422 ENV_LIMIT) are
  // listed so the page can say which box to fix: a secret route keeps a code only when it is listed, never a message or details.
  envUpdate: defineRoute({ method: 'POST', path: '/api/v1/exec/env/update', ...exec, body: ['scriptPath', 'scope', 'rel', 'set', 'unset', 'ifRevision', 'opId'], secret: ['set'] , codes: ['BAD_REVISION', 'REVISION_MISMATCH', 'SCRIPT_BUSY', 'INVALID_ENV_KEY', 'INVALID_ENV_VALUE', 'ENV_LIMIT'], unknownCodes: WRITE_UNKNOWN_CODES }),
  testsPut: defineRoute({ method: 'PUT', path: '/api/v1/exec/tests/put', ...exec, body: ['scriptPath', 'cases', 'ifRevision', 'opId'], secret: ['cases'], unknownCodes: WRITE_UNKNOWN_CODES }),
  testsDelete: defineRoute({ method: 'DELETE', path: '/api/v1/exec/tests/delete', ...exec, query: ['scriptPath', 'ifRevision', 'opId'], unknownCodes: WRITE_UNKNOWN_CODES }),
  trigger: defineRoute({ method: 'POST', path: '/api/v1/exec/schedules/trigger', ...exec, body: ['scriptPath', 'force'], idem: true }),
  // the agent: ideas, the writing session, and the guarded delete of idea-made scripts
  instances: defineRoute({ method: 'GET', path: '/script-instances', scope: 'agent', query: ['computer_id'] }),
  // One idea as the agent lists it (its fields), read for the idea way's Check (the template text is the agent's to render).
  template: defineRoute({ method: 'GET', path: '/script-templates/:name', scope: 'agent' }),
  instantiate: defineRoute({ method: 'POST', path: '/script-templates/:name/instantiate', scope: 'agent', body: ['computer_id', 'script_path', 'vars', 'caller_key'], secret: ['vars', 'caller_key'], idem: true, codes: INSTANTIATE_CODES }),
  instanceDelete: defineRoute({ method: 'POST', path: '/script-instances/delete', scope: 'agent', body: ['computer_id', 'path', 'if_revision', 'op_id', 'keep_copy'], idem: true }),
  // The agent's own state: what it lists is core's versionRoute (GET /version); whose it is is authStatus, global like the agent's /health
  // core's route (agent-signin.ts reads it to prove a sign-in): one route object, so fixture states answer both.
  authStatus: agentSignInRoutes.status,
  // The writing session: one session of the script-writer per ask, one turn in it, read back through its own record
  sessionCreate: defineRoute({ method: 'POST', path: '/sessions', scope: 'agent', body: ['agent', 'model', 'realm', 'computer', 'tool_mode', 'dir_scope', 'approval', 'expected_binding'], idem: true }),
  turn: defineRoute({ method: 'POST', path: '/sessions/:sid/turns', scope: 'agent', body: ['text'], secret: ['text'], codes: ['gate_parked', 'turn_in_flight', 'idempotency_key_reused'], idem: true, maxBytes: 2 * MIB }),
  cancel: defineRoute({ method: 'POST', path: '/sessions/:sid/cancel', scope: 'agent', body: ['turn_id'], idem: true }),
  turnRead: defineRoute({ method: 'GET', path: '/sessions/:sid/turns/:tid', scope: 'agent' }),
  turns: defineRoute({ method: 'GET', path: '/sessions/:sid/turns', scope: 'agent' }),
  transcript: defineRoute({ method: 'GET', path: '/sessions/:sid/transcript', scope: 'agent', maxBytes: 16 * MIB }),
  // A stored build's own reads (New script): the session summary (live binding, incarnation, a
  // parked gate), its current step, and the gateway's buffered event window (min_seq/max_seq/incarnation) to resume a stream from.
  session: defineRoute({ method: 'GET', path: '/sessions/:sid', scope: 'agent' }),
  sessionState: defineRoute({ method: 'GET', path: '/sessions/:sid/state', scope: 'agent' }),
  replay: defineRoute({ method: 'GET', path: '/sessions/:sid/replay', scope: 'agent', maxBytes: 16 * MIB }),
  stream: defineRoute({ method: 'GET', path: '/sessions/:sid/stream', scope: 'agent', query: ['since', 'incarnation'], stream: { id: 2 * MIB, noId: 256 * 1024 }, maxBytes: 64 * MIB, timeoutMs: 20000 }),
  // public links (Hoody API)
  aliases: aliasRoutes.list,
  aliasCreate: aliasRoutes.create,
  aliasState: aliasRoutes.state,
  aliasRemove: aliasRoutes.remove,
} as const;

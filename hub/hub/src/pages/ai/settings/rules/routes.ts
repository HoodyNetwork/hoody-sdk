// The requests of AI → Settings → Rules & hooks and of the settings session behind them, declared
// once with core's defineRoute. All go to the computer's agent in the realm the call names.
//
// A rules READ needs no session (getHookRules; X-Hoody-Cwd adds a folder's project and local scopes). Hooks, MCP and every
// WRITE need a live session, so a settings session (a `chat` agent that has no tools, never prompted) is created for them
// and closed when the person leaves (Session.ts). A guarded write mints its single-use nonce first (beginHookWrite: bound
// to session + op + scope) and presents it with the scope's revision; both are required before anything leaves.
import { defineRoute } from '@core';

/** The settings session's create. Keyed (Idempotency-Key): a lost answer is never asked again under that key (Session.ts). */
export const sessionRoutes = {
  create: defineRoute({
    method: 'POST', path: '/sessions', scope: 'agent', idem: true,
    body: ['agent', 'realm', 'computer', 'cwd', 'tool_mode', 'dir_scope', 'approval', 'expected_binding'],
  }),
  // The hard close (DELETE /sessions/:id?hard=true) is core's one route for that endpoint, agent.sessionRoutes.delete (Session.ts).
} as const;

export const rulesRoutes = {
  /** The rules of the realm's settings with no session: user scope always, project and local with a folder. Never changes anything. */
  get: defineRoute({ method: 'GET', path: '/hooks/rules', scope: 'agent', realm: 'realm', cwd: true, maxBytes: 1048576, timeoutMs: 20000 }),
  /** The hooks and rules of a live session (the first read of the Hooks view; revisions come from here as well). */
  list: defineRoute({ method: 'GET', path: '/hooks', scope: 'agent', realm: 'realm', query: ['session_id'], maxBytes: 2097152, timeoutMs: 20000 }),
  /** Mints the nonce of one guarded write: bound to this session, this op and this scope, single use, five minutes. It changes nothing. */
  begin: defineRoute({ method: 'POST', path: '/hooks/begin-write', scope: 'agent', realm: 'realm', body: ['session_id', 'op', 'scope'] }),
  /**
   * Replaces ONE scope's complete rules list. Refused before anything is written: a spent or foreign nonce, a rules list that
   * fails validation (all or nothing), a scope whose rules changed since `expected_revision`, a session that is gone.
   * `exec_trust` and `timeout_ms` are not declared: this page never sends them, so the grants and the budget stay as they are.
   */
  set: defineRoute({
    method: 'POST', path: '/hooks/rules', scope: 'agent', realm: 'realm',
    body: ['session_id', 'nonce', 'scope', 'rules', 'expected_revision'],
    cas: { via: 'body', keys: ['nonce', 'expected_revision'] },
    refuses: ['write_intent_invalid', 'revision_conflict', 'bad_request', 'not_found', 'realm_denied'],
  }),
} as const;

/**
 * The guarded hook writes. Each presents the single-use nonce of its own op (beginHookWrite) and is sent once: a refused
 * nonce is a definite refusal and a lost answer is held, never resent. The delete carries its identity in a JSON BODY.
 */
export const hookRoutes = {
  /** Turns one ordinary hook on or off, named by event + matcher + the exact command. */
  toggle: defineRoute({
    method: 'POST', path: '/hooks/toggle', scope: 'agent', realm: 'realm',
    body: ['session_id', 'nonce', 'scope', 'event', 'matcher', 'command', 'disabled'],
    cas: { via: 'body', keys: ['nonce'] }, refuses: ['write_intent_invalid', 'bad_request', 'not_found', 'realm_denied'],
  }),
  /**
   * Removes one hook, named by event + matcher + the exact command (leaving the command out would remove its whole group). A hook the
   * agent turned off for hidden characters is named by its place instead (`matcher_index` + `index`, with the matcher and command as
   * listed, marked): the agent removes only such a hook whose marked text is the one sent, and never a hook it runs.
   */
  remove: defineRoute({
    method: 'DELETE', path: '/hooks', scope: 'agent', realm: 'realm', deleteBody: true,
    body: ['session_id', 'nonce', 'scope', 'event', 'matcher', 'command', 'matcher_index', 'index'],
    cas: { via: 'body', keys: ['nonce'] }, refuses: ['write_intent_invalid', 'bad_request', 'not_found', 'realm_denied'],
  }),
  /**
   * Adds a hook or updates one in place, named by event + matcher + the exact command. A different command is a different hook.
   * `when` (call_when) is sent only by the add of a replace, carrying the old hook's condition: an absent `when` keeps the stored
   * one, so an update in place leaves it out.
   */
  upsert: defineRoute({
    method: 'PUT', path: '/hooks', scope: 'agent', realm: 'realm',
    body: ['session_id', 'nonce', 'scope', 'event', 'matcher', 'command', 'timeout', 'name', 'description', 'when'],
    cas: { via: 'body', keys: ['nonce'] }, refuses: ['write_intent_invalid', 'bad_request', 'realm_denied'],
  }),
  /** Runs ONE unsaved command now, as the person, on the computer (the agent caps it at 60 s). It writes nothing and needs no nonce. */
  test: defineRoute({
    method: 'POST', path: '/hooks/test', scope: 'agent', realm: 'realm',
    body: ['session_id', 'event', 'command', 'timeout'],
    refuses: ['approval_policy_unsatisfiable', 'bad_request', 'not_found', 'realm_denied'], maxBytes: 1048576, timeoutMs: 130000,
  }),
  /** Switches the kill switch of one settings file. `value` is always sent: absent reads as false, a re-enable. */
  disableAll: defineRoute({
    method: 'POST', path: '/hooks/disable-all', scope: 'agent', realm: 'realm',
    body: ['session_id', 'nonce', 'scope', 'value'],
    cas: { via: 'body', keys: ['nonce'] }, refuses: ['write_intent_invalid', 'bad_request', 'not_found', 'realm_denied'],
  }),
  /**
   * Trusts the hooks the person reviewed: `hash` is the trust hash read from listHooks, and the agent refuses one that no
   * longer matches the live hooks. `high_risk` is exactly "the reviewed trust has unverifiable targets": the agent requires it then
   * and refuses it otherwise. No nonce. Every refusal (hash moved, wrong risk kind, nothing to trust) is the same bare 400
   * bad_request with prose only, so a refusal is read as "nothing recorded" and the list is read again to see why. Idempotent for
   * the same hash.
   */
  ackTrust: defineRoute({
    method: 'POST', path: '/hooks/trust/ack', scope: 'agent', realm: 'realm',
    body: ['session_id', 'hash', 'high_risk'],
    cas: { via: 'body', keys: ['hash'] }, refuses: ['bad_request', 'not_found', 'realm_denied'],
  }),
} as const;

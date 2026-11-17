// The MCP server requests of AI → Settings → Connections, declared once with core's defineRoute.
// Every one names a live session (the settings session, settings/rules/Session.ts): the agent resolves the settings files
// against that session's folder and realm, so none takes a folder header. A write presents a single-use nonce minted for its
// op and settings layer (beginMCPWrite) AND the hash of that layer's servers as the person last saw them (expect_hash), so a
// change made meanwhile by anyone else is refused (409 mcp_conflict) instead of overwritten.
//
// probeMCPServer is not declared: over HTTP the agent always refuses it (403 human_only), so the Hub never offers it.
// An import sends a pasted config twice: once to preview it (writes nothing), then, as reviewed, to import it. The
// document may hold env and header values, so both routes name it secret: core keeps no copy and rebuilds their refusals
// from the code alone (the agent's message may quote the document).
import { defineRoute } from '@core';

/** The refusals a write gets before it changes anything: the layer moved (mcp_conflict), the nonce or the entry is not
 *  valid (bad_request), the realm is not served (realm_denied). A missing session (404) is handled by the session manager. */
const WRITE_REFUSES = ['mcp_conflict', 'bad_request', 'realm_denied'] as const;

export const mcpRoutes = {
  /** The effective servers of the session, the settings files behind them (each with its hash) and each server's live
   *  state. env and header VALUES are never in it, only their names. */
  list: defineRoute({ method: 'GET', path: '/mcp/servers', scope: 'agent', realm: 'realm', query: ['session_id'], maxBytes: 2097152, timeoutMs: 30000 }),
  /** Mints the nonce of one write: bound to this session, this op and this settings layer, single use, short lived. It
   *  changes nothing. */
  begin: defineRoute({ method: 'POST', path: '/mcp/write-intents', scope: 'agent', realm: 'realm', body: ['session_id', 'op', 'scope'], refuses: ['bad_request', 'realm_denied'] }),
  /** Adds a server or changes one, field by field; env and header values merge per name (null removes one). The values the
   *  person typed are secret: they are never kept by core or shown back. */
  upsert: defineRoute({
    method: 'PUT', path: '/mcp/servers', scope: 'agent', realm: 'realm', timeoutMs: 90000,
    body: ['session_id', 'nonce', 'scope', 'expect_hash', 'server'], secret: ['server'],
    // A secret route's refusal keeps only declared codes: not_found is the lost session's (the session manager replaces it).
    codes: ['not_found'], cas: { via: 'body', keys: ['nonce', 'expect_hash'] }, refuses: [...WRITE_REFUSES],
  }),
  /** Removes one server from one settings layer; it is cut off in every open chat before the answer. */
  remove: defineRoute({
    method: 'DELETE', path: '/mcp/servers', scope: 'agent', realm: 'realm', timeoutMs: 90000, deleteBody: true,
    body: ['session_id', 'nonce', 'scope', 'name', 'expect_hash'],
    cas: { via: 'body', keys: ['nonce', 'expect_hash'] }, refuses: [...WRITE_REFUSES],
  }),
  /** Turns one server on or off; its settings and saved values stay. */
  enable: defineRoute({
    method: 'POST', path: '/mcp/servers/enable', scope: 'agent', realm: 'realm', timeoutMs: 90000,
    body: ['session_id', 'nonce', 'scope', 'name', 'enabled', 'expect_hash'],
    cas: { via: 'body', keys: ['nonce', 'expect_hash'] }, refuses: [...WRITE_REFUSES],
  }),
  /** Reads a pasted config as the import would (any of the agent's dialects) and answers each server with its env and header
   *  NAMES only, every one off. Writes nothing, so no nonce. */
  parse: defineRoute({
    method: 'POST', path: '/mcp/parse', scope: 'agent', realm: 'realm', timeoutMs: 30000, body: ['session_id', 'document'], secret: ['document'],
    codes: ['not_found'], refuses: ['bad_request', 'realm_denied'],
  }),
  /** Imports the servers of a pasted config into one settings layer, all off. One bad entry refuses the whole import; a name
   *  the layer already has refuses it too unless `replace`. */
  import: defineRoute({
    method: 'POST', path: '/mcp/import', scope: 'agent', realm: 'realm', timeoutMs: 90000,
    body: ['session_id', 'nonce', 'scope', 'document', 'replace', 'expect_hash'], secret: ['document'],
    codes: ['not_found'], cas: { via: 'body', keys: ['nonce', 'expect_hash'] }, refuses: [...WRITE_REFUSES],
  }),
  /** Reads the settings files again and reconnects the servers: writes nothing, so no nonce. The agent spaces these out
   *  per session (429 rate_limited). */
  reconnect: defineRoute({ method: 'POST', path: '/mcp/reconnect', scope: 'agent', realm: 'realm', timeoutMs: 90000, body: ['session_id'], refuses: ['rate_limited'] }),
} as const;

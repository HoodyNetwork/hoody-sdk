// The POSTs that only read (plain version): a page asks something of the server with a body,
// and nothing is written. The send policy admits them as reads: no durable record, any store mode. The list is exact
// (scope, kit, method, path of a declared route, and its declared body keys in order: a route that takes another key, such
// as validate's opt-in `typecheck`, which may install a package, is a change); post-reads.term.test.ts pins each entry to
// the page route that sends it. A route not listed here is a change, whatever its name says.
import type { Route } from '../../core/routes';

const POST_READS: ReadonlyMap<string, readonly string[]> = new Map<string, readonly string[]>([
  ['kit exec POST /api/v1/exec/route/resolve', ['path', 'hostname', 'execId', 'omit']], // scripts: who answers an address
  ['kit exec POST /api/v1/exec/validate/script', ['code', 'language']], // scripts: check a script's code
  ['kit exec POST /api/v1/exec/magic-comments/parse', ['text']], // scripts: read a new script's header (stateless)
  ['kit exec POST /api/v1/exec/magic-comments/print', ['text', 'set']], // scripts: the header lines a set of values prints as (stateless)
  ['kit exec POST /api/v1/exec/logs/read', ['executionId', 'lines']], // logs: a run's output
  ['agent - POST /memory/search', ['project', 'query', 'limit', 'kinds']], // AI memory: search
  ['agent - POST /mcp/parse', ['session_id', 'document']], // AI connections: read a pasted config, writes nothing
]);

const keyOf = (r: Pick<Route, 'scope' | 'method' | 'path'> & { readonly kit?: string }): string => `${r.scope} ${r.kit ?? '-'} ${r.method} ${r.path}`;

/** True for a declared route that is a POST read: the policy admits it as a read. */
export function isPostRead(route: unknown): boolean {
  if (typeof route !== 'object' || route === null) return false;
  const r = route as Pick<Route, 'scope' | 'method' | 'path'> & { readonly kit?: string; readonly change?: boolean; readonly body?: unknown };
  if (r.method !== 'POST' || r.change === true) return false;
  const want = POST_READS.get(keyOf(r));
  const body = r.body;
  return want !== undefined && Array.isArray(body) && body.length === want.length && want.every((k, i) => body[i] === k);
}

/** The list, for the census test. */
export const POST_READ_KEYS: readonly string[] = Object.freeze([...POST_READS.keys()]);

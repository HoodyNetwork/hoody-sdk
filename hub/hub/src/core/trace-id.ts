// The Hoody API's trace id rule (shared.js apiCall keeps the same one): a UUID
// or 16-64 hex characters. A value of that shape can carry nothing but an id, so core may keep it on any
// rejection, a secret call's included (C9). Anything else is no id.
const TRACE_ID = /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{16,64})$/;

/** `v` when it is a trace id in the API's accepted shape, else null. */
export function traceIdOf(v: unknown): string | null {
  return typeof v === 'string' && TRACE_ID.test(v) ? v : null;
}

/** "METHOD /declared/{template}" of a declared route: the template's `:name` segments shown as `{name}`. Built from
 *  the declaration only, never from a filled path or a query, so it carries no id, key or value a call sent. */
export function routeLabel(method: string, path: string): string {
  return method + ' ' + path.replace(/(^|\/):([a-z][A-Za-z0-9_]*)/g, '$1{$2}').replace(/(^|\/)\*([a-z][A-Za-z0-9_]*)$/, '$1{$2+}');
}

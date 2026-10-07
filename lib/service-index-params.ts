/**
 * Which request parameter names a kit's host index.
 *
 * A kit URL carries an instance index in its host
 * (`{projectId}-{containerId}-terminal-{serviceIndex}.{server}…`). For the kits
 * below the containers proxy treats that index as authoritative: it overwrites
 * the matching query parameter (`?terminal_id=`, `?browser_id=`, `?id=`, the
 * display selectors) with the host's index on every request. A client that
 * sends `terminal_id=5` to the `-terminal-1` host therefore reaches terminal 1.
 * So the parameter has to pick the host, and this table says which parameter
 * does that for which kit.
 *
 * One table for the SDK (the generated service base, `buildTemplateUrl`) and
 * the CLI (`cli/http-client.ts`, `extractServiceIndex`). Hand-maintained; it
 * has no template mirror and no Node-only import, so the browser bundle can
 * carry it.
 *
 * `agent` is absent on purpose: the hoody-agent-d HTTP gateway is a singleton
 * served at `-agent-1`.
 */
export const SERVICE_INDEX_PARAMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  browser: Object.freeze(['browser_id']),
  terminal: Object.freeze(['terminal_id']),
  display: Object.freeze(['displayId', 'display_id', 'display']),
  code: Object.freeze(['id']),
});

export interface ServiceIndexParamMatch {
  /** The query parameter that matched (e.g. `terminal_id`). */
  param: string;
  /** The caller's value, untouched. */
  value: unknown;
  /**
   * The host index the value names, or undefined when it cannot ride the host:
   * the proxy reads the index as an integer, so `abc`, `007`, `1.5` and `-1`
   * name no instance it can route to.
   */
  index: number | undefined;
}

/**
 * A host index: a non-negative safe integer, or its canonical decimal string.
 * 0 is legal (`terminal_id=0` is the terminal kit's "no terminal id" value).
 */
export function parseServiceIndex(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * The first index parameter of `namespace` that `query` carries. A parameter
 * that is undefined, null or the empty string counts as absent.
 */
export function findServiceIndexParam(
  namespace: string | undefined,
  query: Record<string, unknown> | null | undefined,
): ServiceIndexParamMatch | undefined {
  if (!namespace || !query) return undefined;
  if (!Object.prototype.hasOwnProperty.call(SERVICE_INDEX_PARAMS, namespace)) return undefined;
  for (const param of SERVICE_INDEX_PARAMS[namespace]!) {
    const value = query[param];
    if (value === undefined || value === null || value === '') continue;
    return { param, value, index: parseServiceIndex(value) };
  }
  return undefined;
}

/** The host index `query` names for `namespace`; undefined when it names none. */
export function serviceIndexFromQuery(
  namespace: string | undefined,
  query: Record<string, unknown> | null | undefined,
): number | undefined {
  return findServiceIndexParam(namespace, query)?.index;
}

/**
 * The parameter that asks a kit for a FRESH instance, per kit. The terminal kit
 * generates a new terminal id (40000-65535) for `ephemeral=true` only when the
 * request names no terminal id; through the proxy that means the `-terminal-0`
 * host, since every other host forces `terminal_id=<its index>` and the call
 * then runs in that terminal (or is refused on it).
 */
export const SERVICE_FRESH_INSTANCE_PARAMS: Readonly<Record<string, string>> = Object.freeze({
  terminal: 'ephemeral',
});

/** The kit's own spelling of true for these flags: `1`, `true`, `yes`. */
function isKitTrue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes';
}

/**
 * The host index a request names, from every place it can name one, in the
 * order the kit reads them:
 *
 * 1. a PATH parameter of the table (`/history/{terminal_id}`,
 *    `DELETE /{terminal_id}`, `/{terminal_id}/automation`). The proxy never
 *    rewrites the path, and the kit reads the path id before the query, so
 *    the call acts on that id from any host; but the proxy checks access on
 *    the host's index, so the host must be the one the id names.
 * 2. a query parameter of the table (`?terminal_id=`), which the proxy
 *    overwrites with the host's index.
 * 3. the kit's fresh-instance flag with no id (`ephemeral=true`): index 0,
 *    the proxy's "no terminal id" host.
 *
 * Undefined when the request names none: the client's own index applies.
 */
export function findRequestServiceIndex(
  namespace: string | undefined,
  query: Record<string, unknown> | null | undefined,
  pathParams?: Record<string, unknown> | null,
): ServiceIndexParamMatch | undefined {
  const fromPath = findServiceIndexParam(namespace, pathParams);
  if (fromPath) return fromPath;
  const fromQuery = findServiceIndexParam(namespace, query);
  if (fromQuery) return fromQuery;
  if (!namespace || !query) return undefined;
  if (!Object.prototype.hasOwnProperty.call(SERVICE_FRESH_INSTANCE_PARAMS, namespace)) return undefined;
  const flag = SERVICE_FRESH_INSTANCE_PARAMS[namespace]!;
  return isKitTrue(query[flag]) ? { param: flag, value: query[flag], index: 0 } : undefined;
}

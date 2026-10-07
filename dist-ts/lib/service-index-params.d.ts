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
export declare const SERVICE_INDEX_PARAMS: Readonly<Record<string, readonly string[]>>;
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
export declare function parseServiceIndex(value: unknown): number | undefined;
/**
 * The first index parameter of `namespace` that `query` carries. A parameter
 * that is undefined, null or the empty string counts as absent.
 */
export declare function findServiceIndexParam(namespace: string | undefined, query: Record<string, unknown> | null | undefined): ServiceIndexParamMatch | undefined;
/** The host index `query` names for `namespace`; undefined when it names none. */
export declare function serviceIndexFromQuery(namespace: string | undefined, query: Record<string, unknown> | null | undefined): number | undefined;
/**
 * The parameter that asks a kit for a FRESH instance, per kit. The terminal kit
 * generates a new terminal id (40000-65535) for `ephemeral=true` only when the
 * request names no terminal id; through the proxy that means the `-terminal-0`
 * host, since every other host forces `terminal_id=<its index>` and the call
 * then runs in that terminal (or is refused on it).
 */
export declare const SERVICE_FRESH_INSTANCE_PARAMS: Readonly<Record<string, string>>;
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
export declare function findRequestServiceIndex(namespace: string | undefined, query: Record<string, unknown> | null | undefined, pathParams?: Record<string, unknown> | null): ServiceIndexParamMatch | undefined;

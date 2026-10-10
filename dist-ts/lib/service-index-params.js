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
export const SERVICE_INDEX_PARAMS = Object.freeze({
    browser: Object.freeze(['browser_id']),
    terminal: Object.freeze(['terminal_id']),
    display: Object.freeze(['displayId', 'display_id', 'display']),
    code: Object.freeze(['id']),
});
/**
 * A host index: a non-negative safe integer, or its canonical decimal string.
 * 0 is legal (`terminal_id=0` is the terminal kit's "no terminal id" value).
 */
export function parseServiceIndex(value) {
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
export function findServiceIndexParam(namespace, query) {
    if (!namespace || !query)
        return undefined;
    if (!Object.prototype.hasOwnProperty.call(SERVICE_INDEX_PARAMS, namespace))
        return undefined;
    for (const param of SERVICE_INDEX_PARAMS[namespace]) {
        const value = query[param];
        if (value === undefined || value === null || value === '')
            continue;
        return { param, value, index: parseServiceIndex(value) };
    }
    return undefined;
}
/** The host index `query` names for `namespace`; undefined when it names none. */
export function serviceIndexFromQuery(namespace, query) {
    return findServiceIndexParam(namespace, query)?.index;
}
/**
 * Request BODY fields that name a kit's host index. The proxy never reads the
 * body, and the terminal kit refuses a `/create` body id that differs from the
 * query id the host forces (400 TERMINAL_ID_MISMATCH), so the body id has to
 * pick the host too. `terminal` is the kit's short alias of `terminal_id`.
 */
export const SERVICE_INDEX_BODY_PARAMS = Object.freeze({
    terminal: Object.freeze(['terminal_id', 'terminal']),
});
/**
 * The parameter that asks a kit for a FRESH instance, per kit. The terminal kit
 * generates a new terminal id (40000-65535) for `ephemeral=true` only when the
 * request names no terminal id; through the proxy that means the `-terminal-0`
 * host, since every other host forces `terminal_id=<its index>` and the call
 * then runs in that terminal (or is refused on it).
 */
export const SERVICE_FRESH_INSTANCE_PARAMS = Object.freeze({
    terminal: 'ephemeral',
});
/** The kit's own spelling of true for these flags: `1`, `true`, `yes`. */
function isKitTrue(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'yes';
}
function plainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
/**
 * The host index a request names, from every place it can name one, in the
 * order the kit reads them:
 *
 * 1. a PATH parameter of the table (`/history/{terminal_id}`,
 *    `DELETE /{terminal_id}`, `/{terminal_id}/automation`). The proxy never
 *    rewrites the path and checks access on the host's index, and the kit
 *    refuses a path id that differs from the query id the host forces, so
 *    the host must be the one the id names.
 * 2. a query parameter of the table (`?terminal_id=`), which the proxy
 *    overwrites with the host's index.
 * 3. a body field of SERVICE_INDEX_BODY_PARAMS (`/create`'s `terminal_id`),
 *    for the same reason as the path.
 * 4. the kit's fresh-instance flag with no id (`ephemeral=true`, in the query
 *    or the body): index 0, the proxy's "no terminal id" host.
 *
 * Undefined when the request names none: the client's own index applies.
 */
export function findRequestServiceIndex(namespace, query, pathParams, body) {
    const fromPath = findServiceIndexParam(namespace, pathParams);
    if (fromPath)
        return fromPath;
    const fromQuery = findServiceIndexParam(namespace, query);
    if (fromQuery)
        return fromQuery;
    if (!namespace)
        return undefined;
    const bodyFields = plainObject(body);
    if (bodyFields && Object.prototype.hasOwnProperty.call(SERVICE_INDEX_BODY_PARAMS, namespace)) {
        for (const param of SERVICE_INDEX_BODY_PARAMS[namespace]) {
            const value = bodyFields[param];
            if (value === undefined || value === null || value === '')
                continue;
            return { param, value, index: parseServiceIndex(value) };
        }
    }
    if (!Object.prototype.hasOwnProperty.call(SERVICE_FRESH_INSTANCE_PARAMS, namespace))
        return undefined;
    const flag = SERVICE_FRESH_INSTANCE_PARAMS[namespace];
    for (const source of [query, bodyFields]) {
        if (source && isKitTrue(source[flag]))
            return { param: flag, value: source[flag], index: 0 };
    }
    return undefined;
}
/**
 * The message for a request whose host index is named twice, differently, or undefined when
 * every name agrees. Compared: the id in the path, the query and the body (the first parameter
 * of each that is present), and a per-call serviceIndex against each of them, or against the
 * fresh-instance flag when no id is named. Through the proxy the host decides, so a silent pick
 * would run the call somewhere the caller did not name. An id named with the flag is the kit's
 * own business (it turns that session ephemeral, or refuses), not a conflict.
 */
export function serviceIndexConflict(namespace, serviceIndex, query, pathParams, body) {
    const kit = namespace ?? 'kit';
    const named = [];
    const fromPath = findServiceIndexParam(namespace, pathParams);
    if (fromPath)
        named.push({ ...fromPath, where: 'the path' });
    const fromQuery = findServiceIndexParam(namespace, query);
    if (fromQuery)
        named.push({ ...fromQuery, where: 'the query' });
    const fromBody = findRequestServiceIndex(namespace, undefined, undefined, body);
    if (fromBody && fromBody.param !== SERVICE_FRESH_INSTANCE_PARAMS[kit])
        named.push({ ...fromBody, where: 'the body' });
    const hasIndex = serviceIndex !== undefined && serviceIndex !== null && serviceIndex !== '';
    // A path or body "06" names session "06" at the kit but no host index, so it never agrees with
    // another name (the kit refuses it). A query one is overwritten by the proxy with the host index.
    const odd = named.find((m) => m.index === undefined && m.where !== 'the query');
    if (odd && (named.length > 1 || hasIndex)) {
        return `${odd.param} ${JSON.stringify(odd.value)} in ${odd.where} is not a ${kit} number a ${kit}-N host can carry `
            + `(no sign, no leading zero), so the kit refuses it combined with ${hasIndex ? 'serviceIndex' : 'another ' + odd.param}`;
    }
    const ids = named.filter((m) => m.index !== undefined);
    for (const other of ids.slice(1)) {
        if (other.index !== ids[0].index) {
            return `${ids[0].param} ${JSON.stringify(ids[0].value)} in ${ids[0].where} conflicts with ${other.param} ${JSON.stringify(other.value)} in ${other.where}: `
                + `the ${kit}-N host picks the ${kit}, so name one ${kit}`;
        }
    }
    if (!hasIndex)
        return undefined;
    const explicit = parseServiceIndex(serviceIndex);
    const first = ids[0];
    if (first) {
        if (explicit === first.index)
            return undefined;
        return `serviceIndex ${JSON.stringify(serviceIndex)} conflicts with ${first.param} ${JSON.stringify(first.value)}: the ${kit}-N host picks the ${kit} `
            + `(the proxy sets ${first.param}=N), so name one of them, or the same value in both`;
    }
    if (named.length > 0)
        return undefined; // a query id the host cannot carry: the proxy overwrites it
    const fresh = findRequestServiceIndex(namespace, query, undefined, body);
    if (fresh && explicit !== 0) {
        return `serviceIndex ${JSON.stringify(serviceIndex)} conflicts with ${fresh.param}=true: a fresh session is made only on the ${kit}-0 host. `
            + `Drop serviceIndex for a fresh session, or drop ${fresh.param} to run in ${kit} ${String(serviceIndex)}`;
    }
    return undefined;
}

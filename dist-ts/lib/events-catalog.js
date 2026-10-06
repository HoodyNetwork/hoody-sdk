/**
 * Event catalog: the names, resource types and payload types of every real-time event.
 *
 * Everything here comes from the server's catalog, vendored as
 * `lib/events-catalog.json` and turned into `lib/events-payloads.generated.ts` by
 * `scripts/sync-events-catalog.ts`. This file adds the hand-written helpers on top; it never
 * lists a type name itself, so the catalog stays the single source of names.
 *
 * The OpenAPI `event_type` enum in `generated/` is only checked as a subset of this catalog
 * (tests/unit/events-catalog-drift.test.ts): it lists what history can be filtered by, not what
 * the stream can carry.
 */
import { EVENT_CATALOG, EVENT_TYPES, } from './events-payloads.generated.js';
export * from './events-payloads.generated.js';
const TYPE_SET = new Set(EVENT_TYPES);
/** True when `name` is a type the catalog declares. */
export function isEventType(name) {
    return TYPE_SET.has(name);
}
/** True for live-only types (`cursor: null`, never persisted, never replayed). */
export function isEphemeralEventType(name) {
    return isEventType(name) && !EVENT_CATALOG[name].persisted;
}
/** True for types that go to history and carry a cursor. */
export function isPersistedEventType(name) {
    return isEventType(name) && EVENT_CATALOG[name].persisted;
}
/** True for declared names the server never emits. */
export function isReservedEventType(name) {
    return isEventType(name) && EVENT_CATALOG[name].status === 'reserved';
}
/** True when `pattern` is `'*'`, a declared type, or a `.*` prefix that matches at least one declared type. */
export function isEventPattern(pattern) {
    if (pattern === '*' || isEventType(pattern))
        return true;
    if (!pattern.endsWith('.*'))
        return false;
    const prefix = pattern.slice(0, -1);
    return EVENT_TYPES.some((t) => t.startsWith(prefix));
}
/**
 * Expand a pattern to the catalog types it selects, in catalog order.
 *
 * Wildcards (`'*'`, `'x.*'`) leave out ephemeral types unless `includeEphemeral` is set, so
 * `on('*')` never turns on the opt-in activity feed. A pattern naming an ephemeral
 * type explicitly always selects it. An unknown name or prefix throws: a typo must not become a
 * handler that silently never fires.
 */
export function expandEventPattern(pattern, opts = {}) {
    if (isEventType(pattern))
        return [pattern];
    if (pattern !== '*' && !pattern.endsWith('.*')) {
        throw new TypeError(`Unknown event type "${pattern}"`);
    }
    const prefix = pattern === '*' ? '' : pattern.slice(0, -1);
    const all = EVENT_TYPES.filter((t) => t.startsWith(prefix));
    if (all.length === 0)
        throw new TypeError(`Event pattern "${pattern}" matches no event type`);
    return opts.includeEphemeral ? [...all] : all.filter((t) => EVENT_CATALOG[t].persisted);
}
/** Catalog metadata for one type. */
export function eventCatalogInfo(type) {
    return EVENT_CATALOG[type];
}

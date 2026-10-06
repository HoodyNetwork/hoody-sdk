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

import {
    EVENT_CATALOG,
    EVENT_TYPES,
    type EphemeralEventType,
    type EventCatalogInfo,
    type EventResourceTypeMap,
    type EventType,
    type HoodyEventMap,
    type PersistedEventType,
    type ReservedEventType,
} from './events-payloads.generated.js';

export * from './events-payloads.generated.js';

/** The `resource_type` an event of type `T` carries. */
export type ResourceTypeFor<T extends EventType> = EventResourceTypeMap[T];

/** The `data` payload of an event of type `T`. */
export type EventPayload<T extends EventType> = HoodyEventMap[T];

type Prefixes<S extends string> = S extends `${infer Head}.${infer Tail}` ? Head | `${Head}.${Prefixes<Tail>}` : never;

/**
 * A subscription pattern: one type, a dotted prefix ending in `.*` (`'container.*'`,
 * `'container.snapshot.*'`), or `'*'` for everything. Only prefixes that exist in the catalog
 * type-check.
 */
export type EventPattern = EventType | `${Prefixes<EventType>}.*` | '*';

/** The event types a pattern selects, as a union (for typing handlers). */
export type EventTypesMatching<P extends EventPattern> =
    P extends '*' ? EventType
    : P extends `${infer Prefix}.*` ? Extract<EventType, `${Prefix}.${string}`>
    : Extract<P, EventType>;

const TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

/** True when `name` is a type the catalog declares. */
export function isEventType(name: string): name is EventType {
    return TYPE_SET.has(name);
}

/** True for live-only types (`cursor: null`, never persisted, never replayed). */
export function isEphemeralEventType(name: string): name is EphemeralEventType {
    return isEventType(name) && !(EVENT_CATALOG[name] as EventCatalogInfo).persisted;
}

/** True for types that go to history and carry a cursor. */
export function isPersistedEventType(name: string): name is PersistedEventType {
    return isEventType(name) && (EVENT_CATALOG[name] as EventCatalogInfo).persisted;
}

/** True for declared names the server never emits. */
export function isReservedEventType(name: string): name is ReservedEventType {
    return isEventType(name) && (EVENT_CATALOG[name] as EventCatalogInfo).status === 'reserved';
}

/** True when `pattern` is `'*'`, a declared type, or a `.*` prefix that matches at least one declared type. */
export function isEventPattern(pattern: string): pattern is EventPattern {
    if (pattern === '*' || isEventType(pattern)) return true;
    if (!pattern.endsWith('.*')) return false;
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
export function expandEventPattern(pattern: string, opts: { includeEphemeral?: boolean } = {}): EventType[] {
    if (isEventType(pattern)) return [pattern];
    if (pattern !== '*' && !pattern.endsWith('.*')) {
        throw new TypeError(`Unknown event type "${pattern}"`);
    }
    const prefix = pattern === '*' ? '' : pattern.slice(0, -1);
    const all = EVENT_TYPES.filter((t) => t.startsWith(prefix));
    if (all.length === 0) throw new TypeError(`Event pattern "${pattern}" matches no event type`);
    return opts.includeEphemeral ? [...all] : all.filter((t) => (EVENT_CATALOG[t] as EventCatalogInfo).persisted);
}

/** Catalog metadata for one type. */
export function eventCatalogInfo(type: EventType): EventCatalogInfo {
    return EVENT_CATALOG[type];
}

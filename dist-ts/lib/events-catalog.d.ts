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
import { type EphemeralEventType, type EventCatalogInfo, type EventResourceTypeMap, type EventType, type HoodyEventMap, type PersistedEventType, type ReservedEventType } from './events-payloads.generated.js';
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
export type EventTypesMatching<P extends EventPattern> = P extends '*' ? EventType : P extends `${infer Prefix}.*` ? Extract<EventType, `${Prefix}.${string}`> : Extract<P, EventType>;
/** True when `name` is a type the catalog declares. */
export declare function isEventType(name: string): name is EventType;
/** True for live-only types (`cursor: null`, never persisted, never replayed). */
export declare function isEphemeralEventType(name: string): name is EphemeralEventType;
/** True for types that go to history and carry a cursor. */
export declare function isPersistedEventType(name: string): name is PersistedEventType;
/** True for declared names the server never emits. */
export declare function isReservedEventType(name: string): name is ReservedEventType;
/** True when `pattern` is `'*'`, a declared type, or a `.*` prefix that matches at least one declared type. */
export declare function isEventPattern(pattern: string): pattern is EventPattern;
/**
 * Expand a pattern to the catalog types it selects, in catalog order.
 *
 * Wildcards (`'*'`, `'x.*'`) leave out ephemeral types unless `includeEphemeral` is set, so
 * `on('*')` never turns on the opt-in activity feed. A pattern naming an ephemeral
 * type explicitly always selects it. An unknown name or prefix throws: a typo must not become a
 * handler that silently never fires.
 */
export declare function expandEventPattern(pattern: string, opts?: {
    includeEphemeral?: boolean;
}): EventType[];
/** Catalog metadata for one type. */
export declare function eventCatalogInfo(type: EventType): EventCatalogInfo;

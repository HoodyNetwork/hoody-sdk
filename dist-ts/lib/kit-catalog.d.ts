/**
 * Canonical Hoody Kit slug catalog used by SDK helpers.
 *
 * This catalog is static metadata describing supported service slugs, URL
 * segment patterns, and short human-readable descriptions.
 */
export type KitCatalogKind = 'named' | 'special' | 'dynamic';
export interface KitCatalogEntry {
    /** Service slug accepted by getKitUrl() / open commands (for example: "terminal"). */
    slug: string;
    /** Category of slug semantics. */
    kind: KitCatalogKind;
    /** Short description intended for help/docs output. */
    description: string;
    /** Subdomain segment pattern used in container URLs. */
    serviceSegmentPattern: string;
    /** Full URL sample format for this service slug. */
    urlTemplateSample: string;
    /** Whether this slug supports indexed instances (N suffix). */
    supportsIndex: boolean;
    /** Default instance index when supportsIndex=true. */
    defaultIndex?: number;
    /** Minimum supported instance index when supportsIndex=true. */
    minIndex?: number;
    /** Maximum supported instance index when supportsIndex=true. */
    maxIndex?: number;
    /** Minimum supported port when kind="dynamic". */
    minPort?: number;
    /** Maximum supported port when kind="dynamic". */
    maxPort?: number;
    /** SDK namespace name, when applicable. */
    sdkNamespace?: string;
    /** Optional aliases commonly used in CLI/docs. */
    aliases?: string[];
}
export interface KitCatalogOptions {
    includeDynamic?: boolean;
    includeSpecial?: boolean;
}
/**
 * Return a clone of the kit catalog so callers can safely mutate their local copy.
 */
export declare function getKitCatalogEntries(options?: KitCatalogOptions): KitCatalogEntry[];

/**
 * Exec Dynamic Parse — Shared script-entry parsing logic.
 *
 * Used by both `exec-dynamic-discovery.ts` (service-backed) and
 * `exec-dynamic-discovery-cli.ts` (raw-response adapter) so tag parsing,
 * method resolution, dual-method variant generation, path-param merging,
 * and deduplication live in one place.
 */
import { type DiscoveredScript } from './exec-dynamic-discovery.js';
export interface RawScriptEntry {
    path?: string;
    label?: string;
    description?: string;
    tags?: string | string[];
    method?: string;
    methods?: string[];
    metadata?: {
        method?: string;
        methods?: string[];
        [key: string]: unknown;
    };
    schema?: Record<string, unknown>;
    hasSchema?: boolean;
    [key: string]: unknown;
}
/**
 * Parse a single raw script entry into zero or more DiscoveredScript objects.
 *
 * Returns an empty array if the entry is invalid (missing path, invalid name,
 * path traversal detected, etc.). Returns multiple entries when the script
 * declares dual-method support (both GET and POST).
 */
export declare function parseRawScriptEntry(raw: RawScriptEntry): DiscoveredScript[];
/**
 * Parse an array of raw script entries, deduplicate by name (first wins).
 */
export declare function parseRawScriptEntries(rawScripts: RawScriptEntry[]): DiscoveredScript[];

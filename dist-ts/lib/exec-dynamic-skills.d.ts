/**
 * Exec Dynamic Skills — Agent script filtering.
 *
 * Provides the `filterAgentScripts` utility used to select only scripts
 * tagged with `@tags agent` from the full discovery result.
 */
import type { DiscoveredScript } from './exec-dynamic-discovery.js';
/**
 * Filter discovered scripts to only those with `@tags agent`.
 */
export declare function filterAgentScripts(scripts: DiscoveredScript[]): DiscoveredScript[];

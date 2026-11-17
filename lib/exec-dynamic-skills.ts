/**
 * Exec Dynamic Skills — Agent script filtering.
 *
 * Provides the `filterAgentScripts` utility used to select only scripts
 * tagged with `@tags agent` from the full discovery result.
 */

import type { CallableScript } from './exec-dynamic-discovery.js';

/**
 * Filter discovered scripts to only those with `@tags agent`.
 */
export function filterAgentScripts(scripts: CallableScript[]): CallableScript[] {
  return scripts.filter(
    (s) => s.tags && s.tags.some((t) => t.toLowerCase() === 'agent'),
  );
}

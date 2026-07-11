/**
 * Exec Dynamic Skills — Agent script filtering.
 *
 * Provides the `filterAgentScripts` utility used to select only scripts
 * tagged with `@tags agent` from the full discovery result.
 */
/**
 * Filter discovered scripts to only those with `@tags agent`.
 */
export function filterAgentScripts(scripts) {
    return scripts.filter((s) => s.tags && s.tags.some((t) => t.toLowerCase() === 'agent'));
}

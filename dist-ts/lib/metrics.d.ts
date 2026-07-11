/**
 * Metrics normalization and humanization utilities.
 *
 * Data flow:
 *   API response (envelope with `.data`) -> deep clone -> normalize CPU/memory
 *   in-place on the clone -> attach lazy `metrics_human` getter via
 *   Object.defineProperty -> return modified clone (original response untouched).
 *
 * Why this exists:
 * Some container CPU payloads expose a cumulative CPU time ratio as
 * `usage_percent`, which can grow far beyond sane percentage ranges (e.g. 50000%).
 * These helpers detect such broken formulas, normalize them using delta-sampling
 * or uptime-based fallbacks, and attach friendly `metrics_human` / `metrics_human_summary`
 * fields while preserving raw values for debugging.
 *
 * Key design choices:
 * - All mutation happens on a clone; callers get a new object.
 * - `metrics_human` is a lazy self-replacing getter (see `defineCachedGetter`)
 *   so humanization work is skipped if the field is never accessed.
 * - Type guards use `UnknownRecord` throughout for defensive narrowing:
 *   server schemas can drift, so every field access is guarded.
 */
/**
 * Entry point for single-container stats API responses.
 *
 * Orchestration: clones the response, extracts the best server/client reference
 * timestamp, normalizes CPU + memory, attaches lazy `metrics_human` getter,
 * returns the modified clone. The original response object is never mutated.
 */
export declare function normalizeContainerStatsResponse<T>(response: T): T;
/**
 * Entry point for project-level (multi-container) stats API responses.
 *
 * Orchestration: clones the response, normalizes each container in `data.stats[]`,
 * then attaches a lazy `metrics_human_summary` getter on `data` that aggregates
 * totals/averages across all containers (CPU avg, memory sum, disk sum, network sum).
 */
export declare function normalizeProjectStatsResponse<T>(response: T): T;

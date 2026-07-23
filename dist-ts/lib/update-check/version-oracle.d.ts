/**
 * Version oracle — "what is the newest published version?"
 *
 * This is distinct from `checkForUpdate` (index.ts), which verifies the CDN's
 * minisign-signed channel for the NATIVE binary. The oracle answers the simpler
 * question the npm/npx path needs, from the sources npm users already trust.
 *
 * Source order, chosen from measured behaviour:
 *
 *   1. npm registry — `registry.npmjs.org/<pkg>/latest` → `.version`.
 *      No rate limit, no redirect, CDN-backed (`cache-control: max-age=300`),
 *      and the SAME source of truth as `npx <pkg>`, so the two can never
 *      disagree. This is the primary.
 *
 *   2. GitHub web redirect — `github.com/<o>/<r>/releases/latest` returns a
 *      302 whose `Location` ends in `/releases/tag/v<semver>`. No API, no rate
 *      limit. Read via `followRedirect: 'manual'`; the Location is strictly
 *      validated before the tag is trusted.
 *
 *   3. GitHub API — `api.github.com/.../releases/latest`. Redirect-free JSON,
 *      but 60 requests/hour PER IP unauthenticated (a shared NAT exhausts it),
 *      so it is the LAST resort — only reached when npm AND the GitHub web
 *      redirect both fail.
 *
 * Every source is validated the same way: the parsed version must be strict
 * semver, and — because a captive portal or MITM proxy happily answers 200 with
 * an HTML login page — a source that does not yield a clean semver is treated
 * as a failure and the chain falls through to the next.
 */
export interface OracleOptions {
    /** npm package name, e.g. `hoody-sdk`. */
    packageName: string;
    /** GitHub `owner/repo`, e.g. `HoodyNetwork/hoody-sdk`. */
    githubRepo: string;
    /** Injected for tests. */
    fetch?: typeof fetch;
    userAgent?: string;
    /** foreground = retry chain; background = single-shot per source. */
    mode?: 'foreground' | 'background';
    /** Deterministic jitter for tests. */
    random?: () => number;
    nowFn?: () => number;
}
export interface OracleResult {
    /** Resolved latest version, or null if every source failed. */
    version: string | null;
    /** Which source answered: `npm`, `github-web`, `github-api`, or null. */
    source: 'npm' | 'github-web' | 'github-api' | null;
    /** Per-source failure reasons, for diagnostics. Never surfaced to the user
     *  as a stack — the CLI shows one friendly line. */
    attempts: Array<{
        source: string;
        error: string;
    }>;
}
/** Extract a `v?<semver>` tag from a validated GitHub release `Location`. */
export declare function parseTagFromLocation(location: string | null, expectedRepo: string): string | null;
/** Resolve the newest published version via npm → GitHub-web → GitHub-API. */
export declare function resolveLatestVersion(opts: OracleOptions): Promise<OracleResult>;

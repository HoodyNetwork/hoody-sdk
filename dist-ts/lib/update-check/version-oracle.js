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
import { fetchOnce, fetchWithRetry, FetchError, FOREGROUND_TOTAL_BUDGET_MS, } from './fetcher.js';
import { isValidSemver } from './semver-compare.js';
/** Strict, canonical semver: MAJOR.MINOR.PATCH(-pre)(+build), no leading `v`,
 *  no surrounding whitespace. `semver.valid()` tolerates `v1.2.3` and spaces, so
 *  after the oracle strips one `v` a `vv1.2.3` would slip through — this does not. */
const CANONICAL_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
function strictSemver(v) {
    return CANONICAL_SEMVER.test(v) && isValidSemver(v) ? v : null;
}
/** A media type is JSON only if its type/subtype (before `;`) is an
 *  `application/…json` form. Rejects a captive-portal `text/html` firmly. */
function isJsonContentType(ct) {
    const mt = (ct ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    return /^application\/([a-z0-9.+-]*\+)?json$/.test(mt) || mt === 'application/json';
}
/** npm registry base. Third-party host — never domain-substituted. */
const NPM_REGISTRY = 'https://registry.npmjs.org';
/** Extract a `v?<semver>` tag from a validated GitHub release `Location`. */
export function parseTagFromLocation(location, expectedRepo) {
    if (!location)
        return null;
    let u;
    try {
        u = new URL(location);
    }
    catch {
        return null;
    }
    // Only ever trust github.com over https, for the exact repo, on the exact
    // release-tag path shape. Anything else is a redirect we will not follow.
    if (u.protocol !== 'https:')
        return null;
    if (u.hostname !== 'github.com')
        return null;
    const want = `/${expectedRepo.toLowerCase()}/releases/tag/`;
    const path = u.pathname.toLowerCase();
    if (!path.startsWith(want))
        return null;
    // No credentials, query, or fragment on a release-tag URL.
    if (u.username || u.password || u.search || u.hash)
        return null;
    const tag = decodeURIComponent(u.pathname.slice(want.length));
    if (tag.includes('/'))
        return null;
    const version = tag.startsWith('v') ? tag.slice(1) : tag;
    return strictSemver(version);
}
/** Pull `.version` out of an npm `/latest` document, validating shape. */
function parseNpmLatest(res) {
    // A captive portal / proxy returns 200 text/html — require a real JSON media
    // type (exact, not a substring match) before we even parse.
    if (!isJsonContentType(res.contentType)) {
        throw new Error(`npm /latest returned non-JSON content-type: ${res.contentType || '(none)'}`);
    }
    let doc;
    try {
        doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(res.body));
    }
    catch (e) {
        throw new Error(`npm /latest is not valid JSON: ${e.message}`);
    }
    const raw = doc?.version;
    const version = typeof raw === 'string' ? strictSemver(raw.trim()) : null;
    if (!version) {
        throw new Error(`npm /latest has no valid .version (got ${JSON.stringify(raw)})`);
    }
    return version;
}
/** Resolve the newest published version via npm → GitHub-web → GitHub-API. */
export async function resolveLatestVersion(opts) {
    const attempts = [];
    const foreground = (opts.mode ?? 'foreground') === 'foreground';
    const now = opts.nowFn ?? Date.now;
    // ONE deadline for the whole chain. Without this, each source spent its own
    // ~20s budget → ~60-90s worst case on a total outage. Shared, the CLI's
    // `hoody update` is bounded no matter how many sources it falls through.
    const deadlineMs = now() + FOREGROUND_TOTAL_BUDGET_MS;
    const base = {
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
        ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
        ...(opts.random ? { random: opts.random } : {}),
        deadlineMs,
    };
    // One attempt against a source, with the mode's retry profile. Background
    // mode is single-shot but still capped to the remaining shared budget.
    const run = (url, extra = {}) => {
        const o = { ...base, ...extra };
        return foreground
            ? fetchWithRetry(url, o, 3, opts.nowFn)
            : fetchOnce(url, Math.max(1, Math.min(30_000, deadlineMs - now())), o);
    };
    // 1. npm registry.
    try {
        const url = `${NPM_REGISTRY}/${encodeURIComponent(opts.packageName)}/latest`;
        const res = await run(url, { userAgent: opts.userAgent ?? 'hoody-update-check/1' });
        // /latest answers JSON regardless of Accept; parseNpmLatest guards the
        // content-type (captive-portal defense), so no Accept negotiation is needed.
        return { version: parseNpmLatest(res), source: 'npm', attempts };
    }
    catch (e) {
        attempts.push({ source: 'npm', error: describe(e) });
    }
    // 2. GitHub web redirect.
    try {
        const url = `https://github.com/${opts.githubRepo}/releases/latest`;
        const res = await run(url, { followRedirect: 'manual' });
        const version = parseTagFromLocation(res.location, opts.githubRepo);
        if (!version) {
            throw new Error(`github releases/latest did not redirect to a valid tag (status ${res.status}, ` +
                `location ${JSON.stringify(res.location)})`);
        }
        return { version, source: 'github-web', attempts };
    }
    catch (e) {
        attempts.push({ source: 'github-web', error: describe(e) });
    }
    // 3. GitHub API — last, quota-limited.
    try {
        const url = `https://api.github.com/repos/${opts.githubRepo}/releases/latest`;
        const res = await run(url, {
            userAgent: opts.userAgent ?? 'hoody-update-check/1',
        });
        if (!isJsonContentType(res.contentType)) {
            throw new Error(`github api returned non-JSON content-type: ${res.contentType || '(none)'}`);
        }
        const doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(res.body));
        const tag = typeof doc.tag_name === 'string' ? doc.tag_name.trim() : '';
        const version = strictSemver(tag.startsWith('v') ? tag.slice(1) : tag);
        if (!version) {
            throw new Error(`github api tag_name is not valid semver: ${JSON.stringify(tag)}`);
        }
        return { version, source: 'github-api', attempts };
    }
    catch (e) {
        attempts.push({ source: 'github-api', error: describe(e) });
    }
    return { version: null, source: null, attempts };
}
function describe(e) {
    if (e instanceof FetchError) {
        const rl = e.isRateLimited ? ' (rate-limited)' : '';
        return `${e.kind}${e.status ? ` ${e.status}` : ''}${rl}: ${e.message}`;
    }
    return e instanceof Error ? e.message : String(e);
}

/**
 * HTTP fetcher with AbortController-based per-attempt timeout,
 * exponential backoff, and narrow retry classification.
 *
 * Exports:
 *   - `fetchWithRetry`: foreground / `hoody update` — up to 3 attempts, 1s/3s
 *     backoff with full jitter, bounded by a total wall-clock budget
 *   - `fetchOnce`: background refresh — single shot, 30s budget, no retry
 *
 * A server `Retry-After` (408/429/503) is honored EXACTLY (clamped to [1,60]s), not
 * jittered. Neither retries on: DNS NXDOMAIN, HTTP 401/403/404, an exhausted
 * rate-limit quota, or 2xx with a malformed body.
 */

/** Retry-After header floor (seconds). */
export const RETRY_AFTER_MIN_SECONDS = 1;
/** Retry-After header ceiling (seconds) — prevents server-induced long waits. */
export const RETRY_AFTER_MAX_SECONDS = 60;
/** Per-attempt hard timeout for `fetchWithRetry`. */
export const FOREGROUND_ATTEMPT_TIMEOUT_MS = 10_000;
/**
 * Total wall-clock budget for `fetchWithRetry`, across ALL attempts and their
 * backoff sleeps. Without this, three attempts that each sleep on a
 * `Retry-After: 60` could stall `hoody update` for ~2 minutes — the opposite of
 * "friendly". Once the budget is spent, the loop stops and throws the last
 * error instead of starting another attempt.
 */
export const FOREGROUND_TOTAL_BUDGET_MS = 20_000;
/** Single-shot timeout for `fetchOnce`. */
export const BACKGROUND_TOTAL_TIMEOUT_MS = 30_000;

/**
 * Hard cap on response body size. channel.json is ~2 KB, .minisig is ~200 B —
 * anything beyond 256 KB is either a misconfiguration or a DoS attempt and
 * must be rejected before we allocate a huge buffer.
 */
export const MAX_RESPONSE_BYTES = 256 * 1024;

export class FetchError extends Error {
  /**
   * Machine-readable class:
   *   'network'         — DNS/connection/reset
   *   'http'            — non-2xx response
   *   'abort'           — per-attempt timeout fired
   *   'external-abort'  — caller-supplied AbortSignal fired (non-retryable)
   */
  readonly kind: 'network' | 'http' | 'abort' | 'external-abort';
  readonly status?: number | undefined;
  readonly errno?: string | undefined;
  readonly url: string;
  /** Retry-After value clamped to [1, 60] seconds, when the server sent one. */
  readonly retryAfterSeconds?: number | undefined;
  /**
   * `x-ratelimit-remaining`, when present. GitHub's unauthenticated API allows
   * 60 requests/hour PER IP, and signals exhaustion with `403` + `remaining: 0`
   * — not `429`. Without surfacing this the caller cannot tell an exhausted
   * quota (wait until reset; retrying makes it worse) from a real
   * authorization failure.
   */
  readonly rateLimitRemaining?: number | undefined;
  /** `x-ratelimit-reset` as a UNIX epoch in SECONDS, when present. */
  readonly rateLimitResetEpochSec?: number | undefined;

  constructor(msg: string, kind: FetchError['kind'], url: string, opts?: {
    status?: number | undefined;
    errno?: string | undefined;
    retryAfterSeconds?: number | undefined;
    rateLimitRemaining?: number | undefined;
    rateLimitResetEpochSec?: number | undefined;
  }) {
    super(msg);
    this.name = 'FetchError';
    this.kind = kind;
    this.url = url;
    this.status = opts?.status;
    this.errno = opts?.errno;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
    this.rateLimitRemaining = opts?.rateLimitRemaining;
    this.rateLimitResetEpochSec = opts?.rateLimitResetEpochSec;
  }

  /**
   * True when this failure is an exhausted rate-limit quota rather than a
   * transient error. Such a failure must NOT be retried against the same
   * source — the caller should fall through to the next one.
   */
  get isRateLimited(): boolean {
    return this.kind === 'http'
      && (this.status === 403 || this.status === 429)
      && this.rateLimitRemaining === 0;
  }
}

export interface FetchedResource {
  url: string;
  body: Uint8Array;
  contentType: string | null;
  /** Response status. Always 2xx unless `followRedirect: 'manual'`. */
  status: number;
  /** `Location`, present only on a 3xx returned via `followRedirect: 'manual'`. */
  location: string | null;
}

type FetchFn = typeof fetch;

export interface FetcherOptions {
  /** Injected for tests. Default: globalThis.fetch. */
  fetch?: FetchFn | undefined;
  /** User-Agent for CDN traffic distinction. */
  userAgent?: string | undefined;
  /** AbortSignal the caller can supply (e.g. process-wide cancellation). */
  signal?: AbortSignal | undefined;
  /**
   * Redirect policy. Defaults to `'error'` — the correct behaviour for every
   * trust-chain fetch, where following a redirect would let a network attacker
   * relocate the request.
   *
   * `'manual'` is opt-in for the ONE case that needs it: reading the tag out of
   * `github.com/<o>/<r>/releases/latest`, whose entire mechanism is a 302
   * `Location`. With `'error'` the fetch throws before the header is readable,
   * so this cannot be done by inspecting the error. The caller MUST validate
   * the returned `location` before using it.
   *
   * Never change the default. This module is on the update trust chain.
   */
  followRedirect?: 'error' | 'manual' | undefined;
  /** Injected for deterministic jitter in tests. Default: Math.random. */
  random?: (() => number) | undefined;
  /** Absolute deadline (epoch ms) shared across a retry loop AND, when the
   *  oracle sets it, across ALL its sources — so total wall-clock stays bounded
   *  by one budget instead of one-per-source. Default: this call's own budget. */
  deadlineMs?: number | undefined;
}

/**
 * Fetch `url` once with a hard timeout. Throws FetchError on any failure.
 * Success: returns `{body, contentType}` with fully-drained body bytes.
 */
export async function fetchOnce(
  url: string,
  timeoutMs: number,
  opts: FetcherOptions = {},
): Promise<FetchedResource> {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new FetchError('fetch is not available in this runtime', 'network', url);
  }
  const abortCtrl = new AbortController();
  const upstream = opts.signal;
  // Mirror upstream abort onto our controller. Track whether the external
  // signal caused the abort so we can classify it as non-retryable later.
  let externalAborted = false;
  const forwardAbort = () => {
    externalAborted = true;
    abortCtrl.abort();
  };
  if (upstream) {
    if (upstream.aborted) {
      externalAborted = true;
      abortCtrl.abort();
    } else {
      // Explicit add/remove in the finally block: `{ once: true }` only
      // removes the listener after it FIRES — if the signal never aborts,
      // the listener accumulates on long-lived signals.
      upstream.addEventListener('abort', forwardAbort);
    }
  }
  const timer = setTimeout(() => abortCtrl.abort(), timeoutMs);
  try {
    const redirectMode = opts.followRedirect ?? 'error';
    const response = await fetchImpl(url, {
      method: 'GET',
      ...(opts.userAgent ? { headers: { 'user-agent': opts.userAgent } } : {}),
      signal: abortCtrl.signal,
      // Default 'error': never follow redirects on trust-chain fetches. The
      // sole opt-in is the GitHub-latest oracle (see FetcherOptions).
      redirect: redirectMode,
    });

    // In 'manual' mode a 3xx is a SUCCESS to be inspected, not an error — the
    // whole point is to read `Location`. Return it without draining a body
    // (redirect responses have none worth reading) so the caller can validate
    // the target itself.
    if (redirectMode === 'manual' && response.status >= 300 && response.status < 400) {
      return {
        url,
        body: new Uint8Array(0),
        contentType: response.headers.get('content-type'),
        status: response.status,
        location: response.headers.get('location'),
      };
    }

    if (!response.ok) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after')) ?? undefined;
      const remainingHdr = response.headers.get('x-ratelimit-remaining');
      const resetHdr = response.headers.get('x-ratelimit-reset');
      const remaining = remainingHdr !== null && /^\d+$/.test(remainingHdr.trim())
        ? parseInt(remainingHdr.trim(), 10)
        : undefined;
      const resetEpoch = resetHdr !== null && /^\d+$/.test(resetHdr.trim())
        ? parseInt(resetHdr.trim(), 10)
        : undefined;
      throw new FetchError(
        `HTTP ${response.status} for ${url}`,
        'http',
        url,
        {
          status: response.status,
          retryAfterSeconds: retryAfter,
          rateLimitRemaining: remaining,
          rateLimitResetEpochSec: resetEpoch,
        },
      );
    }
    // Reject oversized responses before allocating. Content-Length header is
    // advisory — we re-check the actual byte count during streaming below.
    const cl = response.headers.get('content-length');
    if (cl && Number(cl) > MAX_RESPONSE_BYTES) {
      throw new FetchError(
        `response too large (declared ${cl} bytes, cap ${MAX_RESPONSE_BYTES}): ${url}`,
        'network', url,
      );
    }
    const body = await readCapped(response, url);
    return {
      url,
      body,
      contentType: response.headers.get('content-type'),
      status: response.status,
      location: null,
    };
  } catch (e) {
    if (e instanceof FetchError) throw e;
    const err = e as { name?: string; code?: string; message?: string };
    const msg = err.message ?? String(e);
    if (err.name === 'AbortError') {
      // Distinguish caller-requested cancellation (non-retryable) from
      // our own per-attempt timeout (retryable).
      if (externalAborted) {
        throw new FetchError(
          `fetch cancelled by caller: ${url}`,
          'external-abort',
          url,
        );
      }
      throw new FetchError(`fetch aborted (timeout ${timeoutMs}ms): ${url}`, 'abort', url);
    }
    // Node fetch bundles errno under cause; try to surface it.
    const code = err.code ?? (e as { cause?: { code?: string } }).cause?.code;
    throw new FetchError(`network error: ${msg}`, 'network', url, { errno: code });
  } finally {
    clearTimeout(timer);
    if (upstream) {
      upstream.removeEventListener('abort', forwardAbort);
    }
  }
}

/**
 * Determine if a `FetchError` is eligible for retry. Permanent failures
 * (DNS NXDOMAIN, 4xx except 408/429, abort caused by external signal) are
 * never retried.
 */
export function isRetryable(err: FetchError): boolean {
  if (err.kind === 'external-abort') return false;  // caller cancelled — respect it
  if (err.kind === 'abort') return true;            // our own timeout — retry
  if (err.kind === 'network') {
    if (err.errno === 'ENOTFOUND') return false;  // DNS NXDOMAIN = permanent
    return true;
  }
  // HTTP
  if (err.status === undefined) return false;
  // An exhausted rate-limit quota is NOT transient — retrying against the same
  // host burns more quota and, on GitHub's secondary limits, extends the block.
  // The caller falls through to the next source instead (see the oracle chain).
  if (err.isRateLimited) return false;
  if (err.status === 408 || err.status === 429) return true;
  if (err.status >= 500 && err.status < 600) return true;
  return false;
}

/** Parse a Retry-After header value. Accepts integer seconds or HTTP-date.
 *
 * Parser is now aligned with the main http-client parser
 * (integer-seconds only, matches RFC 9110 §10.2.3 delta-seconds production
 * which forbids decimals). The [RETRY_AFTER_MIN_SECONDS, RETRY_AFTER_MAX_SECONDS]
 * clamp is retained because this is a foreground-UI use case where an
 * over-eager or hostile server must not stall the CLI.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;
  // Seconds form — integer only, matching http-client parser.
  if (/^\d+$/.test(trimmed)) {
    const secs = parseInt(trimmed, 10);
    if (!Number.isFinite(secs) || secs < 0) return null;
    return clampRetryAfter(secs);
  }
  // Reject anything that looks numeric but isn't a valid integer. Date.parse
  // accepts bare decimals like '2.5' as a date ("Feb 5, 2001") which clamps
  // to the floor and hides the parse failure.
  if (/^[+\-]?\d*\.?\d+([eE][+\-]?\d+)?$/.test(trimmed)) return null;
  // HTTP-date form
  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return null;
  const deltaSec = Math.max(0, (dateMs - nowMs) / 1000);
  return clampRetryAfter(deltaSec);
}

function clampRetryAfter(seconds: number): number {
  if (!Number.isFinite(seconds)) return RETRY_AFTER_MIN_SECONDS;
  return Math.min(
    RETRY_AFTER_MAX_SECONDS,
    Math.max(RETRY_AFTER_MIN_SECONDS, seconds),
  );
}

/**
 * Fetch with smart retry for `hoody update` foreground use.
 *
 * 3 attempts, exponential backoff 1s + 3s, 10s per-attempt timeout.
 * Retry class: timeout, network (except NXDOMAIN), 408/429/5xx.
 * Honors Retry-After header on 429.
 */
export async function fetchWithRetry(
  url: string,
  opts: FetcherOptions = {},
  attempts = 3,
  nowFn: () => number = Date.now,
): Promise<FetchedResource> {
  // If the caller's AbortSignal is already aborted, don't enter the retry
  // loop at all — fail fast with a non-retryable classification.
  if (opts.signal?.aborted) {
    throw new FetchError(
      `fetch cancelled by caller before start: ${url}`,
      'external-abort',
      url,
    );
  }
  // Absolute deadline. When the caller supplies `opts.deadlineMs` (the oracle
  // shares ONE across all its sources), honor it so three sources can't each
  // spend a fresh budget; otherwise fall back to this call's own budget.
  const deadline = opts.deadlineMs ?? nowFn() + FOREGROUND_TOTAL_BUDGET_MS;
  let lastErr: FetchError | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Check the deadline BEFORE every attempt, and cap this attempt's timeout to
    // the time actually left — a fresh 10s per attempt could otherwise overrun
    // the total budget on its own.
    const budgetLeft = deadline - nowFn();
    if (budgetLeft <= 0) break;
    const attemptTimeout = Math.min(FOREGROUND_ATTEMPT_TIMEOUT_MS, budgetLeft);
    try {
      return await fetchOnce(url, attemptTimeout, opts);
    } catch (e) {
      const err = e as FetchError;
      lastErr = err;
      if (!isRetryable(err) || attempt === attempts - 1) break;

      // A server-provided `Retry-After` is an explicit instruction — honor it
      // EXACTLY (clamped to [1,60]s at parse), on ANY retryable status that
      // carries one (408, 429, and 503). Jittering it would mean retrying
      // before the server said we may.
      let delayMs: number;
      if (typeof err.retryAfterSeconds === 'number') {
        delayMs = err.retryAfterSeconds * 1000;
      } else {
        // Default backoff (1s then 3s) gets FULL jitter — a random point in
        // [0, delay] (AWS "Exponential Backoff and Jitter"). Two clients that
        // hit a 5xx at the same instant otherwise retry in lock-step and
        // re-collide; jitter spreads them. Randomness is injected via
        // `opts.random` for deterministic tests; defaults to Math.random.
        const baseSec = attempt === 0 ? 1 : 3;
        delayMs = (opts.random ?? Math.random)() * baseSec * 1000;
      }

      // Never start a sleep that would run past the deadline. If the required
      // wait doesn't fit (e.g. Retry-After: 60 with 20s left), stop now and
      // surface the last error rather than stalling.
      const remaining = deadline - nowFn();
      if (remaining <= 0 || delayMs >= remaining) break;
      await sleep(delayMs);
    }
  }
  throw lastErr!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Read up to MAX_RESPONSE_BYTES from a fetch Response, throwing a
 * FetchError if the body exceeds that cap. Works around the fact that
 * `response.arrayBuffer()` will happily allocate the full body regardless
 * of size; we stream via reader() and count bytes.
 */
async function readCapped(response: Response, url: string): Promise<Uint8Array> {
  if (!response.body) {
    const ab = await response.arrayBuffer();
    if (ab.byteLength > MAX_RESPONSE_BYTES) {
      throw new FetchError(
        `response too large (${ab.byteLength} bytes, cap ${MAX_RESPONSE_BYTES}): ${url}`,
        'network', url,
      );
    }
    return new Uint8Array(ab);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new FetchError(
        `response too large (>${MAX_RESPONSE_BYTES} bytes): ${url}`,
        'network', url,
      );
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

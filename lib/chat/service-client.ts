/**
 * service-client.ts — the ONLY network path of `hoody chat`.
 *
 * `hoody chat` asks Hoody's documentation assistant and renders what it says.
 * There is no local model: no API key, no provider tiers, no model/token/
 * temperature knobs. The answer is produced by the service and streamed
 * straight to the terminal.
 *
 * Wire format (`POST /api/chat`, `Accept: text/event-stream`):
 *   data: {"text":"…"}                        — content delta, may be many
 *   data: {"done":true,"sources":[{title,path,section}]}   — terminal success
 *   data: {"error":"…","done":true}           — terminal error
 *
 * `sources[]` entries are site-relative (`path`), never absolute — the browser
 * widget uses them as an href directly. A terminal cannot, so they are resolved
 * against DOCS_SITE_BASE here.
 *
 * Server-side limits this client is built against (chatbot's chat-handler.ts):
 *   message  ≤ 2000 chars   (CHATBOT_MAX_INPUT_LENGTH)
 *   history  ≤ 20 turns     (CHATBOT_MAX_HISTORY)
 *   30 requests/hour per IP, plus a global daily cap answered with 503.
 */

import { readSseFrames } from '../ai/openai-client.js';
import { checkAcceptance, type AcceptanceStatus } from './endpoint-accept.js';

export type ChatErrorCode =
  | 'rate-limited'
  | 'client-rate-limit'
  | 'timeout'
  | 'unavailable'
  | 'network'
  | 'endpoint-not-accepted'
  | 'bad-request'
  | 'failed';

export interface DocsSource {
  title: string;
  path: string;
  section?: string | undefined;
  /**
   * The service also sends an absolute URL. It is deliberately IGNORED: it
   * arrives from the same untrusted place as the answer, and validating it is
   * a trap — `new URL()` strips newlines and tabs when computing the origin, so
   * a value carrying an embedded newline passes an origin check and then emits
   * a second, forged citation into the rendered Sources block. `path` is the
   * one field we vet (SAFE_DOC_PATH), so the href is built only from that.
   */
  url?: string | undefined;
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export type AskResult =
  | { text: string; sources: DocsSource[]; truncated?: boolean }
  | { error: ChatErrorCode; message: string };

export const DEFAULT_SERVICE_URL = 'https://chatbot.hoody.com/api/chat';

/**
 * Public docs site, used to turn a citation into a clickable link. The service
 * emits site-relative paths and has never emitted an absolute URL.
 */
export const DOCS_SITE_BASE = 'https://docs.hoody.com';

/** Shown to the user when the answer hit the size cap. Never part of `text`. */
export const TRUNCATION_NOTICE = `\n…[truncated, see ${DOCS_SITE_BASE} for full content]`;

export const DEFAULT_MAX_RESULT_BYTES = 16_384;
export const DEFAULT_TIMEOUT_MS = 120_000;
/**
 * The service emits nothing until retrieval finishes and the first non-think
 * token arrives: embedding can take 30s and the upstream connect another 30s,
 * with no keepalives in between. A tighter bound aborts work the server (and
 * the user's hourly quota) has already paid for. Kept under the server's own
 * 120s absolute ceiling.
 */
export const DEFAULT_FIRST_BYTE_MS = 65_000;
export const DEFAULT_CLIENT_RATE_LIMIT = 30; // per hour — matches the server's

/**
 * Recorded in session metadata. There is exactly one answerer — the service —
 * so these are constants rather than user-selectable values.
 */
export const SERVICE_MODEL_LABEL = 'hoody-docs-assistant';
export const SERVICE_TIER_LABEL = 'hoody-service';

/** Server's own input cap. Rejected here so the user gets a clean message. */
export const MAX_MESSAGE_CHARS = 2000;
/** Server's own history cap. */
export const MAX_HISTORY_TURNS = 20;
/**
 * Byte budget for the whole `history` array. The server rejects request bodies
 * over 50 KB before reading them, and a character cap does not bound bytes:
 * 20 turns of 2000 CJK characters is ~120 KB. Budget in UTF-8 bytes, keeping
 * headroom for the message and JSON envelope.
 */
export const MAX_HISTORY_BYTES = 32_000;

const MAX_RETRIES_429 = 4;
const BACKOFF_FLOOR_MS = 5000;
const BACKOFF_CEIL_MS = 10 * 60_000;
const JITTER_FRAC = 0.2;

/**
 * The answer is untrusted text on its way to a terminal. Escape sequences in
 * it can clear the screen, reposition the cursor, set the window title, or
 * redefine keys — so strip C0 (except tab/newline), DEL, and C1 before any of
 * it is rendered or recorded. Printable content is untouched.
 */
// eslint-disable-next-line no-control-regex
const TERMINAL_CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

function stripTerminalControls(chunk: string): string {
  return chunk.replace(TERMINAL_CONTROL, '');
}

/** A citation path we are willing to turn into a link: site-relative, no host. */
const SAFE_DOC_PATH = /^\/(?!\/)[A-Za-z0-9/_.#-]*$/;

/**
 * Longest prefix of `str` that fits in `maxBytes` UTF-8 bytes, never splitting
 * a character or a surrogate pair (which would emit a lone replacement char).
 */
function takeBytes(str: string, maxBytes: number): string {
  if (Buffer.byteLength(str, 'utf8') <= maxBytes) return str;
  let bytes = 0;
  let end = 0;
  for (const ch of str) {
    const size = Buffer.byteLength(ch, 'utf8');
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += ch.length;
  }
  return str.slice(0, end);
}

/** Strip what would break out of a markdown link label. */
function sanitizeTitle(title: string): string {
  // eslint-disable-next-line no-control-regex
  return title.replace(/[\x00-\x1f\x7f-\x9f\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Render citations as markdown links. Sources are UNTRUSTED (same provenance
 * as the answer), so both halves of the link are constrained: the path must be
 * a plain site-relative docs path, and the title cannot carry markdown-link
 * metacharacters or newlines that would break out of the `[…](…)`.
 */
export function renderSources(sources: readonly DocsSource[]): string {
  const list = sources
    .filter(
      s =>
        typeof s?.title === 'string' &&
        s.title.trim() !== '' &&
        typeof s?.path === 'string' &&
        SAFE_DOC_PATH.test(s.path),
    )
    .map(s => `- [${sanitizeTitle(s.title)}](${DOCS_SITE_BASE}${s.path})`)
    .join('\n');
  return list ? `\n\nSources:\n${list}` : '';
}

/**
 * Rolling-window request counter. One instance per process, shared by the
 * one-shot path and the REPL so a single bucket bounds them both.
 */
export class RollingRateLimiter {
  private hits: number[] = [];
  constructor(private limit: number, private windowMs = 3_600_000) {}

  canProceed(now = Date.now()): boolean {
    this.prune(now);
    return this.hits.length < this.limit;
  }

  record(now = Date.now()): void {
    this.prune(now);
    this.hits.push(now);
  }

  retryAfterMs(now = Date.now()): number {
    this.prune(now);
    if (this.hits.length < this.limit) return 0;
    const oldest = this.hits[0]!;
    return Math.max(0, this.windowMs - (now - oldest));
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.hits.length > 0 && this.hits[0]! < cutoff) this.hits.shift();
  }
}

/** Exponential backoff with jitter, honouring a server-sent Retry-After. */
export function computeBackoffMs(
  attempt: number,
  retryAfterSec?: number | undefined,
  rng: () => number = Math.random,
): number {
  const base =
    retryAfterSec !== undefined && Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? retryAfterSec * 1000
      : BACKOFF_FLOOR_MS * Math.pow(2, attempt);
  const capped = Math.min(base, BACKOFF_CEIL_MS);
  const jitter = capped * JITTER_FRAC * (rng() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

export interface AskOptions {
  /** The user's question. */
  message: string;
  /** Prior turns, oldest first. Trimmed to the server's cap. */
  history?: readonly Turn[] | undefined;
  /** Called for each content delta as it arrives. */
  onDelta?: ((chunk: string) => void) | undefined;
  /** Override for HOODY_CHAT_URL. */
  url?: string | undefined;
  maxResultBytes?: number | undefined;
  timeoutMs?: number | undefined;
  firstByteTimeoutMs?: number | undefined;
  limiter?: RollingRateLimiter | undefined;
  fetchImpl?: typeof fetch | undefined;
  sleepImpl?: ((ms: number, signal?: AbortSignal) => Promise<void>) | undefined;
  rng?: (() => number) | undefined;
  acceptEndpointFlag?: string | undefined;
  acceptEndpointEnv?: string | undefined;
  isTty?: boolean | undefined;
  /** Private mode: never read or write the accept file. */
  sessionOnly?: boolean | undefined;
  onTtyPrompt?: ((origin: string) => Promise<boolean>) | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Ask the Hoody documentation assistant one question.
 *
 * Retries only ever happen BEFORE any delta reaches the caller: the sole
 * retryable condition is an HTTP 429, which the service answers with a status
 * line and no stream. A failure that arrives mid-stream is returned as-is —
 * re-issuing it would duplicate text the user has already seen.
 */
export async function askHoody(opts: AskOptions): Promise<AskResult> {
  const url = opts.url ?? process.env.HOODY_CHAT_URL ?? DEFAULT_SERVICE_URL;
  const maxBytes =
    opts.maxResultBytes ??
    (Number(process.env.HOODY_CHAT_MAX_RESULT_BYTES) || DEFAULT_MAX_RESULT_BYTES);
  const totalMs = opts.timeoutMs ?? (Number(process.env.HOODY_CHAT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleepImpl ?? defaultSleep;
  const rng = opts.rng ?? Math.random;
  const limiter = opts.limiter;

  // 1. Endpoint acceptance. The built-in origin passes silently; a custom
  //    HOODY_CHAT_URL must be authorized before anything is sent to it.
  const acceptance = await checkAcceptance(url, {
    flagValue: opts.acceptEndpointFlag,
    envValue: opts.acceptEndpointEnv,
    isTty: opts.isTty,
    sessionOnly: opts.sessionOnly,
  });
  const ok = await resolveAcceptance(acceptance, opts.onTtyPrompt, opts.sessionOnly);
  if (ok.status !== 'ok') {
    // Actionable when — and only when — the advice can actually work. An
    // unparseable HOODY_CHAT_URL has no origin to accept, a user who just
    // declined does not need to be told how to overrule themselves, and a
    // `reason` that already carries the instructions must not repeat them.
    const detail = 'reason' in ok && ok.reason ? ok.reason : ok.origin;
    const declined = 'reason' in ok && /declined/i.test(String(ok.reason ?? ''));
    const acceptable = /^https?:\/\/[^\s]+$/.test(ok.origin);
    const alreadyAdvises = detail.includes('--accept-endpoint');
    const remedy =
      acceptable && !declined && !alreadyAdvises
        ? `\n  Re-run with --accept-endpoint ${ok.origin}, ` +
          `or set HOODY_CHAT_ACCEPT_ENDPOINT=${ok.origin}`
        : '';
    return { error: 'endpoint-not-accepted', message: `Endpoint not accepted: ${detail}${remedy}` };
  }

  // 2. Client-side bucket, checked before the request is issued.
  if (limiter && !limiter.canProceed()) {
    const mins = Math.max(1, Math.ceil(limiter.retryAfterMs() / 60_000));
    return {
      error: 'client-rate-limit',
      message: `Rate limit reached. Try again in ~${mins} minute(s).`,
    };
  }

  // 3. Input cap — the server rejects anything longer, so say so locally
  //    rather than spending a request to be told.
  const message = opts.message.trim();
  if (message.length === 0) {
    return { error: 'bad-request', message: 'Empty question.' };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return {
      error: 'bad-request',
      message: `Question is too long (${message.length} > ${MAX_MESSAGE_CHARS} characters).`,
    };
  }

  const history = normalizeHistory(opts.history);

  let attempt = 0;
  let charged = false;
  while (true) {
    const streamed = { any: false };
    const result = await fetchOnce(
      url,
      message,
      history,
      maxBytes,
      totalMs,
      opts.firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_MS,
      fetchImpl,
      opts.onDelta,
      streamed,
      opts.signal,
    );
    // One question costs one slot no matter how many 429 retries it takes.
    if (limiter && !charged) {
      limiter.record();
      charged = true;
    }
    if ('text' in result) return result;
    // Never retry once the user has seen output — it would print twice.
    if (streamed.any) return result;
    if (result.error !== 'rate-limited' || attempt >= MAX_RETRIES_429) {
      if (result.error === 'rate-limited' && attempt >= MAX_RETRIES_429) {
        return {
          error: 'rate-limited',
          message: `Still rate-limited after ${attempt + 1} attempts. Try again later.`,
        };
      }
      return result;
    }
    // Only retry when the server actually told us when to come back. Its
    // limiter is a fixed one-hour window and it sends no Retry-After, so
    // blind backoff just burns 75s of silence and fails anyway.
    const retryAfterSec = (result as any)._retryAfterSec;
    if (retryAfterSec === undefined) return result;
    const waited = await abortableSleep(computeBackoffMs(attempt, retryAfterSec, rng), sleep, opts.signal);
    // Ctrl-C during the wait must return immediately, not finish the sleep.
    if (!waited) return { error: 'network', message: 'aborted by caller' };
    attempt++;
  }
}

/** Keep the newest turns, well-formed and within the server's cap. */
function normalizeHistory(history: readonly Turn[] | undefined): Turn[] {
  if (!Array.isArray(history) || history.length === 0) return [];
  const trimmed = history
    .filter(
      h =>
        h &&
        (h.role === 'user' || h.role === 'assistant') &&
        typeof h.content === 'string' &&
        h.content !== '',
    )
    .slice(-MAX_HISTORY_TURNS)
    // Clamp each turn's characters (the server truncates to this length anyway,
    // so nothing is lost) …
    .map(h => ({ role: h.role, content: h.content.slice(0, MAX_MESSAGE_CHARS) }));

  // … then enforce a real BYTE budget, newest-first. Characters are not bytes:
  // 20 turns of 2000 CJK characters serialise to ~120 KB and the server rejects
  // the body at 50 KB, which the client would then misreport as "question too
  // long" about a five-word question.
  const kept: Turn[] = [];
  let bytes = 0;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const turn = trimmed[i]!;
    // Measure the SERIALISED turn: the request body is JSON, and a turn made of
    // backslashes or quotes doubles in length once escaped. Budgeting the raw
    // UTF-8 bytes under-counts it by ~2x and the server rejects the body.
    const size = Buffer.byteLength(JSON.stringify(turn), 'utf8');
    if (bytes + size > MAX_HISTORY_BYTES) break;
    bytes += size;
    kept.unshift(turn);
  }
  // Never send a dangling assistant turn as the oldest entry.
  if (kept.length > 0 && kept[0]!.role === 'assistant') kept.shift();
  return kept;
}

async function fetchOnce(
  url: string,
  message: string,
  history: Turn[],
  maxBytes: number,
  totalMs: number,
  firstByteMs: number,
  fetchImpl: typeof fetch,
  onDelta: ((chunk: string) => void) | undefined,
  streamed: { any: boolean },
  callerSignal?: AbortSignal,
): Promise<AskResult> {
  if (callerSignal?.aborted) {
    return { error: 'network', message: 'aborted by caller' };
  }
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(new Error('timeout')), totalMs);
  let firstByteTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => controller.abort(new Error('first-byte-timeout')),
    firstByteMs,
  );
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal) callerSignal.addEventListener('abort', onCallerAbort, { once: true });

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      // No Origin header — the CLI is not a browser. The service refuses a
      // request that carries a present-but-unallowlisted Origin, and treats
      // an absent one as a non-browser caller.
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ message, history }),
      // The acceptance gate authorises ONE origin, and it only sees the URL we
      // are about to call. Following a redirect would re-POST the question and
      // the conversation history to whatever host the response names, with no
      // gate in front of it. Refuse instead: the service never redirects.
      redirect: 'error',
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return mapHttpError(res.status, res.headers.get('retry-after'), body);
    }
    if (!res.body) {
      return { error: 'network', message: 'Empty response body from the service.' };
    }

    let text = '';
    let truncated = false;
    let sources: DocsSource[] = [];
    let fatal: string | undefined;
    let framesSeen = 0;
    let sawDone = false;

    for await (const frame of readSseFrames(res.body)) {
      if (firstByteTimer) {
        clearTimeout(firstByteTimer);
        firstByteTimer = undefined;
      }
      let payload: any;
      try {
        payload = JSON.parse(frame);
      } catch {
        continue;
      }
      framesSeen++;
      if (typeof payload.error === 'string' && payload.error) {
        fatal = payload.error;
        break;
      }
      if (!truncated && typeof payload.text === 'string' && payload.text !== '') {
        const clean = stripTerminalControls(payload.text);
        if (clean !== '') {
          // Count real UTF-8 bytes: `.length` is UTF-16 units, so a CJK answer
          // would otherwise be allowed several times the configured cap.
          const room = Math.max(0, maxBytes - Buffer.byteLength(text, 'utf8'));
          const piece = room > 0 ? takeBytes(clean, room) : '';
          if (piece !== '') {
            text += piece;
            if (onDelta) {
              onDelta(piece);
              streamed.any = true;
            }
          }
          // Anything we could not take means the answer was cut. This MUST be
          // evaluated even when room is already 0: a frame arriving after the
          // cap is exactly full is dropped, and reporting that as a complete
          // answer is how a truncated reply gets persisted as a finished turn.
          // Truncation is signalled ONLY by the returned flag — never through
          // onDelta, because the REPL builds the assistant turn from deltas and
          // would store the client's own words as the assistant's.
          if (piece.length < clean.length) truncated = true;
        }
      }
      if (payload.done === true) {
        sawDone = true;
        if (Array.isArray(payload.sources)) sources = payload.sources;
        break;
      }
    }

    if (fatal) return { error: 'failed', message: stripTerminalControls(fatal) };
    if (framesSeen === 0) {
      return { error: 'network', message: 'No data received from the service.' };
    }
    // The terminal `{done:true}` frame is what distinguishes a complete answer
    // from a connection that died mid-sentence. Without it the text on screen
    // is a fragment, and must not be recorded as a finished turn.
    if (!sawDone) {
      return {
        error: 'network',
        message: 'The service closed the connection before finishing its answer.',
      };
    }
    return { text, sources, truncated };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (/first-byte-timeout/.test(msg)) {
      return { error: 'timeout', message: 'The service never started answering.' };
    }
    if (/timeout/.test(msg)) {
      return { error: 'timeout', message: 'The service timed out.' };
    }
    return { error: 'network', message: msg.slice(0, 200) };
  } finally {
    if (firstByteTimer) clearTimeout(firstByteTimer);
    clearTimeout(totalTimer);
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}

function mapHttpError(
  status: number,
  retryAfterHeader: string | null,
  body: string,
): AskResult {
  // The service reports a machine-readable code alongside the prose; prefer it.
  let code: string | undefined;
  let prose: string | undefined;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === 'string') code = parsed.error;
    if (parsed && typeof parsed.message === 'string') prose = parsed.message;
  } catch {
    /* not JSON — fall back to the status */
  }
  const snippet = stripTerminalControls(prose ?? body).slice(0, 200);

  if (status === 400) {
    return { error: 'bad-request', message: snippet || 'Rejected by the service (400).' };
  }
  if (status === 408) return { error: 'timeout', message: 'The service timed out (408).' };
  if (status === 413) {
    return { error: 'bad-request', message: 'Question too long for the service (413).' };
  }
  if (status === 429) {
    const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
    return {
      error: 'rate-limited',
      message: snippet || 'Rate limit exceeded. Try again shortly.',
      _retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
    } as AskResult;
  }
  if (status === 503) {
    // `daily_capacity` is the whole service being at its daily budget; a plain
    // 503 is a transient outage. Both are "come back later", but the message
    // should not blame the user's own usage.
    return {
      error: 'unavailable',
      message:
        code === 'daily_capacity'
          ? 'The docs assistant is at capacity right now. Try again later.'
          : snippet || 'The service is temporarily unavailable.',
    };
  }
  return { error: 'failed', message: snippet || `Service returned HTTP ${status}.` };
}

async function resolveAcceptance(
  initial: AcceptanceStatus,
  onTtyPrompt?: ((origin: string) => Promise<boolean>) | undefined,
  sessionOnly?: boolean | undefined,
): Promise<AcceptanceStatus> {
  if (initial.status === 'ok') return initial;
  if (initial.status === 'needs-tty-prompt' && onTtyPrompt) {
    const agreed = await onTtyPrompt(initial.origin);
    if (agreed) {
      if (sessionOnly) return { status: 'ok', origin: initial.origin, reason: 'prompt' };
      const { confirmAcceptance } = await import('./endpoint-accept.js');
      return confirmAcceptance(initial.origin);
    }
    return {
      status: 'refused',
      origin: initial.origin,
      reason: 'User declined to accept the endpoint.',
    };
  }
  return initial;
}

/**
 * Sleep that gives up when the caller aborts. Returns false if it was cut
 * short — without this, Ctrl-C during a backoff leaves the REPL's main loop
 * stuck inside the await while the prompt has already returned, silently
 * queueing whatever the user types next.
 */
async function abortableSleep(
  ms: number,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!signal) {
    await sleep(ms);
    return true;
  }
  if (signal.aborted) return false;
  // Own the timer so it can be CLEARED. Racing an abandoned setTimeout leaves
  // it pending and holds the event loop open: askHoody returns immediately on
  // Ctrl-C but the process then sits there for the rest of the backoff, which
  // Retry-After can push to ten minutes.
  let onAbort!: () => void;
  const aborted = new Promise<boolean>(resolve => {
    onAbort = () => resolve(false);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    // The sleep gets the signal too, so the DEFAULT one can clear its timer.
    // Racing alone is not enough: an abandoned setTimeout keeps the event loop
    // alive, so the process would sit there for the rest of the backoff — up
    // to ten minutes with a large Retry-After — after askHoody had returned.
    return await Promise.race([sleep(ms, signal).then(() => true), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(res => {
    const timer = setTimeout(res, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        res();
      },
      { once: true },
    );
  });
}

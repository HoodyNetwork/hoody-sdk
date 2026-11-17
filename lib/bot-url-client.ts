/**
 * Call a Bot through its public URL — `new BotUrlClient({ url, key })`.
 * Browser-safe (fetch only, no Node imports). Maintained in lib/, not generated.
 *
 * A public Bot URL (`https://<label>.hoody.bot`) is the doors of ONE Bot, reached
 * with a named key its owner made. This client uses only those doors and needs no
 * Hoody account, computer or kit URL; `box.agent.bots.ask()` (bot-chat.ts) is the
 * owner's private route and is a different thing.
 *
 *   GET  /v1/models            the one model; its id is the URL's label
 *   POST /v1/chat/completions  OpenAI chat (chat(), streamed by default)
 *   POST /mcp                  MCP tools ask, updates, answer, status (stateless:
 *                              every call is one JSON-RPC POST, no session)
 *   GET  /events               the live status and updates (streamEvents(): Server-Sent
 *                              Events, resumed by Last-Event-ID; polling where a
 *                              Bot URL has no such path yet)
 *
 * The key travels only in `Authorization: Bearer`, never in a URL, and the client's own
 * string forms do not show it. Errors and diagnostics the client makes contain no
 * authentication material; content the Bot returns on success (model ids, chat text,
 * stream deltas, MCP answers, status fields, update rows) is the caller's own data and
 * is passed through unchanged. An error holds no text that an answer, a custom fetch or
 * stream, or an abort reason controls:
 *   - its code is in the closed registry or is one of the client's own;
 *   - its message is the registry's fixed text plus the HTTP status, or a fixed text of
 *     the client's, never the server's words;
 *   - a request id is kept only in the edge's form (32 lowercase hex) and only when it
 *     holds no 8-character piece of the key;
 *   - a cause is one of a few standard exception names (fixed words such as `TypeError`
 *     can happen to match a piece of a key: that is public vocabulary, not the key);
 *   - abort reasons are not propagated: a cancelled call throws a fresh AbortError.
 * An exception the caller's onText throws is passed back unchanged, and so is an SDK
 * error the caller changed itself: both are the caller's own objects.
 *
 * Every refusal carries a fixed code: lower snake in the body, the same code UPPER in
 * `X-Hoody-Error-Code`, in the door's own envelope (OpenAI `error.code`, MCP
 * `error.data.code` or a tool result `error <code>: <message>`). BotUrlError.code is
 * that code, lower case. Retries follow BOT_URL_ERRORS, for HTTP refusals and MCP tool
 * refusals alike: a 429 waits its Retry-After; a cold start (503 `bot_starting`, which
 * has no Retry-After) and the other retryable failures back off 1 s, 2 s, 4 s … up to
 * 30 s, about two minutes in all (streamEvents() is the exception: it retries until stopped).
 * A streamed chat answer that already delivered text is not retried. An error frame that
 * arrives inside a streamed chat answer that is already open is thrown as a BotUrlError
 * carrying its `retryable` flag, and the client does not retry it: the caller decides.
 *
 * What a retry sends again: chat() sends an Idempotency-Key, a fresh random one per call
 * unless you give one (or turn it off with `idempotencyKey: false`). Retries reuse the
 * same key. Repeating a request with the same Idempotency-Key (or the same MCP text)
 * normally joins the running message or returns its saved reply. This is best effort, not
 * a guarantee: the Bot keeps a key for about 24 hours after it accepted the message, and
 * after that, or after a reset, the repeat can be a NEW message. A Bot holding very many
 * recent keys refuses a new key (429) instead of forgetting an old one. Before repeating anything that changes things, check
 * with status/updates or poll the ref you got back. A new chat() call is a new message. An MCP text ask and an answer() carry no replay key, and
 * the Bot can act on a repeat (post the text again; approve whichever gate holds a title
 * by then). So they, and chat() without a key, are sent again only after a refusal that
 * comes before the Bot acts (a 429, `bot_starting`, `bot_unavailable`). When the answer
 * is lost after the request may have reached the Bot (a broken connection, an unreadable
 * answer or answer shape, a timeout or upstream failure, and for an unkeyed streamed
 * chat() any stream failure or error frame before the first text other than the five
 * refusals that come before the Bot acts: rate_limited, concurrency_limit, ip_blocked,
 * bot_starting, bot_unavailable), they throw
 * `outcome_unknown` and are not sent again: read getStatus() or listUpdates() before sending
 * them yourself. Reads (models, status,
 * updates) and asks by ref change nothing and are retried as above.
 *
 * Long answers: chat() streams and the Bot sends a keepalive comment while it works, so
 * a quiet connection is dropped after `idleTimeoutMs`. MCP ask() returns after about
 * 50 s with status `working` and a ref; ask() then asks again with that ref (which
 * sends nothing new) until the reply arrives or `maxWaitMs` passes.
 *
 * The code table, the key grammar and the backoff numbers are those of the Bot URL wire
 * contract.
 */

import { botLabelOfUrl, isValidBotZone, type BotLabelOfUrlOptions } from './bot-label.js';
import { retireAccessors, retireMethods } from './retired-accessor.js';

/** How a code tells a caller to react. */
export interface BotUrlErrorInfo {
  status: number;
  /** `backoff`: retry after a growing delay. `after`: retry after Retry-After. `no`: do not retry. */
  retry: 'no' | 'backoff' | 'after';
  /** The fixed public message; BotUrlError.message uses it, never the server's text. */
  message: string;
}

/** The public error codes a Bot URL answers with (the list is closed). */
export const BOT_URL_ERRORS: Readonly<Record<string, BotUrlErrorInfo>> = Object.freeze({
  bot_not_found: { status: 404, retry: 'no', message: 'Bot not found or unavailable.' },
  https_required: { status: 426, retry: 'no', message: 'Use https://.' },
  ipv4_required: { status: 403, retry: 'no', message: 'This Bot is reachable over IPv4 only.' },
  bot_unavailable: { status: 503, retry: 'backoff', message: 'Bot temporarily unavailable. Retry shortly.' },
  bot_starting: { status: 503, retry: 'backoff', message: 'Bot is starting. Retry shortly.' },
  bot_disabled: { status: 403, retry: 'no', message: 'This Bot is turned off. Ask its owner.' },
  bot_upgrade_required: { status: 503, retry: 'no', message: 'This Bot needs an update by its owner.' },
  key_invalid: { status: 401, retry: 'no', message: 'Missing or invalid key.' },
  key_disabled: { status: 403, retry: 'no', message: 'This key is paused or expired. Ask the Bot\'s owner.' },
  ip_not_allowed: { status: 403, retry: 'no', message: 'This key is not allowed from your IP address.' },
  ip_blocked: { status: 429, retry: 'after', message: 'Too many failed attempts. Retry later.' },
  path_not_allowed: { status: 404, retry: 'no', message: 'Not found.' },
  method_not_allowed: { status: 405, retry: 'no', message: 'Method not allowed.' },
  cors_disabled: { status: 403, retry: 'no', message: 'Browser access is turned off for this Bot.' },
  body_too_large: { status: 413, retry: 'no', message: 'Request body too large.' },
  rate_limited: { status: 429, retry: 'after', message: 'Too many requests. Retry later.' },
  concurrency_limit: { status: 429, retry: 'after', message: 'Too many simultaneous requests. Retry shortly.' },
  request_timeout: { status: 408, retry: 'backoff', message: 'Request timed out.' },
  invalid_request: { status: 400, retry: 'no', message: 'Invalid request.' },
  request_not_found: { status: 404, retry: 'no', message: 'Not found.' },
  request_conflict: { status: 409, retry: 'no', message: 'Conflict with an earlier request.' },
  forbidden: { status: 403, retry: 'no', message: 'Not allowed.' },
  upstream_timeout: { status: 504, retry: 'backoff', message: 'The Bot did not answer in time.' },
  upstream_error: { status: 502, retry: 'backoff', message: 'The Bot could not answer. Retry later.' },
  internal_error: { status: 500, retry: 'backoff', message: 'Internal error.' },
});

/**
 * Codes the client makes itself, never sent by a Bot URL: `network_error` (no answer:
 * the connection failed), `stream_idle` (a stream sent nothing, not even a keepalive,
 * for idleTimeoutMs), `stream_interrupted` (a stream that already gave text broke off; an
 * explicit error frame after text keeps its registry code instead and is not retryable),
 * `outcome_unknown` (a call that changes something lost its answer after the request may
 * have reached the Bot; it is not sent again), `protocol_error` (an answer this client
 * cannot read), `tool_error` (an MCP tool
 * refused without a registry code), `http_<status>` (an HTTP refusal without a registry
 * code). A code outside the registry is never passed on as given.
 */
export type BotUrlLocalCode = 'network_error' | 'stream_idle' | 'stream_interrupted' | 'outcome_unknown' | 'protocol_error' | 'tool_error' | `http_${number}`;

/** Errors this module made: the only ones it passes on or retries as they are. */
const OWN_ERRORS = new WeakSet<object>();
let minting = false;

function isOwnError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && OWN_ERRORS.has(e);
}

/**
 * The error of every failed Bot URL call. `code` is the Bot's fixed refusal
 * code in lower snake case (see `BOT_URL_ERRORS`) or one of the client's own
 * (`BotUrlLocalCode`); `status` is the HTTP status, 0 when no answer arrived;
 * `retryable` says whether trying again can succeed. The message is a fixed
 * text, never the server's words, and holds no authentication material.
 */
export class BotUrlError extends Error {
  /** The registry code (lower snake case), or a BotUrlLocalCode. */
  readonly code: string;
  /** The HTTP status; 0 when no answer arrived. */
  readonly status: number;
  /** Whether trying again can succeed. */
  readonly retryable: boolean;
  /** The Retry-After of a 429, in ms. */
  readonly retryAfterMs: number | undefined;
  /** The answer's X-Request-Id: the owner finds the call in the Bot's access log by it. */
  readonly requestId: string | undefined;

  /** Build an error with `code` and `message`. Fields left out of `init` default to `status` 0 and `retryable` false; `cause` becomes the standard `Error.cause`. */
  constructor(code: string, message: string, init: { status?: number | undefined; retryable?: boolean | undefined; retryAfterMs?: number | undefined; requestId?: string | undefined; cause?: unknown } = {}) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'BotUrlError';
    this.code = code;
    this.status = init.status ?? 0;
    this.retryable = init.retryable ?? false;
    this.retryAfterMs = init.retryAfterMs;
    this.requestId = init.requestId;
    if (minting) OWN_ERRORS.add(this);
  }
}

/** A BotUrlError this module made (marked own, unlike one a custom fetch or stream throws). */
function botUrlError(...args: ConstructorParameters<typeof BotUrlError>): BotUrlError {
  minting = true;
  try {
    return new BotUrlError(...args);
  } finally {
    minting = false;
  }
}

/** True when `e` is a `BotUrlError`: a type guard for `catch` blocks. */
export function isBotUrlError(e: unknown): e is BotUrlError {
  return e instanceof BotUrlError;
}

export interface BotUrlRetryOptions {
  /** Tries per call, the first included (default 8). 1 turns retries off. */
  maxAttempts?: number;
  /** The first backoff delay in ms (default 1000); each next one doubles. */
  initialDelayMs?: number;
  /** The longest backoff delay, and the longest Retry-After waited, in ms (default 30000). */
  maxDelayMs?: number;
  /** No retry starts later than this many ms after the call began (default 120000). */
  maxElapsedMs?: number;
}

export interface BotUrlClientOptions {
  /**
   * The Bot's public URL, `https://<label>.hoody.bot`: a label under `hoody.bot`, under
   * the Bot zone of `platform`, or under `zone`. A path, query or fragment is refused, and so is any other host, before
   * any request.
   */
  url: string;
  /** The key its owner gave you. Kept out of URLs, errors and logs. */
  key: string;
  retry?: BotUrlRetryOptions;
  /**
   * Drop a stream that sends nothing, not even a keepalive, for this many ms
   * (default 90000: the Bot sends one at least every 30 s while it works).
   */
  idleTimeoutMs?: number;
  /** Default: globalThis.fetch. */
  fetch?: typeof fetch;
  /**
   * One more Bot zone to accept besides the known ones, for a Bot on another platform
   * (`bots.example.org` accepts `https://<label>.bots.example.org`). It adds to the list
   * and never replaces it. Lowercase host names only; anything else is refused.
   */
  zone?: string;
  /**
   * The platform domain whose Bot zone is accepted besides `hoody.bot`, for example the
   * domain of your account's API base URL. Default: the platform this SDK was deployed or
   * released for (production: `hoody.bot` alone). A platform with no Bot zone adds nothing.
   */
  platform?: string;
}

/** One model as GET /v1/models lists it. On a public URL its id is the label. */
export interface BotUrlModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  [extra: string]: unknown;
}

export interface BotUrlChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface BotUrlChatOptions {
  /**
   * Stream the answer (default true). onText gets each piece as it arrives; an exception
   * it throws is passed back to you unchanged (it is your own object, not an SDK error).
   */
  stream?: boolean;
  onText?: (delta: string) => void;
  /**
   * The Idempotency-Key (1 to 255 printable ASCII characters, no spaces). By default a
   * fresh random key per call, reused by this call's retries. Give your own to send a
   * message again under the same key; false sends none. The Bot's replay is best effort
   * (see the module header): a key is kept for about 24 hours.
   */
  idempotencyKey?: string | false;
  signal?: AbortSignal;
}

export interface BotUrlChatResult {
  text: string;
  /** The label. */
  model: string | undefined;
  finishReason: string | undefined;
  requestId: string | undefined;
}

/** What MCP ask and answer return. */
export interface BotUrlAnswer {
  /** answered | working | waiting_on_gate | reset (the Bot's own words, passed on as given). */
  status: string;
  text: string;
  /** Ask again with it to wait for the same reply; it sends nothing new. */
  ref: string;
  requestId: string | undefined;
}

export interface BotUrlAskOptions {
  /**
   * Keep asking with the ref while the answer is `working` (default true). False
   * returns the first answer, which may be `working`.
   */
  wait?: boolean;
  /** Stop waiting after this many ms and return the last `working` answer (default 600000). */
  maxWaitMs?: number;
  /** Called with each `working` answer while ask() keeps waiting. */
  onWorking?: (answer: BotUrlAnswer) => void;
  signal?: AbortSignal;
}

export interface BotUrlUpdate {
  seq: number;
  at: string;
  role: string;
  text: string;
  [extra: string]: unknown;
}

export interface BotUrlUpdates {
  /** The rows, oldest first. A row whose fields have the wrong JSON type is left out (see `omitted`). */
  items: BotUrlUpdate[];
  /** Rows left out because a field was missing or had the wrong JSON type (fail closed, like the Bot's own renderer). */
  omitted: number;
  /** Pass to the next listUpdates() call. */
  cursor: number;
  hasMore: boolean;
  requestId: string | undefined;
}

export interface BotUrlGateAnswer {
  /** The gate handle (`g_` + 22 characters) as getStatus() lists it. Give this or title. */
  gateId?: string;
  /** The delegate's title, when it has one pending gate. */
  title?: string;
  decision: 'approve' | 'allow_session' | 'deny' | 'answer';
  /** With deny: why (at most 500 characters). With answer: the answer. */
  text?: string;
}

/** The Bot's status as the MCP status tool gives it; fields beyond these are passed through. */
export interface BotUrlStatus {
  name?: string;
  turn_running?: boolean;
  queued?: number;
  pending_gate?: unknown;
  open_delegates?: Array<{ title?: string; pending_gates?: Array<{ gate_id: string; type?: string; summary?: string }>; [extra: string]: unknown }>;
  [extra: string]: unknown;
}

/** One event of streamEvents(): the same projections getStatus() and listUpdates() return. */
export type BotUrlEvent =
  | { type: 'status'; status: BotUrlStatus }
  | { type: 'row'; row: BotUrlUpdate }
  /** The log no longer holds the rows after the cursor: its rows go on from nextSeq (the cursor may move back). */
  | { type: 'gap'; nextSeq: number }
  /** The log was archived: its rows start again at nextSeq (the cursor may move back). */
  | { type: 'archived'; nextSeq: number };

export interface BotUrlStreamEventsOptions {
  /** Where to resume: a cursor from listUpdates() or from an earlier stream (the same numbers). Absent: the newest rows. */
  cursor?: number;
  signal?: AbortSignal;
  /**
   * What to do where the Bot URL has no event stream yet (404 path_not_allowed or 405
   * method_not_allowed): 'poll' (default) polls getStatus() and listUpdates(); 'none' throws.
   */
  fallback?: 'poll' | 'none';
  /** Poll mode: the time between the starts of two status polls (default 15000). */
  pollIntervalMs?: number;
  /** How long to wait for the stream's (or a poll's) response headers, in ms (default 15000). */
  connectTimeoutMs?: number;
}

export interface BotUrlEventStream extends AsyncIterable<BotUrlEvent> {
  /** The resume position: pass it as `cursor` to go on later. Not "the last row shown": a gap or archive can move it back. */
  getCursor(): number | undefined;
  /** 'poll' once the Bot URL turned out to have no event stream. */
  getMode(): 'stream' | 'poll';
}

/** Hooks for tests: time and randomness. */
export interface BotUrlClientDeps {
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  random?: () => number;
  /**
   * Tests only: let an http:// URL through for a local test server (http://localhost or
   * http://127.0.0.1, any port). It changes nothing for https:// URLs, which must still be
   * Bot URLs. No shipped caller sets it; a real Bot URL refuses plain http.
   */
  allowHttp?: boolean;
}

/** The key grammar. */
const KEY_RE = /^hbk_[A-Za-z0-9]{43}$/;
/** Statuses that mean "try again" when the code is not in the registry. */
const RETRY_STATUSES = new Set([408, 500, 502, 503, 504]);
const DEFAULT_RETRY: Required<BotUrlRetryOptions> = { maxAttempts: 8, initialDelayMs: 1000, maxDelayMs: 30_000, maxElapsedMs: 120_000 };
const DEFAULT_IDLE_MS = 90_000;
const DEFAULT_ASK_WAIT_MS = 600_000;
const MCP_PROTOCOL_VERSION = '2025-06-18';
/** `error <code>: <message>`, the text of a refused MCP tool call. */
const TOOL_ERROR_RE = /^error ([a-z][a-z0-9_]*): ([\s\S]*)$/;
/** The X-Request-Id the edge sets on every answer: 32 lowercase hex. */
const REQUEST_ID_RE = /^[0-9a-f]{32}$/;
/** The exception names a cause may keep; any other name (it could be anything, a key included) becomes 'Error'. */
const CAUSE_NAMES = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AbortError', 'TimeoutError', 'NetworkError', 'DOMException']);
/** The shortest piece of the key that counts as the key when an answer echoes it. */
const KEY_PIECE = 8;
/** What the Bot takes as an Idempotency-Key; `compat:` and `chan:` are its own. */
const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{1,255}$/;
/** A gate handle: `g_` + 22 base64url characters. */
const GATE_HANDLE_RE = /^g_[A-Za-z0-9_-]{22}$/;
/** streamEvents(): the defaults, the bound on one pending frame and on a refusal body read, and stable progress. */
const DEFAULT_CONNECT_MS = 15_000;
const DEFAULT_POLL_MS = 15_000;
const DEFAULT_EVENTS_RETRY_MS = 1000;
const END_JITTER_MS = 500;
const EVENTS_PENDING_CAP = 4 << 20;
const ERROR_BODY_CAP = 4096;
const STABLE_MS = 10_000;
/** An event id: the decimal resume position (the agent sends at most 16 digits, within 2^53 - 1). */
const EVENT_ID_RE = /^\d{1,16}$/;
const EVENT_NAMES = new Set(['status', 'row', 'cursor', 'gap', 'archived', 'end', 'error']);
/** Thrown inside streamEvents() once its lifetime ended; never leaves it. */
const EVENTS_HALT = Symbol('events_halt');
/** Local failures streamEvents() backs off from (the registry's retryable codes aside). */
const POLL_RETRY = new Set(['network_error', 'stream_idle', 'protocol_error']);
/** HTTP refusals without a registry code that streamEvents() still backs off from (an edge restarting); any other http_<status> is thrown. */
const EVENTS_RETRY_STATUSES = new Set([408, 502, 503, 504]);
/** Poll mode: the most updates pages one tick reads; the rest wait for the next tick. */
const EVENTS_PAGES_PER_TICK = 20;
/** After a 429 rate_limited, streamEvents() waits at least this much more, doubling up to the max, until 5 min pass without one. */
const RATE_SLOW_MS = 30_000;
const RATE_SLOW_MAX_MS = 120_000;
const RATE_SLOW_RESET_MS = 300_000;

/** Whether `v` is a gate handle (`g_` + 22 base64url characters), the only gate name a Bot URL shows. */
export function isGateHandle(v: unknown): v is string {
  return typeof v === 'string' && GATE_HANDLE_RE.test(v);
}

/** An updates row with every field of its documented JSON type: strict, never coerced. */
function isUpdateRow(v: unknown): v is BotUrlUpdate {
  return isObject(v) && Number.isSafeInteger(v.seq) && (v.seq as number) >= 0
    && typeof v.at === 'string' && typeof v.role === 'string' && typeof v.text === 'string';
}

/**
 * What a cancelled call throws. The signal's reason is never passed on: it is the
 * caller's object and could hold anything, so a fresh AbortError with no cause stands in.
 */
function abortError(): Error {
  const e = new Error('The operation was aborted.');
  e.name = 'AbortError';
  OWN_ERRORS.add(e);
  return e;
}

/** The TypeErrors this module throws for bad input, each with the fixed literal it was made with. */
const OWN_USAGE_ERRORS = new WeakMap<object, string>();

function usageError(message: string): TypeError {
  const e = new TypeError(message);
  OWN_USAGE_ERRORS.set(e, message);
  return e;
}

/**
 * The fixed text a bad-input TypeError of this module was made with, or undefined for any
 * other value. Read from private data, never from the error's (mutable) message. For the CLI.
 */
export function ownUsageMessage(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null ? OWN_USAGE_ERRORS.get(e) : undefined;
}

/**
 * A Response's status, read once: an integer from 100 to 599, else undefined. A custom
 * fetch's Response could give anything (a string, an object, a getter that changes), so
 * the one read is the only one, and only the checked number is used afterwards.
 */
function statusOf(res: Response): number | undefined {
  let v: unknown;
  try {
    v = res.status;
  } catch {
    return undefined;
  }
  return typeof v === 'number' && Number.isInteger(v) && v >= 100 && v <= 599 ? v : undefined;
}

/** What a stream read rejects with when nothing arrived for idleTimeoutMs; only this module makes it. */
const STREAM_IDLE = Symbol('stream_idle');

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const done = (): void => {
      signal?.removeEventListener('abort', stop);
      resolve();
    };
    const stop = (): void => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

function positive(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Retry-After as integer seconds (the only form a Bot URL sends), in ms. */
function retryAfterMs(h: string | null): number | undefined {
  if (h === null || !/^\d{1,6}$/.test(h.trim())) return undefined;
  return Number(h.trim()) * 1000;
}

/**
 * The registry code `c` names (any case), or undefined. Codes come from the answer, so
 * one outside the closed list is never passed on: it could carry anything, a key included.
 */
function registryCode(c: unknown): string | undefined {
  if (typeof c !== 'string') return undefined;
  const code = c.toLowerCase();
  return Object.prototype.hasOwnProperty.call(BOT_URL_ERRORS, code) ? code : undefined;
}

/** The error message for `code`: the registry's fixed text plus the status, or a fixed local text. */
function publicMessage(code: string, status: number): string {
  if (Object.prototype.hasOwnProperty.call(BOT_URL_ERRORS, code)) return `${BOT_URL_ERRORS[code]!.message} (HTTP ${status})`;
  if (code === 'tool_error') return 'The Bot refused the tool call.';
  return `The Bot URL answered HTTP ${status}.`;
}

/** Refusals the edge or the Bot gives before acting on a request: safe to send again. */
const BEFORE_ACTING = new Set(['rate_limited', 'concurrency_limit', 'ip_blocked', 'bot_starting', 'bot_unavailable']);
const OUTCOME_UNKNOWN = 'the request may have reached the Bot and its answer was lost; check getStatus() or listUpdates() before sending it again';

/**
 * A successful answer whose shape this client cannot use. For a call that changes
 * something it is `outcome_unknown` (the Bot answered 2xx, so it may have acted); for a
 * read it stays `protocol_error`.
 */
function unusableAnswer(changes: boolean, message: string, requestId: string | undefined): BotUrlError {
  return changes ? botUrlError('outcome_unknown', OUTCOME_UNKNOWN, { requestId }) : botUrlError('protocol_error', message, { requestId });
}

function retryableCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(BOT_URL_ERRORS, code) && BOT_URL_ERRORS[code]!.retry !== 'no';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function newKey(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** One SSE field block, or the stream's retry hint. */
type SseItem = { event: string; id: string | undefined; data: string } | { retry: number };

/**
 * An incremental Server-Sent Events parser: LF, CRLF and CR line ends (a CR at the end of
 * a chunk ends its line at once; an LF starting the next chunk is then dropped), comments
 * skipped, multi-line data joined with \n. The id is per frame: a frame without one has
 * none. Sizes are counted in UTF-16 code units (JavaScript string lengths), not bytes:
 * `pending` is what an unfinished frame holds (its unfinished line, event, id and data),
 * and a frame larger than `cap` is never handed over: `over` turns true as soon as the
 * frame so far is larger (a field replaced later in the frame included), stays so, and
 * nothing more is parsed.
 */
class SseParser {
  #buf = '';
  #skipLF = false;
  #event = '';
  #id: string | undefined;
  #data: string[] = [];
  #dataLen = 0;
  readonly #cap: number;
  over = false;

  constructor(cap: number) {
    this.#cap = cap;
  }

  get pending(): number {
    return this.#buf.length + this.#dataLen;
  }

  feed(text: string): SseItem[] {
    const out: SseItem[] = [];
    if (this.over) return out;
    let s = text;
    if (this.#skipLF && s.length > 0) {
      if (s.charCodeAt(0) === 10) s = s.slice(1);
      this.#skipLF = false;
    }
    // The held text has no line end: scan only what is new.
    const from = this.#buf.length;
    const buf = this.#buf + s;
    let start = 0;
    for (let i = from; i < buf.length; i++) {
      const c = buf.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      this.#line(buf.slice(start, i), out);
      if (this.over) {
        this.#buf = '';
        return out;
      }
      if (c === 13) {
        if (i + 1 === buf.length) this.#skipLF = true;
        else if (buf.charCodeAt(i + 1) === 10) i++;
      }
      start = i + 1;
    }
    this.#buf = buf.slice(start);
    return out;
  }

  #line(line: string, out: SseItem[]): void {
    if (line === '') {
      if (this.#data.length > 0) out.push({ event: this.#event, id: this.#id, data: this.#data.join('\n') });
      this.#event = '';
      this.#id = undefined;
      this.#data = [];
      this.#dataLen = 0;
      return;
    }
    if (line.charCodeAt(0) === 58) return; // ':' a comment (the heartbeat)
    const k = line.indexOf(':');
    const field = k < 0 ? line : line.slice(0, k);
    let value = k < 0 ? '' : line.slice(k + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') {
      this.#dataLen += value.length - this.#event.length;
      this.#event = value;
    } else if (field === 'data') {
      this.#data.push(value);
      this.#dataLen += value.length + 1;
    } else if (field === 'id') {
      this.#dataLen += value.length - (this.#id?.length ?? 0);
      this.#id = value;
    }
    else if (field === 'retry' && /^\d{1,9}$/.test(value)) out.push({ retry: Number(value) });
    if (this.#dataLen > this.#cap) this.over = true;
  }
}

/** One streamEvents() connection's end: a normal end, a failure, a 429 wait, the switch to polling, or an error to throw. */
type EventsOutcome =
  | { kind: 'end' }
  | { kind: 'fail'; stable: boolean; error?: BotUrlError }
  | { kind: 'poll' }
  | { kind: 'fatal'; error: BotUrlError };

/** One streamEvents() iterator's state. */
interface EventsRun {
  cursor: number | undefined;
  mode: 'stream' | 'poll';
  /** The lifetime controller: the caller's signal, return() and the iterator's end abort it. */
  readonly life: AbortController;
  /** return() ended it (quietly), as opposed to the caller's signal (AbortError). */
  returned: boolean;
  readonly fallback: 'poll' | 'none';
  readonly pollMs: number;
  readonly connectMs: number;
  /** The rate_limited slowdown (RATE_SLOW_MS …) and when the last rate_limited came. */
  slow: number;
  slowAt: number | undefined;
}

/** Releases a body that will not be read. */
function discardBody(res: Response): void {
  try {
    res.body?.cancel().catch(() => undefined);
  } catch {
    // a foreign body: nothing to release
  }
}

/**
 * A client for one Bot, reached through its public Bot URL with a key the
 * Bot's owner made. It needs no Hoody account. `chat()` sends a message and
 * returns the reply (streamed by default), `ask()` hands the Bot a task and
 * returns a reference to poll, `answer()` replies to a question the Bot is
 * waiting on, `getStatus()` and `listUpdates()` read its progress, and
 * `streamEvents()` follows it live. Works in browsers and in Node (fetch
 * only).
 *
 * The key is sent only in the `Authorization` header and never appears in a
 * URL, an error or the client's string forms. Failed calls throw
 * `BotUrlError`; retryable refusals are retried with backoff first (see
 * `BotUrlRetryOptions`).
 */
export class BotUrlClient {
  // The checked origin. Private, so nothing assigned to `url` later can redirect the key.
  readonly #url: string;
  readonly #key: string;
  readonly #fetch: typeof fetch;
  readonly #retry: Required<BotUrlRetryOptions>;
  readonly #idleMs: number;
  readonly #sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly #now: () => number;
  readonly #random: () => number;
  #rpcId = 0;

  /**
   * `options.url` is the Bot's public URL alone (`https://<label>.hoody.bot`,
   * or a label under `options.zone` or the Bot zone of `options.platform`) and
   * `options.key` its `hbk_` key. Throws `TypeError` before any request when
   * the URL carries a path, query, fragment or credentials, is not https or
   * not a Bot URL, when the key is not a Bot key, or when no `fetch` is
   * available. The message never quotes the key. `deps` are hooks for tests.
   */
  constructor(options: BotUrlClientOptions, deps: BotUrlClientDeps = {}) {
    if (!isObject(options)) throw usageError('BotUrlClient needs { url, key }');
    this.#url = BotUrlClient.#checkUrl(options.url, deps.allowHttp === true, options.zone, options.platform);
    if (typeof options.key !== 'string' || !KEY_RE.test(options.key)) {
      // The value is never quoted back: a near-miss is still mostly a secret.
      throw usageError('BotUrlClient: key is not a Bot key (it starts with hbk_; check for spaces or a cut-off copy)');
    }
    this.#key = options.key;
    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== 'function') throw usageError('BotUrlClient: no fetch available; pass options.fetch');
    this.#fetch = f.bind(globalThis);
    const r = options.retry ?? {};
    this.#retry = {
      maxAttempts: Math.max(1, Math.floor(positive(r.maxAttempts, DEFAULT_RETRY.maxAttempts))),
      initialDelayMs: positive(r.initialDelayMs, DEFAULT_RETRY.initialDelayMs),
      maxDelayMs: positive(r.maxDelayMs, DEFAULT_RETRY.maxDelayMs),
      maxElapsedMs: positive(r.maxElapsedMs, DEFAULT_RETRY.maxElapsedMs),
    };
    this.#idleMs = positive(options.idleTimeoutMs, DEFAULT_IDLE_MS);
    this.#sleep = deps.sleep ?? defaultSleep;
    this.#now = deps.now ?? Date.now;
    this.#random = deps.random ?? Math.random;
  }

  /** The Bot's URL, as checked: `https://<label>.hoody.bot`. */
  getUrl(): string {
    return this.#url;
  }

  static #checkUrl(raw: unknown, allowHttp: boolean, zone: unknown, platform: unknown): string {
    if (typeof raw !== 'string') throw usageError('BotUrlClient: url must be a string');
    if (platform !== undefined && typeof platform !== 'string') throw usageError('BotUrlClient: platform must be a string');
    if (zone !== undefined && !isValidBotZone(zone)) {
      throw usageError('BotUrlClient: zone is not a Bot zone (a lowercase host name such as hoody.bot)');
    }
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw usageError('BotUrlClient: url is not a URL');
    }
    const http = u.protocol === 'http:';
    if (u.protocol !== 'https:' && !(allowHttp && http)) {
      throw usageError('BotUrlClient: url must start with https://');
    }
    // The authority as typed, before the parser drops an empty `@` or rewrites an IPv6 form.
    const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(raw)?.[1] ?? '';
    // A key pasted into the URL would ride every request and every log on the way.
    if (u.search !== '' || u.hash !== '' || u.username !== '' || u.password !== '' || authority.includes('@')) {
      throw usageError('BotUrlClient: pass the Bot URL alone (no ?query, #fragment or user:password); give the key as options.key');
    }
    // Bot URLs are IPv4 only; an IPv6 literal (mapped forms included) is refused as typed.
    if (/[[\]]/.test(authority) || u.hostname.startsWith('[')) {
      throw usageError('BotUrlClient: an IPv6 address is not a Bot URL');
    }
    if (u.pathname !== '/') throw usageError('BotUrlClient: pass the Bot URL without a path, e.g. https://<label>.hoody.bot');
    if (http) {
      // allowHttp opens plain http to a local test server and nothing else.
      if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(authority)) {
        throw usageError('BotUrlClient: allowHttp is for a local test server only (http://localhost or http://127.0.0.1)');
      }
      return u.origin;
    }
    // Checked on the string as typed: the URL parser would lowercase and punycode the host.
    const accept: BotLabelOfUrlOptions = {};
    if (zone !== undefined) accept.zone = zone as string;
    if (platform !== undefined) accept.platform = platform as string;
    if (botLabelOfUrl(raw, accept) === undefined) {
      throw usageError('BotUrlClient: not a public Bot URL (https://<label>.hoody.bot or a label under options.zone, label in lowercase a-z, 0-9 and single hyphens)');
    }
    return u.origin;
  }

  /** Never shows the key. */
  toString(): string {
    return `BotUrlClient(${this.#url})`;
  }

  /** The JSON form: the Bot's URL only, so serializing or logging the client never shows the key. */
  toJSON(): { url: string } {
    return { url: this.#url };
  }

  /** The Bot's model list: one model, whose id is the label. A cheap way to test a key. */
  async listModels(options: { signal?: AbortSignal } = {}): Promise<BotUrlModel[]> {
    const { body } = await this.#call('GET', '/v1/models', undefined, options.signal, 'openai');
    const data = isObject(body) ? body.data : undefined;
    if (!Array.isArray(data) || !data.every((m) => isObject(m) && typeof m.id === 'string')) {
      throw botUrlError('protocol_error', 'the model list is not an OpenAI model list');
    }
    return data as BotUrlModel[];
  }

  /**
   * Send a message (or a whole conversation) through the OpenAI chat door and return the
   * Bot's reply. One Bot is one shared conversation: the Bot answers your last message
   * and may put updates it logged since the last answer in front of the reply.
   */
  async chat(input: string | BotUrlChatMessage[], options: BotUrlChatOptions = {}): Promise<BotUrlChatResult> {
    const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
    if (!Array.isArray(messages) || messages.length === 0) throw usageError('chat: give a message');
    const stream = options.stream !== false;
    const headers: Record<string, string> = {};
    const ik = options.idempotencyKey;
    if (ik !== false) {
      if (ik !== undefined && (typeof ik !== 'string' || !IDEMPOTENCY_KEY_RE.test(ik) || /^(compat|chan):/.test(ik))) {
        throw usageError('chat: idempotencyKey is 1 to 255 printable ASCII characters with no spaces, not starting compat: or chan: (false sends none)');
      }
      // Set once per call: every retry below carries the same key (the Bot's replay is best effort; see the header).
      headers['Idempotency-Key'] = ik ?? newKey();
    }
    // The model name is ignored on a Bot URL; the label is sent so OpenAI clients' checks pass.
    const body = { model: new URL(this.#url).hostname.split('.')[0], messages, stream };
    if (!stream) {
      const { body: res, requestId } = await this.#call('POST', '/v1/chat/completions', body, options.signal, 'openai', headers, ik === false);
      const choice = isObject(res) && Array.isArray(res.choices) && isObject(res.choices[0]) ? res.choices[0] : undefined;
      const msg = choice && isObject(choice.message) ? choice.message : undefined;
      if (!msg || typeof msg.content !== 'string') throw unusableAnswer(ik === false, 'the chat answer has no message', requestId);
      options.onText?.(msg.content);
      return {
        text: msg.content,
        model: isObject(res) && typeof res.model === 'string' ? res.model : undefined,
        finishReason: typeof choice!.finish_reason === 'string' ? choice!.finish_reason : undefined,
        requestId,
      };
    }
    const { res, status } = await this.#open('POST', '/v1/chat/completions', body, options.signal, 'openai', { ...headers, Accept: 'text/event-stream' }, ik === false);
    return this.#readChatStream(res, status, options, ik === false);
  }

  /**
   * Ask through the MCP door and wait for the reply. A `working` answer is followed by
   * asks with its ref (they send nothing new) until the Bot answers, a gate stops it, or
   * `maxWaitMs` passes. `ask({ ref })` rejoins a reply an earlier call left waiting.
   */
  async ask(message: string | { ref: string }, options: BotUrlAskOptions = {}): Promise<BotUrlAnswer> {
    const args = typeof message === 'string' ? { text: message } : isObject(message) && typeof message.ref === 'string' ? { ref: message.ref } : undefined;
    if (!args || Object.values(args)[0]!.trim() === '') throw usageError('ask: give the message text, or { ref } from an earlier answer');
    const started = this.#now();
    const maxWait = positive(options.maxWaitMs, DEFAULT_ASK_WAIT_MS);
    // A text ask posts a message; an ask by ref only reads.
    const changes = 'text' in args;
    let answer = BotUrlClient.#answer(await this.#tool('ask', args, options.signal, changes), changes);
    while (answer.status === 'working' && options.wait !== false && answer.ref !== '' && this.#now() - started < maxWait) {
      options.onWorking?.(answer);
      answer = BotUrlClient.#answer(await this.#tool('ask', { ref: answer.ref }, options.signal), false);
    }
    return answer;
  }

  /** What the Bot logged after `cursor` (its replies, delegate reports, gates), oldest first. Without one, the newest rows. */
  async listUpdates(cursor?: number, options: { signal?: AbortSignal } = {}): Promise<BotUrlUpdates> {
    if (cursor !== undefined && !(Number.isSafeInteger(cursor) && cursor >= 0)) throw usageError('listUpdates: cursor must be a non-negative integer');
    return BotUrlClient.#updatesOf(await this.#tool('updates', cursor === undefined ? {} : { cursor }, options.signal));
  }

  static #updatesOf(r: { structured: unknown; requestId: string | undefined }): BotUrlUpdates {
    const s = r.structured;
    // The cursor goes into the next call and has_more decides whether there is one: both fail closed.
    if (!isObject(s) || !Array.isArray(s.items) || !Number.isSafeInteger(s.cursor) || (s.cursor as number) < 0 || typeof s.has_more !== 'boolean') {
      throw botUrlError('protocol_error', 'the updates answer has no items, cursor and has_more of the documented types', { requestId: r.requestId });
    }
    const items = s.items.filter(isUpdateRow);
    return { items, omitted: s.items.length - items.length, cursor: s.cursor as number, hasMore: s.has_more, requestId: r.requestId };
  }

  /**
   * Answer a pending gate of one of the Bot's delegates. The answer goes to the Bot as
   * your message and the result is the Bot's reply, like ask().
   */
  async answer(gate: BotUrlGateAnswer, options: BotUrlAskOptions = {}): Promise<BotUrlAnswer> {
    if (!isObject(gate) || (typeof gate.gateId === 'string') === (typeof gate.title === 'string')) {
      throw usageError('answer: give gateId or title, not both');
    }
    if (gate.gateId !== undefined && !isGateHandle(gate.gateId)) {
      throw usageError('answer: gateId is a gate handle, g_ followed by 22 characters, as getStatus() lists it');
    }
    if (!['approve', 'allow_session', 'deny', 'answer'].includes(gate.decision)) {
      throw usageError('answer: decision must be approve, allow_session, deny or answer');
    }
    const args: Record<string, string> = { decision: gate.decision };
    if (gate.gateId !== undefined) args.gate_id = gate.gateId;
    if (gate.title !== undefined) args.title = gate.title;
    if (gate.text !== undefined) args.text = gate.text;
    const first = BotUrlClient.#answer(await this.#tool('answer', args, options.signal, true), true);
    if (first.status !== 'working' || options.wait === false || first.ref === '') return first;
    return this.ask({ ref: first.ref }, options);
  }

  /** The Bot: whether it is working on a turn and its open delegates with their pending gates. */
  async getStatus(options: { signal?: AbortSignal } = {}): Promise<BotUrlStatus> {
    return BotUrlClient.#statusOf(await this.#tool('status', {}, options.signal));
  }

  static #statusOf(r: { structured: unknown; requestId: string | undefined }): BotUrlStatus {
    if (!isObject(r.structured)) throw botUrlError('protocol_error', 'the status answer has no fields', { requestId: r.requestId });
    return r.structured as BotUrlStatus;
  }

  /**
   * The Bot's live events: its status first and whenever it changes, then each new log
   * row, from `GET /events` (Server-Sent Events). `for await (const e of bot.streamEvents({ signal }))`.
   *
   * - The stream resumes where it left off: `cursor` (also readable on the returned
   *   object) is sent as Last-Event-ID on every reconnect. A `gap` or `archived` event
   *   tells that the Bot's log moved on without those rows; the cursor can then move back.
   * - The Bot ends each stream after about 25 s; streamEvents() reconnects by itself, after the
   *   server's retry hint plus up to 0.5 s. Failures back off 1 s, 2 s, 4 s … up to
   *   `retry.maxDelayMs`; the backoff resets only after a normal end or a connection that
   *   stayed up 10 s. A 429 waits at least its Retry-After (one longer than
   *   `retry.maxDelayMs` is thrown, as calls do), and a rate_limited slows the next tries
   *   by 30 s, doubling to 2 min, until 5 min pass without one. Unlike calls it never gives
   *   up on its own.
   * - Codes that cannot succeed (key_invalid, key_disabled, bot_disabled, ip_not_allowed,
   *   invalid_request, an HTTP refusal without a code other than 408, 502, 503 or 504 …)
   *   are thrown from the iterator as BotUrlError.
   * - Where the Bot URL has no event stream yet (404 path_not_allowed, 405
   *   method_not_allowed) it polls instead (`mode` turns 'poll'): getStatus() every
   *   `pollIntervalMs` (15 s), listUpdates() only when the status changed, about 4 requests a
   *   minute while nothing happens. Polling never reports gap or archived, and rows that
   *   leave the status as it was wait for its next change. `fallback: 'none'` throws
   *   instead.
   * - `break` (or return()) stops it at once and quietly; the caller's signal stops it with
   *   an AbortError. Either way no connection, timer or reader is left behind.
   */
  streamEvents(options: BotUrlStreamEventsOptions = {}): BotUrlEventStream {
    if (typeof options !== 'object' || options === null || Array.isArray(options)) throw usageError('events: options must be an object');
    const { cursor, fallback, signal } = options;
    if (cursor !== undefined && !(Number.isSafeInteger(cursor) && cursor >= 0)) throw usageError('events: cursor must be a non-negative integer');
    if (fallback !== undefined && fallback !== 'poll' && fallback !== 'none') throw usageError("events: fallback must be 'poll' or 'none'");
    const run: EventsRun = {
      cursor,
      mode: 'stream',
      life: new AbortController(),
      returned: false,
      fallback: fallback ?? 'poll',
      pollMs: positive(options.pollIntervalMs, DEFAULT_POLL_MS),
      connectMs: positive(options.connectTimeoutMs, DEFAULT_CONNECT_MS),
      slow: 0,
      slowAt: undefined,
    };
    const onAbort = (): void => run.life.abort();
    if (signal?.aborted) run.life.abort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    const gen = this.#eventsLoop(run, () => signal?.removeEventListener('abort', onAbort));
    // The getters these reads replaced refuse, naming the methods.
    return retireAccessors<BotUrlEventStream>({
      getCursor() {
        return run.cursor;
      },
      getMode() {
        return run.mode;
      },
      [Symbol.asyncIterator]: () => ({
        next: () => gen.next(),
        // Aborts first, so a next() still pending settles as done at once instead of
        // this return() waiting behind it.
        return: async () => {
          run.returned = true;
          run.life.abort();
          await gen.return(undefined).catch(() => undefined);
          return { done: true as const, value: undefined };
        },
      }),
    }, 'BotUrlEventStream', { cursor: 'getCursor()', mode: 'getMode()' });
  }

  /** streamEvents()'s loop: one connection (or the polls) at a time, each under its own child controller. */
  async *#eventsLoop(run: EventsRun, unlink: () => void): AsyncGenerator<BotUrlEvent, void, undefined> {
    const life = run.life.signal;
    let fails = 0;
    let retry = DEFAULT_EVENTS_RETRY_MS;
    try {
      for (;;) {
        if (life.aborted) throw EVENTS_HALT;
        const att = new AbortController();
        const link = (): void => att.abort();
        life.addEventListener('abort', link, { once: true });
        let out: EventsOutcome;
        try {
          out = yield* this.#eventsAttempt(run, att, (ms) => {
            retry = Math.min(ms, this.#retry.maxDelayMs);
          });
        } finally {
          life.removeEventListener('abort', link);
          att.abort();
        }
        if (life.aborted) throw EVENTS_HALT;
        if (out.kind === 'poll') {
          yield* this.#eventsPoll(run);
          return;
        }
        if (out.kind === 'fatal') throw out.error;
        let wait: number;
        if (out.kind === 'end') {
          fails = 0;
          wait = retry + END_JITTER_MS * this.#random();
        } else {
          if (out.stable) fails = 0;
          wait = Math.max(retry, this.#backoff(fails++), this.#refusalWait(run, out.error));
        }
        await this.#sleep(Math.max(wait, this.#slowFloor(run)), life);
      }
    } catch (e) {
      if (life.aborted) {
        if (run.returned) return;
        throw abortError();
      }
      throw e;
    } finally {
      unlink();
      run.life.abort();
    }
  }

  /** The backoff after `fails` earlier failures: 1 s, 2 s, 4 s … capped at maxDelayMs, jitter in the upper half. */
  #backoff(fails: number): number {
    const cap = Math.min(this.#retry.maxDelayMs, this.#retry.initialDelayMs * 2 ** fails);
    return cap / 2 + (cap / 2) * this.#random();
  }

  /**
   * What a refusal adds to streamEvents()'s backoff: a 429's Retry-After (one longer than
   * maxDelayMs is not waited: the refusal is thrown, as calls do) and, after a
   * rate_limited, the slowdown of RATE_SLOW_MS doubling to RATE_SLOW_MAX_MS, reset once
   * RATE_SLOW_RESET_MS pass without one. The caller waits the larger of this and its
   * backoff, so a Retry-After of 0 never makes it spin.
   */
  #refusalWait(run: EventsRun, e: BotUrlError | undefined): number {
    if (e?.status !== 429) return 0;
    const after = e.retryAfterMs ?? 0;
    if (after > this.#retry.maxDelayMs) throw e;
    if (e.code !== 'rate_limited') return after;
    const now = this.#now();
    run.slow = run.slowAt !== undefined && now - run.slowAt < RATE_SLOW_RESET_MS ? Math.min(run.slow * 2, RATE_SLOW_MAX_MS) : RATE_SLOW_MS;
    run.slowAt = now;
    return Math.max(after, run.slow);
  }

  /**
   * The rate_limited slowdown still in force: every streamEvents() wait (a reconnect, a retry,
   * the poll interval) is at least this long until RATE_SLOW_RESET_MS pass without
   * another rate_limited, when it clears.
   */
  #slowFloor(run: EventsRun): number {
    if (run.slowAt === undefined) return 0;
    if (this.#now() - run.slowAt < RATE_SLOW_RESET_MS) return run.slow;
    run.slow = 0;
    run.slowAt = undefined;
    return 0;
  }

  /** Whether streamEvents() backs off from `e` (and tries again) rather than throwing it. */
  static #eventsRetryable(e: BotUrlError): boolean {
    if (e.code.startsWith('http_')) return e.status !== undefined && EVENTS_RETRY_STATUSES.has(e.status);
    return e.retryable || POLL_RETRY.has(e.code);
  }

  /**
   * One GET /events under `att`, yielding its events. Every failure (no answer, the connect
   * timeout, a retryable refusal or error frame, an idle or broken body, EOF without `end`,
   * an id or frame this client cannot use) drops the connection and keeps the cursor.
   */
  async *#eventsAttempt(run: EventsRun, att: AbortController, setRetry: (ms: number) => void): AsyncGenerator<BotUrlEvent, EventsOutcome, undefined> {
    const life = run.life.signal;
    // Set once a 200 event stream is accepted: time spent waiting for headers or reading a
    // refusal is never stable progress.
    let started: number | undefined;
    const failed = (error?: BotUrlError): EventsOutcome => ({
      kind: 'fail',
      stable: started !== undefined && this.#now() - started >= STABLE_MS,
      ...(error === undefined ? {} : { error }),
    });
    // Until the headers arrive (and while a refusal body is read): the connect timeout.
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => att.abort(), run.connectMs);
    const stopTimer = (): void => {
      clearTimeout(timer);
      timer = undefined;
    };
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      if (run.cursor !== undefined) headers['Last-Event-ID'] = String(run.cursor);
      const res = await this.#send('GET', '/events', undefined, att.signal, headers);
      const status = statusOf(res);
      if (status === undefined) {
        discardBody(res);
        return failed();
      }
      if (status < 200 || status > 299) {
        const err = await this.#httpError(res, 'plain', status, att.signal);
        if (life.aborted) throw EVENTS_HALT;
        if (err.code === 'path_not_allowed' || err.code === 'method_not_allowed') {
          return run.fallback === 'poll' ? { kind: 'poll' } : { kind: 'fatal', error: err };
        }
        return BotUrlClient.#eventsRetryable(err) ? failed(err) : { kind: 'fatal', error: err };
      }
      const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (status !== 200 || type !== 'text/event-stream' || !res.body) {
        discardBody(res);
        return failed();
      }
      stopTimer();
      started = this.#now();
      const reader = res.body.getReader();
      try {
        const decoder = new TextDecoder();
        const parser = new SseParser(EVENTS_PENDING_CAP);
        for (;;) {
          const chunk = await this.#readIdle(reader, att.signal);
          const eof = chunk.done === true;
          if (!eof && !(chunk.value instanceof Uint8Array)) return failed();
          const items = parser.feed(eof ? decoder.decode() : decoder.decode(chunk.value, { stream: true }));
          if (parser.over || parser.pending > EVENTS_PENDING_CAP) return failed();
          for (const item of items) {
            // A chunk can hold many frames: an abort while one was being handled stops the rest.
            if (life.aborted) throw EVENTS_HALT;
            if ('retry' in item) {
              setRetry(item.retry);
              continue;
            }
            if (!EVENT_NAMES.has(item.event)) continue; // an event this client does not know yet
            let id: number | undefined;
            if (item.id !== undefined) {
              if (!EVENT_ID_RE.test(item.id) || !Number.isSafeInteger(Number(item.id))) return failed();
              id = Number(item.id);
            }
            let v: unknown;
            try {
              v = JSON.parse(item.data);
            } catch {
              return failed();
            }
            if (!isObject(v)) return failed();
            if (item.event === 'end') return typeof v.reason === 'string' ? { kind: 'end' } : failed();
            switch (item.event) {
              case 'status':
                yield { type: 'status', status: v as BotUrlStatus };
                break;
              case 'error': {
                const code = registryCode(v.code) ?? 'upstream_error';
                if (retryableCode(code)) return failed();
                const st = BOT_URL_ERRORS[code]!.status;
                return { kind: 'fatal', error: botUrlError(code, publicMessage(code, st), { status: st }) };
              }
              case 'row':
                if (id === undefined || v.seq !== id) return failed();
                run.cursor = id;
                if (isUpdateRow(v)) yield { type: 'row', row: v };
                break;
              case 'cursor':
                if (id === undefined || v.seq !== id) return failed();
                run.cursor = id;
                break;
              default: // gap, archived
                if (id === undefined || v.next_seq !== id + 1) return failed();
                run.cursor = id;
                yield { type: item.event as 'gap' | 'archived', nextSeq: id + 1 };
            }
          }
          if (eof) return failed(); // EOF without end is a failure
        }
      } finally {
        try {
          reader.cancel().catch(() => undefined);
        } catch {
          // a foreign reader whose cancel throws: nothing is left to release
        }
      }
    } catch (e) {
      if (e === EVENTS_HALT || life.aborted) throw EVENTS_HALT;
      // No answer, the connect or idle timeout, a broken body, or something foreign threw:
      // its words are never passed on.
      return failed();
    } finally {
      stopTimer();
    }
  }

  /**
   * streamEvents() where the Bot URL has no event stream, paced like the chat page's poller to
   * fit small per-key budgets: one getStatus() a tick, each tick starting at least pollMs
   * (default 15 s) after the last; listUpdates() from the cursor only when rows are due (the
   * first tick, a status that changed, or pages an earlier tick left unread), at most
   * EVENTS_PAGES_PER_TICK listUpdates() attempts a tick, failed ones included. That is 4
   * requests a minute while nothing changes, plus the listUpdates() pages of each change.
   * The pace counts from the last getStatus() that succeeded, so a getStatus() retried after a
   * long wait is not followed at once by another; a rate_limited slowdown in force
   * lengthens the interval (see #slowFloor). Polling never yields gap or archived, and
   * rows that leave the status as it was wait for its next change. Each request is one
   * attempt (this loop owns the waits, so they never stack with #withRetry's), time-boxed
   * by the connect timeout for its headers and the idle timeout for its body. A status
   * equal to the last one is not yielded again.
   */
  async *#eventsPoll(run: EventsRun): AsyncGenerator<BotUrlEvent, void, undefined> {
    run.mode = 'poll';
    const life = run.life.signal;
    let last: string | undefined;
    let fails = 0;
    let tickAt: number | undefined;
    let rowsDue = true;
    // listUpdates() attempts this tick: kept across its retries, so a failure never renews them.
    let pages = 0;
    // A failed request is tried again after its wait, within the same tick: a failed
    // listUpdates() does not read the status again.
    let step: 'status' | 'updates' = 'status';
    let retrying = false;
    for (;;) {
      if (!retrying) {
        if (tickAt !== undefined) {
          const left = tickAt + Math.max(run.pollMs, this.#slowFloor(run)) - this.#now();
          if (left > 0) await this.#sleep(left, life);
        }
        tickAt = this.#now();
        pages = 0;
      }
      if (life.aborted) throw EVENTS_HALT;
      let wait: number | undefined;
      try {
        if (step === 'status') {
          const status = BotUrlClient.#statusOf(await this.#tool('status', {}, life, false, run.connectMs));
          tickAt = this.#now();
          step = 'updates';
          const json = JSON.stringify(status);
          if (json !== last) {
            last = json;
            rowsDue = true;
            yield { type: 'status', status };
          }
        }
        while (rowsDue && pages < EVENTS_PAGES_PER_TICK) {
          pages++;
          const from = run.cursor;
          const page = BotUrlClient.#updatesOf(await this.#tool('updates', from === undefined ? {} : { cursor: from }, life, false, run.connectMs));
          for (const row of page.items) {
            // A page holds many rows: an abort while one was being handled stops the rest.
            if (life.aborted) throw EVENTS_HALT;
            run.cursor = row.seq;
            yield { type: 'row', row };
          }
          // updates' own cursor, also for an empty page.
          run.cursor = page.cursor;
          if (!page.hasMore) rowsDue = false;
          else if (page.items.length === 0 && page.cursor === from) break; // no progress: the next tick tries again
        }
        step = 'status';
        fails = 0;
        retrying = false;
      } catch (e) {
        if (life.aborted) throw EVENTS_HALT;
        if (!(e instanceof BotUrlError) || !BotUrlClient.#eventsRetryable(e)) throw e;
        wait = Math.max(this.#backoff(fails++), this.#refusalWait(run, e), this.#slowFloor(run));
        retrying = true;
      }
      if (wait !== undefined) await this.#sleep(wait, life);
    }
  }

  static #answer(r: { structured: unknown; text: string; requestId: string | undefined }, changes: boolean): BotUrlAnswer {
    const s = r.structured;
    if (!isObject(s) || typeof s.status !== 'string') throw unusableAnswer(changes, 'the answer has no status', r.requestId);
    return {
      status: s.status,
      text: typeof s.text === 'string' ? s.text : r.text,
      ref: typeof s.ref === 'string' ? s.ref : '',
      requestId: r.requestId,
    };
  }

  /**
   * One MCP tools/call; a refused tool throws BotUrlError. The JSON-RPC error and the
   * tool's isError result are read inside the retry loop, so a retryable tool refusal is
   * retried like an HTTP one. `changes`: the call acts on the Bot (see #withRetry).
   */
  /** `connectMs`: one attempt only (the caller owns the waits), time-boxed (see #fetchJson). */
  async #tool(name: string, args: Record<string, unknown>, signal: AbortSignal | undefined, changes = false, connectMs?: number): Promise<{ structured: unknown; text: string; requestId: string | undefined }> {
    return this.#withRetry(signal, changes, async () => {
      const id = ++this.#rpcId;
      const { body, requestId } = await this.#fetchJson(
        'POST',
        '/mcp',
        { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } },
        signal,
        'mcp',
        { Accept: 'application/json, text/event-stream', 'Mcp-Protocol-Version': MCP_PROTOCOL_VERSION },
        connectMs,
      );
      return this.#toolResult(body, id, requestId);
    }, connectMs === undefined ? undefined : 1);
  }

  /** The result of the tools/call `id` in `body`, or the BotUrlError its refusal means. */
  #toolResult(body: unknown, id: number, requestId: string | undefined): { structured: unknown; text: string; requestId: string | undefined } {
    const msg = BotUrlClient.#rpcMessage(body, id);
    if (msg === undefined) throw botUrlError('protocol_error', 'the MCP answer holds no reply to this call', { requestId });
    if (isObject(msg.error)) throw this.#rpcError(msg.error, 200, requestId);
    const result = msg.result;
    if (!isObject(result)) throw botUrlError('protocol_error', 'the MCP reply has no result', { requestId });
    const text = Array.isArray(result.content)
      ? result.content.filter((c) => isObject(c) && c.type === 'text' && typeof c.text === 'string').map((c) => (c as { text: string }).text).join('\n')
      : '';
    if (result.isError === true) {
      const code = registryCode(TOOL_ERROR_RE.exec(text)?.[1]) ?? 'tool_error';
      const status = code === 'tool_error' ? 0 : BOT_URL_ERRORS[code]!.status;
      throw botUrlError(code, publicMessage(code, status), {
        status,
        retryable: retryableCode(code),
        requestId,
      });
    }
    return { structured: result.structuredContent, text, requestId };
  }

  /** The JSON-RPC message answering `id`, from a JSON body or the events of an SSE body. */
  static #rpcMessage(body: unknown, id: number): Record<string, unknown> | undefined {
    const all = Array.isArray(body) ? body : [body];
    return all.find((m): m is Record<string, unknown> => isObject(m) && m.id === id && ('result' in m || 'error' in m));
  }

  #rpcError(err: Record<string, unknown>, status: number, requestId: string | undefined): BotUrlError {
    const data = isObject(err.data) ? err.data : undefined;
    const code = registryCode(data?.code) ?? 'tool_error';
    const st = code === 'tool_error' ? status : BOT_URL_ERRORS[code]!.status;
    return botUrlError(code, publicMessage(code, st), {
      status: st,
      retryable: retryableCode(code),
      requestId,
    });
  }

  /** The answer's X-Request-Id when it is in the edge's form and holds no piece of the key. */
  #requestIdOf(res: Response): string | undefined {
    let id: unknown;
    try {
      id = res.headers.get('x-request-id');
    } catch {
      return undefined; // a custom fetch's Response whose headers throw
    }
    if (typeof id !== 'string' || !REQUEST_ID_RE.test(id)) return undefined;
    const key = this.#key.toLowerCase();
    for (let i = 0; i + KEY_PIECE <= key.length; i++) if (id.includes(key.slice(i, i + KEY_PIECE))) return undefined;
    return id;
  }

  /** A request whose whole answer is read; retried per the registry. Returns the parsed body. */
  async #call(
    method: string,
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
    door: 'openai' | 'mcp',
    headers: Record<string, string> = {},
    changes = false,
  ): Promise<{ body: unknown; requestId: string | undefined }> {
    return this.#withRetry(signal, changes, () => this.#fetchJson(method, path, body, signal, door, headers));
  }

  /**
   * One try of a request whose whole answer is read. A failure keeps only the cause's
   * name: a reader's or parser's message can quote the body, and the body is the answer's.
   * `connectMs`: the headers must arrive within it and the body within idleTimeoutMs, else
   * a retryable network_error.
   */
  async #fetchJson(
    method: string,
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
    door: 'openai' | 'mcp',
    headers: Record<string, string> = {},
    connectMs?: number,
  ): Promise<{ body: unknown; requestId: string | undefined }> {
    if (connectMs === undefined) return this.#fetchJsonIn(method, path, body, signal, door, headers);
    if (signal?.aborted) throw abortError();
    const att = new AbortController();
    const link = (): void => att.abort();
    signal?.addEventListener('abort', link, { once: true });
    let late = false;
    const box = (ms: number): ReturnType<typeof setTimeout> =>
      setTimeout(() => {
        late = true;
        att.abort();
      }, ms);
    let timer = box(connectMs);
    try {
      return await this.#fetchJsonIn(method, path, body, att.signal, door, headers, () => {
        clearTimeout(timer);
        timer = box(this.#idleMs);
      });
    } catch (e) {
      if (signal?.aborted) throw abortError();
      if (late) throw botUrlError('network_error', 'the Bot did not answer in time', { retryable: true });
      throw e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', link);
    }
  }

  async #fetchJsonIn(
    method: string,
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
    door: 'openai' | 'mcp',
    headers: Record<string, string>,
    onHeaders?: () => void,
  ): Promise<{ body: unknown; requestId: string | undefined }> {
    const res = await this.#send(method, path, body, signal, headers);
    onHeaders?.();
    const requestId = this.#requestIdOf(res);
    const status = statusOf(res);
    if (status === undefined) throw botUrlError('protocol_error', 'the answer has no valid HTTP status', { requestId });
    if (status < 200 || status > 299) throw await this.#httpError(res, door, status, signal);
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    let text: string;
    try {
      text = await res.text();
    } catch (cause) {
      if (signal?.aborted) throw abortError();
      throw botUrlError('network_error', 'the answer broke off', { retryable: true, requestId, cause: BotUrlClient.#causeName(cause) });
    }
    try {
      return { body: type.startsWith('text/event-stream') ? BotUrlClient.#sseJson(text) : JSON.parse(text), requestId };
    } catch (cause) {
      throw botUrlError('protocol_error', 'the answer is not JSON', { status, requestId, cause: BotUrlClient.#causeName(cause) });
    }
  }

  /** A streamed request: retried until its headers arrive with a 2xx; the body is the caller's. */
  async #open(method: string, path: string, body: unknown, signal: AbortSignal | undefined, door: 'openai' | 'mcp', headers: Record<string, string>, changes = false): Promise<{ res: Response; status: number }> {
    return this.#withRetry(signal, changes, async () => {
      const res = await this.#send(method, path, body, signal, headers);
      const status = statusOf(res);
      if (status === undefined) throw botUrlError('protocol_error', 'the answer has no valid HTTP status', { requestId: this.#requestIdOf(res) });
      if (status < 200 || status > 299) throw await this.#httpError(res, door, status, signal);
      if (!res.body) throw botUrlError('protocol_error', 'the stream has no body', { status, requestId: this.#requestIdOf(res) });
      return { res, status };
    });
  }

  async #send(method: string, path: string, body: unknown, signal: AbortSignal | undefined, headers: Record<string, string>): Promise<Response> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.#key}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // A redirect would carry the Authorization header to wherever it points.
      redirect: 'error',
      ...(signal ? { signal } : {}),
    };
    try {
      return await this.#fetch(this.#url + path, init);
    } catch (cause) {
      if (signal?.aborted) throw abortError();
      // fetch's own message can name the URL and the request; keep only that it failed.
      throw botUrlError('network_error', `could not reach the Bot (${method} ${path})`, { retryable: true, cause: BotUrlClient.#causeName(cause) });
    }
  }

  /**
   * An exception's name when it is a standard one, else 'Error'; never its message. The
   * object is foreign (a custom fetch or stream made it), so a read that throws gives
   * 'unknown' and what it threw is dropped.
   */
  static #causeName(cause: unknown): string {
    try {
      if ((typeof cause !== 'object' && typeof cause !== 'function') || cause === null) return 'Error';
      const name: unknown = (cause as { name?: unknown }).name;
      return typeof name === 'string' && CAUSE_NAMES.has(name) ? name : 'Error';
    } catch {
      return 'unknown';
    }
  }

  /**
   * The BotUrlError for a non-2xx answer, read from its header and door envelope (`plain`:
   * the `<code>: <message>` text of a path with no door format, such as /events). When the
   * header names a registry code the body is not read at all; otherwise at most
   * ERROR_BODY_CAP bytes are, each read bounded by `signal` and idleTimeoutMs.
   * `status` is the checked snapshot the caller read once; `res.status` is not read again.
   */
  async #httpError(res: Response, door: 'openai' | 'mcp' | 'plain', status: number, signal?: AbortSignal): Promise<BotUrlError> {
    const requestId = this.#requestIdOf(res);
    const after = status === 429 ? retryAfterMs(res.headers.get('retry-after')) : undefined;
    const headerCode = registryCode(res.headers.get('x-hoody-error-code'));
    if (headerCode !== undefined) {
      discardBody(res);
      return this.#refusal(headerCode, status, after, requestId);
    }
    const text = await this.#boundedText(res, signal);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    let code: string | undefined;
    if (isObject(parsed)) {
      const env = isObject(parsed.error) ? parsed.error : undefined;
      const data = env && isObject(env.data) ? env.data : undefined;
      // OpenAI and Anthropic: error.code; MCP JSON-RPC: error.data.code.
      code = registryCode(door === 'mcp' ? data?.code ?? env?.code : env?.code ?? data?.code);
    } else if (text !== '') {
      // Plain text: `<code>: <message>`; only the code is read.
      code = registryCode(/^([a-z][a-z0-9_]*): /.exec(text.trim())?.[1]);
    }
    // The header wins when it names a registry code (above); anything else in it is ignored.
    return this.#refusal(code ?? `http_${status}`, status, after, requestId);
  }

  #refusal(code: string, status: number, after: number | undefined, requestId: string | undefined): BotUrlError {
    const retryable = retryableCode(code) || (!(code in BOT_URL_ERRORS) && (RETRY_STATUSES.has(status) || status === 429));
    return botUrlError(code, publicMessage(code, status), {
      status,
      retryable,
      ...(after === undefined ? {} : { retryAfterMs: after }),
      ...(requestId === undefined ? {} : { requestId }),
    });
  }

  /** At most ERROR_BODY_CAP bytes of a refusal's body, then the body is cancelled. Any failure gives what was read. */
  async #boundedText(res: Response, signal: AbortSignal | undefined): Promise<string> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      reader = res.body?.getReader();
    } catch {
      return '';
    }
    if (!reader) return '';
    const decoder = new TextDecoder();
    let text = '';
    let n = 0;
    try {
      while (n < ERROR_BODY_CAP) {
        const r = await this.#readIdle(reader, signal);
        if (r.done || !(r.value instanceof Uint8Array)) break;
        const take = r.value.subarray(0, ERROR_BODY_CAP - n);
        n += take.length;
        text += decoder.decode(take, { stream: true });
      }
    } catch {
      // The message is optional.
    } finally {
      try {
        reader.cancel().catch(() => undefined);
      } catch {
        // a foreign reader whose cancel throws
      }
    }
    return text;
  }

  /**
   * Runs `attempt` until it succeeds, a failure is not retryable, the tries run out or the
   * next wait would end past maxElapsedMs. A 429 waits its Retry-After (a longer one than
   * maxDelayMs is not waited: the error is thrown with retryAfterMs set); everything else,
   * a 429 whose Retry-After the edge stripped included, backs off 1 s, 2 s, 4 s … capped at
   * maxDelayMs, with jitter in the upper half.
   *
   * `changes`: the call acts on the Bot and carries no replay key, so it is sent again
   * only after a BEFORE_ACTING refusal. Any other retryable failure, and an unreadable
   * answer, may come after the Bot acted: it becomes `outcome_unknown`, not retryable.
   */
  async #withRetry<T>(signal: AbortSignal | undefined, changes: boolean, attempt: () => Promise<T>, attempts?: number): Promise<T> {
    const { initialDelayMs, maxDelayMs, maxElapsedMs } = this.#retry;
    const maxAttempts = attempts ?? this.#retry.maxAttempts;
    const started = this.#now();
    for (let n = 1; ; n++) {
      if (signal?.aborted) throw abortError();
      try {
        return await attempt();
      } catch (e) {
        if (!isOwnError(e)) {
          // Thrown by something foreign (a custom fetch's Response, say): never passed on.
          if (signal?.aborted) throw abortError();
          throw botUrlError(changes ? 'outcome_unknown' : 'protocol_error', changes ? OUTCOME_UNKNOWN : 'the answer could not be read', { cause: BotUrlClient.#causeName(e) });
        }
        if (!(e instanceof BotUrlError)) throw e;
        if (changes && (e.code === 'protocol_error' || (e.retryable && !BEFORE_ACTING.has(e.code)))) {
          throw botUrlError('outcome_unknown', OUTCOME_UNKNOWN, {
            status: e.status,
            requestId: e.requestId,
            ...(e.cause === undefined ? {} : { cause: e.cause }),
          });
        }
        if (!e.retryable || n >= maxAttempts) throw e;
        let wait: number;
        if (e.status === 429 && e.retryAfterMs !== undefined) {
          if (e.retryAfterMs > maxDelayMs) throw e;
          wait = e.retryAfterMs;
        } else {
          const cap = Math.min(maxDelayMs, initialDelayMs * 2 ** (n - 1));
          wait = cap / 2 + (cap / 2) * this.#random();
        }
        if (this.#now() - started + wait > maxElapsedMs) throw e;
        try {
          await this.#sleep(wait, signal);
        } catch (e) {
          if (signal?.aborted || isOwnError(e)) throw abortError();
          throw e;
        }
      }
    }
  }

  /** The JSON of each `data:` event of an SSE body (an MCP answer sent as a stream). */
  static #sseJson(text: string): unknown[] {
    const out: unknown[] = [];
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data !== '') out.push(JSON.parse(data));
    }
    return out;
  }

  /** Reads an OpenAI chat stream: `data:` chunks, `: keepalive` comments, `[DONE]`, an in-stream error frame. */
  /**
   * `changes`: the chat carries no Idempotency-Key, so the request may already have reached
   * the Bot. Until text arrives, every failure but a BEFORE_ACTING error frame (a broken
   * or idle stream, an unreadable frame, an error frame, an end without [DONE]) is then
   * `outcome_unknown`. Once text arrived the rules for every stream apply.
   */
  async #readChatStream(res: Response, status: number, options: BotUrlChatOptions, changes = false): Promise<BotUrlChatResult> {
    const requestId = this.#requestIdOf(res);
    let reader: ReadableStreamDefaultReader<Uint8Array>;
    try {
      reader = res.body!.getReader();
    } catch (e) {
      throw botUrlError(changes ? 'outcome_unknown' : 'protocol_error', changes ? OUTCOME_UNKNOWN : 'the stream could not be read', { requestId, cause: BotUrlClient.#causeName(e) });
    }
    const decoder = new TextDecoder();
    let buf = '';
    let text = '';
    let model: string | undefined;
    let finishReason: string | undefined;
    let done = false;
    /** What the caller's onText threw: it is the caller's own and goes back as it is. */
    let callbackError: { e: unknown } | undefined;
    const fail = (code: BotUrlLocalCode, message: string, cause?: unknown): BotUrlError =>
      text === '' && changes
        ? botUrlError('outcome_unknown', OUTCOME_UNKNOWN, { status, requestId, cause })
        : // A stream that gave text is not retried: a retry would answer from the start.
          botUrlError(text === '' ? code : 'stream_interrupted', message, { status, retryable: false, requestId, cause });
    try {
      while (!done) {
        const chunk = await this.#readIdle(reader, options.signal).catch((e: unknown) => {
          if (options.signal?.aborted) throw abortError();
          // Only the idle timeout made below is trusted; any other rejection, a BotUrlError
          // a custom stream made included, is a broken stream with a standard cause name.
          if (e === STREAM_IDLE) throw fail('stream_idle', `the stream sent nothing for ${Math.round(this.#idleMs / 1000)} s`);
          throw fail('network_error', 'the stream broke off', BotUrlClient.#causeName(e));
        });
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        let sep: RegExpExecArray | null;
        while ((sep = /\r?\n\r?\n/.exec(buf)) !== null) {
          const block = buf.slice(0, sep.index);
          buf = buf.slice(sep.index + sep[0].length);
          const data = block
            .split(/\r?\n/)
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).replace(/^ /, ''))
            .join('\n');
          if (data === '') continue; // a comment (keepalive) or an empty event
          if (data === '[DONE]') {
            done = true;
            break;
          }
          let frame: unknown;
          try {
            frame = JSON.parse(data);
          } catch {
            throw fail('protocol_error', 'a stream frame is not JSON');
          }
          if (!isObject(frame)) continue;
          if (isObject(frame.error)) {
            const env = frame.error;
            const code = registryCode(env.code) ?? 'upstream_error';
            if (text === '' && changes && !BEFORE_ACTING.has(code)) {
              throw botUrlError('outcome_unknown', OUTCOME_UNKNOWN, { status: BOT_URL_ERRORS[code]!.status, requestId });
            }
            throw botUrlError(code, publicMessage(code, BOT_URL_ERRORS[code]!.status), {
              status: BOT_URL_ERRORS[code]!.status,
              retryable: text === '' && retryableCode(code),
              requestId,
            });
          }
          if (typeof frame.model === 'string') model = frame.model;
          const choice = Array.isArray(frame.choices) && isObject(frame.choices[0]) ? frame.choices[0] : undefined;
          if (!choice) continue;
          if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;
          const delta = isObject(choice.delta) && typeof choice.delta.content === 'string' ? choice.delta.content : '';
          if (delta !== '') {
            text += delta;
            try {
              options.onText?.(delta);
            } catch (e) {
              callbackError = { e };
              throw e;
            }
          }
        }
      }
      if (!done) throw fail('stream_interrupted', 'the stream ended before [DONE]');
      return { text, model, finishReason, requestId };
    } catch (e) {
      if (isOwnError(e) || (callbackError !== undefined && e === callbackError.e)) throw e;
      // Thrown by the foreign stream (a chunk that is not bytes, say): never passed on.
      if (options.signal?.aborted) throw abortError();
      throw fail('protocol_error', 'the stream could not be read', BotUrlClient.#causeName(e));
    } finally {
      try {
        reader.cancel().catch(() => undefined);
      } catch {
        // A foreign reader whose cancel throws: nothing is left to release.
      }
    }
  }

  /** One read, failed with stream_idle when nothing (not even a keepalive) arrives for idleTimeoutMs. */
  #readIdle(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal | undefined): Promise<ReadableStreamReadResult<Uint8Array>> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const finish = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = (): void => {
        finish();
        reject(abortError());
      };
      const timer = setTimeout(() => {
        finish();
        reject(STREAM_IDLE);
      }, this.#idleMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      reader.read().then(
        (r) => {
          finish();
          resolve(r);
        },
        (e: unknown) => {
          finish();
          reject(e);
        },
      );
    });
  }

  /** A fresh Idempotency-Key, for callers who keep one per message. */
  static generateIdempotencyKey(): string {
    return newKey();
  }
}

// The getter this read replaced refuses, naming the method.
retireAccessors(BotUrlClient.prototype, 'BotUrlClient', { url: 'getUrl()' });
// Methods renamed in the naming freeze refuse, naming the new method.
retireMethods(BotUrlClient.prototype, 'BotUrlClient', {
  status: 'getStatus()',
  events: 'streamEvents()',
  models: 'listModels()',
  updates: 'listUpdates()',
});
retireMethods(BotUrlClient, 'BotUrlClient', { newIdempotencyKey: 'BotUrlClient.generateIdempotencyKey()' });

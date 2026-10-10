/**
 * Talk to a Bot — `box.agent.bots.ask()` and `box.agent.bots.follow()`.
 * Browser-safe (no Node imports). Maintained in lib/, not generated.
 *
 * ask() first reads whether the kit keeps message keys (GET /api/v1/agent/version
 * lists the `bots` capability, as every released hoody-agent with /bots routes
 * does, or `bot_message_idempotency`). When it does, the message goes with
 * postBotMessage's Idempotency-Key, a lost answer is retried under that key,
 * and a queued message is re-sent under it to read its turn. A kit that lists
 * neither ignores the key, so any second send there would queue the message
 * twice: the message goes once, without a key (a key set as a client default
 * header is blanked for that send), and a queued one is reported as
 * BOT_RECEIPT_UNAVAILABLE. The result's `keyed` says which case it was.
 *
 * How a Bot answers (hoody-agent /bots routes):
 *
 * - POST /bots/{id}/messages logs the message as a `user` row carrying its
 *   message_id, then answers 202 with a receipt: `posted` with the turn_id of
 *   the Bot turn it started, or `queued` while the Bot is busy. Messages
 *   queued by the end of the Bot's turn are posted together as its next turn.
 * - The reply is ONE `bot` row carrying that turn_id, written when the turn
 *   ends and only when the Bot wrote text. A turn that ends silently, fails or
 *   is cancelled writes no `bot` row (one stopped at its step limit writes a
 *   `system` row), so the end of a silent turn is read from the Bot session's
 *   turn ledger (GET /sessions/{session_id}/turns/{turn_id}).
 * - Sending the same message again with the same Idempotency-Key queues
 *   nothing: the kit answers with the same message_id and the message's
 *   CURRENT state (waiting a few seconds for the turn_id). That re-send is how
 *   a queued message's turn_id is read.
 * - GET /bots/{id}/stream follows the log. Each `row` frame's id is the row's
 *   seq; a reconnect resumes with ?since=<seq> and the Last-Event-ID header
 *   (the same seq). Besides rows the kit may send
 *   `state` (the Bot, first and when it changes), `lagged` (the rows between
 *   the cursor and min_seq are no longer in the log; the rows that follow
 *   start at min_seq) and `end` (the Bot was deleted or the kit ended the
 *   stream). follow() reconnects when the connection closes without an `end`.
 *   It also drops a connection that sends nothing, not even the heartbeat
 *   comment the kit writes every 15 s, for 45 s, and resumes the same way.
 */
import { BotsService } from '../generated/agent/bots.service.js';
import type { BotsServiceBase } from '../generated/agent/bots.service.generated.js';
import { isApiError, isRetryableApiError } from '../generated/errors.js';
import type {
  AgentBotsSendMessageResponse,
  AgentKitGetVersionResponse,
  AgentSessionsTurnsGetResponse,
} from '../generated/types.js';

/** The URL template variables: the LAST parameter of a Bot method (its options come before them on a kit whose Bot routes take a realm). */
type LastParameter<F extends (...args: never[]) => unknown> = Required<Parameters<F>> extends [...unknown[], infer L] ? L | undefined : never;
type TemplateVars = LastParameter<BotsServiceBase['get']>;
type BotStream = Awaited<ReturnType<BotsServiceBase['stream']>>;
/** stream()'s options. The cast in follow() lets it compile against a kit spec whose Bot stream declares no Last-Event-ID. */
type StreamOptions = Parameters<BotsServiceBase['stream']>[1];
/** A frame of a Bot's log stream. */
export type BotStreamFrame = BotStream extends AsyncIterable<infer F> ? F : never;
/** One row of a Bot's log, as the stream's `row` frame carries it. */
export type BotLogRow = Extract<BotStreamFrame, { declared: true; event: 'row' }>['data'];
/** A message's receipt, as POST /bots/{id}/messages returns it. */
export type BotMessageReceipt = AgentBotsSendMessageResponse['data'];

/** The capability a kit lists when a keyed re-send queues nothing and answers with the same message's current state. */
export const BOT_MESSAGE_IDEMPOTENCY_CAPABILITY = 'bot_message_idempotency';

/**
 * The capabilities that say a kit keeps message keys. hoody-agent lists `bots` and not
 * BOT_MESSAGE_IDEMPOTENCY_CAPABILITY; its POST /bots/{id}/messages has honoured Idempotency-Key
 * since the /bots routes were released (routes_bots.go, idempotencyKeyFromRequest).
 */
const KEYED_RESEND_CAPABILITIES: ReadonlySet<string> = new Set([BOT_MESSAGE_IDEMPOTENCY_CAPABILITY, 'bots']);

export interface BotFollowOptions {
  /**
   * The realm the Bot lives in: "global" or a realm id. Default: the agent's current realm.
   * A Bot id the realm does not hold is 404.
   */
  realm?: string;
  /** Yield the rows after this seq. Default: every row in the log. */
  since?: number;
  /** Ends the iteration (it throws the signal's reason). */
  signal?: AbortSignal;
  /**
   * Every frame that is not a row (`state`, `lagged`, `end`, and any name the
   * spec does not list), as it arrives.
   */
  onFrame?: (frame: BotStreamFrame) => void;
  /**
   * Reconnects in a row that yield no row before giving up (default 8). A
   * connection that yields a row, or stays open 30 s, resets the count.
   */
  maxRetries?: number;
  /**
   * Drops a connection that sends nothing for this many ms, a heartbeat
   * included, and reconnects after the last row (default 45000: three missed
   * heartbeats, which the kit sends every 15 s). Without it a connection that
   * died behind a proxy that keeps it open waits forever.
   */
  idleTimeoutMs?: number;
}

export interface BotAskOptions {
  /**
   * The realm the Bot lives in: "global" or a realm id. Default: the agent's current realm.
   * Every request ask() makes for the Bot (the message, its log, the Bot's session turn) goes to it.
   */
  realm?: string;
  /**
   * The message's Idempotency-Key. Default: a new random key, returned as
   * `idempotencyKey`. Asking again with the same key and text (after a crash,
   * say) does not send the message twice; it waits for the same reply. A
   * blank key is refused (INVALID_IDEMPOTENCY_KEY).
   */
  idempotencyKey?: string;
  /**
   * Follow the log from this seq. Default: the whole log, skipping to the
   * message's own row. Pass the seq you already followed to.
   */
  since?: number;
  /** Stops waiting: ask() rejects with the signal's reason. A message already sent stays sent. */
  signal?: AbortSignal;
  /**
   * Every log row read after the message's own row (after `since` when given),
   * the reply included, as it arrives.
   */
  onRow?: (row: BotLogRow) => void;
  /** Every stream frame that is not a row, as it arrives. */
  onFrame?: (frame: BotStreamFrame) => void;
  /** How often to re-read the receipt or the turn while waiting, in ms (default 2000). */
  pollMs?: number;
  /**
   * How long a turn the ledger reports ended may take to log its reply
   * before the reply is taken to be none, in ms (default 10000).
   */
  replyGraceMs?: number;
}

export interface BotAskResult {
  /** The last receipt read: `posted`, with the turn_id the reply carries. */
  receipt: BotMessageReceipt;
  /** The message's key. It was sent only when `keyed` is true. */
  idempotencyKey: string;
  /**
   * True when the message went under `idempotencyKey`: asking again with that
   * key and text does not send it twice. False on a kit that does not keep
   * keys (one that lists neither `bots` nor `bot_message_idempotency`): the message went once,
   * without a key, and asking again sends it again.
   */
  keyed: boolean;
  /** The Bot's reply; null when its turn ended without one (see `turnState`). */
  reply: BotLogRow | null;
  /**
   * The turn's state from the Bot session's turn ledger (completed, failed,
   * cancelled, interrupted), when it was read. Always set when `reply` is null.
   */
  turnState?: string;
  /** The rows onRow received, the reply included. */
  rows: BotLogRow[];
  /** The seq to follow the log from next. */
  since: number | undefined;
}

declare module '../generated/agent/bots.service.js' {
  interface BotsService {
    /**
     * Send `text` to the Bot under an Idempotency-Key and wait for its reply.
     * Resolves with the `bot` row of the turn that took the message, or with
     * `reply: null` once that turn has ended without one.
     *
     * A queued message waits for the Bot's current turn to end. A Bot turn
     * that waits on a gate (`pending_gate` on bots.get) keeps this waiting
     * until the gate is answered.
     *
     * Rejects with an Error carrying `code`, `idempotencyKey` and `receipt`:
     * BOT_RECEIPT_UNAVAILABLE (the message is queued and the kit lists neither
     * `bots` nor `bot_message_idempotency`, so the turn that takes it cannot be read: follow
     * the log), BOT_MESSAGE_REQUEUED (the kit dropped the message and the
     * re-send queued it again under a new message_id, `requeuedMessageId`),
     * BOT_STREAM_ENDED (the Bot was deleted). Kit errors surface as ApiError.
     */
    ask(id: string, text: string, options?: BotAskOptions, templateVars?: TemplateVars): Promise<BotAskResult>;
    /**
     * The Bot's log rows, live: the rows after `since`, then each new row as
     * it is written. Reconnects after a dropped or closed stream and resumes
     * after the last row it yielded, so no row is yielded twice or skipped. A
     * `lagged` frame (rows moved to the archive) moves the cursor to the rows
     * the log still holds. A connection that goes quiet for `idleTimeoutMs`
     * (45 s) is dropped and resumed the same way. Ends after an `end` frame
     * (the Bot was deleted).
     */
    follow(id: string, options?: BotFollowOptions, templateVars?: TemplateVars): AsyncIterableIterator<BotLogRow>;
  }
}

interface RequestHttp {
  get<T>(path: string, data?: Record<string, unknown>): Promise<T>;
}

interface ServiceInternals {
  http: RequestHttp;
  buildTemplateUrl(path: string, vars: Record<string, string | number | undefined>, query?: Record<string, unknown>, pathParams?: Record<string, unknown>): string;
}

const TERMINAL_TURN_STATES = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const LIVE_CONNECTION_MS = 30_000;
/** Bot replies ask() keeps while its message's turn is unknown: at most this many rows and this much text. */
const EARLY_REPLY_MAX_ROWS = 64;
const EARLY_REPLY_MAX_CHARS = 1_048_576;
/** Three missed heartbeats: the kit writes a heartbeat comment on the stream every 15 s. */
const FOLLOW_IDLE_TIMEOUT_MS = 45_000;

interface StreamHttp {
  streamEvents(method: string, path: string, data?: unknown, options?: Record<string, unknown>): unknown;
}

/**
 * The service as stream() should see it to send the request with a read-idle
 * bound, which the generated method has no option for: its http adds
 * idleTimeoutMs to the stream options and is the client in every other way.
 * The request is the generated method's own (validation, URL, query, declared
 * frames), so it cannot drift from the spec.
 */
function withStreamIdleTimeout(svc: BotsService, idleTimeoutMs: number): BotsService {
  const http = (svc as unknown as { http: StreamHttp }).http;
  const bounded = Object.create(http, {
    streamEvents: {
      value: (method: string, path: string, data?: unknown, options?: Record<string, unknown>): unknown =>
        http.streamEvents(method, path, data, { ...options, idleTimeoutMs }),
    },
  }) as StreamHttp;
  return Object.create(svc, { http: { value: bounded } }) as BotsService;
}

interface PostHttp {
  post(path: string, data?: Record<string, unknown>): unknown;
  config?: { headers?: Record<string, string> };
}

/**
 * The service as sendMessage() should see it on a kit that ignores the key: its
 * http sends the generated method's own request, except that the request does
 * not count as keyed and carries no key. A key set as a client default header
 * would otherwise ride the send and have a lost answer retried, which queues
 * the message twice there. The default header is overridden with a blank
 * value, which is no key.
 */
function withoutMessageKey(svc: BotsService): BotsService {
  const http = (svc as unknown as { http: PostHttp }).http;
  const unkeyed = Object.create(http, {
    post: {
      value: (path: string, data: Record<string, unknown> = {}): unknown => {
        const { declaredIdempotencyKeyHeader: declared, idempotencyKeyHeader: _minted, ...rest } = data;
        const name = typeof declared === 'string' && declared !== '' ? declared.toLowerCase() : 'idempotency-key';
        const headers = Object.fromEntries(
          Object.entries((rest.headers ?? {}) as Record<string, string>).filter(([h]) => h.toLowerCase() !== name),
        );
        for (const h of Object.keys(http.config?.headers ?? {})) if (h.toLowerCase() === name) headers[h] = '';
        return http.post(path, { ...rest, headers });
      },
    },
  }) as PostHttp;
  return Object.create(svc, { http: { value: unkeyed } }) as BotsService;
}

function botChatError(code: string, message: string, extra: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { code }, extra);
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function newKey(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Resolves after `ms`, or as soon as `signal` aborts; never rejects. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}

/** A dropped or refused connection worth another try; anything else ends the follow. */
function reconnectable(error: unknown): boolean {
  if (!isApiError(error) || error.code === 'ABORTED') return false;
  if (error.code === 'STREAM_READ_FAILED' || error.code === 'STREAM_REQUEST_FAILED' || error.code === 'ETIMEDOUT') return true;
  return isRetryableApiError(error);
}

function frameData(frame: BotStreamFrame): unknown {
  return (frame as { data?: unknown }).data;
}

async function* follow(
  this: BotsService,
  id: string,
  options: BotFollowOptions = {},
  templateVars?: TemplateVars,
): AsyncGenerator<BotLogRow, void, undefined> {
  const { signal, onFrame, realm } = options;
  const maxRetries = Math.floor(positive(options.maxRetries, 8));
  const idleTimeoutMs = positive(options.idleTimeoutMs, FOLLOW_IDLE_TIMEOUT_MS);
  const bots = withStreamIdleTimeout(this, idleTimeoutMs);
  let since = options.since;
  // True while `since` is a row this follow read: a reconnect then also sends it as
  // Last-Event-ID, the SSE resume header, on a kit whose stream takes it.
  let resumed = false;
  let failures = 0;
  for (;;) {
    if (signal?.aborted) throw abortReason(signal);
    const opened = Date.now();
    let yielded = false;
    let retryMs: number | undefined;
    let delayMs: number;
    try {
      const cursor = since === undefined ? {} : { since, ...(resumed ? { LastEventID: String(since) } : {}) };
      const stream = await bots.stream(id, { ...cursor, ...(realm === undefined ? {} : { realm }), ...(signal ? { signal } : {}) } as StreamOptions, templateVars);
      for await (const frame of stream) {
        if (typeof frame.retry === 'number' && frame.retry > 0) retryMs = frame.retry;
        if (frame.declared && frame.event === 'row') {
          const row = frame.data;
          const seq = typeof row.seq === 'number' ? row.seq : frame.seq;
          if (seq !== undefined && since !== undefined && seq <= since) continue;
          if (seq !== undefined) {
            since = seq;
            resumed = true;
          }
          yielded = true;
          failures = 0;
          yield row;
          continue;
        }
        onFrame?.(frame);
        if (frame.event === 'lagged') {
          // The rows that follow start at min_seq, which may be below the cursor (the Bot
          // was deleted and created again): accept them.
          const min = (frameData(frame) as { min_seq?: unknown } | undefined)?.min_seq;
          if (typeof min === 'number' && Number.isSafeInteger(min)) {
            since = Math.max(0, min - 1);
            // Not a row this follow read: the cursor goes as ?since only until the next row.
            resumed = false;
          }
        }
        if (frame.event === 'end') return;
      }
      if (yielded || Date.now() - opened >= LIVE_CONNECTION_MS) failures = 0;
      else if (++failures > maxRetries) {
        throw botChatError('BOT_STREAM_CLOSED', 'the Bot log stream kept closing without a row', { since });
      }
      delayMs = retryMs ?? 1000;
    } catch (error) {
      if (signal?.aborted) throw abortReason(signal);
      if (!reconnectable(error)) throw error;
      // A connection the idle bound closed sent its last bytes idleTimeoutMs ago.
      const quietMs = isApiError(error) && error.code === 'ETIMEDOUT' ? idleTimeoutMs : 0;
      if (yielded || Date.now() - opened - quietMs >= LIVE_CONNECTION_MS) failures = 0;
      if (++failures > maxRetries) throw error;
      const after = (error as { retryAfterMs?: unknown }).retryAfterMs;
      delayMs = typeof after === 'number' && Number.isFinite(after) && after > 0
        ? after
        : Math.min(30_000, 1000 * 2 ** (failures - 1));
    }
    await pause(delayMs, signal);
  }
}

/** True when the kit lists a capability that keeps message keys, false when it does not (or cannot say). */
async function keyedResendSupported(svc: ServiceInternals, templateVars: TemplateVars, signal: AbortSignal): Promise<boolean> {
  try {
    const url = svc.buildTemplateUrl('/api/v1/agent/version', templateVars ?? {}, {});
    const res = await svc.http.get<AgentKitGetVersionResponse>(url, { signal });
    return (res.data.capabilities ?? []).some((c) => KEYED_RESEND_CAPABILITIES.has(String(c.name)) && c.supported && c.available);
  } catch (error) {
    if (signal.aborted) throw abortReason(signal);
    if (isApiError(error) && error.status === 404) return false;
    throw error;
  }
}

/** The turn's ledger state, or null when the ledger does not hold it. */
async function turnState(svc: ServiceInternals, sessionId: string, turnId: string, templateVars: TemplateVars, signal: AbortSignal, realm: string | undefined): Promise<string | null> {
  const url = svc
    .buildTemplateUrl('/api/v1/agent/sessions/{id}/turns/{turn_id}', templateVars ?? {}, {}, { id: sessionId, turn_id: turnId })
    .replace('{id}', () => encodeURIComponent(sessionId))
    .replace('{turn_id}', () => encodeURIComponent(turnId));
  try {
    // The Bot's session lives in the Bot's realm: looked up in another, it is 404.
    const res = await svc.http.get<AgentSessionsTurnsGetResponse>(url, { signal, ...(realm === undefined ? {} : { headers: { 'X-Hoody-Realm': realm } }) });
    return typeof res.data.state === 'string' ? res.data.state : null;
  } catch (error) {
    if (signal.aborted) throw abortReason(signal);
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

async function ask(
  this: BotsService,
  id: string,
  text: string,
  options: BotAskOptions = {},
  templateVars?: TemplateVars,
): Promise<BotAskResult> {
  const svc = this as unknown as ServiceInternals;
  const outer = options.signal;
  if (outer?.aborted) throw abortReason(outer);
  if (options.idempotencyKey !== undefined && (typeof options.idempotencyKey !== 'string' || options.idempotencyKey.trim() === '')) {
    // A blank key is no key to the kit: the re-send that reads a queued message's turn would
    // queue the message a second time.
    throw botChatError('INVALID_IDEMPOTENCY_KEY', 'idempotencyKey must not be blank; omit it to have one made', {});
  }
  const idempotencyKey = options.idempotencyKey ?? newKey();
  const realm = options.realm;
  const inRealm = realm === undefined ? {} : { realm };
  const pollMs = positive(options.pollMs, 2000);
  const graceMs = positive(options.replyGraceMs, 10_000);
  const ctl = new AbortController();
  const signal = ctl.signal;
  const onAbort = (): void => ctl.abort(outer?.reason);
  outer?.addEventListener('abort', onAbort, { once: true });
  // Read before the first send. A kit without the capability ignores the key, so the message
  // goes without one: a send that carries a key is retried after a lost answer, and there that
  // retry would queue the message twice.
  let keyed = false;
  const send = async (): Promise<BotMessageReceipt> =>
    keyed
      ? (await this.sendMessage(id, { text }, { ...inRealm, IdempotencyKey: idempotencyKey, signal }, templateVars)).data
      : (await withoutMessageKey(this).sendMessage(id, { text }, { ...inRealm, signal }, templateVars)).data;

  let rowsIter: AsyncGenerator<BotLogRow, void, undefined> | undefined;
  // One handled promise per pending row: a race that loses to the timer must not leave a
  // rejection nobody handles.
  const pull = (it: AsyncGenerator<BotLogRow, void, undefined>): Promise<{ r: IteratorResult<BotLogRow, void> }> => {
    const p = it.next().then((r) => ({ r }));
    p.catch(() => undefined);
    return p;
  };
  try {
    keyed = await keyedResendSupported(svc, templateVars, signal);
    let receipt = await send();
    const messageId = receipt.message_id;
    const fail = (code: string, message: string, extra: Record<string, unknown> = {}): Error =>
      botChatError(code, message, { idempotencyKey, keyed, receipt, ...extra });
    const turnOf = (r: BotMessageReceipt): string | undefined =>
      r.state === 'posted' && typeof r.turn_id === 'string' && r.turn_id !== '' ? r.turn_id : undefined;
    let turnId = turnOf(receipt);
    if (turnId === undefined && !keyed) {
      throw fail('BOT_RECEIPT_UNAVAILABLE', 'the message is queued and this kit cannot report the Bot turn that takes it; follow the log');
    }

    const rows: BotLogRow[] = [];
    let since = options.since;
    // Following the whole log, the rows before the message's own row are history: skip them.
    let reporting = options.since !== undefined;
    let reply: BotLogRow | null | undefined;
    let state: string | undefined;
    let endedAt: number | undefined;
    let ledger = true;
    let sessionId: string | undefined;
    let pollNow = false;
    // Bot replies read while the message's turn is not known yet, by turn id: a queued
    // message's reply can be logged before the receipt names its turn.
    const early = new Map<string, BotLogRow>();
    let earlyChars = 0;

    rowsIter = follow.call(this, id, { ...inRealm, ...(since === undefined ? {} : { since }), signal, ...(options.onFrame ? { onFrame: options.onFrame } : {}) }, templateVars);
    let next = pull(rowsIter);
    let tick = pause(pollMs, signal);
    while (reply === undefined) {
      const step = await Promise.race([next, tick.then(() => null)]);
      if (signal.aborted) throw abortReason(signal);
      if (step !== null) {
        if (step.r.done) throw fail('BOT_STREAM_ENDED', 'the Bot log stream ended (the Bot was deleted) before the reply');
        const row = step.r.value;
        next = pull(rowsIter);
        if (typeof row.seq === 'number') since = row.seq;
        if (row.role === 'user' && row.message_id === messageId) {
          reporting = true;
          continue;
        }
        if (turnId !== undefined && row.role === 'bot' && row.turn_id === turnId) reply = row;
        if (turnId === undefined && reporting && row.role === 'bot' && typeof row.turn_id === 'string') {
          earlyChars += (row.text ?? '').length;
          // Dropping one could drop the reply: stop instead. The message stays queued or posted.
          if (early.size >= EARLY_REPLY_MAX_ROWS || earlyChars > EARLY_REPLY_MAX_CHARS) {
            throw fail('BOT_REPLY_BACKLOG', 'too many Bot replies were logged before the kit named the turn of this message; read the reply from the log');
          }
          early.set(row.turn_id, row);
        }
        // The Bot's turn ended: a queued message is posted now.
        if (turnId === undefined && (row.role === 'bot' || row.role === 'system')) pollNow = true;
        if (reporting || reply !== undefined) {
          rows.push(row);
          options.onRow?.(row);
        }
        if (!pollNow) continue;
      }
      pollNow = false;
      if (turnId === undefined) {
        const again = await send();
        if (again.message_id !== messageId) {
          throw fail('BOT_MESSAGE_REQUEUED', 'the kit dropped the message; the re-send queued it again', { requeuedMessageId: again.message_id });
        }
        receipt = again;
        turnId = turnOf(again);
        if (turnId !== undefined) {
          reply = early.get(turnId);
          early.clear();
        }
      } else if (endedAt !== undefined) {
        if (Date.now() - endedAt >= graceMs) reply = null;
      } else if (ledger) {
        sessionId ??= (await this.get(id, { ...inRealm, signal }, templateVars)).data.session_id;
        const s = await turnState(svc, sessionId, turnId, templateVars, signal, realm);
        if (s === null) {
          ledger = false;
        } else if (TERMINAL_TURN_STATES.has(s)) {
          state = s;
          endedAt = Date.now();
        }
      }
      tick = pause(endedAt === undefined ? pollMs : Math.max(0, endedAt + graceMs - Date.now()), signal);
    }
    return { receipt, idempotencyKey, keyed, reply, ...(state === undefined ? {} : { turnState: state }), rows, since };
  } catch (error) {
    if (outer?.aborted) throw abortReason(outer);
    throw error;
  } finally {
    outer?.removeEventListener('abort', onAbort);
    ctl.abort();
    void rowsIter?.return(undefined).catch(() => undefined);
  }
}

const PATCHED = Symbol.for('hoody.bot-chat.patched');

export function patchBotChatExtensions(): void {
  const proto = BotsService.prototype as unknown as Record<string | symbol, unknown>;
  if (proto[PATCHED]) return;
  proto[PATCHED] = true;
  proto.ask = ask;
  proto.follow = follow;
}

patchBotChatExtensions();

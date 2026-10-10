import type { BotsServiceBase } from '../generated/agent/bots.service.generated.js';
import type { AgentBotsSendMessageResponse } from '../generated/types.js';
/** The URL template variables: the LAST parameter of a Bot method (its options come before them on a kit whose Bot routes take a realm). */
type LastParameter<F extends (...args: never[]) => unknown> = Required<Parameters<F>> extends [...unknown[], infer L] ? L | undefined : never;
type TemplateVars = LastParameter<BotsServiceBase['get']>;
type BotStream = Awaited<ReturnType<BotsServiceBase['stream']>>;
/** A frame of a Bot's log stream. */
export type BotStreamFrame = BotStream extends AsyncIterable<infer F> ? F : never;
/** One row of a Bot's log, as the stream's `row` frame carries it. */
export type BotLogRow = Extract<BotStreamFrame, {
    declared: true;
    event: 'row';
}>['data'];
/** A message's receipt, as POST /bots/{id}/messages returns it. */
export type BotMessageReceipt = AgentBotsSendMessageResponse['data'];
/** The capability a kit lists when a keyed re-send queues nothing and answers with the same message's current state. */
export declare const BOT_MESSAGE_IDEMPOTENCY_CAPABILITY = "bot_message_idempotency";
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
export declare function patchBotChatExtensions(): void;
export {};

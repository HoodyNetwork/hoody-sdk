/**
 * WebSocket client for Talk to a Bot by voice (WebSocket).
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent GET /api/v1/agent/bots/{id}/voice WebSocket v1.0.0
 */
export type { WebSocketUpgradeRefusedError } from "../../lib/websocket-errors.js";
/** Minimal structural contract a WebSocket implementation must satisfy. */
export type IRawWebSocketMessageEvent = {
    data: string | ArrayBuffer | ArrayBufferView | Blob;
};
export type IRawWebSocketCloseEvent = {
    code: number;
    reason: string;
};
export interface IRawWebSocketLike {
    readyState: number;
    binaryType?: "arraybuffer" | "blob";
    onopen: (() => void) | null;
    onmessage: ((event: IRawWebSocketMessageEvent) => void) | null;
    onclose: ((event: IRawWebSocketCloseEvent) => void) | null;
    onerror: ((event: unknown) => void) | null;
    send(data: string | ArrayBuffer | Uint8Array): void;
    close(code?: number, reason?: string): void;
}
export type IRawWebSocketCtor = new (url: string, protocols?: string | string[]) => IRawWebSocketLike;
/**
 * Injectable WebSocket transport.
 *
 * When supplied on the options bag this factory is the ONLY way the client
 * opens a socket: no `globalThis.WebSocket`, no dynamic `ws` import, no
 * silent degradation. A factory that throws (or rejects) fails the connect
 * rather than falling back to another transport, so a test double, a
 * proxy-aware socket or a header-capable implementation is guaranteed to be
 * the one in use.
 *
 * It is called once per connection attempt, including every reconnect.
 */
export type WebSocketFactory = (url: string, protocols?: string | string[], options?: {
    headers?: Record<string, string>;
}) => IRawWebSocketLike | Promise<IRawWebSocketLike>;
/**
 * One sequenced event from a gateway that stamps a cursor.
 *
 * The hoody-agent gateway publishes `{seq, event}` (plus `incarnation` and,
 * on the frame that parks a gate, `gate`) rather than a bare typed message.
 * A client that dispatched on `message.type` alone saw NOTHING on that
 * stream: the type lives one level down, on `event`.
 *
 * `seq` is the resume cursor. It is monotonic WITHIN an incarnation only —
 * a session torn down and re-attached restarts at 1 — so a cursor is only
 * meaningful together with the incarnation that stamped it.
 */
export interface IStreamEnvelope<TEvent = unknown> {
    kind: 'envelope';
    seq: number;
    incarnation?: string;
    gate?: {
        id: string;
        generation: number;
        type: string;
    };
    event: TEvent;
}
/**
 * The subscriber was dropped, or a resume cursor fell outside the replay
 * ring (or belonged to another incarnation).
 *
 * `code` distinguishes the two: `lagged` means the client was too slow and
 * events were dropped; `replay_gap` means the cursor it resumed with cannot
 * be served. Both are reconciled by reconnecting — the client does that
 * itself, from `min_seq` on a gap.
 */
export interface IStreamLaggedFrame {
    kind: 'lagged';
    code: string;
    min_seq?: number;
    max_seq?: number;
    incarnation?: string;
    resume?: string;
}
/** The ring-to-live boundary: everything before it was buffered replay. */
export interface IStreamReplayBoundaryFrame {
    kind: 'replay_boundary';
    max_seq?: number;
    incarnation?: string;
}
/** The stream is terminating; no further frame will arrive. */
export interface IStreamEndFrame {
    kind: 'end';
    reason?: string;
}
/**
 * The gateway refused a frame this client sent, on this connection only:
 * `frame` names the refused frame's type, `code` why (for example
 * `no_active_workflow` or `admission_unconfirmed` for a workflow_message).
 */
export interface IStreamRefusedFrame {
    kind: 'refused';
    code: string;
    frame?: string;
    reason?: string;
}
export type IStreamControlFrame = IStreamLaggedFrame | IStreamReplayBoundaryFrame | IStreamEndFrame | IStreamRefusedFrame;
/** Everything the stream yields, discriminated on `kind`. */
export type IStreamFrame<TEvent = unknown> = IStreamEnvelope<TEvent> | IStreamControlFrame;
/**
 * WebSocket connection configuration options
 */
export interface IWebSocketConnectionOptions {
    timeout?: number;
    reconnect?: boolean;
    /**
     * How many automatic reconnect attempts may follow one another before
     * the client gives up and calls onReconnectFailed. Default: no limit.
     * The count starts over after a connection that lasted
     * reconnectStableMs, and on connect() and reconnect().
     *
     * Set a limit when the client may run on a browser WebSocket or on
     * Node's built-in one. Those hide the HTTP status of a refused upgrade,
     * so a route that is gone for good (401, 403, 404) looks like a network
     * drop and is retried, one attempt per reconnectDelayMax (30 s by
     * default), until this limit. With the `ws` package the status is
     * visible and such a refusal ends the series at once.
     */
    reconnectAttempts?: number;
    reconnectDelay?: number;
    reconnectDelayMax?: number;
    reconnectionDelayGrowFactor?: number;
    randomizationFactor?: number;
    auth?: Record<string, unknown>;
    headers?: Record<string, string>;
    /**
     * The header names a credential given for THIS socket would travel in (a
     * per-call kitAuth's header, whatever its name, or a credential header on
     * the call). A browser WebSocket cannot send headers, so connect() rejects
     * with a WebSocketCredentialNotSentError when one of these names is among
     * the headers, instead of opening a socket that looks unauthenticated.
     * Unset, the dropped credential header names are reported once with a
     * warning and the socket opens. It has no effect outside a browser.
     */
    requireHeaderCredentials?: string[];
    query?: Record<string, string>;
    transports?: Array<'websocket' | 'polling'>;
    path?: string;
    protocols?: string[];
    autoConnect?: boolean;
    /**
     * Transport used to open the socket. When set it is used exclusively —
     * see WebSocketFactory. Raw-WebSocket channels only; a Socket.IO client
     * rejects it at connect() instead of silently ignoring it.
     */
    webSocketFactory?: WebSocketFactory;
    /**
     * Steers the client's own choice of transport. "ws" opens the socket with
     * the `ws` package (in a Bun binary, Bun's built-in `ws`), never with the
     * global WebSocket, and fails the connect when `ws` cannot be loaded. Only
     * that transport shows the status and body of a refused upgrade (see
     * WebSocketUpgradeFailedError). A webSocketFactory or a static
     * webSocketImpl the caller injected still wins: this option only steers
     * the automatic choice. Refused in a browser and on Socket.IO channels.
     * "auto" (the default) keeps the client's own choice.
     */
    socketTransport?: "auto" | "ws";
    /**
     * Reconnect after the SERVER closed the socket normally (code 1000).
     * Off by default: a normal close means the server ended the stream on
     * purpose (a deleted terminal session closes this way), and reconnecting
     * to it can silently re-create what was just deleted.
     * A close because another connection took over (reason "taken over")
     * is never reconnected, even with this on: see onTakenOver.
     */
    reconnectOnNormalClose?: boolean;
    /**
     * How long a connection must stay open before the reconnect backoff
     * starts over. Default 30000. A server that accepts and then closes
     * sooner than this keeps the delay growing instead of being retried at
     * the first step forever.
     */
    reconnectStableMs?: number;
    /**
     * Supplies the URL for every open AFTER the first one: each automatic
     * reconnect, reconnect(), and a connect() that follows a disconnect().
     * For routes whose URL holds a single-use value (a socket ticket): run
     * the operation that issues it again and return the new URL. A provider
     * that throws fails that attempt; an automatic reconnect tries again
     * after the next backoff delay.
     *
     * A fresh URL does not reopen a refused connection: when the server
     * answers the upgrade with a 4xx status (other than 408, 425 or 429)
     * the reconnect series ends, even though the provider issued that URL
     * a moment before. onError carries the status; call connect() to try again.
     */
    urlProvider?: (context: {
        previousUrl: string;
        attempt: number;
        reconnect: boolean;
    }) => string | Promise<string>;
    /**
     * Half-open detection: when nothing has arrived for this many
     * milliseconds the link is treated as dead. The client reports
     * disconnect (1006, "liveness timeout") and reconnects as after any
     * other drop. Every received message counts as activity.
     *
     * Default: 75000 when the transport can send protocol pings (the `ws`
     * package, which this client uses on Node); the client then pings on
     * its own and counts pings and pongs too, so a quiet but healthy stream
     * is never cut. A browser WebSocket (and Bun's or Deno's) hides pings:
     * there the default is 75000 only on a channel with its own ping frame,
     * which the client then sends, and off otherwise. Set it there only
     * above the longest silence the server allows itself, such as its
     * heartbeat interval. 0 turns it off.
     */
    idleTimeoutMs?: number;
    /**
     * Find out why a reconnect keeps failing. A browser WebSocket and Node's
     * built-in one hide the HTTP status of a refused upgrade: a 401, 403 or
     * 404 looks like a network drop. After this many automatic attempts in
     * a row that never opened (default 3; 0 turns it off), the client sends
     * one plain GET to the same URL: the same query, the headers this
     * transport may send (none in a browser, which sends its cookies
     * instead), a 5 s timeout, redirects not followed. On 401, 403 or 404
     * automatic reconnect stops: onError receives a
     * WebSocketUpgradeRefusedError carrying the status and the server's
     * error code, then onReconnectFailed. Any other answer, or none, and the
     * backoff goes on; the next probe follows after as many failures again.
     * With the `ws` package the status is visible at once and ends the
     * series with the same error, without a probe. Not used with a
     * webSocketFactory, which owns the network path. A server whose route
     * answers a plain GET differently from an upgrade (400 or 426 before
     * any permission check) cannot be told apart this way.
     */
    refusalProbeAfter?: number;
    /**
     * Cursor-preserving resume. When the client has seen a sequenced
     * envelope, every RECONNECT carries the last seq (and the incarnation
     * that stamped it) so the gateway replays from there instead of from
     * the top of its ring. Without this a reconnect silently loses every
     * event that arrived while the socket was down.
     *
     * On by default, and inert until a cursor exists — a channel that never
     * sends a seq never gets a resume parameter.
     *
     * A whole-number cursor given as `?since=` (URL or `query`) or as a
     * Last-Event-ID header only SEEDS the cursor: the first connect sends it,
     * reconnects send the live one. An incarnation given without a cursor is
     * sent on the first connect only.
     */
    streamResume?: {
        enabled?: boolean;
        /** Query parameter carrying the cursor. Default `since`. */
        param?: string;
        /** Query parameter carrying the incarnation. Default `incarnation`. */
        incarnationParam?: string;
        /**
         * Numeric field of a plain (non-envelope) frame that is the resume
         * cursor, e.g. hoody-watch's `id` for `since_id`. Unset: only
         * sequenced envelopes move the cursor.
         */
        cursorField?: string;
    };
}
/** In vad mode (the agent detects when the user starts and stops speaking): end the utterance now, keeping its audio up to last_seq. */
export interface InputCommitClientMessage {
    /** The frame type. */
    type: 'input.commit';
    /** The utterance: numbered from 1 per connection. */
    utt: number;
    /** The last input frame that belongs to the utterance. */
    last_seq: number;
}
/** In ptt mode (push to talk): the user pressed to talk. It stops any speech that is playing (barge-in). */
export interface PttDownClientMessage {
    /** The frame type. */
    type: 'ptt.down';
}
/** In ptt mode: the user released; the utterance holds its audio up to last_seq. */
export interface PttUpClientMessage {
    /** The frame type. */
    type: 'ptt.up';
    /** The last input frame that belongs to the utterance. */
    last_seq: number;
}
/** Stop speech and cancel turns. With reply_id: that reply's output and its turn. Without: everything playing, and every turn this connection's messages started. With keep_turn true only speech stops: no turn is cancelled, later reply text is not spoken, and reply.final comes when the turn really ends, with spoken judged then against its whole text (true only when playback.mark confirmed all of it). Answered with cancel.result. */
export interface OutputCancelClientMessage {
    /** The frame type. */
    type: 'output.cancel';
    /** The reply (turn id, or an announcement's reply id) to cancel. */
    reply_id?: string;
    /** true: stop speech only; the turns go on (cancel.result turn_continues). */
    keep_turn?: boolean;
}
/** How far the client has played an output: send at least every 500 ms while playing, and once at its end. A mark past the audio sent closes the connection with 1008. */
export interface PlaybackMarkClientMessage {
    /** The frame type. */
    type: 'playback.mark';
    /** The output. */
    out: number;
    /** Samples of that output played so far. */
    played_to: number;
}
/** Decide an approval the Bot itself is waiting on (own_gate.pending kind confirm). */
export interface OwnGateDecideClientMessage {
    /** The frame type. */
    type: 'own_gate.decide';
    /** The gate. */
    gate_id: string;
    /** The gate's generation; a decision for another generation is stale. */
    generation: number;
    /** The decision. */
    decision: 'approve' | 'deny' | 'allow_session';
    /** With deny only: why, at most 500 characters. */
    reason?: string;
}
/** Answer a question the Bot itself asked (own_gate.pending kind question). */
export interface OwnGateAnswerClientMessage {
    /** The frame type. */
    type: 'own_gate.answer';
    /** The gate. */
    gate_id: string;
    /** The gate's generation; an answer for another generation is stale. */
    generation: number;
    /** The answer; a blank one is refused with error bad_request. */
    answer: string;
}
/** A typed message to the Bot. The whole frame, JSON envelope and escaping included, is at most 64 KiB; a longer frame closes the connection with code 1009. Its reply is spoken here, as for a spoken message; output.cancel stops that speech but leaves the turn running (cancel.result turn_continues). With key it is answered by one text.result instead of error frames. */
export interface TextClientMessage {
    /** The frame type. */
    type: 'text';
    /** The message. */
    text: string;
    /** An idempotency key (1–255 printable ASCII, no whitespace; not starting with "compat:" or "chan:"), from the same set as the Idempotency-Key of POST /api/v1/agent/bots/{id}/messages and the Bot's other doors: the same key and text answer the first message again, and GET /api/v1/agent/bots/{id}/messages/by-key/{key} reads what became of it. */
    key?: string;
}
/** Answered with pong. */
export interface PingClientMessage {
    /** The frame type. */
    type: 'ping';
}
/** First frame: the connection's settings. */
export interface SessionServerMessage {
    /** The frame type. */
    type: 'session';
    /** A number that grows each time a connection takes control of the Bot's voice: a later connection has a higher one. When one takes over, the earlier connection gets takeover and closes. */
    epoch: number;
    /** The connection id. */
    conn: string;
    /** Input sample rate. */
    in_rate: number;
    /** Output sample rate. */
    out_rate: number;
    /** true in vad mode (the agent detects when the user starts and stops speaking), false in ptt mode (push to talk). */
    vad: boolean;
    /** false when the connection was opened with speak=false: replies arrive as text only. */
    speak?: boolean;
    /** true when the connection was opened with play_lead=true: reply audio is kept at most 8 seconds ahead of what playback.mark says was played. */
    play_lead?: boolean;
}
/** The user started speaking (vad mode) or pressed to talk (ptt mode). */
export interface VadStartServerMessage {
    /** The frame type. */
    type: 'vad.start';
    /** The utterance: numbered from 1 per connection. */
    utt: number;
}
/** The utterance ended. */
export interface VadEndServerMessage {
    /** The frame type. */
    type: 'vad.end';
    /** The utterance: numbered from 1 per connection. */
    utt: number;
}
/** Text heard so far in the utterance. */
export interface TranscriptPartialServerMessage {
    /** The frame type. */
    type: 'transcript.partial';
    /** The utterance: numbered from 1 per connection. */
    utt: number;
    /** The text so far. */
    text: string;
}
/** How the utterance ended: message_id when the Bot got it as a message, or one of no_speech, rejected and failed. */
export interface TranscriptFinalServerMessage {
    /** The frame type. */
    type: 'transcript.final';
    /** The utterance: numbered from 1 per connection. */
    utt: number;
    /** The text heard. */
    text: string;
    /** The Bot message it became. */
    message_id?: string;
    /** Nothing was said: vad (too little speech). */
    no_speech?: string;
    /** Not sent: too_long (over the utterance limit), frame_loss (input frames missing), busy (the agent had no room for it), stt_suspect (the transcript was empty or does not fit the audio), or another reason the Bot refused it. */
    rejected?: string;
    /** Sent but failed: submit, or the speech service's reason. */
    failed?: string;
    /** Present when failed is set or rejected is stt_suspect: what failed and what to do next. Its code is the most specific cause and may differ from failed. */
    error?: {
        code: string;
        reason?: string;
        message: string;
        diag_id?: string;
        retryable: boolean;
        retry_after_secs?: number;
    };
}
/** Reply text so far, while the Bot's turn runs. */
export interface ReplyProvisionalServerMessage {
    /** The frame type. */
    type: 'reply.provisional';
    /** The turn. */
    turn_id: string;
    /** Orders a turn's provisional frames. */
    seq: number;
    /** New text. */
    text: string;
}
/** Earlier provisional text of the turn is withdrawn from from_raw on. */
export interface ReplyInvalidateServerMessage {
    /** The frame type. */
    type: 'reply.invalidate';
    /** The turn. */
    turn_id: string;
    /** The first withdrawn position of the turn's raw text. */
    from_raw: number;
}
/** The turn's final text and how much of it was spoken. The frame is at most 64 KiB: a longer text is cut and truncated is true; the whole text is in the Bot's log. */
export interface ReplyFinalServerMessage {
    /** The frame type. */
    type: 'reply.final';
    /** The turn. */
    turn_id: string;
    /** The final text. */
    text: string;
    /** true: all spoken; false: not spoken; "partial": only part was spoken (reason says why); "unknown": audio went out that no playback.mark confirmed (the client stopped reporting playback, or speech was stopped before its marks came). */
    spoken: unknown;
    /** Why speech stopped or was partial: barge_in (the user spoke), cancelled (output.cancel), busy (the agent had no room), revised (an earlier reply's text was withdrawn), too_long (a segment over the speech limit), tts_cut or tts_incomplete or tts_failed (the speech service), speech_limit (the daily speech budget is spent, or speech output is off: speech.limits.tts_chars 0), diverged (the final text differs from what was spoken), no_marks (with play_lead: reply audio waited 5 seconds for a playback.mark that did not come; spoken is then unknown, or partial when whole segments were heard; the turn was not cancelled). */
    reason?: 'barge_in' | 'cancelled' | 'busy' | 'revised' | 'too_long' | 'tts_cut' | 'tts_incomplete' | 'tts_failed' | 'speech_limit' | 'diverged' | 'no_marks';
    /** true when text was cut: to fit the frame, or because the agent had no room to keep all of it (for a spoken reply, reason is usually busy). The whole text is in the Bot's log. */
    truncated?: boolean;
    /** true when the turn answers a message sent on this connection, false when it does not; absent when the connection cannot tell. It is about this connection only: a message sent on an earlier connection is answered with own false. */
    own?: boolean;
    /** Present when the turn failed after earlier reply text: the text is what the Bot said before it, and the reply was cut off. content_filter or refusal: the model provider stopped the answer; max_steps: the turn stopped at its step limit. Absent otherwise. */
    failure?: 'content_filter' | 'refusal' | 'max_steps';
    /** Present when reason is tts_failed or tts_incomplete: what failed and what to do next. */
    error?: {
        code: string;
        reason?: string;
        message: string;
        diag_id?: string;
        retryable: boolean;
        retry_after_secs?: number;
    };
}
/** The final text differs from what was being spoken; the affected speech is stopped with output.stop, and a spoken notice points to the final text. */
export interface ReplyDivergedServerMessage {
    /** The frame type. */
    type: 'reply.diverged';
    /** The turn. */
    turn_id: string;
}
/** An output (a piece of speech) starts. Its audio normally follows in output.audio frames. When speech output is off (speech.limits.tts_chars 0), the speech budget is spent, or the speech service fails before any audio of the reply was sent, no audio follows: output.end with samples 0 comes next, then, for a reply, reply.final with spoken false (reason speech_limit or tts_failed). If a later segment fails or the speech budget runs out after earlier segments of the reply played, the reply ends with spoken partial and a reason from the speech service or budget (tts_failed, tts_cut, tts_incomplete or speech_limit; see reply.final). An announcement (kind announcement) never sends reply.final. When the speech service fails (tts_failed, tts_incomplete) it is reported with an error frame (code service_unavailable), once per code and reason per connection; an announcement stopped for speech_limit or silenced by speech off is not reported. */
export interface OutputStartServerMessage {
    /** The frame type. */
    type: 'output.start';
    /** The output, numbered up per connection. */
    out: number;
    /** The reply it belongs to. */
    reply_id: string;
    /** Its place in the reply. */
    seg: number;
    /** reply: the Bot's reply; announcement: a spoken notice that a delegate waits on a gate. */
    kind: 'reply' | 'announcement';
    /** For an announcement: session_id, gate_id and generation of the gate. */
    ref?: Record<string, unknown>;
}
/** All audio of the output was sent. */
export interface OutputEndServerMessage {
    /** The frame type. */
    type: 'output.end';
    /** The output. */
    out: number;
    /** Its length in samples. */
    samples: number;
}
/** Every output up to upto_out stops: drop its unplayed audio. */
export interface OutputStopServerMessage {
    /** The frame type. */
    type: 'output.stop';
    /** The last output stopped. */
    upto_out: number;
    /** Why: barge_in (the user spoke), cancelled (output.cancel), busy (the agent had no room), revised (a reply's text was withdrawn), tts_incomplete or tts_failed (the speech service), speech_limit (the daily speech budget is spent), or no_marks (with play_lead: reply audio waited 5 seconds for a playback.mark that did not come). */
    reason: 'barge_in' | 'cancelled' | 'busy' | 'revised' | 'tts_incomplete' | 'tts_failed' | 'speech_limit' | 'no_marks';
}
/** The answer to output.cancel. */
export interface CancelResultServerMessage {
    /** The frame type. */
    type: 'cancel.result';
    /** The reply named, if any. */
    reply_id?: string;
    /** cancelled: the turns were cancelled, or the speech of a turn that had already ended was stopped (message_ids then empty); turn_continues: a turn goes on (it carries other messages, or could not be cancelled); not_active: nothing was speaking and no turn to cancel. */
    state: 'cancelled' | 'turn_continues' | 'not_active';
    /** The messages concerned. */
    message_ids: string[];
}
/** The answer to a text frame that carried a key. */
export interface TextResultServerMessage {
    /** The frame type. */
    type: 'text.result';
    /** The text frame's key. */
    key: string;
    /** posted: the message went out in a Bot turn; queued: it waits for the Bot's current turn to end; dropped: the key's message was dropped before it was posted and never will be (reason says why; send it again under a new key); refused: it was not queued (code says why; send it again only after fixing that); unknown: whether it was queued is not known yet, and it may still arrive: read GET /api/v1/agent/bots/{id}/messages/by-key/{key} before sending it again (a 404 there proves nothing; read the log). */
    state: 'posted' | 'queued' | 'dropped' | 'refused' | 'unknown';
    /** With posted, queued or dropped: the message's id. With refused idempotency_key_reused: the message the key took. */
    message_id?: string;
    /** On dropped: access_revoked (the chat-app sender is no longer allowed to send it) or key_conflict (the Bot could not deliver it). */
    reason?: 'access_revoked' | 'key_conflict';
    /** With refused: bad_request (an empty text, one over 64 KiB, or a bad key), busy (no room now; send it again), idempotency_key_reused (the key was used for other text, or through another door), idempotency_keys_exhausted (the Bot remembers too many recent keys), service_unavailable (the Bot could not take it now; send it again). */
    code?: 'bad_request' | 'busy' | 'idempotency_key_reused' | 'idempotency_keys_exhausted' | 'service_unavailable';
    /** What happened. */
    message?: string;
}
/** A delegate's gate is being announced; answer it on screen or by typing. The announcement is its own reply: its output.start frames carry reply_id and kind announcement. */
export interface GateAnnouncedServerMessage {
    /** The frame type. */
    type: 'gate.announced';
    /** session_id, gate_id and generation of the gate. */
    ref: Record<string, unknown>;
    /** The announcement's reply id; output.cancel with it stops the announcement. */
    reply_id: string;
}
/** The Bot itself waits on an approval or a question. */
export interface OwnGatePendingServerMessage {
    /** The frame type. */
    type: 'own_gate.pending';
    /** The gate. */
    gate_id: string;
    /** The gate's generation; a decision or answer for another generation is stale. */
    generation: number;
    /** confirm: decide with own_gate.decide; question: answer with own_gate.answer. */
    kind: 'confirm' | 'question';
    /** What it is about. */
    summary: string;
    /** With confirm: the decisions offered. */
    decisions?: unknown;
    /** With question: the questions. */
    questions?: unknown;
}
/** The result of your own_gate.decide or own_gate.answer; with outcome resolved, it is sent unprompted when the gate ended elsewhere. */
export interface OwnGateResolvedServerMessage {
    /** The frame type. */
    type: 'own_gate.resolved';
    /** The gate. */
    gate_id: string;
    /** The gate's generation; a decision or answer for another generation is stale. */
    generation: number;
    /** applied (the decision or answer was taken), resolved (the gate ended elsewhere), stale (the gate is gone and no record of it is held, or the frame named another generation), unavailable (it could not be delivered, or whether it was taken is not known; check the Bot before trying again), not_offered (allow_session was sent but the gate does not offer it; nothing was sent and the gate is still open: decide with approve or deny), or the code it was refused with, for example no_pending_gate (the Bot waits on no gate), stale_gate (the gate changed; answer the new one), gate_decision_pending (another decision for the gate is still being applied), gate_already_answered or gate_already_resolved (the gate was already answered or ended), gate_cancelled (the gate ended without taking it), decision_unconfirmed (whether the answer was taken is not known; check the Bot before answering again). */
    outcome: string;
}
/** The utterance was not taken: the agent had no room for it. transcript.final rejected busy follows. */
export interface BusyServerMessage {
    /** The frame type. */
    type: 'busy';
    /** The utterance: numbered from 1 per connection. */
    utt: number;
}
/** A request in a frame failed. After protocol or rate_limited the connection closes with 1008; after any other code it stays open. */
export interface ErrorServerMessage {
    /** The frame type. */
    type: 'error';
    /** What failed: bad_request (a frame had a bad field: a decision other than approve, deny or allow_session, a reason without deny or over 500 characters, a blank answer, an empty text or one over 64 KiB), busy (no room now: an earlier gate decision is still being applied, or too much is waiting; send it again), rate_limited (more than 50 text frames a second; closes 1008), protocol (a malformed frame; closes 1008), service_unavailable (the speech service failed on an announcement: tts_failed or tts_incomplete, once per code and reason per connection; or a typed message was not queued; send it again, unless the message says its delivery is not confirmed: it may still arrive, so check the Bot's log or reply first), stale_utterance (input.commit named an utterance that already ended), no_utterance (nothing to end: input.commit with no utterance open, or ptt.up without ptt.down), wrong_mode (input.commit in ptt mode, or ptt.down or ptt.up in vad mode), server_error (a frame could not be encoded). */
    code: 'bad_request' | 'busy' | 'rate_limited' | 'protocol' | 'service_unavailable' | 'stale_utterance' | 'no_utterance' | 'wrong_mode' | 'server_error';
    /** What happened. */
    message: string;
    /** With code service_unavailable when the speech service failed on an announcement: the speech failure. */
    error?: {
        code: string;
        reason?: string;
        message: string;
        diag_id?: string;
        retryable: boolean;
        retry_after_secs?: number;
    };
}
/** Another connection took over this Bot's voice; the connection closes with 1000. */
export interface TakeoverServerMessage {
    /** The frame type. */
    type: 'takeover';
    /** The connection that took over. */
    by: string;
}
/** The answer to ping. */
export interface PongServerMessage {
    /** The frame type. */
    type: 'pong';
}
/** Only with refuse=frame, and then the only frame: the agent refused the connection. The connection closes next with 4000 plus the HTTP status the refusal has without refuse=frame. Nothing was taken over. */
export interface RefusedServerMessage {
    /** The frame type. */
    type: 'refused';
    /** The refusal's code, as in the HTTP error answer: bad_request, invalid_realm, realm_scope_unsupported, not_found, voice_busy, realm_blocked, bot_owned_elsewhere, service_unavailable, restriction_unknown or speech_unavailable. */
    code: string;
    /** What happened and what to do next. */
    message: string;
    /** The refusal's details, as in the HTTP error answer: for require, the check's result. */
    details?: Record<string, unknown>;
    /** Seconds to wait before trying again, when the refusal names them. */
    retry_after_secs?: number;
}
/** Binary frame: byte 0x01, a big-endian unsigned 32-bit output number (out), a big-endian unsigned 32-bit sample offset into that output, then 16-bit little-endian PCM at out_rate. */
export interface OutputAudioServerFrame {
    /** The output (see output.start). */
    out: number;
    /** The sample offset of this audio into that output. */
    offset: number;
    /** 16-bit little-endian PCM at out_rate. A view into the received frame. */
    pcm: Uint8Array;
}
export interface IAgentBotsConnectVoiceWebSocket {
    /** In vad mode (the agent detects when the user starts and stops speaking): end the utterance now, keeping its audio up to last_seq. */
    inputCommit(utt: number, last_seq: number): void;
    /** In ptt mode (push to talk): the user pressed to talk. It stops any speech that is playing (barge-in). */
    pttDown(): void;
    /** In ptt mode: the user released; the utterance holds its audio up to last_seq. */
    pttUp(last_seq: number): void;
    /** Stop speech and cancel turns. With reply_id: that reply's output and its turn. Without: everything playing, and every turn this connection's messages started. With keep_turn true only speech stops: no turn is cancelled, later reply text is not spoken, and reply.final comes when the turn really ends, with spoken judged then against its whole text (true only when playback.mark confirmed all of it). Answered with cancel.result. */
    outputCancel(reply_id?: string, keep_turn?: boolean): void;
    /** How far the client has played an output: send at least every 500 ms while playing, and once at its end. A mark past the audio sent closes the connection with 1008. */
    playbackMark(out: number, played_to: number): void;
    /** Decide an approval the Bot itself is waiting on (own_gate.pending kind confirm). */
    own_gateDecide(gate_id: string, generation: number, decision: 'approve' | 'deny' | 'allow_session', reason?: string): void;
    /** Answer a question the Bot itself asked (own_gate.pending kind question). */
    own_gateAnswer(gate_id: string, generation: number, answer: string): void;
    /** A typed message to the Bot. The whole frame, JSON envelope and escaping included, is at most 64 KiB; a longer frame closes the connection with code 1009. Its reply is spoken here, as for a spoken message; output.cancel stops that speech but leaves the turn running (cancel.result turn_continues). With key it is answered by one text.result instead of error frames. */
    text(text: string, key?: string): void;
    /** Answered with pong. */
    ping(): void;
    /** First frame: the connection's settings. */
    onSession(callback: (message: SessionServerMessage) => void): () => void;
    /** The user started speaking (vad mode) or pressed to talk (ptt mode). */
    onVadStart(callback: (message: VadStartServerMessage) => void): () => void;
    /** The utterance ended. */
    onVadEnd(callback: (message: VadEndServerMessage) => void): () => void;
    /** Text heard so far in the utterance. */
    onTranscriptPartial(callback: (message: TranscriptPartialServerMessage) => void): () => void;
    /** How the utterance ended: message_id when the Bot got it as a message, or one of no_speech, rejected and failed. */
    onTranscriptFinal(callback: (message: TranscriptFinalServerMessage) => void): () => void;
    /** Reply text so far, while the Bot's turn runs. */
    onReplyProvisional(callback: (message: ReplyProvisionalServerMessage) => void): () => void;
    /** Earlier provisional text of the turn is withdrawn from from_raw on. */
    onReplyInvalidate(callback: (message: ReplyInvalidateServerMessage) => void): () => void;
    /** The turn's final text and how much of it was spoken. The frame is at most 64 KiB: a longer text is cut and truncated is true; the whole text is in the Bot's log. */
    onReplyFinal(callback: (message: ReplyFinalServerMessage) => void): () => void;
    /** The final text differs from what was being spoken; the affected speech is stopped with output.stop, and a spoken notice points to the final text. */
    onReplyDiverged(callback: (message: ReplyDivergedServerMessage) => void): () => void;
    /** An output (a piece of speech) starts. Its audio normally follows in output.audio frames. When speech output is off (speech.limits.tts_chars 0), the speech budget is spent, or the speech service fails before any audio of the reply was sent, no audio follows: output.end with samples 0 comes next, then, for a reply, reply.final with spoken false (reason speech_limit or tts_failed). If a later segment fails or the speech budget runs out after earlier segments of the reply played, the reply ends with spoken partial and a reason from the speech service or budget (tts_failed, tts_cut, tts_incomplete or speech_limit; see reply.final). An announcement (kind announcement) never sends reply.final. When the speech service fails (tts_failed, tts_incomplete) it is reported with an error frame (code service_unavailable), once per code and reason per connection; an announcement stopped for speech_limit or silenced by speech off is not reported. */
    onOutputStart(callback: (message: OutputStartServerMessage) => void): () => void;
    /** All audio of the output was sent. */
    onOutputEnd(callback: (message: OutputEndServerMessage) => void): () => void;
    /** Every output up to upto_out stops: drop its unplayed audio. */
    onOutputStop(callback: (message: OutputStopServerMessage) => void): () => void;
    /** The answer to output.cancel. */
    onCancelResult(callback: (message: CancelResultServerMessage) => void): () => void;
    /** The answer to a text frame that carried a key. */
    onTextResult(callback: (message: TextResultServerMessage) => void): () => void;
    /** A delegate's gate is being announced; answer it on screen or by typing. The announcement is its own reply: its output.start frames carry reply_id and kind announcement. */
    onGateAnnounced(callback: (message: GateAnnouncedServerMessage) => void): () => void;
    /** The Bot itself waits on an approval or a question. */
    onOwnGatePending(callback: (message: OwnGatePendingServerMessage) => void): () => void;
    /** The result of your own_gate.decide or own_gate.answer; with outcome resolved, it is sent unprompted when the gate ended elsewhere. */
    onOwnGateResolved(callback: (message: OwnGateResolvedServerMessage) => void): () => void;
    /** The utterance was not taken: the agent had no room for it. transcript.final rejected busy follows. */
    onBusy(callback: (message: BusyServerMessage) => void): () => void;
    /** Another connection took over this Bot's voice; the connection closes with 1000. */
    onTakeover(callback: (message: TakeoverServerMessage) => void): () => void;
    /** The answer to ping. */
    onPong(callback: (message: PongServerMessage) => void): () => void;
    /** Only with refuse=frame, and then the only frame: the agent refused the connection. The connection closes next with 4000 plus the HTTP status the refusal has without refuse=frame. Nothing was taken over. */
    onRefusedMessage(callback: (message: RefusedServerMessage) => void): () => void;
    /** Binary frame: byte 0x00, a big-endian unsigned 32-bit sequence number (one more than the last), then 20 to 200 ms of audio in in_format at in_rate. A frame outside 20 to 200 ms closes the connection with 1008. A pcm16 frame of an odd byte length is not decoded: it counts as lost, so an utterance it falls in ends with transcript.final rejected frame_loss; the connection stays open. */
    sendInputAudio(seq: number, audio: ArrayBuffer | ArrayBufferView): void;
    /** Binary frame: byte 0x01, a big-endian unsigned 32-bit output number (out), a big-endian unsigned 32-bit sample offset into that output, then 16-bit little-endian PCM at out_rate. */
    onOutputAudio(callback: (frame: OutputAudioServerFrame) => void): () => void;
    /** A binary frame whose tag byte no declared frame uses, raw (forward compatibility). */
    onUnknownFrame(callback: (buf: Uint8Array) => void): () => void;
    /** Establish WebSocket connection */
    connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void>;
    /** Reconnect to WebSocket server */
    reconnect(): Promise<void>;
    /**
     * Turn automatic reconnection on or off on a LIVE client.
     *
     * Disabling also cancels any reconnect already scheduled, so a consumer
     * shutting down does not race a pending backoff timer. Re-enabling does
     * not itself reconnect — call connect()/reconnect() for that.
     */
    setAutoReconnect(enabled: boolean): void;
    /** Whether automatic reconnection is currently enabled */
    isAutoReconnect(): boolean;
    /** Disconnect from WebSocket server */
    disconnect(reason?: string): void;
    /** Called when WebSocket connection is established */
    onConnect(callback: () => void): () => void;
    /** Called when WebSocket connection is closed */
    onDisconnect(callback: (code: number, reason: string) => void): () => void;
    /** Called when reconnection attempt starts */
    onReconnectAttempt(callback: (attemptNumber: number) => void): () => void;
    /** Called when reconnection succeeds */
    onReconnect(callback: (attemptNumber: number) => void): () => void;
    /** Called when all reconnection attempts fail */
    onReconnectFailed(callback: () => void): () => void;
    /**
     * Called when WebSocket error occurs. A frame of type "error" the server
     * sent arrives here as a WebSocketServerError (name "WebSocketServerError",
     * with its `code` and the `frame`): the server refused one request, and
     * the connection stays open unless a close follows.
     */
    onError(callback: (error: Error) => void): () => void;
    /**
     * Called when the server closed the connection because another one took
     * its place (close 1000, reason "taken over"; a Bot's voice has one
     * controller). No automatic reconnect follows, even with
     * reconnectOnNormalClose: connect again (with takeover) only when the
     * user asks for it, or two always-connected clients take it from each
     * other forever. onDisconnect still runs first.
     */
    onTakenOver(callback: (reason: string) => void): () => void;
    /** Remove event listener(s) */
    off(event: string, callback?: Function): void;
    /** Remove all listeners for event or all events */
    removeAllListeners(event?: string): void;
    /** Close the WebSocket connection */
    close(code?: number, reason?: string): void;
    /** WebSocket ready state */
    getReadyState(): number;
    /** WebSocket URL */
    getUrl(): string;
    /** Whether currently connected */
    isConnected(): boolean;
    /** Whether currently attempting to reconnect */
    isReconnecting(): boolean;
    /**
     * Sequenced events, as the gateway publishes them.
     *
     * Separate from the per-type handlers because an envelope carries no
     * top-level `type` — the type is on `event`, one level down.
     */
    onEnvelope(callback: (envelope: IStreamEnvelope) => void): () => void;
    /** Every control frame: lagged, replay_boundary, end, refused. */
    onControlFrame(callback: (frame: IStreamControlFrame) => void): () => void;
    /** Dropped for slowness, or a resume cursor the ring cannot serve. */
    onLagged(callback: (frame: IStreamLaggedFrame) => void): () => void;
    /** The replay tail ended; everything after this frame is live. */
    onReplayBoundary(callback: (frame: IStreamReplayBoundaryFrame) => void): () => void;
    /** The stream is over. No reconnect follows — the session is gone. */
    onEnd(callback: (frame: IStreamEndFrame) => void): () => void;
    /** The gateway refused a frame this client sent (code, the frame type, reason). */
    onRefused(callback: (frame: IStreamRefusedFrame) => void): () => void;
    /**
     * Every envelope and control frame as one async iterable, in arrival
     * order, ending after the `end` frame.
     *
     * Frames that arrive while nothing is awaiting are queued, so a consumer
     * that starts iterating after connect() still sees the replay tail.
     */
    frames(): AsyncIterableIterator<IStreamFrame>;
    /** The last seq seen. Survives reconnects; this is the resume cursor. */
    getCursor(): number | undefined;
    /** The incarnation that stamped the cursor (`getCursor()`), when the gateway sends one. */
    getIncarnation(): string | undefined;
    /**
     * Seed the cursor before connecting — resume a stream this client did
     * not itself read. `undefined` clears it and replays from the ring.
     */
    setCursor(seq: number | undefined, incarnation?: string): void;
}
/**
 * A frame of type "error" the server sent: it refused one request, and the
 * connection stays open unless a close follows. onError receives it as this
 * Error, never as the bare frame, so `name` tells it from a transport failure.
 * `code` is the frame's code (or its `error.code` / `error.type`), else
 * "server_error"; `frame` is the frame as received.
 */
export interface WebSocketServerError extends Error {
    name: "WebSocketServerError";
    code: string;
    frame: Record<string, unknown>;
}
export declare class AgentBotsConnectVoiceWebSocket implements IAgentBotsConnectVoiceWebSocket {
    /**
     * The socket constructor every instance of this client uses, in place of
     * its own choice (the `ws` package on Node, the global WebSocket
     * elsewhere). It is called as `new ctor(url, protocols)`, like a browser
     * WebSocket, so headers are not passed. A webSocketFactory in the options
     * still wins. Unset (the default) restores the client's own choice.
     */
    static webSocketImpl: IRawWebSocketCtor | undefined;
    private ws;
    private eventHandlers;
    private options;
    private _url;
    private reconnectAttempts;
    private reconnectTimer;
    private _reconnecting;
    private shouldReconnect;
    private _urlSpent;
    private _livenessTimer;
    private _openAttempt;
    private _unopenedFailures;
    private _lastConnectUrl;
    private _lastSocketGlobal;
    private _upgradeReadAbort;
    private _retiredByDisconnect;
    private _frameQueue;
    private _dispatchAlive;
    private _socketGen;
    private _cursor;
    private _incarnation;
    private _firstIncarnation;
    private _frameBuffer;
    private _frameWaiters;
    private _streamEnded;
    constructor(url: string, options?: IWebSocketConnectionOptions);
    /**
     * Turns a resume point the caller put on the URL, in `options.query` or in
     * a Last-Event-ID header into the live cursor, and removes it from all
     * three. Left in place it went out on EVERY reconnect: the URL value beat
     * the live cursor, and the gateway reads Last-Event-ID before ?since=, so
     * each reconnect replayed from the original point. Only a whole-number
     * cursor is taken; any other value stays where the caller put it.
     */
    private takeResumeSeed;
    /**
     * Establish WebSocket connection.
     *
     * A second connect() (or reconnect()) made while this one is still
     * opening replaces it: this one then rejects with "WebSocket connect
     * superseded", and the new call owns the connection.
     */
    connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void>;
    /**
     * Open one socket. `isRetry` is true for an automatic reconnect attempt and
     * false for a connect the caller asked for.
     */
    private openSocket;
    private createRawSocket;
    /**
     * Manually trigger reconnection
     */
    reconnect(): Promise<void>;
    /**
     * Turn automatic reconnection on or off on a LIVE client.
     *
     * `reconnect` was construction-time only, so a consumer that wanted to
     * stop reconnecting had to tear the client down. Disabling here also
     * clears any scheduled attempt and drops the `reconnecting` flag, so no
     * backoff timer survives the switch. Enabling does not reconnect by
     * itself — it only re-arms the close handler for the NEXT drop.
     */
    setAutoReconnect(enabled: boolean): void;
    isAutoReconnect(): boolean;
    /**
     * Disconnect from server
     */
    disconnect(reason?: string): void;
    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect;
    /**
     * One plain GET to the URL the failing sockets used, to learn the status the
     * transport hid. Ends the series on 401, 403 or 404; otherwise the backoff
     * goes on. `attempt` is the open attempt that failed: a disconnect() or a
     * new connect() meanwhile makes the answer irrelevant.
     */
    private probeRefusal;
    /** Stop the liveness timer of the current socket. */
    private stopLiveness;
    /**
     * Clear reconnection timer
     */
    private clearReconnectTimer;
    /**
     * Handle an incoming TEXT frame (or a binary frame decoded as UTF-8).
     *
     * Three frame shapes, checked in this order:
     *
     *  1. A sequenced envelope `{seq, event}` — what a gateway that stamps a
     *     cursor publishes. It has NO top-level `type`, so the original
     *     `message.type` dispatch read undefined and dropped every frame on
     *     such a stream. The cursor is recorded, the envelope is published,
     *     and the INNER event is still offered to the per-type handlers so
     *     existing on<Type>() consumers keep working unchanged.
     *  2. A control frame — `lagged`, `replay_boundary`, `end`, `refused`.
     *  3. Anything else — the original dispatch on `message.type`.
     */
    private handleString;
    /** The per-type dispatch. */
    private dispatchTypedMessage;
    /** Normalise a gateway control frame and publish it. */
    private handleControlFrame;
    /**
     * Hand one frame to frames(): to a pending next(), or to the queue.
     *
     * Queueing matters — connect() resolves on open, and the gateway writes
     * its replay tail immediately, so a consumer that starts iterating after
     * connect() would otherwise miss everything replayed in between.
     */
    private pushStreamFrame;
    /** End frames() without an end frame: the socket is gone and none follows. */
    private endFrames;
    /**
     * Handle an incoming BINARY frame: its first byte is the tag of a declared
     * binary frame, whose header is decoded and handed to the handlers of
     * that frame. A binary frame is never parsed as JSON; text frames are.
     * A frame with an undeclared tag goes to onUnknownFrame.
     */
    private handleBinary;
    /**
     * Backwards-compat shim for any subclass that still calls handleMessage.
     * Delegates to handleString.
     */
    private handleMessage;
    /**
     * Send message to server
     */
    private send;
    /**
     * In vad mode (the agent detects when the user starts and stops speaking): end the utterance now, keeping its audio up to last_seq.
     * @param utt Message parameters
     */
    inputCommit(utt: number, last_seq: number): void;
    /**
     * In ptt mode (push to talk): the user pressed to talk. It stops any speech that is playing (barge-in).
     */
    pttDown(): void;
    /**
     * In ptt mode: the user released; the utterance holds its audio up to last_seq.
     * @param last_seq Message parameters
     */
    pttUp(last_seq: number): void;
    /**
     * Stop speech and cancel turns. With reply_id: that reply's output and its turn. Without: everything playing, and every turn this connection's messages started. With keep_turn true only speech stops: no turn is cancelled, later reply text is not spoken, and reply.final comes when the turn really ends, with spoken judged then against its whole text (true only when playback.mark confirmed all of it). Answered with cancel.result.
     * @param reply_id Message parameters
     */
    outputCancel(reply_id?: string, keep_turn?: boolean): void;
    /**
     * How far the client has played an output: send at least every 500 ms while playing, and once at its end. A mark past the audio sent closes the connection with 1008.
     * @param out Message parameters
     */
    playbackMark(out: number, played_to: number): void;
    /**
     * Decide an approval the Bot itself is waiting on (own_gate.pending kind confirm).
     * @param gate_id Message parameters
     */
    own_gateDecide(gate_id: string, generation: number, decision: 'approve' | 'deny' | 'allow_session', reason?: string): void;
    /**
     * Answer a question the Bot itself asked (own_gate.pending kind question).
     * @param gate_id Message parameters
     */
    own_gateAnswer(gate_id: string, generation: number, answer: string): void;
    /**
     * A typed message to the Bot. The whole frame, JSON envelope and escaping included, is at most 64 KiB; a longer frame closes the connection with code 1009. Its reply is spoken here, as for a spoken message; output.cancel stops that speech but leaves the turn running (cancel.result turn_continues). With key it is answered by one text.result instead of error frames.
     * @param text Message parameters
     */
    text(text: string, key?: string): void;
    /**
     * Answered with pong.
     */
    ping(): void;
    /**
     * First frame: the connection's settings.
     * @param callback Function to call when session message received
     * @returns Unsubscribe function
     */
    onSession(callback: (message: SessionServerMessage) => void): () => void;
    /**
     * The user started speaking (vad mode) or pressed to talk (ptt mode).
     * @param callback Function to call when vad.start message received
     * @returns Unsubscribe function
     */
    onVadStart(callback: (message: VadStartServerMessage) => void): () => void;
    /**
     * The utterance ended.
     * @param callback Function to call when vad.end message received
     * @returns Unsubscribe function
     */
    onVadEnd(callback: (message: VadEndServerMessage) => void): () => void;
    /**
     * Text heard so far in the utterance.
     * @param callback Function to call when transcript.partial message received
     * @returns Unsubscribe function
     */
    onTranscriptPartial(callback: (message: TranscriptPartialServerMessage) => void): () => void;
    /**
     * How the utterance ended: message_id when the Bot got it as a message, or one of no_speech, rejected and failed.
     * @param callback Function to call when transcript.final message received
     * @returns Unsubscribe function
     */
    onTranscriptFinal(callback: (message: TranscriptFinalServerMessage) => void): () => void;
    /**
     * Reply text so far, while the Bot's turn runs.
     * @param callback Function to call when reply.provisional message received
     * @returns Unsubscribe function
     */
    onReplyProvisional(callback: (message: ReplyProvisionalServerMessage) => void): () => void;
    /**
     * Earlier provisional text of the turn is withdrawn from from_raw on.
     * @param callback Function to call when reply.invalidate message received
     * @returns Unsubscribe function
     */
    onReplyInvalidate(callback: (message: ReplyInvalidateServerMessage) => void): () => void;
    /**
     * The turn's final text and how much of it was spoken. The frame is at most 64 KiB: a longer text is cut and truncated is true; the whole text is in the Bot's log.
     * @param callback Function to call when reply.final message received
     * @returns Unsubscribe function
     */
    onReplyFinal(callback: (message: ReplyFinalServerMessage) => void): () => void;
    /**
     * The final text differs from what was being spoken; the affected speech is stopped with output.stop, and a spoken notice points to the final text.
     * @param callback Function to call when reply.diverged message received
     * @returns Unsubscribe function
     */
    onReplyDiverged(callback: (message: ReplyDivergedServerMessage) => void): () => void;
    /**
     * An output (a piece of speech) starts. Its audio normally follows in output.audio frames. When speech output is off (speech.limits.tts_chars 0), the speech budget is spent, or the speech service fails before any audio of the reply was sent, no audio follows: output.end with samples 0 comes next, then, for a reply, reply.final with spoken false (reason speech_limit or tts_failed). If a later segment fails or the speech budget runs out after earlier segments of the reply played, the reply ends with spoken partial and a reason from the speech service or budget (tts_failed, tts_cut, tts_incomplete or speech_limit; see reply.final). An announcement (kind announcement) never sends reply.final. When the speech service fails (tts_failed, tts_incomplete) it is reported with an error frame (code service_unavailable), once per code and reason per connection; an announcement stopped for speech_limit or silenced by speech off is not reported.
     * @param callback Function to call when output.start message received
     * @returns Unsubscribe function
     */
    onOutputStart(callback: (message: OutputStartServerMessage) => void): () => void;
    /**
     * All audio of the output was sent.
     * @param callback Function to call when output.end message received
     * @returns Unsubscribe function
     */
    onOutputEnd(callback: (message: OutputEndServerMessage) => void): () => void;
    /**
     * Every output up to upto_out stops: drop its unplayed audio.
     * @param callback Function to call when output.stop message received
     * @returns Unsubscribe function
     */
    onOutputStop(callback: (message: OutputStopServerMessage) => void): () => void;
    /**
     * The answer to output.cancel.
     * @param callback Function to call when cancel.result message received
     * @returns Unsubscribe function
     */
    onCancelResult(callback: (message: CancelResultServerMessage) => void): () => void;
    /**
     * The answer to a text frame that carried a key.
     * @param callback Function to call when text.result message received
     * @returns Unsubscribe function
     */
    onTextResult(callback: (message: TextResultServerMessage) => void): () => void;
    /**
     * A delegate's gate is being announced; answer it on screen or by typing. The announcement is its own reply: its output.start frames carry reply_id and kind announcement.
     * @param callback Function to call when gate.announced message received
     * @returns Unsubscribe function
     */
    onGateAnnounced(callback: (message: GateAnnouncedServerMessage) => void): () => void;
    /**
     * The Bot itself waits on an approval or a question.
     * @param callback Function to call when own_gate.pending message received
     * @returns Unsubscribe function
     */
    onOwnGatePending(callback: (message: OwnGatePendingServerMessage) => void): () => void;
    /**
     * The result of your own_gate.decide or own_gate.answer; with outcome resolved, it is sent unprompted when the gate ended elsewhere.
     * @param callback Function to call when own_gate.resolved message received
     * @returns Unsubscribe function
     */
    onOwnGateResolved(callback: (message: OwnGateResolvedServerMessage) => void): () => void;
    /**
     * The utterance was not taken: the agent had no room for it. transcript.final rejected busy follows.
     * @param callback Function to call when busy message received
     * @returns Unsubscribe function
     */
    onBusy(callback: (message: BusyServerMessage) => void): () => void;
    /**
     * Another connection took over this Bot's voice; the connection closes with 1000.
     * @param callback Function to call when takeover message received
     * @returns Unsubscribe function
     */
    onTakeover(callback: (message: TakeoverServerMessage) => void): () => void;
    /**
     * The answer to ping.
     * @param callback Function to call when pong message received
     * @returns Unsubscribe function
     */
    onPong(callback: (message: PongServerMessage) => void): () => void;
    /**
     * Only with refuse=frame, and then the only frame: the agent refused the connection. The connection closes next with 4000 plus the HTTP status the refusal has without refuse=frame. Nothing was taken over.
     * @param callback Function to call when refused message received
     * @returns Unsubscribe function
     */
    onRefusedMessage(callback: (message: RefusedServerMessage) => void): () => void;
    /**
     * Binary frame: byte 0x00, a big-endian unsigned 32-bit sequence number (one more than the last), then 20 to 200 ms of audio in in_format at in_rate. A frame outside 20 to 200 ms closes the connection with 1008. A pcm16 frame of an odd byte length is not decoded: it counts as lost, so an utterance it falls in ends with transcript.final rejected frame_loss; the connection stays open.
     * @param seq The sequence number: one more than the last input frame's.
     * @param audio 20 to 200 ms of audio in in_format at in_rate.
     */
    sendInputAudio(seq: number, audio: ArrayBuffer | ArrayBufferView): void;
    /**
     * Binary frame: byte 0x01, a big-endian unsigned 32-bit output number (out), a big-endian unsigned 32-bit sample offset into that output, then 16-bit little-endian PCM at out_rate.
     * @param callback Called with each decoded output.audio frame
     * @returns Unsubscribe function
     */
    onOutputAudio(callback: (frame: OutputAudioServerFrame) => void): () => void;
    /**
     * A binary frame whose tag byte no declared frame uses, raw. Such a frame is
     * never JSON-parsed and nothing else receives it (forward compatibility).
     */
    onUnknownFrame(callback: (buf: Uint8Array) => void): () => void;
    onConnect(callback: () => void): () => void;
    onDisconnect(callback: (code: number, reason: string) => void): () => void;
    onReconnectAttempt(callback: (attemptNumber: number) => void): () => void;
    onReconnect(callback: (attemptNumber: number) => void): () => void;
    onReconnectFailed(callback: () => void): () => void;
    onError(callback: (error: Error) => void): () => void;
    onTakenOver(callback: (reason: string) => void): () => void;
    /**
     * Add event listener
     * @returns Unsubscribe function
     */
    private addEventListener;
    /**
     * Remove event listener(s)
     */
    off(event: string, callback?: Function): void;
    /**
     * Remove all listeners
     */
    removeAllListeners(event?: string): void;
    /**
     * Emit event to all registered handlers
     */
    private emitEvent;
    close(code?: number, reason?: string): void;
    getReadyState(): number;
    getUrl(): string;
    /**
     * The socket of the current connection, or null when there is none. It is
     * replaced on every reconnect, so read it again after each `connect`
     * event instead of keeping it. For code that needs what the transport
     * offers beyond this client (the `ws` package: ping(), the ping and pong
     * events); do not assign its on* handlers, the client owns them.
     */
    getRawSocket(): IRawWebSocketLike | null;
    isConnected(): boolean;
    isReconnecting(): boolean;
    onEnvelope(callback: (envelope: IStreamEnvelope) => void): () => void;
    onControlFrame(callback: (frame: IStreamControlFrame) => void): () => void;
    onLagged(callback: (frame: IStreamLaggedFrame) => void): () => void;
    onReplayBoundary(callback: (frame: IStreamReplayBoundaryFrame) => void): () => void;
    onEnd(callback: (frame: IStreamEndFrame) => void): () => void;
    onRefused(callback: (frame: IStreamRefusedFrame) => void): () => void;
    /**
     * Every frame as one async iterable. SINGLE consumer: frames are handed
     * out once, so two concurrent iterators would split the stream between
     * them. Use onEnvelope()/onControlFrame() for fan-out.
     */
    frames(): AsyncIterableIterator<IStreamFrame>;
    getCursor(): number | undefined;
    getIncarnation(): string | undefined;
    setCursor(seq: number | undefined, incarnation?: string): void;
}

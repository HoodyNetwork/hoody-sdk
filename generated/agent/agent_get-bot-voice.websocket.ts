/**
 * WebSocket client for Talk to a Bot by voice (WebSocket).
 * 
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent GET /api/v1/agent/bots/{id}/voice WebSocket v1.0.0
 */

import type { WebSocketUpgradeRefusedError, WebSocketUpgradeFailedError } from "../../lib/websocket-errors.js";
export type { WebSocketUpgradeRefusedError } from "../../lib/websocket-errors.js";

/** Minimal structural contract a WebSocket implementation must satisfy. */
export type IRawWebSocketMessageEvent = { data: string | ArrayBuffer | ArrayBufferView | Blob };
export type IRawWebSocketCloseEvent = { code: number; reason: string };

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
export type WebSocketFactory = (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> },
) => IRawWebSocketLike | Promise<IRawWebSocketLike>;

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
  gate?: { id: string; generation: number; type: string };
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

export type IStreamControlFrame =
  | IStreamLaggedFrame
  | IStreamReplayBoundaryFrame
  | IStreamEndFrame
  | IStreamRefusedFrame;

/** Everything the stream yields, discriminated on `kind`. */
export type IStreamFrame<TEvent = unknown> =
  | IStreamEnvelope<TEvent>
  | IStreamControlFrame;

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
  urlProvider?: (context: { previousUrl: string; attempt: number; reconnect: boolean }) => string | Promise<string>;
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

// ============================================================================
// Client → Server Messages
// ============================================================================

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

// ============================================================================
// Server → Client Messages
// ============================================================================

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
  error?: { code: string; reason?: string; message: string; diag_id?: string; retryable: boolean; retry_after_secs?: number };
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
  error?: { code: string; reason?: string; message: string; diag_id?: string; retryable: boolean; retry_after_secs?: number };
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
  error?: { code: string; reason?: string; message: string; diag_id?: string; retryable: boolean; retry_after_secs?: number };
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
  // ============================================================================
  // Send Messages (Client → Server)
  // ============================================================================

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

  // ============================================================================
  // Receive Messages (Server → Client)
  // ============================================================================

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

  // ============================================================================
  // Binary frames (a tag byte, fixed header fields, then bytes)
  // ============================================================================

  /** Binary frame: byte 0x00, a big-endian unsigned 32-bit sequence number (one more than the last), then 20 to 200 ms of audio in in_format at in_rate. A frame outside 20 to 200 ms closes the connection with 1008. A pcm16 frame of an odd byte length is not decoded: it counts as lost, so an utterance it falls in ends with transcript.final rejected frame_loss; the connection stays open. */
  sendInputAudio(seq: number, audio: ArrayBuffer | ArrayBufferView): void;

  /** Binary frame: byte 0x01, a big-endian unsigned 32-bit output number (out), a big-endian unsigned 32-bit sample offset into that output, then 16-bit little-endian PCM at out_rate. */
  onOutputAudio(callback: (frame: OutputAudioServerFrame) => void): () => void;

  /** A binary frame whose tag byte no declared frame uses, raw (forward compatibility). */
  onUnknownFrame(callback: (buf: Uint8Array) => void): () => void;

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

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

  // ============================================================================
  // Gateway stream (sequenced envelopes + control frames)
  // ============================================================================

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

/** A credential passed for this socket cannot be sent by a browser WebSocket; connect() rejects with it. */
function credentialNotSentError(headers: string[]): Error {
  return Object.assign(
    new Error(`WebSocket credential not sent: a browser WebSocket cannot send ${headers.join(", ")}. Pass a token group read from a query parameter, or use a cookie on the kit host.`),
    { name: "WebSocketCredentialNotSentError", code: "WS_CREDENTIAL_NOT_SENT", headers },
  );
}

const RAW_WEBSOCKET_OPEN = 1;
const RAW_WEBSOCKET_CLOSED = 3;

function upgradeRefusedError(status: number, code: string | undefined, via: "upgrade" | "probe", cause?: unknown): WebSocketUpgradeRefusedError {
  const error = new Error(`WebSocket upgrade refused: HTTP ${status}`) as WebSocketUpgradeRefusedError;
  error.name = "WebSocketUpgradeRefusedError";
  error.status = status;
  error.code = code ?? `HTTP_${status}`;
  error.via = via;
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

/** Bytes of a refused upgrade's body read for its error; the rest is dropped. */
const UPGRADE_BODY_CAP = 16384;
/** Longest wait for that body, inside the connect timeout. */
const UPGRADE_BODY_DEADLINE_MS = 2000;

/**
 * The error for an upgrade answered with `status` instead of 101. `body` is
 * the response text when it was read completely (never when cut at the cap
 * or by a deadline); only a JSON object naming a string `code` (at the top,
 * or under `error`) adds the server's code, message and details.
 */
function upgradeResponseError(status: number, headers: Record<string, unknown>, body: string | undefined): WebSocketUpgradeRefusedError | WebSocketUpgradeFailedError {
  let envelope: Record<string, unknown> | undefined;
  if (body !== undefined) {
    try {
      const parsed: unknown = JSON.parse(body);
      const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
      if (isObject(parsed)) {
        if (typeof parsed.code === "string") envelope = parsed;
        else if (isObject(parsed.error) && typeof parsed.error.code === "string") envelope = parsed.error;
      }
    } catch { /* not JSON: the status alone */ }
  }
  const code = envelope ? envelope.code as string : undefined;
  const serverMessage = envelope && typeof envelope.message === "string" && envelope.message !== "" ? envelope.message : undefined;
  const details = envelope && envelope.details !== null && typeof envelope.details === "object" && !Array.isArray(envelope.details)
    ? envelope.details as Record<string, unknown>
    : undefined;
  let retryAfterSecs: number | undefined;
  const fromDetails = details?.retry_after_secs;
  const header = headers["retry-after"];
  if (typeof fromDetails === "number" && Number.isFinite(fromDetails) && fromDetails >= 0) retryAfterSecs = fromDetails;
  else if (typeof header === "string" && /^\d+$/.test(header.trim())) retryAfterSecs = Number(header.trim());
  if (status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429) {
    const refused = upgradeRefusedError(status, code, "upgrade");
    if (serverMessage !== undefined) refused.serverMessage = serverMessage;
    if (details !== undefined) refused.details = details;
    if (retryAfterSecs !== undefined) refused.retryAfterSecs = retryAfterSecs;
    return refused;
  }
  const failed = new Error(serverMessage ?? "WebSocket connection error") as WebSocketUpgradeFailedError;
  failed.name = "WebSocketUpgradeFailedError";
  failed.status = status;
  if (code !== undefined) failed.code = code;
  if (serverMessage !== undefined) failed.serverMessage = serverMessage;
  if (details !== undefined) failed.details = details;
  if (retryAfterSecs !== undefined) failed.retryAfterSecs = retryAfterSecs;
  failed.via = "upgrade";
  return failed;
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

function serverFrameError(frame: Record<string, unknown>): WebSocketServerError {
  const nested = frame.error !== null && typeof frame.error === "object" ? frame.error as Record<string, unknown> : {};
  const text = (...values: unknown[]): string | undefined => values.find((v): v is string => typeof v === "string" && v !== "");
  const code = text(frame.code, nested.code, nested.type) ?? "server_error";
  const error = new Error(text(frame.message, nested.message) ?? `server error: ${code}`) as WebSocketServerError;
  error.name = "WebSocketServerError";
  error.code = code;
  error.frame = frame;
  return error;
}

/**
 * Close a socket nobody will use. The `ws` package reports closing a socket
 * that is still connecting as an `error` event, a tick later; with no
 * listener that event is thrown and ends a Node process. So the handlers are
 * replaced first: errors swallowed, nothing else delivered.
 */
function discardSocket(socket: IRawWebSocketLike): void {
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = () => { /* discarded */ };
  try { socket.close(); } catch { /* already closed */ }
}


/**
 * True when the built-in WebSocket of this Node must not be constructed:
 * its bundled undici cannot be shown to carry the CVE-2026-12151 fix. The
 * client then opens its socket with the `ws` package instead.
 */
const nodeBuiltinWebSocketUnsafe =
// <node-builtin-ws-unsafe>
(v: Record<string, string | undefined> | undefined): boolean => {
  if (!v?.node || v.bun || v.deno) return false;      // not Node: browser/worker/Bun/Deno keep their own
  const m = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.exec(v.undici ?? "");  // canonical, no leading 0, finite
  if (!m) return true;                                  // absent (shared/distro undici) or not a canonical release → ws
  const [a, b, c] = [+m[1]!, +m[2]!, +m[3]!];
  const ge = (x: number, y: number, z: number) => a !== x ? a > x : b !== y ? b > y : c >= z;
  if (a === 6) return !ge(6, 27, 0);
  if (a === 7) return !ge(7, 28, 0);
  if (a === 8) return !ge(8, 5, 0);
  return a < 6;                                         // ≥ 9: ASSUMED fixed (a later major carries the fix)
}
// </node-builtin-ws-unsafe>
;

export class AgentBotsConnectVoiceWebSocket implements IAgentBotsConnectVoiceWebSocket {
  /**
   * The socket constructor every instance of this client uses, in place of
   * its own choice (the `ws` package on Node, the global WebSocket
   * elsewhere). It is called as `new ctor(url, protocols)`, like a browser
   * WebSocket, so headers are not passed. A webSocketFactory in the options
   * still wins. Unset (the default) restores the client's own choice.
   */
  static webSocketImpl: IRawWebSocketCtor | undefined = undefined;

  private ws: IRawWebSocketLike | null = null;
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private options: IWebSocketConnectionOptions;
  private _url: string;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnecting = false;
  private shouldReconnect = true;
  // The URL has been handed to a socket once; with a urlProvider the next
  // open asks it for a new one.
  private _urlSpent = false;
  // Liveness timer of the CURRENT socket (see idleTimeoutMs).
  private _livenessTimer: ReturnType<typeof setInterval> | null = null;
  // Token of the open attempt in flight. Each openSocket() takes a new one
  // and disconnect() retires it, so an attempt still awaiting its URL or its
  // socket can tell it was abandoned and must install nothing.
  private _openAttempt = 0;
  // Automatic attempts in a row that never opened (see refusalProbeAfter),
  // and the URL the last socket was opened with, for the probe.
  private _unopenedFailures = 0;
  private _lastConnectUrl: string | undefined = undefined;
  // The last socket created is the global WebSocket (no HTTP status of a
  // refused upgrade can be read from it).
  private _lastSocketGlobal = false;
  // Ends the body read of a refused upgrade still in progress; disconnect()
  // calls it so the attempt settles at once.
  private _upgradeReadAbort: (() => void) | null = null;
  // The open attempt disconnect() retired (0: none since the last openSocket).
  // Only that attempt still reports a refused upgrade; an attempt another
  // connect superseded settles silently even if a disconnect follows.
  private _retiredByDisconnect = 0;
  // FIFO queue for message dispatch — preserves frame ordering even when
  // a Blob frame requires async arrayBuffer() decode and a later string/
  // ArrayBuffer frame arrives synchronously.
  private _frameQueue: Promise<void> = Promise.resolve();
  // Dispatch token for the CURRENT socket. Invalidated on manual
  // disconnect() and on the onclose settle-timeout, so a late frame
  // (hung Blob decode) can never dispatch after `disconnect` was
  // announced. Deliberately separate from _socketGen: bumping the
  // generation in disconnect() would make the gen-guarded onclose
  // suppress the manual-disconnect event itself.
  private _dispatchAlive: { alive: boolean } = { alive: true };
  // Generation counter. Bumped synchronously in connect()/reconnect()/
  // disconnect() so queued tasks tagged with an old generation become
  // no-ops if the socket has been swapped out — prevents stale-Blob
  // microtasks from dispatching into a new socket\u2019s handlers.
  private _socketGen = 0;
  // Resume cursor. Updated from every sequenced envelope and deliberately
  // NOT cleared by disconnect()/reconnect(): surviving the drop is the
  // whole point — it is what the next connect sends as ?since=.
  private _cursor: number | undefined = undefined;
  private _incarnation: string | undefined = undefined;
  // An incarnation the caller gave WITHOUT a cursor: sent on the next
  // connect only, never on the reconnects after it.
  private _firstIncarnation: string | undefined = undefined;
  // Frames buffered for frames(); drained by whoever awaits next().
  private _frameBuffer: IStreamFrame[] = [];
  private _frameWaiters: Array<(result: IteratorResult<IStreamFrame>) => void> = [];
  private _streamEnded = false;

  constructor(url: string, options?: IWebSocketConnectionOptions) {
    this._url = url;
    this.options = {
      timeout: 30000,
      reconnect: true,
      reconnectAttempts: Infinity,
      reconnectDelay: 1000,
      reconnectDelayMax: 30000,
      reconnectionDelayGrowFactor: 1.5,
      randomizationFactor: 0.5,
      autoConnect: false,
      protocols: ["hoody.voice.v1"],
      ...options
    };
    this.takeResumeSeed();

    if (this.options.autoConnect) {
      void this.connect().catch((error) => {
        const connectionError = error instanceof Error ? error : new Error(String(error));
        this.emitEvent("error", connectionError);
      });
    }
  }

  /**
   * Turns a resume point the caller put on the URL, in `options.query` or in
   * a Last-Event-ID header into the live cursor, and removes it from all
   * three. Left in place it went out on EVERY reconnect: the URL value beat
   * the live cursor, and the gateway reads Last-Event-ID before ?since=, so
   * each reconnect replayed from the original point. Only a whole-number
   * cursor is taken; any other value stays where the caller put it.
   */
  private takeResumeSeed(): void {
    const resume = this.options.streamResume;
    if (resume?.enabled === false) return;
    const sinceParam = resume?.param ?? "since";
    const incarnationParam = resume?.incarnationParam ?? "incarnation";
    const isSeq = (v: string | null | undefined): v is string => typeof v === "string" && /^\d+$/.test(v.trim());
    let since: string | undefined;
    let incarnation: string | undefined;
    let urlObj: URL | undefined;
    try {
      urlObj = new URL(this._url);
    } catch {
      urlObj = undefined;
    }
    // Same precedence as the connect URL and the gateway: URL, then
    // options.query (which overwrites the URL), then Last-Event-ID.
    const urlSince = urlObj?.searchParams.get(sinceParam);
    if (isSeq(urlSince)) {
      since = urlSince;
      urlObj!.searchParams.delete(sinceParam);
    }
    const query = this.options.query ? { ...this.options.query } : undefined;
    if (query && isSeq(query[sinceParam])) {
      since = query[sinceParam];
      delete query[sinceParam];
    }
    const headers = this.options.headers ? { ...this.options.headers } : undefined;
    let droppedHeader = false;
    for (const name of Object.keys(headers ?? {})) {
      if (name.toLowerCase() === "last-event-id") {
        // Never a lasting header: the gateway reads it before ?since= on every
        // reconnect. A whole number seeds the cursor; anything else is dropped.
        if (isSeq(headers![name])) since = headers![name];
        delete headers![name];
        droppedHeader = true;
      }
    }
    // The incarnation goes with the resume point; it is moved even without
    // one, so it is sent once instead of on every reconnect.
    const urlIncarnation = urlObj?.searchParams.get(incarnationParam);
    if (urlIncarnation) {
      incarnation = urlIncarnation;
      urlObj!.searchParams.delete(incarnationParam);
    }
    if (query && query[incarnationParam]) {
      incarnation = query[incarnationParam];
      delete query[incarnationParam];
    }
    if (since === undefined && incarnation === undefined && !droppedHeader) return;
    if (urlObj) this._url = urlObj.toString();
    this.options = {
      ...this.options,
      ...(query ? { query } : {}),
      ...(headers ? { headers } : {}),
    };
    if (since !== undefined) {
      // A fresh resume point replaces the whole cursor, incarnation included.
      this._cursor = Number(since.trim());
      this._incarnation = incarnation;
      this._firstIncarnation = undefined;
    } else if (incarnation !== undefined) {
      this._firstIncarnation = incarnation;
    }
  }

  /**
   * Establish WebSocket connection.
   *
   * A second connect() (or reconnect()) made while this one is still
   * opening replaces it: this one then rejects with "WebSocket connect
   * superseded", and the new call owns the connection.
   */
  async connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void> {
    if (options) {
      // MERGE, never replace. A shallow spread overwrote the whole header
      // map, so connect({ headers: { Authorization } }) silently dropped
      // every header the constructor set (claim headers, realm pin,
      // user-agent) and the socket opened unauthenticated-looking. Same
      // for query and auth: a caller adding one key keeps the rest. And for
      // streamResume: the service method presets the cursor parameter and
      // field, and connect({ streamResume: { enabled: true } }) replaced the
      // whole preset, so the cursor never moved and every reconnect replayed
      // the stream from the top.
      this.options = {
        ...this.options,
        ...options,
        ...(options.headers ? { headers: { ...(this.options.headers ?? {}), ...options.headers } } : {}),
        ...(options.query ? { query: { ...(this.options.query ?? {}), ...options.query } } : {}),
        ...(options.auth ? { auth: { ...(this.options.auth ?? {}), ...options.auth } } : {}),
        ...(options.streamResume ? { streamResume: { ...(this.options.streamResume ?? {}), ...options.streamResume } } : {}),
      };
      // A resume point passed here seeds the cursor, like one given to the constructor.
      this.takeResumeSeed();
    }

    this.shouldReconnect = true;
    // A connect the caller asked for starts a new backoff series, and a retry
    // still pending from an earlier one must not open a second socket.
    this.reconnectAttempts = 0;
    this._reconnecting = false;
    this.clearReconnectTimer();
    // A new connect() starts a new stream for frames().
    this._streamEnded = false;
    return this.openSocket(false).catch((error: unknown) => {
      // Rejected to the caller and nothing retries it: frames() ends.
      if (!this._reconnecting) this.endFrames();
      throw error;
    });
  }

  /**
   * Open one socket. `isRetry` is true for an automatic reconnect attempt and
   * false for a connect the caller asked for.
   */
  private openSocket(isRetry: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      // This attempt's token. connect(), reconnect(), the next automatic
      // attempt and disconnect() all retire it; everything below re-checks it
      // after each await, because the caller may have disconnected and
      // connected again while this attempt was still waiting.
      const attempt = ++this._openAttempt;
      this._retiredByDisconnect = 0;
      // An older attempt still reading a refused upgrade's body is superseded
      // now: it settles at once, silently.
      const olderRead = this._upgradeReadAbort;
      this._upgradeReadAbort = null;
      olderRead?.();
      const superseded = (): boolean => attempt !== this._openAttempt;
      let timedOut = false;
      // The socket this attempt installed, once it has one.
      let installed: IRawWebSocketLike | null = null;
      // Settles a refused upgrade whose body is being read (see the
      // unexpected-response handler below); set only during that read.
      let settleUpgrade: (() => void) | null = null;
      const deadlineAt = Date.now() + (this.options.timeout ?? 30000);
      const timeoutId = setTimeout(() => {
        timedOut = true;
        // The server already answered the upgrade: report that answer (from
        // what was read so far) instead of a bare timeout.
        if (settleUpgrade) {
          settleUpgrade();
          return;
        }
        reject(new Error(`Connection timeout after ${this.options.timeout}ms`));
        if (superseded()) return;
        if (installed) {
          installed.close();
          return;
        }
        // Still waiting for the URL or for the socket itself: nothing is
        // installed, so no close event will schedule the next attempt. Whatever
        // arrives later is closed and dropped (see the checks below).
        if (isRetry && this.shouldReconnect && this.options.reconnect) this.scheduleReconnect();
      }, this.options.timeout);
      // True when this attempt must stop: it timed out, or it was retired.
      const abandoned = (): boolean => {
        if (!timedOut && !superseded()) return false;
        clearTimeout(timeoutId);
        // A no-op after a timeout, which has already answered.
        reject(new Error("WebSocket connect abandoned: the client was disconnected or connected again"));
        return true;
      };

      void (async () => {
        try {
          // With a urlProvider a URL is good for ONE socket: the first open uses
          // the URL the client was built with, every later one asks the provider.
          const urlProvider = this.options.urlProvider;
          if (urlProvider && this._urlSpent) {
            let nextUrl: string;
            try {
              nextUrl = await urlProvider({ previousUrl: this._url, attempt: this.reconnectAttempts, reconnect: isRetry });
              if (typeof nextUrl !== "string" || nextUrl.length === 0) {
                throw new Error("no URL returned");
              }
            } catch (cause) {
              if (abandoned()) return;
              clearTimeout(timeoutId);
              const error = Object.assign(
                new Error("WebSocket urlProvider failed: " + (cause instanceof Error ? cause.message : String(cause))),
                { cause },
              );
              this.emitEvent("error", error);
              reject(error);
              if (isRetry && this.shouldReconnect && this.options.reconnect) this.scheduleReconnect();
              return;
            }
            if (abandoned()) return;
            this._url = nextUrl;
          }
          this._urlSpent = true;
          let created: IRawWebSocketLike;
          try {
            created = await this.createRawSocket();
          } catch (error) {
            // An abandoned attempt reports nothing and ends no series.
            if (abandoned()) return;
            throw error;
          }
          if (abandoned()) {
            // The socket arrived too late (a slow factory, or a slow `ws`
            // import): the connect() was already rejected, or a replacement
            // connection exists. Close it and install nothing.
            discardSocket(created);
            return;
          }
          this.ws = created;
          installed = created;
          const socket = created;

          // Generation bump + capture happens synchronously, BEFORE
          // onmessage is installed. Each socket\u2019s handlers close over
          // their own installedGen — when disconnect()/reconnect() bumps
          // the counter, queued tasks from this socket compare against
          // their captured value and bail.
          this._socketGen++;
          const installedGen = this._socketGen;
          // Socket-local dispatch: a fresh frame queue (a hung decode on
          // the OLD socket must not head-of-line-block this one) and a
          // fresh dispatch token.
          this._frameQueue = Promise.resolve();
          const dispatchAlive = { alive: true };
          this._dispatchAlive = dispatchAlive;
          // State of THIS socket only. A replacement socket starts clean, so a
          // stale error can never stop the reconnects of a later one.
          let opened = false;
          let openedAt = 0;
          let closeHandled = false;
          let lastActivity = Date.now();
          // Set when this socket ended for a reason a reconnect cannot cure: a
          // local resource cap, or an upgrade the server refused for good.
          let finalError: Error | undefined;
          // Set once the server answered the upgrade with an HTTP status: from
          // then on the attempt settles from that answer only, and every native
          // error/close of this socket is dropped (`ws` emits them after
          // terminate(), Bun's built-in `ws` a close 1002 of its own).
          let upgradeHeld = false;
          this.stopLiveness();


          // Request binary frames as ArrayBuffer rather than Blob.
          // Browser default is "blob" which would force every binary frame
          // through an async decode path. ArrayBuffer is synchronous.
          if (this.ws) {
            try { this.ws.binaryType = "arraybuffer"; } catch { /* not supported on this runtime */ }
          }

          this.ws.onopen = () => {
            clearTimeout(timeoutId);
            // A socket that was superseded before it opened (its connect() timed
            // out and the caller connected again) must not touch the client: it
            // would announce a connection nobody holds and take over the liveness
            // timer of the current socket. It only closes itself.
            if (this._socketGen !== installedGen || this.ws !== socket) {
              closeHandled = true;
              discardSocket(socket);
              // Its connect() is settled here: the timeout that would have
              // answered it was just cleared.
              reject(new Error("WebSocket connect superseded: a newer connect() replaced this attempt"));
              return;
            }
            // The backoff is NOT reset here. A server that accepts and then
            // closes (a connection limit, a deleted resource) would otherwise be
            // retried at the first delay forever; the close handler resets it
            // once a connection has lasted reconnectStableMs.
            opened = true;
            this._unopenedFailures = 0;
            openedAt = Date.now();
            lastActivity = openedAt;
            this._reconnecting = false;
            // The one-shot incarnation reached an open socket; reconnects use the live one.
            this._firstIncarnation = undefined;
            this.clearReconnectTimer();
            // Liveness. A link that dies without a FIN or RST (sleep, a network
            // handover, a NAT entry expiring) delivers no close event, so the
            // socket would stay "connected" with nothing arriving. When nothing
            // has been heard for idleMs the link is declared dead.
            const probe = socket as unknown as {
              ping?: () => void;
              on?: (event: string, listener: () => void) => void;
              terminate?: () => void;
            };
            const canProbe = typeof probe.ping === "function" && typeof probe.on === "function";
            const appPing = !canProbe;
            const configuredIdle = this.options.idleTimeoutMs;
            const idleMs = typeof configuredIdle === "number"
              ? (Number.isFinite(configuredIdle) && configuredIdle > 0 ? configuredIdle : 0)
              : (canProbe || appPing ? 75000 : 0);
            if (idleMs > 0) {
              if (canProbe) {
                // `ws` shows protocol pings and pongs; the client pings too, so
                // a quiet but healthy stream keeps answering.
                const touch = (): void => { lastActivity = Date.now(); };
                probe.on!("ping", touch);
                probe.on!("pong", touch);
              }
              const timer = setInterval(() => {
                if (closeHandled || this._socketGen !== installedGen) {
                  clearInterval(timer);
                  return;
                }
                if (Date.now() - lastActivity >= idleMs) {
                  clearInterval(timer);
                  // A dead link never completes a close handshake: drop the
                  // socket and report the close from here.
                  try {
                    if (typeof probe.terminate === "function") probe.terminate();
                    else socket.close();
                  } catch { /* already closed */ }
                  finishClose(1006, "liveness timeout");
                  return;
                }
                if (canProbe && socket.readyState === RAW_WEBSOCKET_OPEN) {
                  try { probe.ping!(); } catch { /* closing */ }
                } else if (appPing && socket.readyState === RAW_WEBSOCKET_OPEN) {
                  // The pong is a message, and every message counts as activity.
                  try { socket.send('{"type":"ping"}'); } catch { /* closing */ }
                }
              }, Math.max(50, Math.floor(idleMs / 3)));
              (timer as unknown as { unref?: () => void }).unref?.();
              this._livenessTimer = timer;
            }
            this.emitEvent("connect");
            resolve();
          };

          this.ws.onmessage = (event) => {
            const raw: unknown = (event as { data: unknown }).data;
            lastActivity = Date.now();
            // Every dispatch callback is exception-fenced: a throwing frame
            // handler would otherwise leave _frameQueue REJECTED, and since the
            // chain grows via .then(fn) every subsequent frame would be
            // silently dropped for the life of the socket.
            // Synchronous string fast path.
            if (typeof raw === "string") {
              this._frameQueue = this._frameQueue.then(() => {
                try {
                  if (this._socketGen === installedGen && dispatchAlive.alive) this.handleString(raw);
                } catch (err) {
                  this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                }
              });
              return;
            }
            // ArrayBuffer (preferred binary shape).
            if (raw instanceof ArrayBuffer) {
              const buf = new Uint8Array(raw);
              this._frameQueue = this._frameQueue.then(() => {
                try {
                  if (this._socketGen === installedGen && dispatchAlive.alive) this.handleBinary(buf);
                } catch (err) {
                  this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                }
              });
              return;
            }
            // ArrayBufferView covers Node Buffer + Uint8Array w/ non-zero offset.
            if (raw && typeof (raw as ArrayBufferView).byteLength === "number"
                && typeof (raw as ArrayBufferView).buffer !== "undefined") {
              const v = raw as ArrayBufferView;
              const buf = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
              this._frameQueue = this._frameQueue.then(() => {
                try {
                  if (this._socketGen === installedGen && dispatchAlive.alive) this.handleBinary(buf);
                } catch (err) {
                  this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                }
              });
              return;
            }
            // Blob fallback (older browsers / explicit binaryType="blob").
            // Kick off arrayBuffer() decode SYNCHRONOUSLY (so multiple Blob frames
            // decode in parallel) and only the dispatch is serialized through the
            // FIFO queue. This preserves frame ordering AND avoids decode head-of-
            // line blocking.
            if (typeof Blob !== "undefined" && raw instanceof Blob) {
              const decode = raw.arrayBuffer();
              this._frameQueue = this._frameQueue.then(async () => {
                try {
                  const ab = await decode;
                  if (this._socketGen === installedGen && dispatchAlive.alive) {
                    this.handleBinary(new Uint8Array(ab));
                  }
                } catch (err) {
                  this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
                }
              });
              return;
            }
            // Unknown shape — best-effort string coercion.
            this._frameQueue = this._frameQueue.then(() => {
              try {
                if (this._socketGen === installedGen && dispatchAlive.alive) this.handleString(String(raw));
              } catch (err) {
                this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
              }
            });
          };

          const finishClose = (code: number, reason: string): void => {
            // Once per socket: the liveness check reports a dead link itself,
            // and the transport's own close event may still follow.
            if (closeHandled) return;
            closeHandled = true;
            if (this._socketGen === installedGen) this.stopLiveness();
            // Frame-settle barrier. Received frames dispatch through the
            // _frameQueue microtask chain, so a close arriving in the same tick
            // as the final data frames (typical when the remote process exits:
            // last output + close land in one TCP batch) would otherwise emit
            // `disconnect` BEFORE those frames reach handlers — consumers that
            // tear down on disconnect (the CLI terminal bridge) would drop the
            // tail bytes. Settle the queue first (settle-proof: both branches
            // resolve; bounded so a hung Blob decode cannot wedge the close),
            // then announce. Generation-guarded: if a newer socket superseded
            // this one while we waited, its lifecycle owns the events.
            const settled = this._frameQueue.then(() => undefined, () => undefined);
            const cap = new Promise<void>((resolveCap) => {
              const t = setTimeout(resolveCap, 1000);
              (t as unknown as { unref?: () => void }).unref?.();
            });
            void Promise.race([settled, cap]).then(() => {
              // Whether the queue settled or the cap fired, no frame may
              // dispatch after the disconnect announcement below.
              dispatchAlive.alive = false;
              if (this._socketGen !== installedGen) return;
              // Another connection took this one's place on purpose (a Bot's voice
              // has one controller). Reconnecting would take it back, and two
              // clients that both reconnect trade it forever: final, whatever
              // reconnectOnNormalClose says. Not after the caller's own disconnect();
              // read before onDisconnect runs, which may call disconnect() itself.
              const takenOver = code === 1000 && reason === "taken over" && this.shouldReconnect;
              this.emitEvent("disconnect", code, reason);
              if (takenOver) this.emitEvent("__taken_over", reason);
              // The backoff starts over only after a connection that lasted.
              if (opened && Date.now() - openedAt >= (this.options.reconnectStableMs ?? 30000)) {
                this.reconnectAttempts = 0;
              }
              // Close-code filter. Do NOT reconnect on server-sent policy
              // closes — 4xxx codes mean "stop trying" (auth failed, permission
              // denied, bad request), and 1008/1003 are explicit policy rejections.
              // Reconnecting against these would loop forever against a server that
              // already told us to go away.
              //
              // A normal close (1000) from the server is final too, unless the
              // caller opted in: the server ended the stream on purpose, and a
              // reconnect to a deleted terminal session re-creates it.
              //
              // finalError: this socket hit a local resource cap, or the server
              // refused the upgrade for good. Both arrive as 1006, and neither
              // is cured by trying again.
              const isTerminal = code === 1008 || code === 1003 || code === 1002 || (code >= 4000 && code < 5000)
                || (code === 1000 && this.options.reconnectOnNormalClose !== true)
                || takenOver || finalError !== undefined;
              // A connect() the caller made that never opened was rejected to
              // the caller. It must not leave a reconnect loop running behind
              // that rejection; the caller decides whether to connect again.
              const rejectedToCaller = !opened && !isRetry;
              if (this.shouldReconnect && this.options.reconnect && !isTerminal && !rejectedToCaller) {
                // Repeated failures before open, on a transport that hides the
                // status: ask the server why before trying again.
                if (!opened) this._unopenedFailures++;
                const probeAfter = this.options.refusalProbeAfter ?? 3;
                if (!opened && probeAfter > 0 && this._unopenedFailures % probeAfter === 0 && !this.options.webSocketFactory) {
                  this._reconnecting = true;
                  void this.probeRefusal(attempt);
                } else {
                  this.scheduleReconnect();
                }
              } else {
                if (this._reconnecting) {
                  // A reconnect attempt that will not be followed by another.
                  this._reconnecting = false;
                  if (this.shouldReconnect && this.options.reconnect) this.emitEvent("reconnect_failed");
                }
                // No socket follows this one: frames() ends.
                this.endFrames();
              }
            });
          };

          this.ws.onclose = (event) => {
            if (upgradeHeld) return;
            finishClose(event.code, event.reason);
          };

          this.ws.onerror = (event) => {
            // Noise from a socket the liveness check already gave up on, or
            // from one whose refused upgrade settles the attempt itself.
            if (closeHandled || upgradeHeld) return;
            clearTimeout(timeoutId);
            // The transport's own error when it exposes one: `ws` does, a
            // browser socket and Node's built-in one do not.
            const cause: unknown = event instanceof Error ? event : (event as { error?: unknown } | null | undefined)?.error;
            const causeCode = (cause as { code?: unknown } | null | undefined)?.code;
            let error: Error;
            if (causeCode === "WS_ERR_TOO_MANY_BUFFERED_PARTS" || causeCode === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH" || causeCode === "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH") {
              // `ws` stopped reading because a local cap was hit (too many
              // fragments or buffered chunks, or a message over a size limit).
              error = new Error(`WebSocket closed by a local resource limit (${String(causeCode)}); automatic reconnect stopped`);
              finalError = error;
            } else {
              // `ws` reports a refused upgrade with the HTTP status in its message.
              const refused = opened || !(cause instanceof Error) ? null : /^Unexpected server response: (\d{3})$/.exec(cause.message);
              const status = refused ? Number(refused[1]) : 0;
              if (status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429) {
                // The server answered the upgrade with a client error (the
                // resource is gone, or the credential is refused). The same
                // request gets the same answer.
                error = upgradeRefusedError(status, undefined, "upgrade");
                finalError = error;
              } else {
                error = new Error("WebSocket connection error");
              }
            }
            if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
            this.emitEvent("error", error);
            reject(error);
          };

          // A refused upgrade on the `ws` transport (the npm package or Bun's
          // built-in one). With this listener `ws` neither aborts the request
          // nor emits error/close, so the client reads the answer, tears the
          // socket down and reports once: error event, rejection, disconnect
          // 1006, exactly what the native events gave before.
          const emitter = socket as unknown as {
            on?: (event: string, listener: (...args: any[]) => void) => void;
            terminate?: () => void;
          };
          if (!this._lastSocketGlobal && typeof emitter.on === "function") {
            emitter.on("unexpected-response", (_request: unknown, response: unknown) => {
              const res = (response ?? {}) as {
                statusCode?: number;
                headers?: Record<string, unknown>;
                on?: (event: string, listener: (...args: any[]) => void) => void;
                destroy?: () => void;
              };
              // Before anything else: no native event of this socket counts now.
              upgradeHeld = true;
              const tearDown = (): void => {
                try { res.destroy?.(); } catch { /* already gone */ }
                try { emitter.terminate?.(); } catch { /* already closed */ }
              };
              if (closeHandled) {
                tearDown();
                return;
              }
              const status = typeof res.statusCode === "number" ? res.statusCode : 0;
              const chunks: Uint8Array[] = [];
              let size = 0;
              let complete = false;
              let truncated = false;
              let settled = false;
              let bodyTimer: ReturnType<typeof setTimeout> | null = null;
              const settle = (): void => {
                if (settled) return;
                settled = true;
                settleUpgrade = null;
                if (this._upgradeReadAbort === settle) this._upgradeReadAbort = null;
                if (bodyTimer) clearTimeout(bodyTimer);
                tearDown();
                // Replaced by a newer connect(): that one owns the client. This
                // attempt ends silently, its own promise rejected without an event.
                if (superseded() && this._retiredByDisconnect !== attempt) {
                  closeHandled = true;
                  abandoned();
                  return;
                }
                let body: string | undefined;
                if (complete && !truncated) {
                  const all = new Uint8Array(size);
                  let at = 0;
                  for (const chunk of chunks) { all.set(chunk, at); at += chunk.length; }
                  body = new TextDecoder().decode(all);
                }
                const error = upgradeResponseError(status, res.headers ?? {}, body);
                if (error.name === "WebSocketUpgradeRefusedError") finalError = error;
                clearTimeout(timeoutId);
                this.emitEvent("error", error);
                // A no-op when the connect timeout already answered.
                reject(error);
                finishClose(1006, "");
              };
              if (superseded() || timedOut) {
                // Nothing will read this answer: settle without its body.
                settle();
                return;
              }
              settleUpgrade = settle;
              this._upgradeReadAbort = settle;
              const left = deadlineAt - Date.now();
              // Past the connect deadline the connect timer settles the read.
              if (left > UPGRADE_BODY_DEADLINE_MS) bodyTimer = setTimeout(settle, UPGRADE_BODY_DEADLINE_MS);
              if (typeof res.on !== "function") {
                settle();
                return;
              }
              res.on("data", (data: unknown) => {
                if (settled) return;
                const chunk = typeof data === "string" ? new TextEncoder().encode(data)
                  : data instanceof Uint8Array ? data
                  : data instanceof ArrayBuffer ? new Uint8Array(data)
                  : new Uint8Array(0);
                if (size + chunk.length > UPGRADE_BODY_CAP) {
                  truncated = true;
                  settle();
                  return;
                }
                chunks.push(chunk);
                size += chunk.length;
              });
              res.on("end", () => {
                // Bun's built-in `ws` ends the response with whatever had arrived
                // with the status line, so an end is a whole body only when it
                // matches a declared length.
                const declared = Number((res.headers ?? {})["content-length"]);
                if (!settled) complete = !(Number.isInteger(declared) && declared >= 0) || declared === size;
                settle();
              });
              for (const event of ["error", "aborted", "close"]) res.on(event, () => settle());
            });
          }
        } catch (error) {
          clearTimeout(timeoutId);
          if (isRetry) {
            // No socket was created, so no close event follows: report the
            // failure and end the series instead of leaving it silently stuck.
            this.emitEvent("error", error instanceof Error ? error : new Error(String(error)));
            this._reconnecting = false;
            this.emitEvent("reconnect_failed");
            this.endFrames();
          }
          reject(error);
        }
      })();
    });
  }

  private async createRawSocket(): Promise<IRawWebSocketLike> {
    // Assemble the connect URL: base URL + optional Socket.IO `path` + optional `query`.
    // Native WebSocket cannot take custom headers, so anything auth-like that the
    // caller supplied via `options.auth.token` is also folded into the query string.
    // This intentionally mirrors terminal-client.ts — the leakage tradeoff of URL-
    // embedded tokens is inherent to the browser WebSocket API.
    const buildConnectUrl = (): string => {
      try {
        const urlObj = new URL(this._url);
        if (this.options.path) {
          if (!urlObj.pathname || urlObj.pathname === "/" || urlObj.pathname === "") {
            urlObj.pathname = this.options.path;
          }
        }
        if (this.options.query) {
          for (const [k, v] of Object.entries(this.options.query)) {
            if (v !== undefined && v !== null) urlObj.searchParams.set(k, String(v));
          }
        }
        // Cursor-preserving resume. A resume point the caller gave is already
        // the cursor (takeResumeSeed), so the live cursor goes out on every
        // connect. Only a value that is not a cursor can already be here, and
        // that one is left as the caller set it.
        const __resume = this.options.streamResume;
        if (__resume?.enabled !== false) {
          const sinceParam = __resume?.param ?? "since";
          const incarnationParam = __resume?.incarnationParam ?? "incarnation";
          if (typeof this._cursor === "number") {
            if (!urlObj.searchParams.has(sinceParam)) {
              urlObj.searchParams.set(sinceParam, String(this._cursor));
            }
            if (this._incarnation !== undefined && !urlObj.searchParams.has(incarnationParam)) {
              urlObj.searchParams.set(incarnationParam, this._incarnation);
            }
          }
          // An incarnation given without a cursor rides every attempt until one
          // socket opens (cleared in onopen), so a failed first open keeps it.
          if (this._firstIncarnation !== undefined && !urlObj.searchParams.has(incarnationParam)) {
            urlObj.searchParams.set(incarnationParam, this._firstIncarnation);
          }
        }
        const auth = this.options.auth as { token?: unknown } | undefined;
        if (auth && typeof auth.token === "string" && auth.token.length > 0 && !urlObj.searchParams.has("token")) {
          urlObj.searchParams.set("token", auth.token);
        }
        return urlObj.toString();
      } catch {
        return this._url;
      }
    };
    const connectUrl = buildConnectUrl();
    this._lastConnectUrl = connectUrl;
    this._lastSocketGlobal = false;
    // socketTransport "ws": the `ws` package or nothing for the automatic
    // choice below. An injected factory or webSocketImpl still wins. Checked
    // before any socket exists, so an invalid value opens nothing.
    const forceWs = this.options.socketTransport === "ws";
    if (this.options.socketTransport !== undefined && this.options.socketTransport !== "auto" && !forceWs) {
      throw new Error(`socketTransport must be "auto" or "ws", got ${JSON.stringify(this.options.socketTransport)}`);
    }

    // Injected transport wins outright. No global-WebSocket probe, no `ws`
    // import, no degraded path: if the factory throws or returns something
    // unusable the connect fails loudly. A silent fallback here would send
    // traffic over a transport the caller did not choose — the exact failure
    // an injected socket exists to prevent.
    const factory = this.options.webSocketFactory;
    if (factory) {
      const wsOptions = this.options.headers && Object.keys(this.options.headers).length > 0
        ? { headers: this.options.headers }
        : undefined;
      const socket = await factory(connectUrl, this.options.protocols, wsOptions);
      if (!socket || typeof socket.send !== "function" || typeof socket.close !== "function") {
        throw new Error("webSocketFactory did not return a usable WebSocket");
      }
      return socket;
    }
    const impl = AgentBotsConnectVoiceWebSocket.webSocketImpl;
    if (typeof impl === "function") {
      // The injected constructor takes only a URL and protocols: a header credential the call
      // asked for cannot reach the upgrade on any runtime, so refuse it as a browser socket does.
      if (this.options.requireHeaderCredentials && this.options.requireHeaderCredentials.length > 0 && this.options.headers) {
        const wanted = this.options.requireHeaderCredentials.map((name) => name.toLowerCase());
        const refused = Object.keys(this.options.headers).filter((name) => wanted.includes(name.toLowerCase()));
        if (refused.length > 0) throw credentialNotSentError(refused);
      }
      return new impl(connectUrl, this.options.protocols);
    }

    // Runtime detection: on Node >=22 `globalThis.WebSocket` exists but cannot
    // accept custom headers. When the caller supplied `options.headers`, prefer
    // the `ws` module (which accepts a 3rd-arg options bag) so headers actually
    // reach the server. In a true browser environment the `ws` import is unavailable
    // and `globalThis.WebSocket` is the only option.
    const hasHeaders = this.options.headers && Object.keys(this.options.headers).length > 0;
    const isBrowserRuntime = typeof (globalThis as { window?: unknown }).window !== "undefined"
      && typeof (globalThis as { document?: unknown }).document !== "undefined";
    const globalCtor = (globalThis as { WebSocket?: IRawWebSocketCtor }).WebSocket;
    // CVE-2026-12151. On a Node whose bundled undici cannot be shown to be
    // patched, the built-in WebSocket is never constructed: every path below
    // that would have chosen it takes `ws` instead, and fails loudly when `ws`
    // cannot be loaded. This is decided BEFORE the browser test, because a Node
    // process with a jsdom-style window + document is still Node. Bun, Deno,
    // browsers and workers are not Node and keep their own socket.
    const runtime = (globalThis as { process?: { versions?: Record<string, string | undefined> } }).process;
    const runtimeVersions = runtime?.versions;
    const builtinUnsafe = nodeBuiltinWebSocketUnsafe(runtimeVersions);
    // Node itself (not Bun or Deno) opens with `ws` even without headers: its
    // built-in WebSocket hides protocol pings, so it could not tell a quiet
    // stream from a dead link (see idleTimeoutMs).
    const isNode = !!runtimeVersions?.node && !runtimeVersions.bun && !runtimeVersions.deno;
    const builtinRefused = (cause: unknown): Error => Object.assign(
      new Error(
        `The built-in WebSocket of Node ${runtimeVersions?.node ?? "unknown"} (${runtimeVersions?.undici ? "undici " + runtimeVersions.undici : "undici version not reported"}) `
        + "cannot be shown to be free of CVE-2026-12151 and the `ws` package could not be loaded ("
        + (cause instanceof Error ? cause.message : String(cause))
        + "). Reinstall hoody-sdk, or use an official Node 22.23.0+, 24.17.0+ or 26.3.1+.",
      ),
      { cause },
    );
    if (forceWs && isBrowserRuntime) {
      throw new Error("socketTransport \"ws\" is not available in a browser, which only has the global WebSocket");
    }
    if (typeof globalCtor === "function" && !builtinUnsafe && !forceWs && (isBrowserRuntime || (!hasHeaders && !isNode))) {
      if (isBrowserRuntime && hasHeaders) {
        // A browser WebSocket cannot send headers, so kitAuth password, jwt
        // and identity headers never reach the upgrade. The proxy accepts two
        // header-free forms: a token group read from a query parameter, or a
        // cookie on the kit host. Say so once instead of failing silently.
        const dropped = Object.keys(this.options.headers!).filter((name) => /^(authorization|cookie|x-hoody-[\w-]+|proxy-authorization)$/i.test(name));
        if (this.options.requireHeaderCredentials && this.options.requireHeaderCredentials.length > 0) {
          const wanted = this.options.requireHeaderCredentials.map((name) => name.toLowerCase());
          const refused = Object.keys(this.options.headers!).filter((name) => wanted.includes(name.toLowerCase()));
          if (refused.length > 0) throw credentialNotSentError(refused);
        }
        const flags = globalThis as { __hoodyWsHeaderWarned?: boolean };
        if (dropped.length > 0 && !flags.__hoodyWsHeaderWarned) {
          flags.__hoodyWsHeaderWarned = true;
          console.warn(`[hoody-sdk] a browser WebSocket cannot send headers; ${dropped.join(", ")} not sent on the upgrade. Use a proxy token group read from a query parameter, or a cookie on the kit host.`);
        }
      }
      this._lastSocketGlobal = true;
      return new globalCtor(connectUrl, this.options.protocols);
    }

    const specifier = "ws";
    let wsModule: { default?: IRawWebSocketCtor };
    try {
      wsModule = await import(specifier) as { default?: IRawWebSocketCtor };
    } catch (cause) {
      if (builtinUnsafe) throw builtinRefused(cause);
      if (forceWs) throw Object.assign(new Error("socketTransport \"ws\": the `ws` package could not be loaded (" + (cause instanceof Error ? cause.message : String(cause)) + ")"), { cause });
      // `ws` not installed — fall back to global WS, losing headers. This is
      // the same degraded path as when the module exists but has no default.
      if (typeof globalCtor === "function") {
        this._lastSocketGlobal = true;
        return new globalCtor(connectUrl, this.options.protocols);
      }
      throw new Error("WebSocket implementation unavailable in this runtime");
    }
    if (typeof wsModule.default !== "function") {
      if (builtinUnsafe) throw builtinRefused(new Error("the module has no WebSocket constructor export"));
      if (forceWs) throw new Error("socketTransport \"ws\": the `ws` module has no WebSocket constructor export");
      if (typeof globalCtor === "function") {
        this._lastSocketGlobal = true;
        return new globalCtor(connectUrl, this.options.protocols);
      }
      throw new Error("WebSocket implementation unavailable in this runtime");
    }

    // Node `ws` supports `headers` via a 3rd arg; surface caller headers there.
    // The fragment and buffered-chunk caps are passed explicitly, so they hold
    // whatever defaults the installed `ws` has.
    const wsOptions: { headers?: Record<string, string>; maxFragments: number; maxBufferedChunks: number } = { maxFragments: 16384, maxBufferedChunks: 262144 };
    if (hasHeaders) {
      wsOptions.headers = this.options.headers!;
    }
    return new (wsModule.default as unknown as new (url: string, protocols?: string | string[], opts?: unknown) => IRawWebSocketLike)(connectUrl, this.options.protocols, wsOptions);
  }

  /**
   * Manually trigger reconnection
   */
  async reconnect(): Promise<void> {
    this.disconnect("manual reconnect");
    this.reconnectAttempts = 0;
    return this.connect();
  }

  /**
   * Turn automatic reconnection on or off on a LIVE client.
   *
   * `reconnect` was construction-time only, so a consumer that wanted to
   * stop reconnecting had to tear the client down. Disabling here also
   * clears any scheduled attempt and drops the `reconnecting` flag, so no
   * backoff timer survives the switch. Enabling does not reconnect by
   * itself — it only re-arms the close handler for the NEXT drop.
   */
  setAutoReconnect(enabled: boolean): void {
    this.options.reconnect = enabled;
    if (!enabled) {
      this.clearReconnectTimer();
      this._reconnecting = false;
    }
  }

  isAutoReconnect(): boolean {
    return this.options.reconnect !== false;
  }

  /**
   * Disconnect from server
   */
  disconnect(reason?: string): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    // Retire an open attempt still waiting for its URL or its socket. Only the
    // attempt current at the first disconnect() is the one it retired.
    if (this._retiredByDisconnect === 0) this._retiredByDisconnect = this._openAttempt;
    this._openAttempt++;
    // A disconnect during a backoff wait ends the series: nothing is pending.
    this._reconnecting = false;
    this.stopLiveness();
    // Kill the dispatch token synchronously — any in-flight queued task
    // (especially Blob arrayBuffer() microtasks) bails via the token
    // check. Deliberately NOT a _socketGen bump: the generation guard
    // in onclose would then suppress the disconnect event for this
    // manual close, and onDisconnect consumers would never hear it.
    this._dispatchAlive.alive = false;
    if (this.ws) {
      this.ws.close(1000, reason || "Normal closure");
      this.ws = null;
    }
    // A refused upgrade still being read reports now; nothing follows it.
    const read = this._upgradeReadAbort;
    this._upgradeReadAbort = null;
    read?.();
    // The caller closed it: frames() ends after what is already buffered.
    this.endFrames();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= (this.options.reconnectAttempts ?? Infinity)) {
      this._reconnecting = false;
      this.emitEvent("reconnect_failed");
      this.endFrames();
      return;
    }

    this._reconnecting = true;
    const delay = Math.min(
      this.options.reconnectDelay! * Math.pow(this.options.reconnectionDelayGrowFactor!, this.reconnectAttempts),
      this.options.reconnectDelayMax!
    );

    // Add randomization to prevent thundering herd
    const jitter = delay * this.options.randomizationFactor! * (Math.random() - 0.5) * 2;
    const randomizedDelay = Math.max(0, delay + jitter);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      const attempt = this.reconnectAttempts;
      this.emitEvent("reconnect_attempt", attempt);
      this.openSocket(true).then(() => {
        this.emitEvent("reconnect", attempt);
      }).catch(() => {
        // Reported through onError. The close handler (or openSocket, when no
        // socket was created) decides whether another attempt follows.
      });
    }, randomizedDelay);
  }

  /**
   * One plain GET to the URL the failing sockets used, to learn the status the
   * transport hid. Ends the series on 401, 403 or 404; otherwise the backoff
   * goes on. `attempt` is the open attempt that failed: a disconnect() or a
   * new connect() meanwhile makes the answer irrelevant.
   */
  private async probeRefusal(attempt: number): Promise<void> {
    let status = 0;
    let code: string | undefined;
    const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch;
    const target = this._lastConnectUrl;
    if (typeof fetchFn === "function" && target) {
      const isBrowserRuntime = typeof (globalThis as { window?: unknown }).window !== "undefined"
        && typeof (globalThis as { document?: unknown }).document !== "undefined";
      // A browser WebSocket sends no headers, only its cookies; elsewhere the
      // socket carried these headers (kitAuth, realm pin).
      const headers: Record<string, string> = isBrowserRuntime ? {} : { ...(this.options.headers ?? {}) };
      const controller = typeof AbortController === "function" ? new AbortController() : undefined;
      const timer = setTimeout(() => controller?.abort(), 5000);
      (timer as unknown as { unref?: () => void }).unref?.();
      try {
        const response = await fetchFn(target.replace(/^ws(s?):/i, "http$1:"), {
          method: "GET",
          headers,
          // A redirect is not followed, so the headers never reach another host.
          redirect: "manual",
          credentials: isBrowserRuntime ? "include" : "same-origin",
          ...(controller ? { signal: controller.signal } : {}),
        });
        status = response.status;
        if (status === 401 || status === 403 || status === 404) {
          try {
            const body = JSON.parse((await response.text()).slice(0, 4096)) as { code?: unknown; error?: unknown } | null;
            const nested = body && typeof body.error === "object" && body.error !== null ? (body.error as { code?: unknown }).code : undefined;
            if (typeof body?.code === "string") code = body.code;
            else if (typeof nested === "string") code = nested;
            else if (typeof body?.error === "string" && /^[A-Z][A-Z0-9_]*$/.test(body.error)) code = body.error;
          } catch { /* no JSON error code */ }
        } else {
          try { await response.body?.cancel(); } catch { /* nothing to release */ }
        }
      } catch {
        // No answer (network still down, a browser refusing the request):
        // nothing learned.
        status = 0;
      } finally {
        clearTimeout(timer);
      }
    }
    if (attempt !== this._openAttempt || !this.shouldReconnect || !this.options.reconnect) return;
    if (status === 401 || status === 403 || status === 404) {
      this._reconnecting = false;
      this.emitEvent("error", upgradeRefusedError(status, code, "probe"));
      this.emitEvent("reconnect_failed");
      this.endFrames();
      return;
    }
    this.scheduleReconnect();
  }

  /** Stop the liveness timer of the current socket. */
  private stopLiveness(): void {
    if (this._livenessTimer) {
      clearInterval(this._livenessTimer);
      this._livenessTimer = null;
    }
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

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
  private handleString(data: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data) as Record<string, unknown>;
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
      return;
    }
    if (!message || typeof message !== "object") {
      return;
    }

    if (typeof message.seq === "number" && "event" in message) {
      const envelope: IStreamEnvelope = {
        kind: "envelope",
        seq: message.seq,
        event: message.event,
      };
      if (typeof message.incarnation === "string") {
        envelope.incarnation = message.incarnation;
        this._incarnation = message.incarnation;
      }
      const gate = message.gate as IStreamEnvelope["gate"] | undefined;
      if (gate && typeof gate === "object") {
        envelope.gate = gate;
      }
      // Advance the cursor BEFORE any handler runs: a consumer that throws
      // must not cost us the resume point for every later reconnect.
      this._cursor = message.seq;
      this.emitEvent("__envelope", envelope);
      this.pushStreamFrame(envelope);
      const inner = message.event as { type?: unknown } | null;
      if (inner && typeof inner === "object" && typeof inner.type === "string") {
        this.dispatchTypedMessage(inner.type, inner);
      }
      return;
    }

    // A plain frame that carries the declared resume cursor advances it
    // before any handler runs, as an envelope seq does.
    const __cursorField = this.options.streamResume?.cursorField;
    if (__cursorField && typeof message[__cursorField] === "number") {
      this._cursor = message[__cursorField] as number;
    }
    const messageType = message.type;
    if (messageType === "lagged" || messageType === "replay_boundary" || messageType === "end" || messageType === "refused") {
      this.handleControlFrame(messageType, message);
      return;
    }

    this.dispatchTypedMessage(messageType, message);
  }

  /** The per-type dispatch. */
  private dispatchTypedMessage(messageType: unknown, message: unknown): void {
    if (messageType === "error") {
      // "error" is also the key of onError's listeners: they get the frame as an
      // Error, as their type says, and never the bare frame.
      this.emitEvent("error", serverFrameError(message as Record<string, unknown>));
      return;
    }
    const handlers = this.eventHandlers.get(messageType as string);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error(`Error handling message ${messageType}:`, error);
        }
      });
    }
  }

  /** Normalise a gateway control frame and publish it. */
  private handleControlFrame(type: string, message: Record<string, unknown>): void {
    if (typeof message.incarnation === "string") {
      this._incarnation = message.incarnation;
    }
    let frame: IStreamControlFrame;
    if (type === "lagged") {
      const lagged: IStreamLaggedFrame = {
        kind: "lagged",
        code: typeof message.code === "string" ? message.code : "lagged",
      };
      if (typeof message.min_seq === "number") lagged.min_seq = message.min_seq;
      if (typeof message.max_seq === "number") lagged.max_seq = message.max_seq;
      if (typeof message.incarnation === "string") lagged.incarnation = message.incarnation;
      if (typeof message.resume === "string") lagged.resume = message.resume;
      if (lagged.code === "replay_gap") {
        // The cursor we resumed with is outside the ring (or belongs to a
        // different incarnation). Re-sending it would be rejected forever,
        // so fall back to the oldest seq the ring still holds.
        this._cursor = typeof lagged.min_seq === "number" ? lagged.min_seq : undefined;
        if (typeof lagged.incarnation === "string") {
          this._incarnation = lagged.incarnation;
        } else {
          this._incarnation = undefined;
        }
      }
      frame = lagged;
      this.emitEvent("__lagged", lagged);
    } else if (type === "replay_boundary") {
      const boundary: IStreamReplayBoundaryFrame = { kind: "replay_boundary" };
      if (typeof message.max_seq === "number") boundary.max_seq = message.max_seq;
      if (typeof message.incarnation === "string") boundary.incarnation = message.incarnation;
      frame = boundary;
      this.emitEvent("__replay_boundary", boundary);
    } else if (type === "refused") {
      const refused: IStreamRefusedFrame = {
        kind: "refused",
        code: typeof message.code === "string" ? message.code : "refused",
      };
      if (typeof message.frame === "string") refused.frame = message.frame;
      if (typeof message.reason === "string") refused.reason = message.reason;
      frame = refused;
      this.emitEvent("__refused", refused);
    } else {
      const end: IStreamEndFrame = { kind: "end" };
      if (typeof message.reason === "string") end.reason = message.reason;
      // The stream is over on the SERVER. Reconnecting would open a socket
      // onto a session that no longer exists and close again, forever.
      this.shouldReconnect = false;
      this.clearReconnectTimer();
      this._reconnecting = false;
      frame = end;
      this.emitEvent("__end", end);
    }
    this.emitEvent("__control", frame);
    this.pushStreamFrame(frame);
  }

  /**
   * Hand one frame to frames(): to a pending next(), or to the queue.
   *
   * Queueing matters — connect() resolves on open, and the gateway writes
   * its replay tail immediately, so a consumer that starts iterating after
   * connect() would otherwise miss everything replayed in between.
   */
  private pushStreamFrame(frame: IStreamFrame): void {
    if (this._streamEnded) return;
    if (frame.kind === "end") this._streamEnded = true;
    const waiter = this._frameWaiters.shift();
    if (waiter) {
      waiter({ value: frame, done: false });
    } else {
      this._frameBuffer.push(frame);
    }
    if (this._streamEnded && this._frameWaiters.length > 0) {
      const pending = this._frameWaiters.splice(0, this._frameWaiters.length);
      for (const resolveWaiter of pending) {
        resolveWaiter({ value: undefined as never, done: true });
      }
    }
  }

  /** End frames() without an end frame: the socket is gone and none follows. */
  private endFrames(): void {
    this._streamEnded = true;
    for (const resolveWaiter of this._frameWaiters.splice(0, this._frameWaiters.length)) {
      resolveWaiter({ value: undefined as never, done: true });
    }
  }

  /**
   * Handle an incoming BINARY frame: its first byte is the tag of a declared
   * binary frame, whose header is decoded and handed to the handlers of
   * that frame. A binary frame is never parsed as JSON; text frames are.
   * A frame with an undeclared tag goes to onUnknownFrame.
   */
  private handleBinary(buf: Uint8Array): void {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    switch (buf[0]) {
      case 1: {
        if (buf.byteLength < 9) {
          this.emitEvent("error", new Error("output.audio frame shorter than its 9-byte header"));
          return;
        }
        const frame: OutputAudioServerFrame = {
          out: view.getUint32(1),
          offset: view.getUint32(5),
          pcm: buf.subarray(9),
        };
        this.emitEvent("binary:output.audio", frame);
        return;
      }
      default:
        this.emitEvent("unknownFrame", buf);
    }
  }

  /**
   * Backwards-compat shim for any subclass that still calls handleMessage.
   * Delegates to handleString.
   */
  private handleMessage(data: string): void {
    this.handleString(data);
  }

  /**
   * Send message to server
   */
  private send(message: unknown): void {
    if (!this.ws || this.ws.readyState !== RAW_WEBSOCKET_OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * In vad mode (the agent detects when the user starts and stops speaking): end the utterance now, keeping its audio up to last_seq.
   * @param utt Message parameters
   */
  inputCommit(utt: number, last_seq: number): void {
    this.send({
      type: "input.commit",
      utt,
      last_seq,
    });
  }

  /**
   * In ptt mode (push to talk): the user pressed to talk. It stops any speech that is playing (barge-in).
   */
  pttDown(): void {
    this.send({
      type: "ptt.down",
    });
  }

  /**
   * In ptt mode: the user released; the utterance holds its audio up to last_seq.
   * @param last_seq Message parameters
   */
  pttUp(last_seq: number): void {
    this.send({
      type: "ptt.up",
      last_seq,
    });
  }

  /**
   * Stop speech and cancel turns. With reply_id: that reply's output and its turn. Without: everything playing, and every turn this connection's messages started. With keep_turn true only speech stops: no turn is cancelled, later reply text is not spoken, and reply.final comes when the turn really ends, with spoken judged then against its whole text (true only when playback.mark confirmed all of it). Answered with cancel.result.
   * @param reply_id Message parameters
   */
  outputCancel(reply_id?: string, keep_turn?: boolean): void {
    this.send({
      type: "output.cancel",
      reply_id,
      keep_turn,
    });
  }

  /**
   * How far the client has played an output: send at least every 500 ms while playing, and once at its end. A mark past the audio sent closes the connection with 1008.
   * @param out Message parameters
   */
  playbackMark(out: number, played_to: number): void {
    this.send({
      type: "playback.mark",
      out,
      played_to,
    });
  }

  /**
   * Decide an approval the Bot itself is waiting on (own_gate.pending kind confirm).
   * @param gate_id Message parameters
   */
  own_gateDecide(gate_id: string, generation: number, decision: 'approve' | 'deny' | 'allow_session', reason?: string): void {
    this.send({
      type: "own_gate.decide",
      gate_id,
      generation,
      decision,
      reason,
    });
  }

  /**
   * Answer a question the Bot itself asked (own_gate.pending kind question).
   * @param gate_id Message parameters
   */
  own_gateAnswer(gate_id: string, generation: number, answer: string): void {
    this.send({
      type: "own_gate.answer",
      gate_id,
      generation,
      answer,
    });
  }

  /**
   * A typed message to the Bot. The whole frame, JSON envelope and escaping included, is at most 64 KiB; a longer frame closes the connection with code 1009. Its reply is spoken here, as for a spoken message; output.cancel stops that speech but leaves the turn running (cancel.result turn_continues). With key it is answered by one text.result instead of error frames.
   * @param text Message parameters
   */
  text(text: string, key?: string): void {
    this.send({
      type: "text",
      text,
      key,
    });
  }

  /**
   * Answered with pong.
   */
  ping(): void {
    this.send({
      type: "ping",
    });
  }

  /**
   * First frame: the connection's settings.
   * @param callback Function to call when session message received
   * @returns Unsubscribe function
   */
  onSession(callback: (message: SessionServerMessage) => void): () => void {
    return this.addEventListener("session", callback);
  }

  /**
   * The user started speaking (vad mode) or pressed to talk (ptt mode).
   * @param callback Function to call when vad.start message received
   * @returns Unsubscribe function
   */
  onVadStart(callback: (message: VadStartServerMessage) => void): () => void {
    return this.addEventListener("vad.start", callback);
  }

  /**
   * The utterance ended.
   * @param callback Function to call when vad.end message received
   * @returns Unsubscribe function
   */
  onVadEnd(callback: (message: VadEndServerMessage) => void): () => void {
    return this.addEventListener("vad.end", callback);
  }

  /**
   * Text heard so far in the utterance.
   * @param callback Function to call when transcript.partial message received
   * @returns Unsubscribe function
   */
  onTranscriptPartial(callback: (message: TranscriptPartialServerMessage) => void): () => void {
    return this.addEventListener("transcript.partial", callback);
  }

  /**
   * How the utterance ended: message_id when the Bot got it as a message, or one of no_speech, rejected and failed.
   * @param callback Function to call when transcript.final message received
   * @returns Unsubscribe function
   */
  onTranscriptFinal(callback: (message: TranscriptFinalServerMessage) => void): () => void {
    return this.addEventListener("transcript.final", callback);
  }

  /**
   * Reply text so far, while the Bot's turn runs.
   * @param callback Function to call when reply.provisional message received
   * @returns Unsubscribe function
   */
  onReplyProvisional(callback: (message: ReplyProvisionalServerMessage) => void): () => void {
    return this.addEventListener("reply.provisional", callback);
  }

  /**
   * Earlier provisional text of the turn is withdrawn from from_raw on.
   * @param callback Function to call when reply.invalidate message received
   * @returns Unsubscribe function
   */
  onReplyInvalidate(callback: (message: ReplyInvalidateServerMessage) => void): () => void {
    return this.addEventListener("reply.invalidate", callback);
  }

  /**
   * The turn's final text and how much of it was spoken. The frame is at most 64 KiB: a longer text is cut and truncated is true; the whole text is in the Bot's log.
   * @param callback Function to call when reply.final message received
   * @returns Unsubscribe function
   */
  onReplyFinal(callback: (message: ReplyFinalServerMessage) => void): () => void {
    return this.addEventListener("reply.final", callback);
  }

  /**
   * The final text differs from what was being spoken; the affected speech is stopped with output.stop, and a spoken notice points to the final text.
   * @param callback Function to call when reply.diverged message received
   * @returns Unsubscribe function
   */
  onReplyDiverged(callback: (message: ReplyDivergedServerMessage) => void): () => void {
    return this.addEventListener("reply.diverged", callback);
  }

  /**
   * An output (a piece of speech) starts. Its audio normally follows in output.audio frames. When speech output is off (speech.limits.tts_chars 0), the speech budget is spent, or the speech service fails before any audio of the reply was sent, no audio follows: output.end with samples 0 comes next, then, for a reply, reply.final with spoken false (reason speech_limit or tts_failed). If a later segment fails or the speech budget runs out after earlier segments of the reply played, the reply ends with spoken partial and a reason from the speech service or budget (tts_failed, tts_cut, tts_incomplete or speech_limit; see reply.final). An announcement (kind announcement) never sends reply.final. When the speech service fails (tts_failed, tts_incomplete) it is reported with an error frame (code service_unavailable), once per code and reason per connection; an announcement stopped for speech_limit or silenced by speech off is not reported.
   * @param callback Function to call when output.start message received
   * @returns Unsubscribe function
   */
  onOutputStart(callback: (message: OutputStartServerMessage) => void): () => void {
    return this.addEventListener("output.start", callback);
  }

  /**
   * All audio of the output was sent.
   * @param callback Function to call when output.end message received
   * @returns Unsubscribe function
   */
  onOutputEnd(callback: (message: OutputEndServerMessage) => void): () => void {
    return this.addEventListener("output.end", callback);
  }

  /**
   * Every output up to upto_out stops: drop its unplayed audio.
   * @param callback Function to call when output.stop message received
   * @returns Unsubscribe function
   */
  onOutputStop(callback: (message: OutputStopServerMessage) => void): () => void {
    return this.addEventListener("output.stop", callback);
  }

  /**
   * The answer to output.cancel.
   * @param callback Function to call when cancel.result message received
   * @returns Unsubscribe function
   */
  onCancelResult(callback: (message: CancelResultServerMessage) => void): () => void {
    return this.addEventListener("cancel.result", callback);
  }

  /**
   * The answer to a text frame that carried a key.
   * @param callback Function to call when text.result message received
   * @returns Unsubscribe function
   */
  onTextResult(callback: (message: TextResultServerMessage) => void): () => void {
    return this.addEventListener("text.result", callback);
  }

  /**
   * A delegate's gate is being announced; answer it on screen or by typing. The announcement is its own reply: its output.start frames carry reply_id and kind announcement.
   * @param callback Function to call when gate.announced message received
   * @returns Unsubscribe function
   */
  onGateAnnounced(callback: (message: GateAnnouncedServerMessage) => void): () => void {
    return this.addEventListener("gate.announced", callback);
  }

  /**
   * The Bot itself waits on an approval or a question.
   * @param callback Function to call when own_gate.pending message received
   * @returns Unsubscribe function
   */
  onOwnGatePending(callback: (message: OwnGatePendingServerMessage) => void): () => void {
    return this.addEventListener("own_gate.pending", callback);
  }

  /**
   * The result of your own_gate.decide or own_gate.answer; with outcome resolved, it is sent unprompted when the gate ended elsewhere.
   * @param callback Function to call when own_gate.resolved message received
   * @returns Unsubscribe function
   */
  onOwnGateResolved(callback: (message: OwnGateResolvedServerMessage) => void): () => void {
    return this.addEventListener("own_gate.resolved", callback);
  }

  /**
   * The utterance was not taken: the agent had no room for it. transcript.final rejected busy follows.
   * @param callback Function to call when busy message received
   * @returns Unsubscribe function
   */
  onBusy(callback: (message: BusyServerMessage) => void): () => void {
    return this.addEventListener("busy", callback);
  }

  /**
   * Another connection took over this Bot's voice; the connection closes with 1000.
   * @param callback Function to call when takeover message received
   * @returns Unsubscribe function
   */
  onTakeover(callback: (message: TakeoverServerMessage) => void): () => void {
    return this.addEventListener("takeover", callback);
  }

  /**
   * The answer to ping.
   * @param callback Function to call when pong message received
   * @returns Unsubscribe function
   */
  onPong(callback: (message: PongServerMessage) => void): () => void {
    return this.addEventListener("pong", callback);
  }

  /**
   * Only with refuse=frame, and then the only frame: the agent refused the connection. The connection closes next with 4000 plus the HTTP status the refusal has without refuse=frame. Nothing was taken over.
   * @param callback Function to call when refused message received
   * @returns Unsubscribe function
   */
  onRefusedMessage(callback: (message: RefusedServerMessage) => void): () => void {
    return this.addEventListener("refused", callback);
  }

  /**
   * Binary frame: byte 0x00, a big-endian unsigned 32-bit sequence number (one more than the last), then 20 to 200 ms of audio in in_format at in_rate. A frame outside 20 to 200 ms closes the connection with 1008. A pcm16 frame of an odd byte length is not decoded: it counts as lost, so an utterance it falls in ends with transcript.final rejected frame_loss; the connection stays open.
   * @param seq The sequence number: one more than the last input frame's.
   * @param audio 20 to 200 ms of audio in in_format at in_rate.
   */
  sendInputAudio(seq: number, audio: ArrayBuffer | ArrayBufferView): void {
    if (!Number.isInteger(seq) || seq < 0 || seq > 4294967295) {
      throw new RangeError("seq must be an integer from 0 to 4294967295");
    }
    if (!(audio instanceof ArrayBuffer) && !ArrayBuffer.isView(audio)) {
      throw new TypeError("audio must be an ArrayBuffer or a typed array");
    }
    if (!this.ws || this.ws.readyState !== RAW_WEBSOCKET_OPEN) {
      throw new Error("WebSocket is not connected");
    }
    const __body = audio instanceof ArrayBuffer
      ? new Uint8Array(audio)
      : new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
    const __frame = new Uint8Array(5 + __body.byteLength);
    const __view = new DataView(__frame.buffer);
    __frame[0] = 0;
    __view.setUint32(1, seq);
    __frame.set(__body, 5);
    this.ws.send(__frame);
  }

  /**
   * Binary frame: byte 0x01, a big-endian unsigned 32-bit output number (out), a big-endian unsigned 32-bit sample offset into that output, then 16-bit little-endian PCM at out_rate.
   * @param callback Called with each decoded output.audio frame
   * @returns Unsubscribe function
   */
  onOutputAudio(callback: (frame: OutputAudioServerFrame) => void): () => void {
    return this.addEventListener("binary:output.audio", callback);
  }

  /**
   * A binary frame whose tag byte no declared frame uses, raw. Such a frame is
   * never JSON-parsed and nothing else receives it (forward compatibility).
   */
  onUnknownFrame(callback: (buf: Uint8Array) => void): () => void {
    return this.addEventListener("unknownFrame", callback);
  }

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

  onConnect(callback: () => void): () => void {
    return this.addEventListener("connect", callback);
  }

  onDisconnect(callback: (code: number, reason: string) => void): () => void {
    return this.addEventListener("disconnect", callback);
  }

  onReconnectAttempt(callback: (attemptNumber: number) => void): () => void {
    return this.addEventListener("reconnect_attempt", callback);
  }

  onReconnect(callback: (attemptNumber: number) => void): () => void {
    return this.addEventListener("reconnect", callback);
  }

  onReconnectFailed(callback: () => void): () => void {
    return this.addEventListener("reconnect_failed", callback);
  }

  onError(callback: (error: Error) => void): () => void {
    return this.addEventListener("error", callback);
  }

  onTakenOver(callback: (reason: string) => void): () => void {
    return this.addEventListener("__taken_over", callback);
  }

  /**
   * Add event listener
   * @returns Unsubscribe function
   */
  private addEventListener(event: string, callback: Function): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Remove event listener(s)
   */
  off(event: string, callback?: Function): void {
    if (!callback) {
      this.eventHandlers.delete(event);
    } else {
      this.eventHandlers.get(event)?.delete(callback);
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.eventHandlers.delete(event);
    } else {
      this.eventHandlers.clear();
    }
  }

  /**
   * Emit event to all registered handlers
   */
  private emitEvent(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  close(code?: number, reason?: string): void {
    this.disconnect(reason);
  }

  getReadyState(): number {
    return this.ws?.readyState ?? RAW_WEBSOCKET_CLOSED;
  }

  getUrl(): string {
    return this._url;
  }

  /**
   * The socket of the current connection, or null when there is none. It is
   * replaced on every reconnect, so read it again after each `connect`
   * event instead of keeping it. For code that needs what the transport
   * offers beyond this client (the `ws` package: ping(), the ping and pong
   * events); do not assign its on* handlers, the client owns them.
   */
  getRawSocket(): IRawWebSocketLike | null {
    return this.ws;
  }

  isConnected(): boolean {
    return this.ws?.readyState === RAW_WEBSOCKET_OPEN;
  }

  isReconnecting(): boolean {
    return this._reconnecting;
  }

  // ============================================================================
  // Gateway stream (sequenced envelopes + control frames)
  // ============================================================================

  onEnvelope(callback: (envelope: IStreamEnvelope) => void): () => void {
    return this.addEventListener("__envelope", callback);
  }

  onControlFrame(callback: (frame: IStreamControlFrame) => void): () => void {
    return this.addEventListener("__control", callback);
  }

  onLagged(callback: (frame: IStreamLaggedFrame) => void): () => void {
    return this.addEventListener("__lagged", callback);
  }

  onReplayBoundary(callback: (frame: IStreamReplayBoundaryFrame) => void): () => void {
    return this.addEventListener("__replay_boundary", callback);
  }

  onEnd(callback: (frame: IStreamEndFrame) => void): () => void {
    return this.addEventListener("__end", callback);
  }

  onRefused(callback: (frame: IStreamRefusedFrame) => void): () => void {
    return this.addEventListener("__refused", callback);
  }

  /**
   * Every frame as one async iterable. SINGLE consumer: frames are handed
   * out once, so two concurrent iterators would split the stream between
   * them. Use onEnvelope()/onControlFrame() for fan-out.
   */
  frames(): AsyncIterableIterator<IStreamFrame> {
    const iterator: AsyncIterableIterator<IStreamFrame> = {
      [Symbol.asyncIterator]: () => iterator,
      next: (): Promise<IteratorResult<IStreamFrame>> => {
        const buffered = this._frameBuffer.shift();
        if (buffered !== undefined) {
          return Promise.resolve({ value: buffered, done: false });
        }
        if (this._streamEnded) {
          return Promise.resolve({ value: undefined as never, done: true });
        }
        return new Promise<IteratorResult<IStreamFrame>>((resolve) => {
          this._frameWaiters.push(resolve);
        });
      },
      // break / return(): a next() still pending ends too.
      return: (): Promise<IteratorResult<IStreamFrame>> => {
        for (const resolveWaiter of this._frameWaiters.splice(0, this._frameWaiters.length)) {
          resolveWaiter({ value: undefined as never, done: true });
        }
        return Promise.resolve({ value: undefined as never, done: true });
      },
    };
    return iterator;
  }

  getCursor(): number | undefined {
    return this._cursor;
  }

  getIncarnation(): string | undefined {
    return this._incarnation;
  }

  setCursor(seq: number | undefined, incarnation?: string): void {
    this._cursor = seq;
    if (incarnation !== undefined) {
      this._incarnation = incarnation;
    }
  }
}

/** A retired getter refuses, naming the method that replaced it. Not an alias. */
function retireAccessors(target: object, owner: string, renames: Readonly<Record<string, string>>): void {
  for (const [retired, current] of Object.entries(renames)) {
    Object.defineProperty(target, retired, {
      configurable: true,
      enumerable: false,
      get(): never {
        throw new TypeError(owner + '.' + retired + ' was renamed to ' + current + '. Call ' + current + ' instead.');
      },
    });
  }
}

retireAccessors(AgentBotsConnectVoiceWebSocket.prototype, 'AgentBotsConnectVoiceWebSocket', { url: 'getUrl()', connected: 'isConnected()', cursor: 'getCursor()', readyState: 'getReadyState()', reconnecting: 'isReconnecting()', autoReconnect: 'isAutoReconnect()', rawSocket: 'getRawSocket()', incarnation: 'getIncarnation()' });
/**
 * WebSocket client for Attach to a session's event stream (WebSocket / SSE).
 * 
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent session events v1.0.0
 */


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
   * Reconnect after the SERVER closed the socket normally (code 1000).
   * Off by default: a normal close means the server ended the stream on
   * purpose (a deleted terminal session closes this way), and reconnecting
   * to it can silently re-create what was just deleted.
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

/** Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved, persist_dirs?, trust_container?, reason?, remember?, superseded?}. trust_container (with approved) accepts the event.confirm_request exec_trust offer, as on /confirm. reason, remember and superseded are as on /confirm: reason (with approved false, at most 500 characters) reaches the agent in the refused call's result; remember false approves this call only; superseded (with approved false, no reason, no session_scope) declines because the user sent a new message instead, and the agent does not read it as a refusal. gate_id is the stream frame ENVELOPE's gate.id (a sibling of `event`, NOT a field inside the event payload — the payload's own gate_id is the daemon's number), and is published as pending_gate.id on GET /sessions/{id} and /replay and as pending_gate_ref.id on GET /sessions/{id}/state. It is a STRING: sending the payload's number is refused bad_frame, naming the field; without it the answer applies to whatever gate is parked when it arrives. request_id? is the client's own id for the decision (at most 64 characters from A-Z, a-z, 0-9, '.', '_', '-'). Every outcome is ANSWERED, never silently dropped: a consumed decision by the broadcast event.gate_resolved, anything else by a `refused` frame naming the code — a stale or absent gate, a gate that already ended (gate_already_resolved, with what was decided; never a second forward), or a decision in flight (gate_decision_pending). approved is required in every mode: a frame without a boolean approved is refused approved_required and never resolves a gate. On an always session the frame must also carry the exact gate_id and its generation, or it is refused decision_incomplete. | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}; gate_id is as for confirm. A stale, duplicate or absent gate is a `refused` frame, and a retry that names the question this client already resolved replays the original `gate_resolved_ack`. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel", turn_id?}. With turn_id it cancels only that turn (as POST /sessions/{id}/cancel with turn_id); without, whatever is running. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}. */
export interface UnknownClientMessage {
}

// ============================================================================
// Server → Client Messages
// ============================================================================

/** Provider account rotated mid-turn. | Turn complete — terminates a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}] — advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy (open set). | The session's approval policy (mode / lock / rules) changed; carries the new revision. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors GET /hoody/auth/status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | The daemon admitted and forwarded a command that carried a request_id — the sender-only positive counterpart of event.command_refused {type, request_id}; the command's effect still arrives as its ordinary broadcast event. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Commands sent with POST /sessions/{id}/commands reached the session: messages added to the conversation (how next_step inside the running turn, new_turn in a turn of their own, with turn_id), or a stop carried out (how stop, with what it stopped). Carries command_ids. | A session command was refused (unregistered type, a setter frozen by a locked approval policy, an incomplete decision, a decision dropped at consumption) — a sender-only frame carrying type, code, reason, protocol_version, request_id; never fails a turn. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Commands sent with POST /sessions/{id}/commands ended without reaching the session: superseded by a stop, refused (a hook blocked them, the session closed, or the session cannot take them) or failed (the session could not record them). Carries command_ids, state and reason. | Context window compacted. | A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). | Context compaction started. | Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?} — a client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | A delegated turn went quiet past the stall window but is still running (NON-FATAL — not an error). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /sessions/{id}/jev/decide; the standalone /jev routes report usage only in their reply and in GET /jev/settings. | Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | A delegated agent's subscription usage limits (session/weekly windows) changed. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client. | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached. Built by the gateway from the attach acknowledgement; its data is the same `started` object POST /sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /sessions/{id}, which carries it while the session is attached. | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | A prompt or workflow dispatch was accepted but discarded without running, because it was queued while another client's turn waited on a confirmation or question. It closes that dispatch only (its turn_id); the waiting turn keeps running and no event.agent_done is sent for the discarded one. | The durable admission receipt for a prompt or workflow turn — a sender-only frame {turn_id, state, duplicate, accepted_at, request_id, …} written once the ledger row is on disk. CONSUMED BY THE GATEWAY: it is the 202 body of the request that dispatched the turn and is never fanned out to stream subscribers. | Echo of the user's input. | Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). | Gateway control frame: the stream is terminating because the session closed. Carries {reason}. | Gateway control frame, connection-local: the WS command this client just sent was REJECTED and nothing was forwarded to the daemon — the WS twin of a REST error envelope. Carries {frame: the client frame type that was refused, code, reason}. Codes match the REST ones for the same condition: bad_frame (the frame did not decode — the reason names the field and the JSON type it must carry, e.g. a gate_id sent as the daemon number instead of the addressable string), no_pending_gate / stale_gate / gate_already_answered / gate_type_mismatch (the frame did not match the parked gate), approved_required (a confirm frame without a boolean approved; it never resolves a gate), decision_incomplete (an always session needs an explicit approved, the exact gate_id and its generation; or a confirm without gate_id while several gates are parked). For a confirm: gate_already_resolved (the gate already ended and this decision was not applied; the frame also carries gate_id, generation, outcome, decision {approved, persist_dirs, session_scope, trust_container, remember?, superseded?} or decision_unknown:true, and request_id when the decision consumed carried that request_id) and gate_decision_pending (a decision for the gate is in flight and its outcome is not known yet — another client's, or this one past the wait; carries gate_id, generation and reason:connection_lost when the agent connection was lost; retry naming the gate to learn the outcome). For an answer: gate_cancelled (the question was resolved without consuming this answer) and decision_unconfirmed (the daemon did not acknowledge within the wait — it may still apply). It is sent ONLY to the client that sent the frame, never broadcast. | Gateway control frame, connection-local: the replayed acknowledgement of a question answer. When an answer frame is a RETRY naming the question gate this client already resolved, it carries replayed:true and {resolved: the ORIGINAL event.gate_resolved payload} — a retry never forwards a second answer. A confirm retry is refused gate_already_resolved instead. Sent only to the client that sent the frame. */
export interface UnknownServerMessage {
  /** The session's current count of recorded turns, the numbering POST /sessions/{id}/trim uses. Do not count agent_done frames instead: some commands end without recording a turn, and compaction renumbers. Omitted when 0. */
  turns?: number;
  /** Always cancelled: the dispatch never ran. */
  outcome?: 'cancelled';
  /** The turn this stream is watching: on promptStream, the turn the request dispatched (equal to X-Hoody-Turn-Id); on streamSession, the turn dispatched through this gateway that was running when the stream attached. Omitted when no such turn is running, including a turn another client (the TUI) started on the same session; GET /sessions/{id}/state current_turn_id covers that case. It names the turn for POST /sessions/{id}/cancel turn_id and matches its agent_done turn_id. Later frames carry their own envelope turn_id. */
  turn_id?: string;
  /** discarded_while_parked. */
  error_code?: string;
  /** Coded facts about how this turn ran that are not errors, for example hook_skipped_by_policy. Open set. Omitted when there are none. */
  notices?: { code: string; message?: string; detail?: string }[];
  /** Set when this closes a workflow run started in the session: the outcome note the agent recorded in the conversation, so the model knows how the run ended. It is its own recorded turn (turns counts it). A reload of the transcript shows the same two messages. Omitted on every other turn. */
  workflow_note?: { run_id: string; note: string; ack: string };
  /** The commands. */
  command_ids: string[];
  /** next_step: added inside the running turn; new_turn: started a turn; stop: a stop carried out. */
  how: 'next_step' | 'new_turn' | 'stop';
  /** A stop: the work it acted on and how each ended. Omitted otherwise. */
  stopped?: { kind: 'session' | 'task' | 'workflow_run' | 'bash_job' | 'loop'; id: string; outcome: 'stopped' | 'already_done' | 'failed'; detail?: string }[];
  /** What they became. */
  state: 'superseded' | 'refused' | 'failed';
  /** Why the stream ended: "session closed" or "session not authorized" (the session's owner is no longer the active account). */
  reason?: string;
  /** Rich preview for the chat (an edit diff, the first lines of a written file). Omitted when there is none. */
  detail?: string;
  /** The stop that superseded them. Omitted otherwise. */
  superseded_by?: string;
  /** The tool waiting for a decision. */
  tool_name: string;
  /** The tool input the decision is about, redacted, without the agent's own dispatch markers. Always present; null when the call had no input. */
  params: unknown;
  /** Directories outside the session's scope the call needs. Omitted when none. */
  requested_dirs?: string[];
  /** true when an allow-for-the-session answer may be offered (session_scope on /confirm). Omitted when false. */
  offer_session_allow?: boolean;
  /** The daemon's number for a resolved confirm gate. Omitted on a question gate. */
  gate_id: number;
  /** Why the gate exists, for example static_stakes, dir_access, hook_ask or approval_policy. Open set. Omitted by an older agent. */
  gate_cause?: string;
  /** The agent's coarse risk label for the call: read, write or destructive for a fleet action, write for a file write or edit, destructive for a file delete, high for a human-only gate, credential_access when a read, write or unknown call touches a known credential store (a label only: it parks and denies nothing by itself), unknown when the call has no class. Omitted by an older agent. */
  risk?: 'read' | 'write' | 'destructive' | 'high' | 'credential_access' | 'unknown';
  /** true when no automatic policy may answer this gate; a person must. Always present. */
  human_only: boolean;
  /** The approver-lease generation the decision was made under. Omitted when there is none. */
  generation: number;
  /** true when the decision must now come from the approver-lease holder. */
  lease_required: boolean;
  /** On a helper_gates session, the background task of the helper that asked. Omitted otherwise. */
  task_id?: string;
  /** On a hoody_exec_* card: the per-container trust option. Answer /confirm with approved true and trust_container true to run the call and stop exec cards on that container in this realm until the grant is revoked (setHookRules exec_trust). Omitted when no grant can be offered: another tool, a container that did not resolve, a hook or rules ask, the always approval policy, a headless session. */
  exec_trust?: { container_id: string; container_name?: string; realm: string; label: string };
  /** On a call a tool-call rule denied: the rules behind it. outcome deny = the call breaks these limit rules; unchecked = the rules check could not complete where no one can be asked (a helper), so the call was denied. Omitted on every other result. */
  rules?: { rule_ids: string[]; outcome: 'deny' | 'unchecked'; reason?: string };
  /** The helper that produced this event (a background helper's task id, or a per-spawn helper id). Omitted on the session's own events. */
  helper_id?: string;
  /** The tool_use id of the spawn_agent call that started that helper. Omitted on the session's own events. */
  parent_tool_call_id?: string;
  /** The delegated agent that went quiet. */
  agent: string;
  /** The stall window it went quiet for, in milliseconds. */
  idle_ms: number;
  /** A human-readable description. */
  message: string;
  /** lagged: this subscriber was dropped for reading too slowly and the stream ends. replay_gap: the resume cursor was behind or ahead of the retained ring, invalid, or from another incarnation; the frames that follow are the whole retained ring. */
  code?: 'lagged' | 'replay_gap';
  /** Provider diagnostics for a failed model call (provider, model, endpoint, key source and a redacted prefix, HTTP status, attempts). Omitted for every other error. */
  diag?: { provider?: string; model?: string; base_url?: string; key_source?: string; key_prefix?: string; http_status?: number; retryable?: boolean; attempts?: number; req_id?: string; err_code?: 'timeout' | 'rate_limit' | 'auth' | 'network' | 'provider' | 'canceled' | 'context_overflow' | 'provider_incomplete_response' | 'max_tokens' | 'bad_tool_args' | 'unknown'; stop_reason?: string; last_error?: string };
  /** With code max_steps: the step limit in force for the turn that stopped (the agent's max_steps_per_turn). Omitted on every other error. */
  max_steps?: number;
  /** With code quota_wait_too_long: the seconds the model provider asked to wait before the next request. The turn ended instead of waiting; send the message again after that. Omitted on every other error. */
  retry_after_secs?: number;
  /** Which kind of gate was resolved. */
  kind: 'confirm' | 'question';
  /** The agent's own number for this question, for diagnostics. Answer with the frame envelope's gate ref, not this. */
  question_id?: number;
  /** What resolved the gate. Only decision is a real answer; every other value means nobody decided, and the outcome is then never answered. timeout is a helper's gate that ran out of time. Omitted by an older agent. */
  provenance?: 'decision' | 'yolo' | 'cancelled' | 'closed' | 'context_cancelled' | 'timeout';
  /** The approver-lease holder whose decision resolved a confirm gate (the holder sent when the lease was acquired). Omitted when there is none. */
  holder?: string;
  /** The request id of the decision that resolved the gate, when that decision carried one. On the copy sent only to the sender of a retried or late decision (one naming a gate that already resolved, including a helper gate that timed out or was cancelled while the decision was in flight), it is that decision's own request id. */
  request_id?: string;
  /** On a confirm gate whose outcome is answered: the decision it consumed. Omitted otherwise. */
  decision?: { approved?: boolean; persist_dirs?: boolean; session_scope?: boolean; trust_container?: boolean; remember?: boolean; superseded?: boolean };
  /** false when an approving session_scope decision applied once only (a locked approval policy keeps the session-wide rule from being added); see note. Omitted otherwise. */
  session_scope_applied?: boolean;
  /** Present beside session_scope_applied: why the wider grant did not apply. */
  note?: string;
  /** The delegation's id; its event.orchestrator_delegate_done carries the same one. */
  delegate_id: string;
  /** The agent the work was delegated to. */
  agent_type: string;
  /** The delegation's role: change, readonly or verify. */
  role: string;
  /** A verify delegation's reviewer verdict, DONE or NEEDS_FIX. Omitted otherwise. */
  verdict?: string;
  /** The tool failed, or the call was denied or cancelled. */
  is_error: boolean;
  /** How long the step ran, in milliseconds. Omitted when not measured. */
  duration_ms: number;
  /** The start of the delegated prompt. Omitted when empty. */
  prompt_preview?: string;
  /** true for spend outside the foreground turn (a background helper, an exploration): add it to totals only, not to the turn. Omitted when false. */
  background?: boolean;
  /** The background workflow run this response belongs to. Omitted otherwise. */
  run_id: string;
  /** Files the run touched. */
  files: number;
  /** Shell commands the run executed. */
  bash_n: number;
  /** Steps of the run that failed. */
  errors: number;
  /** Whether the step succeeded. */
  success: boolean;
  /** The tool_use id of the call this result answers (the tool_id of its event.tool_call). */
  tool_id: string;
  /** The claims of the turn's last accepted report, in the model's order. */
  claims?: { text: string; evidence: { tool_call_id: string; status: 'linked' | 'foreign' | 'ambiguous' | 'unknown'; receipt?: { tool_name: string; is_error: boolean; exit_code?: number; truncated?: boolean; after_last_write: boolean } }[]; evidence_status: 'linked' | 'none' }[];
  /** true when this report replaced an earlier report_outcome of the same turn. Omitted otherwise. */
  replaced?: boolean;
  /** The question-panel generation the assist request carried (POST /sessions/{id}/assist gen), echoed so a client drops a suggestion for a panel it no longer shows. */
  gen: number;
  /** The assist mode the request carried, echoed: suggest or auto. */
  mode: string;
  /** An agent step: the model it ran on. Omitted otherwise. */
  model: string;
  /** One proposed answer per pending question. Omitted when the helper failed (see error) or proposed nothing. */
  items?: { id: string; answer: string; text?: string; rationale?: string; confident: boolean }[];
  /** Why the helper produced no proposals. Omitted on success. */
  error?: string;
  /** This response's cost in US dollars: the provider's reported figure when it gives one, otherwise an estimate. Omitted when no price is known. */
  cost_usd?: number;
  /** The renamed session. */
  id?: string;
  /** The tool name. */
  name: string;
  /** The message that started the turn. */
  text: string;
  /** An agent step's billed prompt tokens. Omitted when 0. */
  input_tokens: number;
  /** An agent step's billed output tokens. Omitted when 0. */
  output_tokens: number;
  /** An agent step's prompt tokens written to the provider's cache. Omitted when 0. */
  cache_creation_tokens: number;
  /** An agent step's prompt tokens read from the provider's cache. Omitted when 0. */
  cache_read_tokens: number;
  /** How long the tool ran, in milliseconds (0 is a real value). Omitted when the tool never ran or its run was not timed. */
  elapsed_ms: number;
  /** The context window to measure context use against, when the agent knows it better than the model catalogue (a delegated agent reports its own). Omitted when unknown: keep the value you had. */
  context_window?: number;
  /** true when context_input_tokens is an estimate rather than a measured prompt size. Omitted when false. */
  context_estimated?: boolean;
  /** The prompt size to show as context use, when it differs from input_tokens (a fused model bills every member but has one representative prompt). Omitted when 0: use input_tokens. */
  context_input_tokens?: number;
  /** The session's total spend after this response, the figure to display. Omitted when 0. */
  total_cost_usd?: number;
  /** The task: {id, name, status, kind?, prompt, started_at, updated_at?, tool_calls?, elapsed_ms?, output_preview?, container?, cwd?, parent_tool_call_id?, rev?, pending_gate_kind?, pending_gate_id?}; rev is the session's task-state revision of the task's last transition; pending_gate_kind (confirm or question) and pending_gate_id (the daemon's gate_id or question_id) are present while the task's helper has a gate parked on a helper_gates session (keep, per task, the state with the higher rev; see event.tasks_snapshot). */
  task?: Record<string, unknown>;
  /** Every background task of the session, each {id, name, status, kind?, prompt, started_at, updated_at?, tool_calls?, elapsed_ms?, output_preview?, container?, cwd?, parent_tool_call_id?, rev?, pending_gate_kind?, pending_gate_id?}; rev is the session's task-state revision of the task's last transition; pending_gate_kind (confirm or question) and pending_gate_id (the daemon's gate_id or question_id) are present while the task's helper has a gate parked on a helper_gates session. */
  tasks?: Record<string, unknown>[];
  /** The session's task-state revision read before tasks was captured: every transition with rev <= this is reflected in tasks, and a task absent from tasks had no running state at it. A task event whose task.rev is greater is newer than this snapshot and wins. Omitted (0) = unordered: apply as-is. */
  rev?: number;
  /** The tool input as the model issued it, with secrets redacted: the value of a credential-named key (token, password, api_key, authorization and the like) and secret-shaped text become "[REDACTED]". Omitted when empty. */
  arguments?: Record<string, unknown>;
  /** A one-line human summary of the call, for example "$ ls -la", with secret-shaped text redacted. */
  summary: string;
  /** The call's effective timeout in seconds, after the agent's floor and cap. Omitted when the tool has none. */
  timeout_sec?: number;
  /** bash only: why the model did not use read_file. Omitted when empty. */
  reason_not_read_file?: string;
  /** bash only: why the model did not use edit_file. Omitted when empty. */
  reason_not_edit_file?: string;
  /** bash only: why the model did not use glob_files. Omitted when empty. */
  reason_not_glob_files?: string;
  /** bash or glob_files: why the model raised the timeout above the default. Omitted when empty. */
  reason_to_increase_timeout?: string;
  /** The session's tool mode: standard or orchestrator. */
  tool_mode: string;
  /** Whether the mode is locked for the rest of the session. Always true today. */
  locked: boolean;
  /** The tool's output text, with secret-shaped text redacted. It may be shorter than what the tool produced: see truncated. Always empty for tool_orchestrator. */
  output: string;
  /** A remediation sentence for a coding-CLI tool's sign-in failure. Omitted otherwise. */
  hint?: string;
  /** The command that fixes the failure hint describes. Omitted otherwise. */
  hint_cmd?: string;
  /** The bash exit status, 0 included. Omitted when no process exit was observed; evidence of success needs exit_code 0, not just is_error false. */
  exit_code?: number;
  /** true is positive evidence that output is not the tool's whole output. It is set by bash (including container and long-running commands), bash_job_wait, read_file, read_minified_file, grep, glob_files, web_fetch, load_hoody_skill, MCP tools and tool_orchestrator, when the agent cut the output to a size cap, a file search stopped past max_results or the container's search limits, or the event leaves the output out (tool_orchestrator). A range the model asked for (read_file offset and limit) is not a cut, and neither is secret redaction or deny-list filtering. A missing truncated is inconclusive, even from an agent with the tool_output_completeness capability: other tools never set it, and some tools say in their own output when they shortened it. */
  truncated?: boolean;
  /** When truncated is true, the size in bytes of the text the cut was applied to: the whole output, or for a log tail or a fetched page that log or page alone. Omitted when the size is unknown, for example when the agent stopped reading a stream or a container cut it first. */
  original_bytes?: number;
  /** The tag the sending client attached to its input. A client drops an echo carrying its own tag (it already shows the message). On a gateway-dispatched turn it is the turn id. Omitted on turns the agent started itself. */
  echo_tag?: string;
  /** Set when a loop fire started the turn: the loop. Omitted otherwise. */
  loop_id?: string;
  /** With loop_id, the loop's run number. Omitted otherwise. */
  run?: number;
  /** Set when finished background tasks started the turn: those tasks. Omitted otherwise. */
  task_ids?: string[];
  /** Set on an auto-reply round: the model that wrote the message. Omitted otherwise. */
  auto_model?: string;
  /** With auto_model, the 1-based round. Omitted otherwise. */
  auto_round?: number;
  /** What became of the turn's image attachments, metadata only; order is not a pairing contract. Omitted when there were none. */
  attachments?: { name: string; media_type?: string; size?: number; delivered: boolean }[];
  /** The question, for a single question. Always present; empty on a batch, which uses questions instead. */
  question: string;
  /** Suggested answers for a single question (answer). Always present: null on a batch, and it may be empty, in which case any text is accepted. */
  options: unknown;
  /** Structured options (workflow tool steps). Omitted when none. */
  rich_options?: { title: string; description: string; has_user_input?: boolean }[];
  /** Placeholder text for a free-form answer. Omitted when none. */
  placeholder?: string;
  /** A short label for the question. Omitted when none. frame_request on a question a request_view or a Bot tool parked (frame_request is then set). */
  category?: string;
  /** On a frame_tools session, a question the model's request_view parked: what it asks the Frame to make. The Frame answers it on /answer with its status JSON as answer. On a Bot's own session, a call to one of the Bot's tools (kind bot.dispatch, bot.message, bot.stop, bot.delegates, bot.answer_gate or bot.peek), answered by the Bot runtime. Omitted on every other question. */
  frame_request?: { kind: 'view' | 'bot.dispatch' | 'bot.message' | 'bot.stop' | 'bot.delegates' | 'bot.answer_gate' | 'bot.peek'; request: string; id: string; tool_use_id?: string };
  /** A batch of questions; when present it replaces the single-question fields. Answer each by its id in answers. */
  questions?: { id: string; category: string; question: string; options?: string[] }[];
  /** The step's id in the workflow. */
  step_id: string;
  /** The step's position in the run, as on its event.workflow_step_start; 0 for a step refused before it got one. */
  step_idx: number;
  /** The run's step count; 0 when the producer does not know it. */
  total: number;
  /** true when a bash step was killed by its timeout (the workflow may continue). Omitted when false. */
  timed_out?: boolean;
  /** A line to show for the step's end, for example why it was refused. Omitted when empty. */
  display?: string;
  /** A bash step: the resolved command that ran. Omitted otherwise. */
  command?: string;
  /** A bash step: the first lines of its output. Omitted otherwise. */
  bash_output?: string;
  /** An agent step's cost in US dollars. Omitted when 0. */
  cost?: number;
  /** An agent step's tool use, one entry per tool. Omitted when it used none. */
  tool_stats?: { name: string; calls: number; summary: string }[];
  /** The nesting depth: a step of a nested workflow is 1 or more. Omitted for a top-level step. */
  depth?: number;
  /** true when a resumed run replayed the step's recorded result instead of running it. Omitted when false. */
  replayed?: boolean;
  /** Whether the active agent now holds the workflow-authoring tools. */
  available: boolean;
  /** On replay_gap, the lowest seq still retained. */
  min_seq?: number;
  /** The highest seq the ring held when the stream attached: frames up to it are replay, later frames are live. Pass the last seq you read as ?since= to resume. */
  max_seq?: number;
  /** The incarnation max_seq belongs to. Pass it as ?incarnation= with the cursor. */
  incarnation?: string;
  /** On an SSE lagged frame, how to recover: reconnect with ?since= set to the last seq read. The WS frame omits it; the recovery is the same. */
  resume?: string;
  /** While a turn runs: the cursor just before its first frame (the same value as GET /sessions/{id}/state turn_since). A client holding every frame after it can reconnect with ?since=turn_since to replay the whole turn. Omitted when idle, and on promptStream when the dispatched turn already ended and another holds the slot. */
  turn_since?: number;
}


export interface IAgentStreamSessionWebSocket {
  // ============================================================================
  // Send Messages (Client → Server)
  // ============================================================================

  /** Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved, persist_dirs?, trust_container?, reason?, remember?, superseded?}. trust_container (with approved) accepts the event.confirm_request exec_trust offer, as on /confirm. reason, remember and superseded are as on /confirm: reason (with approved false, at most 500 characters) reaches the agent in the refused call's result; remember false approves this call only; superseded (with approved false, no reason, no session_scope) declines because the user sent a new message instead, and the agent does not read it as a refusal. gate_id is the stream frame ENVELOPE's gate.id (a sibling of `event`, NOT a field inside the event payload — the payload's own gate_id is the daemon's number), and is published as pending_gate.id on GET /sessions/{id} and /replay and as pending_gate_ref.id on GET /sessions/{id}/state. It is a STRING: sending the payload's number is refused bad_frame, naming the field; without it the answer applies to whatever gate is parked when it arrives. request_id? is the client's own id for the decision (at most 64 characters from A-Z, a-z, 0-9, '.', '_', '-'). Every outcome is ANSWERED, never silently dropped: a consumed decision by the broadcast event.gate_resolved, anything else by a `refused` frame naming the code — a stale or absent gate, a gate that already ended (gate_already_resolved, with what was decided; never a second forward), or a decision in flight (gate_decision_pending). approved is required in every mode: a frame without a boolean approved is refused approved_required and never resolves a gate. On an always session the frame must also carry the exact gate_id and its generation, or it is refused decision_incomplete. | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}; gate_id is as for confirm. A stale, duplicate or absent gate is a `refused` frame, and a retry that names the question this client already resolved replays the original `gate_resolved_ack`. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel", turn_id?}. With turn_id it cancels only that turn (as POST /sessions/{id}/cancel with turn_id); without, whatever is running. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}. */
  unknown(): void;

  // ============================================================================
  // Receive Messages (Server → Client)
  // ============================================================================

  /** Provider account rotated mid-turn. | Turn complete — terminates a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}] — advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy (open set). | The session's approval policy (mode / lock / rules) changed; carries the new revision. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors GET /hoody/auth/status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | The daemon admitted and forwarded a command that carried a request_id — the sender-only positive counterpart of event.command_refused {type, request_id}; the command's effect still arrives as its ordinary broadcast event. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Commands sent with POST /sessions/{id}/commands reached the session: messages added to the conversation (how next_step inside the running turn, new_turn in a turn of their own, with turn_id), or a stop carried out (how stop, with what it stopped). Carries command_ids. | A session command was refused (unregistered type, a setter frozen by a locked approval policy, an incomplete decision, a decision dropped at consumption) — a sender-only frame carrying type, code, reason, protocol_version, request_id; never fails a turn. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Commands sent with POST /sessions/{id}/commands ended without reaching the session: superseded by a stop, refused (a hook blocked them, the session closed, or the session cannot take them) or failed (the session could not record them). Carries command_ids, state and reason. | Context window compacted. | A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). | Context compaction started. | Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?} — a client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | A delegated turn went quiet past the stall window but is still running (NON-FATAL — not an error). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /sessions/{id}/jev/decide; the standalone /jev routes report usage only in their reply and in GET /jev/settings. | Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | A delegated agent's subscription usage limits (session/weekly windows) changed. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client. | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached. Built by the gateway from the attach acknowledgement; its data is the same `started` object POST /sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /sessions/{id}, which carries it while the session is attached. | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | A prompt or workflow dispatch was accepted but discarded without running, because it was queued while another client's turn waited on a confirmation or question. It closes that dispatch only (its turn_id); the waiting turn keeps running and no event.agent_done is sent for the discarded one. | The durable admission receipt for a prompt or workflow turn — a sender-only frame {turn_id, state, duplicate, accepted_at, request_id, …} written once the ledger row is on disk. CONSUMED BY THE GATEWAY: it is the 202 body of the request that dispatched the turn and is never fanned out to stream subscribers. | Echo of the user's input. | Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). | Gateway control frame: the stream is terminating because the session closed. Carries {reason}. | Gateway control frame, connection-local: the WS command this client just sent was REJECTED and nothing was forwarded to the daemon — the WS twin of a REST error envelope. Carries {frame: the client frame type that was refused, code, reason}. Codes match the REST ones for the same condition: bad_frame (the frame did not decode — the reason names the field and the JSON type it must carry, e.g. a gate_id sent as the daemon number instead of the addressable string), no_pending_gate / stale_gate / gate_already_answered / gate_type_mismatch (the frame did not match the parked gate), approved_required (a confirm frame without a boolean approved; it never resolves a gate), decision_incomplete (an always session needs an explicit approved, the exact gate_id and its generation; or a confirm without gate_id while several gates are parked). For a confirm: gate_already_resolved (the gate already ended and this decision was not applied; the frame also carries gate_id, generation, outcome, decision {approved, persist_dirs, session_scope, trust_container, remember?, superseded?} or decision_unknown:true, and request_id when the decision consumed carried that request_id) and gate_decision_pending (a decision for the gate is in flight and its outcome is not known yet — another client's, or this one past the wait; carries gate_id, generation and reason:connection_lost when the agent connection was lost; retry naming the gate to learn the outcome). For an answer: gate_cancelled (the question was resolved without consuming this answer) and decision_unconfirmed (the daemon did not acknowledge within the wait — it may still apply). It is sent ONLY to the client that sent the frame, never broadcast. | Gateway control frame, connection-local: the replayed acknowledgement of a question answer. When an answer frame is a RETRY naming the question gate this client already resolved, it carries replayed:true and {resolved: the ORIGINAL event.gate_resolved payload} — a retry never forwards a second answer. A confirm retry is refused gate_already_resolved instead. Sent only to the client that sent the frame. */
  onUnknown(callback: (message: UnknownServerMessage) => void): () => void;

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
  readonly autoReconnect: boolean;

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

  /** Called when WebSocket error occurs */
  onError(callback: (error: Error) => void): () => void;

  /** Remove event listener(s) */
  off(event: string, callback?: Function): void;

  /** Remove all listeners for event or all events */
  removeAllListeners(event?: string): void;

  /** Close the WebSocket connection */
  close(code?: number, reason?: string): void;

  /** WebSocket ready state */
  readonly readyState: number;

  /** WebSocket URL */
  readonly url: string;

  /** Whether currently connected */
  readonly connected: boolean;

  /** Whether currently attempting to reconnect */
  readonly reconnecting: boolean;

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
  readonly cursor: number | undefined;

  /** The incarnation that stamped `cursor`, when the gateway sends one. */
  readonly incarnation: string | undefined;

  /**
   * Seed the cursor before connecting — resume a stream this client did
   * not itself read. `undefined` clears it and replays from the ring.
   */
  setCursor(seq: number | undefined, incarnation?: string): void;
}

const RAW_WEBSOCKET_OPEN = 1;
const RAW_WEBSOCKET_CLOSED = 3;

/**
 * The server refused the WebSocket upgrade for good: automatic reconnect has
 * stopped. `status` is the HTTP status; `code` the server's error code when
 * its answer named one, else "HTTP_<status>"; `via` says how it was learned:
 * "upgrade" (the transport showed the status) or "probe" (a plain GET after
 * repeated failures, see refusalProbeAfter).
 */
export interface WebSocketUpgradeRefusedError extends Error {
  name: "WebSocketUpgradeRefusedError";
  status: number;
  code: string;
  via: "upgrade" | "probe";
}

function upgradeRefusedError(status: number, code: string | undefined, via: "upgrade" | "probe", cause?: unknown): WebSocketUpgradeRefusedError {
  const error = new Error(`WebSocket upgrade refused: HTTP ${status}`) as WebSocketUpgradeRefusedError;
  error.name = "WebSocketUpgradeRefusedError";
  error.status = status;
  error.code = code ?? `HTTP_${status}`;
  error.via = via;
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
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
  return a < 6;                                         // ≥ 9: ASSUMED fixed (a later major carries the fix); T1 row
}
// </node-builtin-ws-unsafe>
;

export class AgentStreamSessionWebSocket implements IAgentStreamSessionWebSocket {
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
    return this.openSocket(false);
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
      const superseded = (): boolean => attempt !== this._openAttempt;
      let timedOut = false;
      // The socket this attempt installed, once it has one.
      let installed: IRawWebSocketLike | null = null;
      const timeoutId = setTimeout(() => {
        timedOut = true;
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
            const appPing = false;
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
              this.emitEvent("disconnect", code, reason);
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
                || finalError !== undefined;
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
              } else if (this._reconnecting) {
                // A reconnect attempt that will not be followed by another.
                this._reconnecting = false;
                if (this.shouldReconnect && this.options.reconnect) this.emitEvent("reconnect_failed");
              }
            });
          };

          this.ws.onclose = (event) => {
            finishClose(event.code, event.reason);
          };

          this.ws.onerror = (event) => {
            // Noise from a socket the liveness check already gave up on.
            if (closeHandled) return;
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
        } catch (error) {
          clearTimeout(timeoutId);
          if (isRetry) {
            // No socket was created, so no close event follows: report the
            // failure and end the series instead of leaving it silently stuck.
            this.emitEvent("error", error instanceof Error ? error : new Error(String(error)));
            this._reconnecting = false;
            this.emitEvent("reconnect_failed");
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
    const impl = AgentStreamSessionWebSocket.webSocketImpl;
    if (typeof impl === "function") return new impl(connectUrl, this.options.protocols);

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
    if (typeof globalCtor === "function" && !builtinUnsafe && (isBrowserRuntime || (!hasHeaders && !isNode))) {
      if (isBrowserRuntime && hasHeaders) {
        // A browser WebSocket cannot send headers, so kitAuth password, jwt
        // and identity headers never reach the upgrade. The proxy accepts two
        // header-free forms: a token group read from a query parameter, or a
        // cookie on the kit host. Say so once instead of failing silently.
        const dropped = Object.keys(this.options.headers!).filter((name) => /^(authorization|cookie|x-hoody-[\w-]+|proxy-authorization)$/i.test(name));
        const flags = globalThis as { __hoodyWsHeaderWarned?: boolean };
        if (dropped.length > 0 && !flags.__hoodyWsHeaderWarned) {
          flags.__hoodyWsHeaderWarned = true;
          console.warn(`[hoody-sdk] a browser WebSocket cannot send headers; ${dropped.join(", ")} not sent on the upgrade. Use a proxy token group read from a query parameter, or a cookie on the kit host.`);
        }
      }
      return new globalCtor(connectUrl, this.options.protocols);
    }

    const specifier = "ws";
    let wsModule: { default?: IRawWebSocketCtor };
    try {
      wsModule = await import(specifier) as { default?: IRawWebSocketCtor };
    } catch (cause) {
      if (builtinUnsafe) throw builtinRefused(cause);
      // `ws` not installed — fall back to global WS, losing headers. This is
      // the same degraded path as when the module exists but has no default.
      if (typeof globalCtor === "function") {
        return new globalCtor(connectUrl, this.options.protocols);
      }
      throw new Error("WebSocket implementation unavailable in this runtime");
    }
    if (typeof wsModule.default !== "function") {
      if (builtinUnsafe) throw builtinRefused(new Error("the module has no WebSocket constructor export"));
      if (typeof globalCtor === "function") {
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

  get autoReconnect(): boolean {
    return this.options.reconnect !== false;
  }

  /**
   * Disconnect from server
   */
  disconnect(reason?: string): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    // Retire an open attempt still waiting for its URL or its socket.
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
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= (this.options.reconnectAttempts ?? Infinity)) {
      this._reconnecting = false;
      this.emitEvent("reconnect_failed");
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

  /** The original per-type dispatch, unchanged in behaviour. */
  private dispatchTypedMessage(messageType: unknown, message: unknown): void {
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

  /**
   * Handle an incoming BINARY frame. Default implementation decodes
   * the bytes as UTF-8 and routes them to `handleString` — i.e. for
   * JSON-typed channels the binary path is behaviour-equivalent to the
   * string path. Byte-prefix channels override this method.
   */
  private handleBinary(buf: Uint8Array): void {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    } catch (err) {
      this.emitEvent("error", err instanceof Error ? err : new Error(String(err)));
      return;
    }
    this.handleString(text);
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
   * Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved, persist_dirs?, trust_container?, reason?, remember?, superseded?}. trust_container (with approved) accepts the event.confirm_request exec_trust offer, as on /confirm. reason, remember and superseded are as on /confirm: reason (with approved false, at most 500 characters) reaches the agent in the refused call's result; remember false approves this call only; superseded (with approved false, no reason, no session_scope) declines because the user sent a new message instead, and the agent does not read it as a refusal. gate_id is the stream frame ENVELOPE's gate.id (a sibling of `event`, NOT a field inside the event payload — the payload's own gate_id is the daemon's number), and is published as pending_gate.id on GET /sessions/{id} and /replay and as pending_gate_ref.id on GET /sessions/{id}/state. It is a STRING: sending the payload's number is refused bad_frame, naming the field; without it the answer applies to whatever gate is parked when it arrives. request_id? is the client's own id for the decision (at most 64 characters from A-Z, a-z, 0-9, '.', '_', '-'). Every outcome is ANSWERED, never silently dropped: a consumed decision by the broadcast event.gate_resolved, anything else by a `refused` frame naming the code — a stale or absent gate, a gate that already ended (gate_already_resolved, with what was decided; never a second forward), or a decision in flight (gate_decision_pending). approved is required in every mode: a frame without a boolean approved is refused approved_required and never resolves a gate. On an always session the frame must also carry the exact gate_id and its generation, or it is refused decision_incomplete. | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}; gate_id is as for confirm. A stale, duplicate or absent gate is a `refused` frame, and a retry that names the question this client already resolved replays the original `gate_resolved_ack`. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel", turn_id?}. With turn_id it cancels only that turn (as POST /sessions/{id}/cancel with turn_id); without, whatever is running. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}.
   */
  unknown(): void {
    this.send({
      type: "unknown",
    });
  }

  /**
   * Provider account rotated mid-turn. | Turn complete — terminates a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}] — advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy (open set). | The session's approval policy (mode / lock / rules) changed; carries the new revision. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors GET /hoody/auth/status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | The daemon admitted and forwarded a command that carried a request_id — the sender-only positive counterpart of event.command_refused {type, request_id}; the command's effect still arrives as its ordinary broadcast event. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Commands sent with POST /sessions/{id}/commands reached the session: messages added to the conversation (how next_step inside the running turn, new_turn in a turn of their own, with turn_id), or a stop carried out (how stop, with what it stopped). Carries command_ids. | A session command was refused (unregistered type, a setter frozen by a locked approval policy, an incomplete decision, a decision dropped at consumption) — a sender-only frame carrying type, code, reason, protocol_version, request_id; never fails a turn. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Commands sent with POST /sessions/{id}/commands ended without reaching the session: superseded by a stop, refused (a hook blocked them, the session closed, or the session cannot take them) or failed (the session could not record them). Carries command_ids, state and reason. | Context window compacted. | A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). | Context compaction started. | Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?} — a client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | A delegated turn went quiet past the stall window but is still running (NON-FATAL — not an error). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /sessions/{id}/jev/decide; the standalone /jev routes report usage only in their reply and in GET /jev/settings. | Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | A delegated agent's subscription usage limits (session/weekly windows) changed. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client. | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached. Built by the gateway from the attach acknowledgement; its data is the same `started` object POST /sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /sessions/{id}, which carries it while the session is attached. | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | A prompt or workflow dispatch was accepted but discarded without running, because it was queued while another client's turn waited on a confirmation or question. It closes that dispatch only (its turn_id); the waiting turn keeps running and no event.agent_done is sent for the discarded one. | The durable admission receipt for a prompt or workflow turn — a sender-only frame {turn_id, state, duplicate, accepted_at, request_id, …} written once the ledger row is on disk. CONSUMED BY THE GATEWAY: it is the 202 body of the request that dispatched the turn and is never fanned out to stream subscribers. | Echo of the user's input. | Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). | Gateway control frame: the stream is terminating because the session closed. Carries {reason}. | Gateway control frame, connection-local: the WS command this client just sent was REJECTED and nothing was forwarded to the daemon — the WS twin of a REST error envelope. Carries {frame: the client frame type that was refused, code, reason}. Codes match the REST ones for the same condition: bad_frame (the frame did not decode — the reason names the field and the JSON type it must carry, e.g. a gate_id sent as the daemon number instead of the addressable string), no_pending_gate / stale_gate / gate_already_answered / gate_type_mismatch (the frame did not match the parked gate), approved_required (a confirm frame without a boolean approved; it never resolves a gate), decision_incomplete (an always session needs an explicit approved, the exact gate_id and its generation; or a confirm without gate_id while several gates are parked). For a confirm: gate_already_resolved (the gate already ended and this decision was not applied; the frame also carries gate_id, generation, outcome, decision {approved, persist_dirs, session_scope, trust_container, remember?, superseded?} or decision_unknown:true, and request_id when the decision consumed carried that request_id) and gate_decision_pending (a decision for the gate is in flight and its outcome is not known yet — another client's, or this one past the wait; carries gate_id, generation and reason:connection_lost when the agent connection was lost; retry naming the gate to learn the outcome). For an answer: gate_cancelled (the question was resolved without consuming this answer) and decision_unconfirmed (the daemon did not acknowledge within the wait — it may still apply). It is sent ONLY to the client that sent the frame, never broadcast. | Gateway control frame, connection-local: the replayed acknowledgement of a question answer. When an answer frame is a RETRY naming the question gate this client already resolved, it carries replayed:true and {resolved: the ORIGINAL event.gate_resolved payload} — a retry never forwards a second answer. A confirm retry is refused gate_already_resolved instead. Sent only to the client that sent the frame.
   * @param callback Function to call when unknown message received
   * @returns Unsubscribe function
   */
  onUnknown(callback: (message: UnknownServerMessage) => void): () => void {
    return this.addEventListener("unknown", callback);
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

  get readyState(): number {
    return this.ws?.readyState ?? RAW_WEBSOCKET_CLOSED;
  }

  get url(): string {
    return this._url;
  }

  /**
   * The socket of the current connection, or null when there is none. It is
   * replaced on every reconnect, so read it again after each `connect`
   * event instead of keeping it. For code that needs what the transport
   * offers beyond this client (the `ws` package: ping(), the ping and pong
   * events); do not assign its on* handlers, the client owns them.
   */
  get rawSocket(): IRawWebSocketLike | null {
    return this.ws;
  }

  get connected(): boolean {
    return this.ws?.readyState === RAW_WEBSOCKET_OPEN;
  }

  get reconnecting(): boolean {
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
      return: (): Promise<IteratorResult<IStreamFrame>> =>
        Promise.resolve({ value: undefined as never, done: true }),
    };
    return iterator;
  }

  get cursor(): number | undefined {
    return this._cursor;
  }

  get incarnation(): string | undefined {
    return this._incarnation;
  }

  setCursor(seq: number | undefined, incarnation?: string): void {
    this._cursor = seq;
    if (incarnation !== undefined) {
      this._incarnation = incarnation;
    }
  }
}
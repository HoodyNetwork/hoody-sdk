/**
 * WebSocket client for Attach to a session's event stream (WebSocket / SSE).
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent session events v1.0.0
 */
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
/** Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved, persist_dirs?, trust_container?}. trust_container (with approved) accepts the event.confirm_request exec_trust offer, as on /confirm. gate_id is the stream frame ENVELOPE's gate.id (a sibling of `event`, NOT a field inside the event payload — the payload's own gate_id is the daemon's number), and is published as pending_gate.id on GET /sessions/{id} and /replay and as pending_gate_ref.id on GET /sessions/{id}/state. It is a STRING: sending the payload's number is refused bad_frame, naming the field; without it the answer applies to whatever gate is parked when it arrives. request_id? is the client's own id for the decision (at most 64 characters from A-Z, a-z, 0-9, '.', '_', '-'). Every outcome is ANSWERED, never silently dropped: a consumed decision by the broadcast event.gate_resolved, anything else by a `refused` frame naming the code — a stale or absent gate, a gate that already ended (gate_already_resolved, with what was decided; never a second forward), or a decision in flight (gate_decision_pending). approved is required in every mode: a frame without a boolean approved is refused approved_required and never resolves a gate. On an always session the frame must also carry the exact gate_id and its generation, or it is refused decision_incomplete. | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}; gate_id is as for confirm. A stale, duplicate or absent gate is a `refused` frame, and a retry that names the question this client already resolved replays the original `gate_resolved_ack`. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel", turn_id?}. With turn_id it cancels only that turn (as POST /sessions/{id}/cancel with turn_id); without, whatever is running. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}. */
export interface UnknownClientMessage {
}
/** Provider account rotated mid-turn. | Turn complete — terminates a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}] — advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy (open set). | The session's approval policy (mode / lock / rules) changed; carries the new revision. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors GET /hoody/auth/status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | The daemon admitted and forwarded a command that carried a request_id — the sender-only positive counterpart of event.command_refused {type, request_id}; the command's effect still arrives as its ordinary broadcast event. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | A session command was refused (unregistered type, a setter frozen by a locked approval policy, an incomplete decision, a decision dropped at consumption) — a sender-only frame carrying type, code, reason, protocol_version, request_id; never fails a turn. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Context window compacted. | A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). | Context compaction started. | Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?} — a client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | A delegated turn went quiet past the stall window but is still running (NON-FATAL — not an error). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /sessions/{id}/jev/decide; the standalone /jev routes report usage only in their reply and in GET /jev/settings. | Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | A delegated agent's subscription usage limits (session/weekly windows) changed. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client. | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached. Built by the gateway from the attach acknowledgement; its data is the same `started` object POST /sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /sessions/{id}, which carries it while the session is attached. | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | The durable admission receipt for a prompt or workflow turn — a sender-only frame {turn_id, state, duplicate, accepted_at, request_id, …} written once the ledger row is on disk. CONSUMED BY THE GATEWAY: it is the 202 body of the request that dispatched the turn and is never fanned out to stream subscribers. | Echo of the user's input. | Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). | Gateway control frame: the stream is terminating because the session closed. Carries {reason}. | Gateway control frame, connection-local: the WS command this client just sent was REJECTED and nothing was forwarded to the daemon — the WS twin of a REST error envelope. Carries {frame: the client frame type that was refused, code, reason}. Codes match the REST ones for the same condition: bad_frame (the frame did not decode — the reason names the field and the JSON type it must carry, e.g. a gate_id sent as the daemon number instead of the addressable string), no_pending_gate / stale_gate / gate_already_answered / gate_type_mismatch (the frame did not match the parked gate), approved_required (a confirm frame without a boolean approved; it never resolves a gate), decision_incomplete (an always session needs an explicit approved, the exact gate_id and its generation; or a confirm without gate_id while several gates are parked). For a confirm: gate_already_resolved (the gate already ended and this decision was not applied; the frame also carries gate_id, generation, outcome, decision {approved, persist_dirs, session_scope, trust_container} or decision_unknown:true, and request_id when the decision consumed carried that request_id) and gate_decision_pending (a decision for the gate is in flight and its outcome is not known yet — another client's, or this one past the wait; carries gate_id, generation and reason:connection_lost when the agent connection was lost; retry naming the gate to learn the outcome). For an answer: gate_cancelled (the question was resolved without consuming this answer) and decision_unconfirmed (the daemon did not acknowledge within the wait — it may still apply). It is sent ONLY to the client that sent the frame, never broadcast. | Gateway control frame, connection-local: the replayed acknowledgement of a question answer. When an answer frame is a RETRY naming the question gate this client already resolved, it carries replayed:true and {resolved: the ORIGINAL event.gate_resolved payload} — a retry never forwards a second answer. A confirm retry is refused gate_already_resolved instead. Sent only to the client that sent the frame. */
export interface UnknownServerMessage {
    /** The session's current count of recorded turns, the numbering POST /sessions/{id}/trim uses. Do not count agent_done frames instead: some commands end without recording a turn, and compaction renumbers. Omitted when 0. */
    turns?: number;
    /** How the gate ended: answered by a decision, cancelled without one, auto-approved by switching YOLO mode on while it was parked, or (a helper's gate only) denied because nobody answered within the helper agent's ask_timeout. */
    outcome?: 'answered' | 'cancelled' | 'yolo' | 'timeout';
    /** The turn this stream is watching: on promptStream, the turn the request dispatched (equal to X-Hoody-Turn-Id); on streamSession, the turn dispatched through this gateway that was running when the stream attached. Omitted when no such turn is running, including a turn another client (the TUI) started on the same session; GET /sessions/{id}/state current_turn_id covers that case. It names the turn for POST /sessions/{id}/cancel turn_id and matches its agent_done turn_id. Later frames carry their own envelope turn_id. */
    turn_id?: string;
    /** A stable machine code for a failed result. Omitted on success and on failures that carry only text. */
    error_code?: string;
    /** Coded facts about how this turn ran that are not errors, for example hook_skipped_by_policy. Open set. Omitted when there are none. */
    notices?: {
        code: string;
        message?: string;
        detail?: string;
    }[];
    /** Set when this closes a workflow run started in the session: the outcome note the agent recorded in the conversation, so the model knows how the run ended. It is its own recorded turn (turns counts it). A reload of the transcript shows the same two messages. Omitted on every other turn. */
    workflow_note?: {
        run_id: string;
        note: string;
        ack: string;
    };
    /** Why the stream ended: "session closed" or "session not authorized" (the session's owner is no longer the active account). */
    reason?: string;
    /** The tool waiting for a decision. */
    tool_name: string;
    /** The tool input the decision is about, redacted, without the agent's own dispatch markers. Always present; null when the call had no input. */
    params: unknown;
    /** Directories outside the session's scope the call needs. Omitted when none. */
    requested_dirs?: string[];
    /** Rich preview for the chat (an edit diff, the first lines of a written file). Omitted when there is none. */
    detail?: string;
    /** true when an allow-for-the-session answer may be offered (session_scope on /confirm). Omitted when false. */
    offer_session_allow?: boolean;
    /** The daemon's number for a resolved confirm gate. Omitted on a question gate. */
    gate_id: number;
    /** Why the gate exists, for example static_stakes, dir_access, hook_ask or approval_policy. Open set. Omitted by an older agent. */
    gate_cause?: string;
    /** The agent's coarse risk label for the call: read, write or destructive for a fleet action, write for a file write, high for a human-only gate, credential_access when a read, write or unknown call touches a known credential store (a label only: it parks and denies nothing by itself), unknown when the call has no class. Omitted by an older agent. */
    risk?: string;
    /** true when no automatic policy may answer this gate; a person must. Always present. */
    human_only: boolean;
    /** The approver-lease generation the decision was made under. Omitted when there is none. */
    generation: number;
    /** true when the decision must now come from the approver-lease holder. */
    lease_required: boolean;
    /** On a helper_gates session, the background task of the helper that asked. Omitted otherwise. */
    task_id?: string;
    /** On a hoody_exec_* card: the per-container trust option. Answer /confirm with approved true and trust_container true to run the call and stop exec cards on that container in this realm until the grant is revoked (setHookRules exec_trust). Omitted when no grant can be offered: another tool, a container that did not resolve, a hook or rules ask, the always approval policy, a headless session. */
    exec_trust?: {
        container_id: string;
        container_name?: string;
        realm: string;
        label: string;
    };
    /** On a call a tool-call rule denied: the rules behind it. outcome deny = the call breaks these limit rules; unchecked = the rules check could not complete where no one can be asked (a helper), so the call was denied. Omitted on every other result. */
    rules?: {
        rule_ids: string[];
        outcome: 'deny' | 'unchecked';
    };
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
    diag?: {
        provider?: string;
        model?: string;
        base_url?: string;
        key_source?: string;
        key_prefix?: string;
        http_status?: number;
        retryable?: boolean;
        attempts?: number;
        req_id?: string;
        err_code?: 'timeout' | 'rate_limit' | 'auth' | 'network' | 'provider' | 'canceled' | 'context_overflow' | 'provider_incomplete_response' | 'unknown';
        last_error?: string;
    };
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
    decision?: {
        approved?: boolean;
        persist_dirs?: boolean;
        session_scope?: boolean;
        trust_container?: boolean;
    };
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
    claims?: {
        text: string;
        evidence: {
            tool_call_id: string;
            status: 'linked' | 'foreign' | 'ambiguous' | 'unknown';
            receipt?: {
                tool_name: string;
                is_error: boolean;
                exit_code?: number;
                truncated?: boolean;
                after_last_write: boolean;
            };
        }[];
        evidence_status: 'linked' | 'none';
    }[];
    /** true when this report replaced an earlier report_outcome of the same turn. Omitted otherwise. */
    replaced?: boolean;
    /** The question-panel generation the assist request carried (POST /sessions/{id}/assist gen), echoed so a client drops a suggestion for a panel it no longer shows. */
    gen: number;
    /** The assist mode the request carried, echoed: suggest or auto. */
    mode: string;
    /** An agent step: the model it ran on. Omitted otherwise. */
    model: string;
    /** One proposed answer per pending question. Omitted when the helper failed (see error) or proposed nothing. */
    items?: {
        id: string;
        answer: string;
        text?: string;
        rationale?: string;
        confident: boolean;
    }[];
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
    attachments?: {
        name: string;
        media_type?: string;
        size?: number;
        delivered: boolean;
    }[];
    /** The question, for a single question. Always present; empty on a batch, which uses questions instead. */
    question: string;
    /** Suggested answers for a single question (answer). Always present: null on a batch, and it may be empty, in which case any text is accepted. */
    options: unknown;
    /** Structured options (workflow tool steps). Omitted when none. */
    rich_options?: {
        title: string;
        description: string;
        has_user_input?: boolean;
    }[];
    /** Placeholder text for a free-form answer. Omitted when none. */
    placeholder?: string;
    /** A short label for the question. Omitted when none. frame_request on a question a request_view parked (frame_request is then set). */
    category?: string;
    /** On a frame_tools session, a question the model's request_view parked: what it asks the Frame to make. The Frame answers it on /answer with its status JSON as answer. Omitted on every other question. */
    frame_request?: {
        kind: 'view';
        request: string;
        id: string;
    };
    /** A batch of questions; when present it replaces the single-question fields. Answer each by its id in answers. */
    questions?: {
        id: string;
        category: string;
        question: string;
        options?: string[];
    }[];
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
    tool_stats?: {
        name: string;
        calls: number;
        summary: string;
    }[];
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
    /** Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved, persist_dirs?, trust_container?}. trust_container (with approved) accepts the event.confirm_request exec_trust offer, as on /confirm. gate_id is the stream frame ENVELOPE's gate.id (a sibling of `event`, NOT a field inside the event payload — the payload's own gate_id is the daemon's number), and is published as pending_gate.id on GET /sessions/{id} and /replay and as pending_gate_ref.id on GET /sessions/{id}/state. It is a STRING: sending the payload's number is refused bad_frame, naming the field; without it the answer applies to whatever gate is parked when it arrives. request_id? is the client's own id for the decision (at most 64 characters from A-Z, a-z, 0-9, '.', '_', '-'). Every outcome is ANSWERED, never silently dropped: a consumed decision by the broadcast event.gate_resolved, anything else by a `refused` frame naming the code — a stale or absent gate, a gate that already ended (gate_already_resolved, with what was decided; never a second forward), or a decision in flight (gate_decision_pending). approved is required in every mode: a frame without a boolean approved is refused approved_required and never resolves a gate. On an always session the frame must also carry the exact gate_id and its generation, or it is refused decision_incomplete. | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}; gate_id is as for confirm. A stale, duplicate or absent gate is a `refused` frame, and a retry that names the question this client already resolved replays the original `gate_resolved_ack`. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel", turn_id?}. With turn_id it cancels only that turn (as POST /sessions/{id}/cancel with turn_id); without, whatever is running. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}. */
    unknown(): void;
    /** Provider account rotated mid-turn. | Turn complete — terminates a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}] — advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy (open set). | The session's approval policy (mode / lock / rules) changed; carries the new revision. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors GET /hoody/auth/status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | The daemon admitted and forwarded a command that carried a request_id — the sender-only positive counterpart of event.command_refused {type, request_id}; the command's effect still arrives as its ordinary broadcast event. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | A session command was refused (unregistered type, a setter frozen by a locked approval policy, an incomplete decision, a decision dropped at consumption) — a sender-only frame carrying type, code, reason, protocol_version, request_id; never fails a turn. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Context window compacted. | A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). | Context compaction started. | Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?} — a client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | A delegated turn went quiet past the stall window but is still running (NON-FATAL — not an error). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /sessions/{id}/jev/decide; the standalone /jev routes report usage only in their reply and in GET /jev/settings. | Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | A delegated agent's subscription usage limits (session/weekly windows) changed. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client. | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached. Built by the gateway from the attach acknowledgement; its data is the same `started` object POST /sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /sessions/{id}, which carries it while the session is attached. | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | The durable admission receipt for a prompt or workflow turn — a sender-only frame {turn_id, state, duplicate, accepted_at, request_id, …} written once the ledger row is on disk. CONSUMED BY THE GATEWAY: it is the 202 body of the request that dispatched the turn and is never fanned out to stream subscribers. | Echo of the user's input. | Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). | Gateway control frame: the stream is terminating because the session closed. Carries {reason}. | Gateway control frame, connection-local: the WS command this client just sent was REJECTED and nothing was forwarded to the daemon — the WS twin of a REST error envelope. Carries {frame: the client frame type that was refused, code, reason}. Codes match the REST ones for the same condition: bad_frame (the frame did not decode — the reason names the field and the JSON type it must carry, e.g. a gate_id sent as the daemon number instead of the addressable string), no_pending_gate / stale_gate / gate_already_answered / gate_type_mismatch (the frame did not match the parked gate), approved_required (a confirm frame without a boolean approved; it never resolves a gate), decision_incomplete (an always session needs an explicit approved, the exact gate_id and its generation; or a confirm without gate_id while several gates are parked). For a confirm: gate_already_resolved (the gate already ended and this decision was not applied; the frame also carries gate_id, generation, outcome, decision {approved, persist_dirs, session_scope, trust_container} or decision_unknown:true, and request_id when the decision consumed carried that request_id) and gate_decision_pending (a decision for the gate is in flight and its outcome is not known yet — another client's, or this one past the wait; carries gate_id, generation and reason:connection_lost when the agent connection was lost; retry naming the gate to learn the outcome). For an answer: gate_cancelled (the question was resolved without consuming this answer) and decision_unconfirmed (the daemon did not acknowledge within the wait — it may still apply). It is sent ONLY to the client that sent the frame, never broadcast. | Gateway control frame, connection-local: the replayed acknowledgement of a question answer. When an answer frame is a RETRY naming the question gate this client already resolved, it carries replayed:true and {resolved: the ORIGINAL event.gate_resolved payload} — a retry never forwards a second answer. A confirm retry is refused gate_already_resolved instead. Sent only to the client that sent the frame. */
    onUnknown(callback: (message: UnknownServerMessage) => void): () => void;
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
export declare class AgentStreamSessionWebSocket implements IAgentStreamSessionWebSocket {
    private ws;
    private eventHandlers;
    private options;
    private _url;
    private reconnectAttempts;
    private reconnectTimer;
    private _reconnecting;
    private shouldReconnect;
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
     * Establish WebSocket connection
     */
    connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void>;
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
    get autoReconnect(): boolean;
    /**
     * Disconnect from server
     */
    disconnect(reason?: string): void;
    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect;
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
    /** The original per-type dispatch, unchanged in behaviour. */
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
    /**
     * Handle an incoming BINARY frame. Default implementation decodes
     * the bytes as UTF-8 and routes them to `handleString` — i.e. for
     * JSON-typed channels the binary path is behaviour-equivalent to the
     * string path. Byte-prefix channels override this method.
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
     * Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved, persist_dirs?, trust_container?}. trust_container (with approved) accepts the event.confirm_request exec_trust offer, as on /confirm. gate_id is the stream frame ENVELOPE's gate.id (a sibling of `event`, NOT a field inside the event payload — the payload's own gate_id is the daemon's number), and is published as pending_gate.id on GET /sessions/{id} and /replay and as pending_gate_ref.id on GET /sessions/{id}/state. It is a STRING: sending the payload's number is refused bad_frame, naming the field; without it the answer applies to whatever gate is parked when it arrives. request_id? is the client's own id for the decision (at most 64 characters from A-Z, a-z, 0-9, '.', '_', '-'). Every outcome is ANSWERED, never silently dropped: a consumed decision by the broadcast event.gate_resolved, anything else by a `refused` frame naming the code — a stale or absent gate, a gate that already ended (gate_already_resolved, with what was decided; never a second forward), or a decision in flight (gate_decision_pending). approved is required in every mode: a frame without a boolean approved is refused approved_required and never resolves a gate. On an always session the frame must also carry the exact gate_id and its generation, or it is refused decision_incomplete. | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}; gate_id is as for confirm. A stale, duplicate or absent gate is a `refused` frame, and a retry that names the question this client already resolved replays the original `gate_resolved_ack`. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel", turn_id?}. With turn_id it cancels only that turn (as POST /sessions/{id}/cancel with turn_id); without, whatever is running. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}.
     */
    unknown(): void;
    /**
     * Provider account rotated mid-turn. | Turn complete — terminates a prompt turn. Carries the turn's typed outcome / error_code and notices [{code, message?, detail?}] — advisory, never an error: hook_skipped_by_policy when a configured user hook was skipped under the always policy (open set). | The session's approval policy (mode / lock / rules) changed; carries the new revision. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors GET /hoody/auth/status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | The daemon admitted and forwarded a command that carried a request_id — the sender-only positive counterpart of event.command_refused {type, request_id}; the command's effect still arrives as its ordinary broadcast event. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | A session command was refused (unregistered type, a setter frozen by a locked approval policy, an incomplete decision, a decision dropped at consumption) — a sender-only frame carrying type, code, reason, protocol_version, request_id; never fails a turn. CONSUMED BY THE GATEWAY: it answers the HTTP request / WS frame that sent the command and is never fanned out to stream subscribers. | Context window compacted. | A delegated agent discarded its conversation and started a new one: the context meter no longer describes anything (clear it). | Context compaction started. | Tool/plan confirmation requested (parks a gate). On a helper_gates session a helper's request carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | The decision requirements of the PARKED gate changed (the approver lease was acquired, taken over, renewed past expiry or released while a gate is parked): {gate_id, generation, lease_required, helper_id?} — a client that captured the gate at park time refreshes what its decision must carry. On a helper_gates session each parked helper confirm is re-announced too, with its helper_id. | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | A delegated turn went quiet past the stall window but is still running (NON-FATAL — not an error). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | A Jev decision made for this session finished (success, error or invalid answer): {cost_usd (null when any attempt's spend is unknown), known_cost_usd, cost_unknown_attempts, attempts, latency_ms, model, request_id, input_tokens, output_tokens, error_code}. Produced by POST /sessions/{id}/jev/decide; the standalone /jev routes report usage only in their reply and in GET /jev/settings. | Fusion member trajectory progress. Not sent while the fusion runs inside a silent workflow step. | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | On an outcome_claims session, the report the turn closes with, sent just before event.agent_done: the model's claims and, for each tool call it cited, whether it is this turn's own call and what it returned. The claims are the model's words; nothing here says they are true. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | A delegated agent's subscription usage limits (session/weekly windows) changed. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client. | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached. Built by the gateway from the attach acknowledgement; its data is the same `started` object POST /sessions returns. It is the first frame (seq 1) of a fresh attach while the stream still retains seq 1. A resume with `since` does not repeat it, except when the cursor cannot be resumed: an invalid `since` (or Last-Event-ID), an `incarnation` that does not match the session's current one, or a cursor ahead of the stream is each answered with a `lagged` frame (code replay_gap) and the whole retained stream, which includes it if seq 1 is still retained. A late attach after the oldest frames were evicted starts with a `lagged` frame (code replay_gap) instead and does not carry it. In either case read the same object as `started` from GET /sessions/{id}, which carries it while the session is attached. | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | The durable admission receipt for a prompt or workflow turn — a sender-only frame {turn_id, state, duplicate, accepted_at, request_id, …} written once the ledger row is on disk. CONSUMED BY THE GATEWAY: it is the 202 body of the request that dispatched the turn and is never fanned out to stream subscribers. | Echo of the user's input. | Question posed to the user (parks a gate). On a helper_gates session a helper's question carries helper_id, parent_tool_call_id and, for a background helper, task_id; it parks beside the session's own gate and is answered by its own id. | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step output. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | Workflow step start. Not sent for a silent step: one marked `silent: true`, a step of a background run, or a nested workflow's step the panel does not show. | The workflow-authoring tools became available or unavailable mid-session (the session's tool mode, standard or orchestrator, was applied by its first dispatch; the chat agent was switched; or the agent's `tools:` frontmatter was edited on disk). Not sent for the initial value, which the init state carries as workflow_tools_available. | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring or belongs to another incarnation. Carries {code: lagged|replay_gap[, min_seq, max_seq, incarnation, resume]}; reconcile by reconnecting with ?since= and ?incarnation=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq, incarnation, turn_id?, turn_since?}; turn_id names the turn being watched and turn_since the cursor before its first frame (see the payload). | Gateway control frame: the stream is terminating because the session closed. Carries {reason}. | Gateway control frame, connection-local: the WS command this client just sent was REJECTED and nothing was forwarded to the daemon — the WS twin of a REST error envelope. Carries {frame: the client frame type that was refused, code, reason}. Codes match the REST ones for the same condition: bad_frame (the frame did not decode — the reason names the field and the JSON type it must carry, e.g. a gate_id sent as the daemon number instead of the addressable string), no_pending_gate / stale_gate / gate_already_answered / gate_type_mismatch (the frame did not match the parked gate), approved_required (a confirm frame without a boolean approved; it never resolves a gate), decision_incomplete (an always session needs an explicit approved, the exact gate_id and its generation; or a confirm without gate_id while several gates are parked). For a confirm: gate_already_resolved (the gate already ended and this decision was not applied; the frame also carries gate_id, generation, outcome, decision {approved, persist_dirs, session_scope, trust_container} or decision_unknown:true, and request_id when the decision consumed carried that request_id) and gate_decision_pending (a decision for the gate is in flight and its outcome is not known yet — another client's, or this one past the wait; carries gate_id, generation and reason:connection_lost when the agent connection was lost; retry naming the gate to learn the outcome). For an answer: gate_cancelled (the question was resolved without consuming this answer) and decision_unconfirmed (the daemon did not acknowledge within the wait — it may still apply). It is sent ONLY to the client that sent the frame, never broadcast. | Gateway control frame, connection-local: the replayed acknowledgement of a question answer. When an answer frame is a RETRY naming the question gate this client already resolved, it carries replayed:true and {resolved: the ORIGINAL event.gate_resolved payload} — a retry never forwards a second answer. A confirm retry is refused gate_already_resolved instead. Sent only to the client that sent the frame.
     * @param callback Function to call when unknown message received
     * @returns Unsubscribe function
     */
    onUnknown(callback: (message: UnknownServerMessage) => void): () => void;
    onConnect(callback: () => void): () => void;
    onDisconnect(callback: (code: number, reason: string) => void): () => void;
    onReconnectAttempt(callback: (attemptNumber: number) => void): () => void;
    onReconnect(callback: (attemptNumber: number) => void): () => void;
    onReconnectFailed(callback: () => void): () => void;
    onError(callback: (error: Error) => void): () => void;
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
    get readyState(): number;
    get url(): string;
    get connected(): boolean;
    get reconnecting(): boolean;
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
    get cursor(): number | undefined;
    get incarnation(): string | undefined;
    setCursor(seq: number | undefined, incarnation?: string): void;
}

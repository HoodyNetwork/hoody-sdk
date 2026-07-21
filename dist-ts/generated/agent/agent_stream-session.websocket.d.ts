/**
 * WebSocket client for Attach to a session's event stream (WebSocket / SSE).
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent session events v1.0.0
 */
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
}
/** Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved?, persist_dirs?}. A stale/duplicate/absent gate is dropped (no silently-discarded daemon command). | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel"}. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}. */
export interface UnknownClientMessage {
}
/** Provider account rotated mid-turn. | Turn complete — terminates a session.input turn. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors hoody.auth_status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | Context window compacted. | Context compaction started. | Tool/plan confirmation requested (parks a gate). | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | Fusion member trajectory progress (emitIfVisible). | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client (session.close_all). | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached (server-constructed SessionEvent). | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | Echo of the user's input. | Question posed to the user (parks a gate). | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done (emitIfVisible). | Workflow step output (emitIfVisible). | Workflow step start (emitIfVisible). | Workflow-authoring tool availability changed mid-session (setTools flip). | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring. Carries {code: lagged|replay_gap[, min_seq, max_seq, resume]}; reconcile by reconnecting with ?since=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq}. | Gateway control frame: the stream is terminating because the session closed. Carries {reason}. */
export interface UnknownServerMessage {
}
export interface IAgentStreamSessionWebSocket {
    /** Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved?, persist_dirs?}. A stale/duplicate/absent gate is dropped (no silently-discarded daemon command). | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel"}. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}. */
    unknown(): void;
    /** Provider account rotated mid-turn. | Turn complete — terminates a session.input turn. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors hoody.auth_status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | Context window compacted. | Context compaction started. | Tool/plan confirmation requested (parks a gate). | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | Fusion member trajectory progress (emitIfVisible). | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client (session.close_all). | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached (server-constructed SessionEvent). | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | Echo of the user's input. | Question posed to the user (parks a gate). | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done (emitIfVisible). | Workflow step output (emitIfVisible). | Workflow step start (emitIfVisible). | Workflow-authoring tool availability changed mid-session (setTools flip). | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring. Carries {code: lagged|replay_gap[, min_seq, max_seq, resume]}; reconcile by reconnecting with ?since=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq}. | Gateway control frame: the stream is terminating because the session closed. Carries {reason}. */
    onUnknown(callback: (message: UnknownServerMessage) => void): () => void;
    /** Establish WebSocket connection */
    connect(options?: Partial<IWebSocketConnectionOptions>): Promise<void>;
    /** Reconnect to WebSocket server */
    reconnect(): Promise<void>;
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
    constructor(url: string, options?: IWebSocketConnectionOptions);
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
     * Default behaviour: JSON.parse + dispatch on `message.type`.
     */
    private handleString;
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
     * Inbound WS frame: answer a parked confirm gate. Carries {type:"confirm", gate_id?, generation?, approved?, persist_dirs?}. A stale/duplicate/absent gate is dropped (no silently-discarded daemon command). | Inbound WS frame: answer a parked question gate. Carries {type:"answer", gate_id?, generation?, answer?, text?, answers?}. | Inbound WS frame: cancel the active turn (Esc). Carries {type:"cancel"}. | Inbound WS frame: feed input to a running workflow. Carries {type:"workflow_message", text}.
     */
    unknown(): void;
    /**
     * Provider account rotated mid-turn. | Turn complete — terminates a session.input turn. | Hoody platform auth state changed — login, token adopt, or logout (global broadcast; mirrors hoody.auth_status). | Auto-user composed the next user turn. | Auto-user composition progress. | Background bash job list snapshot. | Background bash job output tail chunk. | Conversation cleared. | Context window compacted. | Context compaction started. | Tool/plan confirmation requested (parks a gate). | Directory-access scope changed/locked. | A peer client detached from this shared live session (multi-attach presence). | Session error (e.g. join_not_ready). | A parked confirm/question gate was resolved (possibly by another attached client). | Files-tab import progress. | Fusion configuration changed. | Fusion member trajectory progress (emitIfVisible). | Hoody concept mode toggled. | A hook executed. | Hook execution summary. | Initial session state snapshot. | Available loops list updated. | A master TODO was filed. | Memory subsystem notice. | Orchestrator delegation finished. | Orchestrator delegated a task to a subagent. | Orchestrator run complete. | Orchestrator narration. | Orchestrator run started. | Orchestrator step progress. | global pause-freeze state changed. | A session permission rule auto-applied (first time). | Session permission rules snapshot. | Plan-mode planning complete. | Question-assist suggestion. | Daemon quitting. | Active realm changed (global broadcast). | Resolved default working dir of the bound container (filetree/chip scope hint). | Full viewport snapshot after session_started. | Mid-turn join with an overflowed turn journal — the active turn's earlier output is elided (connection-local frame). | LLM call retried. | The session was archived for every attached client (session.close_all). | The set of listable sessions (or a session's attach state) changed — clients re-list. | Session title set or cleared. | Session attached (server-constructed SessionEvent). | Available skills list updated. | Skill enable/trust state changed. | Assistant text stream chunk. | Assistant text stream complete. | Profile sync status. | Background task activity. | Background task finished. | Background task started. | Background task transcript entry (upsert-poll). | Snapshot of background tasks. | Reasoning/thinking stream chunk. | Thinking stall warning. | TODO list updated. | Tool invocation. | Tool mode changed/locked. | Tool result. | Echo of the user's input. | Question posed to the user (parks a gate). | Verbosity setting changed. | Workflow run complete. | Workflow run started. | Workflow step done (emitIfVisible). | Workflow step output (emitIfVisible). | Workflow step start (emitIfVisible). | Workflow-authoring tool availability changed mid-session (setTools flip). | Available workflows list updated. | YOLO auto-approve mode toggled. | Gateway control frame: the subscriber was dropped for slowness, or a ?since= resume cursor fell past the replay ring. Carries {code: lagged|replay_gap[, min_seq, max_seq, resume]}; reconcile by reconnecting with ?since=. | Gateway control frame: the ring→live boundary. Everything before it is buffered replay; everything after is live. Carries {max_seq}. | Gateway control frame: the stream is terminating because the session closed. Carries {reason}.
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
}

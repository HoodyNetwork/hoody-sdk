/**
 * WebSocket client for Create a headless one-shot run.
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see hoody-agent createHeadlessRun stream v1.0.0
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
/** Stream opened; carries the run prompt/workflow echo. | The captured headless Result {result, session_id, usage, num_turns, …}. | The run failed/timed out; carries {code,message}. This is where a server-side failure surfaces in the stream form — e.g. code:"timeout" when the run exceeds its bound, or code:"admin_unauthorized" if the daemon's own socket admin gate rejects it (these are NOT HTTP statuses on this op — the run starts after the 200 SSE response). | Stream complete (always last). */
export interface UnknownServerMessage {
}
export interface IAgentCreateHeadlessRunWebSocket {
    /** Stream opened; carries the run prompt/workflow echo. | The captured headless Result {result, session_id, usage, num_turns, …}. | The run failed/timed out; carries {code,message}. This is where a server-side failure surfaces in the stream form — e.g. code:"timeout" when the run exceeds its bound, or code:"admin_unauthorized" if the daemon's own socket admin gate rejects it (these are NOT HTTP statuses on this op — the run starts after the 200 SSE response). | Stream complete (always last). */
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
export declare class AgentCreateHeadlessRunWebSocket implements IAgentCreateHeadlessRunWebSocket {
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
     * Stream opened; carries the run prompt/workflow echo. | The captured headless Result {result, session_id, usage, num_turns, …}. | The run failed/timed out; carries {code,message}. This is where a server-side failure surfaces in the stream form — e.g. code:"timeout" when the run exceeds its bound, or code:"admin_unauthorized" if the daemon's own socket admin gate rejects it (these are NOT HTTP statuses on this op — the run starts after the 200 SSE response). | Stream complete (always last).
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

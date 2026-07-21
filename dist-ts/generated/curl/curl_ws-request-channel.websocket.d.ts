/**
 * WebSocket client for Execute cURL requests over a WebSocket channel
 *
 * Generated from AsyncAPI specification
 * Protocol: ws
 * @see hoody-curl Request Channel WebSocket API v0.1.0
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
export interface RequestStartClientMessage {
    request: unknown;
    stream_id: number;
    type: 'request.start';
}
export interface RequestCancelClientMessage {
    stream_id: number;
    type: 'request.cancel';
}
export interface PingClientMessage {
    type: 'ping';
}
export interface HelloServerMessage {
    connection_id: string;
    features: {
        buffered: boolean;
        cache: boolean;
        outbound_pooling: boolean;
        streaming: boolean;
    };
    limits: {
        chunk_bytes: number;
        idle_timeout_secs: number;
        max_concurrent_streams: number;
        max_frame_bytes: number;
        max_outbound_messages: number;
        max_queue: number;
        max_request_bytes: number;
        stream_timeout_secs: number;
    };
    type: 'hello';
    version: number;
}
export interface PongServerMessage {
    type: 'pong';
}
export interface AcceptedServerMessage {
    stream_id: number;
    type: 'accepted';
}
export interface CancelledServerMessage {
    stream_id: number;
    type: 'cancelled';
}
export interface ResponseStartServerMessage {
    body_bytes: number;
    content_type?: unknown;
    effective_url: string;
    headers: Record<string, unknown>;
    raw_headers: unknown[];
    status_code: number;
    stream_id: number;
    type: 'response.start';
}
export interface ResponseBodyServerMessage {
    data: string;
    encoding: 'base64';
    offset: number;
    stream_id: number;
    type: 'response.body';
}
export interface ResponseEndServerMessage {
    metadata: unknown;
    stream_id: number;
    timing: unknown;
    type: 'response.end';
}
export interface ErrorServerMessage {
    error_type: 'protocol_error' | 'validation_error' | 'queue_full' | 'timeout' | 'cancelled' | 'execution_error' | 'internal_error';
    message: string;
    stream_id?: unknown;
    type: 'error';
}
export interface ICurlWsRequestChannelWebSocket {
    requestStart(request: unknown, stream_id: number): void;
    requestCancel(stream_id: number): void;
    ping(): void;
    onHello(callback: (message: HelloServerMessage) => void): () => void;
    onPong(callback: (message: PongServerMessage) => void): () => void;
    onAccepted(callback: (message: AcceptedServerMessage) => void): () => void;
    onCancelled(callback: (message: CancelledServerMessage) => void): () => void;
    onResponseStart(callback: (message: ResponseStartServerMessage) => void): () => void;
    onResponseBody(callback: (message: ResponseBodyServerMessage) => void): () => void;
    onResponseEnd(callback: (message: ResponseEndServerMessage) => void): () => void;
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
export declare class CurlWsRequestChannelWebSocket implements ICurlWsRequestChannelWebSocket {
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
     * @param request Message parameters
     */
    requestStart(request: unknown, stream_id: number): void;
    /**
     * @param stream_id Message parameters
     */
    requestCancel(stream_id: number): void;
    /**
     */
    ping(): void;
    /**
     * @param callback Function to call when hello message received
     * @returns Unsubscribe function
     */
    onHello(callback: (message: HelloServerMessage) => void): () => void;
    /**
     * @param callback Function to call when pong message received
     * @returns Unsubscribe function
     */
    onPong(callback: (message: PongServerMessage) => void): () => void;
    /**
     * @param callback Function to call when accepted message received
     * @returns Unsubscribe function
     */
    onAccepted(callback: (message: AcceptedServerMessage) => void): () => void;
    /**
     * @param callback Function to call when cancelled message received
     * @returns Unsubscribe function
     */
    onCancelled(callback: (message: CancelledServerMessage) => void): () => void;
    /**
     * @param callback Function to call when response.start message received
     * @returns Unsubscribe function
     */
    onResponseStart(callback: (message: ResponseStartServerMessage) => void): () => void;
    /**
     * @param callback Function to call when response.body message received
     * @returns Unsubscribe function
     */
    onResponseBody(callback: (message: ResponseBodyServerMessage) => void): () => void;
    /**
     * @param callback Function to call when response.end message received
     * @returns Unsubscribe function
     */
    onResponseEnd(callback: (message: ResponseEndServerMessage) => void): () => void;
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

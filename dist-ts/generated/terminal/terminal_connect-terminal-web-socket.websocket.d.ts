/**
 * WebSocket client for WebSocket terminal connection
 *
 * Generated from AsyncAPI specification
 * Protocol: unknown
 * @see Terminal WebSocket Protocol v1.0.0
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
/** Binary message containing user keystrokes. First byte is '0' (INPUT command), followed by raw keyboard data (UTF-8 encoded). Blocked if client has readonly mode enabled. | JSON message indicating terminal window has been resized. First byte is '1' (RESIZE_TERMINAL command), followed by JSON object with new columns and rows. | Flow control message to pause PTY output. First byte is '2' (PAUSE command), no additional data. Prevents server from sending more output until RESUME is received. | Flow control message to resume PTY output. First byte is '3' (RESUME command), no additional data. Allows server to continue sending output after PAUSE. | JSON message sent immediately after WebSocket connection establishes. First byte is '{' (JSON_DATA indicator), followed by complete JSON object containing terminal dimensions (columns, rows). Server responds by sending initial setup messages and spawning the configured process. */
export interface UnknownClientMessage {
    /** Command code for JSON_DATA (ASCII character '{') */
    command: '{';
    /** Raw keyboard input data (UTF-8 encoded) */
    data: string;
    /** Terminal width in characters */
    columns: number;
    /** Terminal height in lines */
    rows: number;
    /** Authentication token (if server requires auth, optional otherwise) */
    token?: string;
}
/** Binary message containing terminal output from PTY process. First byte is '0' (OUTPUT command), followed by raw ANSI-formatted terminal data. May include ANSI escape sequences for colors, cursor positioning, etc. Broadcast to all clients sharing the terminal session. | Text message to update the browser window title. First byte is '1' (SET_WINDOW_TITLE command), followed by title text. Sent during initial connection sequence. Format is "command (hostname)". | JSON message containing client configuration preferences. First byte is '2' (SET_PREFERENCES command), followed by JSON object. Sent during initial connection sequence. Preferences may include theme, font settings, keybindings, etc. | Text message assigning terminal session ID to this client. First byte is '3' (SET_TERMINAL_ID command), followed by terminal_id string. Sent during initial connection sequence. Allows multiple clients to identify shared sessions. | Text message indicating the type of shell running in the terminal. First byte is '4' (SET_SHELL_TYPE command), followed by shell name string. Sent during initial connection sequence. Used for UI indicators and syntax highlighting hints. */
export interface UnknownServerMessage {
    /** Command code for SET_SHELL_TYPE (ASCII character '4') */
    command: '4';
    /** Raw terminal output with ANSI escape sequences */
    data: string;
    /** Window title text */
    title: string;
    /** Client configuration object */
    preferences: {
        font_size?: number;
        theme?: string;
        font_family?: string;
    };
    /** Numeric terminal session ID (1-65535) */
    terminal_id: string;
    /** Shell type identifier */
    shell_type: 'bash' | 'zsh' | 'fish' | 'sh' | 'ssh' | 'tmux';
}
export interface ITerminalConnectTerminalWebSocketWebSocket {
    /** Binary message containing user keystrokes. First byte is '0' (INPUT command), followed by raw keyboard data (UTF-8 encoded). Blocked if client has readonly mode enabled. */
    sendInput(data: string | Uint8Array): void;
    /** JSON message indicating terminal window has been resized. First byte is '1' (RESIZE_TERMINAL command), followed by JSON object with new columns and rows. */
    sendResize(payload: {
        command: '1';
        columns: number;
        rows: number;
    }): void;
    /** Flow control message to pause PTY output. First byte is '2' (PAUSE command), no additional data. Prevents server from sending more output until RESUME is received. */
    sendPause(): void;
    /** Flow control message to resume PTY output. First byte is '3' (RESUME command), no additional data. Allows server to continue sending output after PAUSE. */
    sendResume(): void;
    /** JSON message sent immediately after WebSocket connection establishes. First byte is '{' (JSON_DATA indicator), followed by complete JSON object containing terminal dimensions (columns, rows). Server responds by sending initial setup messages and spawning the configured process. */
    sendJsonData(payload: {
        command: '{';
        columns: number;
        rows: number;
        token?: string;
    }): void;
    /** Binary message containing terminal output from PTY process. First byte is '0' (OUTPUT command), followed by raw ANSI-formatted terminal data. May include ANSI escape sequences for colors, cursor positioning, etc. Broadcast to all clients sharing the terminal session. */
    onOutput(callback: (payload: Uint8Array) => void): () => void;
    /** Text message to update the browser window title. First byte is '1' (SET_WINDOW_TITLE command), followed by title text. Sent during initial connection sequence. Format is "command (hostname)". */
    onSetWindowTitle(callback: (payload: string) => void): () => void;
    /** JSON message containing client configuration preferences. First byte is '2' (SET_PREFERENCES command), followed by JSON object. Sent during initial connection sequence. Preferences may include theme, font settings, keybindings, etc. */
    onSetPreferences(callback: (payload: {
        command: '2';
        preferences: {
            font_size?: number;
            theme?: string;
            font_family?: string;
        };
    }) => void): () => void;
    /** Text message assigning terminal session ID to this client. First byte is '3' (SET_TERMINAL_ID command), followed by terminal_id string. Sent during initial connection sequence. Allows multiple clients to identify shared sessions. */
    onSetTerminalId(callback: (payload: string) => void): () => void;
    /** Text message indicating the type of shell running in the terminal. First byte is '4' (SET_SHELL_TYPE command), followed by shell name string. Sent during initial connection sequence. Used for UI indicators and syntax highlighting hints. */
    onSetShellType(callback: (payload: string) => void): () => void;
    /** Subscribe to RAW unknown frames. Forward-compat for unknown command bytes. */
    onUnknownFrame(callback: (buf: Uint8Array) => void): () => void;
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
export declare class TerminalConnectTerminalWebSocketWebSocket implements ITerminalConnectTerminalWebSocketWebSocket {
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
     * Handle an incoming BINARY frame for a byte-prefix-v1 channel.
     * Switches on the first byte to dispatch typed callbacks.
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
    private _replayPayloads;
    /**
     * Binary message containing user keystrokes. First byte is '0' (INPUT command), followed by raw keyboard data (UTF-8 encoded). Blocked if client has readonly mode enabled.
     */
    sendInput(data: string | Uint8Array): void;
    /**
     * JSON message indicating terminal window has been resized. First byte is '1' (RESIZE_TERMINAL command), followed by JSON object with new columns and rows.
     */
    sendResize(payload: {
        command: '1';
        columns: number;
        rows: number;
    }): void;
    /**
     * Flow control message to pause PTY output. First byte is '2' (PAUSE command), no additional data. Prevents server from sending more output until RESUME is received.
     */
    sendPause(): void;
    /**
     * Flow control message to resume PTY output. First byte is '3' (RESUME command), no additional data. Allows server to continue sending output after PAUSE.
     */
    sendResume(): void;
    /**
     * JSON message sent immediately after WebSocket connection establishes. First byte is '{' (JSON_DATA indicator), followed by complete JSON object containing terminal dimensions (columns, rows). Server responds by sending initial setup messages and spawning the configured process.
     */
    sendJsonData(payload: {
        command: '{';
        columns: number;
        rows: number;
        token?: string;
    }): void;
    /**
     * Binary message containing terminal output from PTY process. First byte is '0' (OUTPUT command), followed by raw ANSI-formatted terminal data. May include ANSI escape sequences for colors, cursor positioning, etc. Broadcast to all clients sharing the terminal session.
     */
    onOutput(callback: (payload: Uint8Array) => void): () => void;
    /**
     * Text message to update the browser window title. First byte is '1' (SET_WINDOW_TITLE command), followed by title text. Sent during initial connection sequence. Format is "command (hostname)".
     */
    onSetWindowTitle(callback: (payload: string) => void): () => void;
    /**
     * JSON message containing client configuration preferences. First byte is '2' (SET_PREFERENCES command), followed by JSON object. Sent during initial connection sequence. Preferences may include theme, font settings, keybindings, etc.
     */
    onSetPreferences(callback: (payload: {
        command: '2';
        preferences: {
            font_size?: number;
            theme?: string;
            font_family?: string;
        };
    }) => void): () => void;
    /**
     * Text message assigning terminal session ID to this client. First byte is '3' (SET_TERMINAL_ID command), followed by terminal_id string. Sent during initial connection sequence. Allows multiple clients to identify shared sessions.
     */
    onSetTerminalId(callback: (payload: string) => void): () => void;
    /**
     * Text message indicating the type of shell running in the terminal. First byte is '4' (SET_SHELL_TYPE command), followed by shell name string. Sent during initial connection sequence. Used for UI indicators and syntax highlighting hints.
     */
    onSetShellType(callback: (payload: string) => void): () => void;
    /**
     * Subscribe to RAW unknown frames — frames whose first byte does not match
     * any known message-prefix in the spec. Mirrors the C server\u2019s silent-
     * ignore policy for unknown bytes (forward compatibility).
     */
    onUnknownFrame(callback: (buf: Uint8Array) => void): () => void;
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

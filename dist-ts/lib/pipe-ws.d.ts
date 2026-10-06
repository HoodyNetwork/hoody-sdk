/**
 * Pipe WebSocket relay client (`GET /{name}?ws`) — browser-safe, no Node imports.
 *
 * Two peers connecting to the same name get a two-way message channel: every
 * text or binary message one sends arrives at the other as one message of the
 * same type. `openPipeDuplex()` wraps the socket as a `PipeDuplex`
 * (WHATWG WebSocketStream shape) with:
 *
 *   - kit auth on the upgrade (lib/kit-ws-auth.ts: headers in Node via the
 *     `ws` package, `?token=` / a token rule's param in browsers);
 *   - a bounded receive queue: a consumer that stops reading closes the
 *     socket with 4013 instead of growing memory;
 *   - one write = one message, ≤ 1 MiB (the kit's message cap), never split.
 *
 * The relay closes both peers with 1013 when a reader falls 2 MiB behind
 * (the kit cannot pause a sender); bulk byte streams belong on the HTTP pipe
 * or forwardTcp({ transport: 'ws' }), which flow-controls end to end.
 */
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
/** The kit's per-message cap (maxPayloadLength). */
export declare const PIPE_WS_MAX_MESSAGE_BYTES: number;
/** Close code for a local receive-queue overflow (browser-sendable range). */
export declare const PIPE_WS_RECEIVE_OVERFLOW = 4013;
export interface PipeConnectOptions {
    /** Seconds the first peer waits for the second (1-3600, kit default 300). */
    wait?: number;
    /** Sec-WebSocket-Protocol offer. Both peers must agree (the kit latches the first peer's choice). */
    protocols?: string | string[];
    /** Aborting closes the socket (1000 "Aborted."), or rejects connect() before open. */
    signal?: AbortSignal;
    /** Received bytes held for a slow reader before closing with 4013. Default 4 MiB. */
    maxReceiveBytes?: number;
    /** Received messages held for a slow reader before closing with 4013. Default 4096. */
    maxReceiveMessages?: number;
}
export interface PipeDuplex {
    /** One chunk per received message: string (text) or Uint8Array (binary). */
    readable: ReadableStream<string | Uint8Array>;
    /** One write = one message. Resolves once the socket's send buffer is below 1 MiB. */
    writable: WritableStream<string | Uint8Array>;
    /** The underlying socket (global WebSocket, or the `ws` package in Node with auth headers). */
    socket: WebSocket;
    /** Resolves (never rejects) with the close code and reason. */
    closed: Promise<{
        code: number;
        reason: string;
    }>;
    close(code?: number, reason?: string): void;
}
/** A refused handshake, a failed connection, or a close that ended a read/write. */
export declare class PipeWsError extends Error {
    readonly status?: number | undefined;
    readonly code?: number | undefined;
    readonly reason?: string | undefined;
    constructor(message: string, status?: number | undefined, code?: number | undefined, reason?: string | undefined);
}
/** Shape of the kit's `?status` answer the error lookup reads. */
type StatusLike = {
    kind?: string | null;
    peers?: number | null;
};
export interface OpenPipeDuplexParams {
    /** ws:// or wss:// URL with `?ws`. */
    url: string;
    kitAuth?: ProxyAuth | ProxyAuthPolicy | undefined;
    options?: PipeConnectOptions;
    /** Label for errors ("pipe.connect()"). */
    label?: string;
    /** Looks up `?status` for a refused handshake whose status the socket API hides. */
    status?: () => Promise<StatusLike | null>;
}
/** http(s) → ws(s); the rest of the URL is kept. */
export declare function toWebSocketUrl(httpUrl: string): string;
/** Open a relay connection; resolves on the 101 (not when the peer arrives). */
export declare function openPipeDuplex(p: OpenPipeDuplexParams): Promise<PipeDuplex>;
export {};

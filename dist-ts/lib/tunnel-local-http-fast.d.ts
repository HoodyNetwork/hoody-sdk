export interface FastResponse {
    status: number;
    headers: [string, string][];
    body: Uint8Array;
}
/**
 * Where a streamed response goes as it is parsed: its head once, then each body piece in
 * order. `body` resolves once the piece is passed on; the pool reads at most
 * STREAM_HIGH_WATER bytes ahead of it, so a slow consumer slows the local target instead of
 * filling memory. A streamed response has no MAX_RESPONSE_BYTES cap, and its FastResponse
 * carries an empty body.
 */
export interface ResponseSink {
    head: (status: number, headers: [string, string][]) => void;
    body: (chunk: Uint8Array) => Promise<void>;
    /**
     * Called once, synchronously, when the response fails after its head (the local socket
     * ends early or errors, or `body` rejects), before the request rejects. A `body` call in
     * progress may still be waiting; the sink must not send anything after this.
     */
    fail?: (err: Error) => void;
}
declare class TargetPool {
    private host;
    private port;
    private idle;
    private busy;
    private waiters;
    private maxSockets;
    /**
     * Connections being opened (waiting for an FD permit or for the connect itself). They
     * count against maxSockets with `busy`, so concurrent opens never overshoot it.
     */
    private connecting;
    /** Sockets of those opens, so destroy() can close them before they connect. */
    private connectingSockets;
    /** After destroy(): nothing is opened or pooled any more. */
    private destroyed;
    constructor(host: string, port: number, maxSockets?: number);
    private parseHeadersBlock;
    private onData;
    /**
     * Reject the in-flight request and tear down the socket when the buffered
     * body would exceed MAX_RESPONSE_BYTES. Returns true when enforced so the
     * caller can bail out of the parse step.
     */
    private enforceBodyCap;
    /**
     * Body bytes of the in-flight response: passed to its sink when it streams, else buffered
     * under MAX_RESPONSE_BYTES. True when the request was refused and the socket torn down.
     */
    private takeBody;
    /** A streamed response whose sink failed, or whose socket went away mid-body. */
    private failStream;
    private completeResponse;
    /** Back to the idle list, or closed, once nothing is in flight on it. */
    private afterResponse;
    /** Callers check capacity first; the count taken here holds the slot until it settles. */
    private createSocket;
    /**
     * A closed socket frees a slot without passing through the idle list (one closed instead
     * of reused, or one that failed): a request waiting for a slot gets a new connection,
     * not the null of its wait timing out.
     */
    private serveWaiter;
    private acquire;
    /**
     * One body-less request. `signal` aborts it: the request rejects (a streamed response's
     * sink gets `fail` first), and its socket is destroyed, never reused. An abort is a
     * failure even where the socket's close would end a response: one delimited by the close.
     */
    request(method: string, path: string, headerLines: string, sink?: ResponseSink, signal?: AbortSignal): Promise<FastResponse>;
    /** Close a socket for good: its 'close' handler fails what is in flight on it. */
    private abortSocket;
    /** Fail `pending` first, then close its socket, so the close cannot complete it. */
    private abortRequest;
    requestStreaming(method: string, path: string, headerLines: string, sink?: ResponseSink): Promise<{
        writeBody: (chunk: Uint8Array) => Promise<void>;
        endBody: () => void;
        waitResponse: () => Promise<FastResponse>;
        abort: () => void;
    }>;
    destroy(): void;
}
export declare function getFastPool(host: string, port: number): TargetPool;
export declare function destroyAllFastPools(): void;
export {};

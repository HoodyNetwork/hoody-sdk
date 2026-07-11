export interface FastResponse {
    status: number;
    headers: [string, string][];
    body: Uint8Array;
}
declare class TargetPool {
    private host;
    private port;
    private idle;
    private busy;
    private waiters;
    private maxSockets;
    constructor(host: string, port: number, maxSockets?: number);
    private parseHeadersBlock;
    private onData;
    /**
     * Reject the in-flight request and tear down the socket when the buffered
     * body would exceed MAX_RESPONSE_BYTES. Returns true when enforced so the
     * caller can bail out of the parse step.
     */
    private enforceBodyCap;
    private completeResponse;
    private createSocket;
    private acquire;
    request(method: string, path: string, headerLines: string): Promise<FastResponse>;
    requestStreaming(method: string, path: string, headerLines: string): Promise<{
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

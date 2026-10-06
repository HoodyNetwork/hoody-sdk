/**
 * Pipe Browser — browser data transfer through the Hoody Pipe service.
 *
 * The browser counterpart of PipeStream (lib/pipe-stream.ts, which is
 * Node-only):
 *
 *   const pipe = PipeBrowser.fromClient(client, container);
 *   await pipe.sendFile('report', file, { onProgress: (p) => show(p.loaded / p.total) });
 *   const { body } = await pipe.receive('report');        // a ReadableStream
 *   pipe.download('report');                               // the browser's download manager
 *   for await (const ev of pipe.subscribeProgress('report')) { ... }
 *   pipe.openPage('receive', 'report', { autostart: true }); // the kit's own receive page
 *
 * sendFile uploads with XMLHttpRequest, for real upload progress. A
 * PipeBrowser built with a transport (fromClient on a HoodyClient, or
 * `config.transport`) sends through it instead, because XHR cannot carry the
 * client's kitAuth or injected fetch; its progress then comes from the
 * server's ?progress events (bytes forwarded to the receivers).
 *
 * Browser-only (XMLHttpRequest, document) and free of Node imports. Not
 * exported from the Node.js entry point (lib/index.ts).
 */
import { type PipeTransport } from './pipe-transport.js';
import { type SseEvent } from './sse-stream.js';
import type { ProxyAuth, ProxyAuthPolicy } from './proxy-auth.js';
import { type PipeConnectOptions, type PipeDuplex } from './pipe-ws.js';
import { PipeTransferError, type PipeStatusMessage } from './pipe-status.js';
import type { PipeStatus } from './pipe-stream.js';
export type { PipeStatus };
import { type PipeOpenPageOptions, type PipePage, type PipePageOptionsMap } from './pipe-media.js';
export interface PipeBrowserConfig {
    /** Full pipe kit base URL (e.g. https://proj-ctr-pipe-1.srv.containers.hoody.com) */
    pipeBaseUrl: string;
    /** Path prefix for pipe endpoints (default: '/api/v1/pipe') */
    basePath?: string;
    /**
     * Sends every request, sendFile's upload included. `fromClient()` supplies
     * the client's transport (injected fetch + kitAuth). Omitted, receive and
     * subscribeProgress use the global `fetch` and sendFile uses XMLHttpRequest.
     */
    transport?: PipeTransport;
    /**
     * Kit credential for connect()'s WebSocket upgrade. A browser socket cannot
     * send headers: a token rule's `param` (or `?token=`) carries it; a
     * containerClaim credential is refused. `fromClient()` takes the client's.
     */
    kitAuth?: ProxyAuth | ProxyAuthPolicy;
}
/** What sendFile sends. A File's name becomes the download name unless `filename` says otherwise. */
export type PipeSendData = Blob | string | ArrayBuffer | ArrayBufferView;
export { PipeTransferError, type PipeStatusMessage };
export interface PipeUploadProgress {
    /** Bytes sent so far. */
    loaded: number;
    /** Bytes in total. */
    total: number;
}
export interface PipeSendFileOptions {
    /** Receivers the transfer waits for (1-256). */
    n?: number;
    /** Download name for the receivers (Content-Disposition). Default: the File's name; `null` sends none. */
    filename?: string | null;
    /** Content-Type. Default: the Blob's type, `text/plain; charset=utf-8` for a string, else application/octet-stream. */
    contentType?: string;
    /** This transfer's id (`?transfer=`, 16-64 characters of A-Z a-z 0-9 `_` `-`); the kit refuses one in use (409). */
    transfer?: string;
    /** Upload progress. */
    onProgress?: (progress: PipeUploadProgress) => void;
    /** Each status line of the sender's response, as it arrives. */
    onStatus?: (message: PipeStatusMessage) => void;
    /** Cancels the upload; the transfer then fails for its receivers. */
    signal?: AbortSignal;
}
export interface PipeSendFileResult {
    /** HTTP status of the upload. */
    status: number;
    /** Bytes sent. */
    bytes: number;
    /** Every status line of the sender's response. */
    messages: PipeStatusMessage[];
}
export interface PipeReceiveOptions {
    /** Receivers the transfer waits for; must match the sender (1-256). */
    n?: number;
    /** Watch a live stream (`?live`) from now on; not with `n` above 1. */
    live?: boolean;
    signal?: AbortSignal;
}
/** Same shape as PipeStream's receive result. */
export interface PipeReceiveResult {
    /** The sender's bytes, streamed. */
    body: ReadableStream<Uint8Array>;
    /** Forwarded headers (Content-Type, Content-Length, Content-Disposition, X-Piping, X-Hoody-Pipe). */
    headers: Headers;
    status: number;
}
export interface PipeDownloadOptions {
    /** Receivers the transfer waits for; must match the sender (1-256). */
    n?: number;
    /** Download name (the server's `?filename`). */
    filename?: string;
}
export interface PipeDownload {
    /** The `?download` URL the browser receives from. */
    readonly url: string;
    /** The hidden iframe that started it. */
    readonly frame: HTMLIFrameElement;
    /**
     * Remove the iframe. Before the sender arrives this cancels the receive;
     * once the download manager has the file it keeps downloading.
     */
    remove(): void;
}
/** A `?progress` event: what PipeStream.subscribeProgress yields for the same stream, with every field set (the Node type leaves the fields added for #891 optional so older event literals still compile). */
export type PipeProgressEvent = {
    kind: 'state';
    state: 'idle' | 'waiting' | 'streaming' | 'complete' | 'failed';
    ts: number;
    hasSender: boolean;
    activeReceivers: number;
    /** null on a live stream (no `n`). */
    totalReceivers: number | null;
    /** A live stream (`?live`): `activeReceivers` are the viewers watching now. */
    live: boolean;
} | {
    kind: 'progress';
    bytesTransferred: number;
    speed: number;
    eta: number;
    receivers: number;
    ts: number;
    /** From the sender's Content-Length; null when it sent none. */
    totalBytes: number | null;
    elapsed: number;
    /** A live stream (`?live`): `receivers` are the viewers watching now. */
    live: boolean;
} | {
    kind: 'done';
    bytesTransferred: number;
    duration: number;
    avgSpeed: number;
    ts: number;
    state: 'complete' | 'failed';
    reason?: string;
    /** SHA-256 of a completed `sha256` transfer; absent otherwise. */
    sha256?: string;
    /** The transfer's id; absent for a WebSocket pair, a live stream or an older kit. */
    transferId?: string;
};
export declare class PipeBrowser {
    private readonly baseUrl;
    private readonly basePath;
    private readonly transport;
    /** Whether a transport was supplied: sendFile then uses it, not XHR. */
    private readonly hasTransport;
    constructor(config: PipeBrowserConfig);
    private readonly kitAuth;
    /** `wss://…/{name}?ws[&wait=]` — the relay URL for `name` (no credential in it). */
    getWsUrl(name: string, opts?: {
        wait?: number | undefined;
    }): string;
    /**
     * Open a WebSocket relay connection on `name` (see PipeStream.connect).
     * A refused handshake is looked up on `?status` for its reason, because
     * the browser hides the HTTP status.
     */
    connect(name: string, opts?: PipeConnectOptions): Promise<PipeDuplex>;
    /**
     * Create a PipeBrowser from a HoodyClient + container: resolves the pipe kit
     * URL and sends through `client.http`, so the client's injected transport
     * and kitAuth apply (lib/pipe-transport.ts).
     */
    static fromClient(client: any, container: any, serviceIndex?: number): PipeBrowser;
    /** Full pipe URL for a name; each segment percent-encoded, a reserved name refused (see PipeMedia.getUrl). */
    getUrl(path: string): string;
    /** URL of one of the kit's browser pages, settings pre-filled. See PipeMedia.getPageUrl. */
    getPageUrl<P extends PipePage>(page: P, name?: string, options?: PipePageOptionsMap[P]): string;
    /** Open a page with window.open. See PipeMedia.openPage. */
    openPage<P extends PipePage>(page: P, name?: string, options?: PipePageOptionsMap[P], open?: PipeOpenPageOptions): Window | null;
    /**
     * Send a File, Blob, string or bytes to pipe `path`. Resolves when the
     * server reports `Transfer complete.` (every receiver has the data).
     * Rejects with PipeTransferError on an `[ERROR]` line, a refused request,
     * a transfer the receivers left, or a response that ends without
     * completing; with an AbortError when `signal` aborts. With a client
     * transport, a refused request throws the client's ApiError.
     */
    sendFile(path: string, data: PipeSendData, opts?: PipeSendFileOptions): Promise<PipeSendFileResult>;
    private sendThroughXhr;
    private sendThroughTransport;
    /**
     * Receive from pipe `path` as a stream. Resolves when the sender arrives
     * (the response headers wait for it). Throws PipeTransferError on a refused
     * receive (with the client transport, its ApiError).
     */
    receive(path: string, opts?: PipeReceiveOptions): Promise<PipeReceiveResult>;
    /**
     * `?status` of `path`: one JSON snapshot, no receiver slot. With `transfer`
     * (a receiver's `X-Hoody-Pipe-Transfer-Id`), the state of that transfer:
     * a `?sha256` transfer stays readable 10 minutes after it ends. Throws
     * PipeTransferError on a refused request (404 for an unknown or expired id).
     */
    status(path: string, opts?: {
        transfer?: string;
        signal?: AbortSignal;
    }): Promise<PipeStatus>;
    /**
     * A GET that the browser's HTTP cache neither answers nor holds: Chromium
     * keeps a second GET of an identical URL waiting behind the first (about
     * 20 s), which stalled two tabs receiving one n>1 transfer. A supplied
     * transport may not honour `cache`, so its URL also gets a unique `_=`.
     */
    private receiveGet;
    /**
     * The `?download` URL for pipe `path`: a link the browser saves to disk.
     * Each call adds a unique `_=` (the kit ignores it), so two downloads of the
     * same pipe in one browser never wait on each other in its HTTP cache.
     */
    getDownloadUrl(path: string, opts?: PipeDownloadOptions): string;
    /**
     * Receive pipe `path` with the browser's download manager, so a file of any
     * size streams to disk: a hidden iframe opens the `?download` URL. The
     * download starts when the sender arrives. A browser navigation carries no
     * kitAuth headers: on a permission-guarded pipe use receive().
     */
    download(path: string, opts?: PipeDownloadOptions): PipeDownload;
    /**
     * Live transfer progress of pipe `path` from its `?progress` event stream.
     * Uses no receiver slot. Ends after the `done` event, or with no event when
     * the path's transfer has just ended (the server answers 204). Breaking out
     * of the loop, or aborting `signal`, closes the connection.
     */
    subscribeProgress(path: string, opts?: {
        signal?: AbortSignal;
    }): AsyncIterable<PipeProgressEvent>;
}
/** Map one `?progress` SSE event to a PipeProgressEvent; unknown events give null. */
export declare function toProgressEvent(ev: SseEvent): PipeProgressEvent | null;

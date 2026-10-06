/**
 * Pipe Media Streaming — Browser-Only Helpers
 *
 * High-level helpers for streaming screen captures, webcam feeds, and
 * arbitrary media through the Hoody Pipe service. The pipe protocol is
 * HTTP-based: POST to send, GET to receive, zero server-side storage.
 *
 * Usage:
 *   const pm = PipeMedia.fromClient(client, container);
 *   const session = await pm.shareScreen();
 *   console.log('Share this URL:', session.url);
 *   // ... later
 *   session.stop();
 *
 * `shareAudio()` streams the microphone (and optionally tab or system audio);
 * viewers open the same `?video` player. `getPageUrl()` / `openPage()` build
 * links to the kit's own browser pages (send, receive, share, video player,
 * progress, no-JavaScript send) with every page setting pre-filled.
 *
 * Browser-only: uses MediaRecorder, getDisplayMedia, getUserMedia.
 * Not exported from the Node.js entry point (lib/index.ts).
 */
import { type PipeTransport } from './pipe-transport.js';
export interface PipeMediaConfig {
    /** Full pipe kit base URL (e.g. https://proj-ctr-pipe-1.srv.containers.hoody.com) */
    pipeBaseUrl: string;
    /** Path prefix for pipe endpoints (default: '/api/v1/pipe') */
    basePath?: string;
    /** Default MediaRecorder timeslice in ms (default: 100) */
    defaultTimeslice?: number;
    /**
     * How requests are sent. `fromClient()` supplies the client's transport
     * (injected fetch + kitAuth); omitted, the global `fetch` is used with no
     * credentials.
     */
    transport?: PipeTransport;
}
export interface ShareScreenOptions {
    /** Custom pipe path. Auto-generated 24-char hex + extension if omitted. */
    path?: string;
    /** What to capture: 'monitor' (full screen), 'window', or 'browser' (tab). Default: user chooses. */
    surfaceType?: 'monitor' | 'window' | 'browser';
    /** Prefer a specific surface type in the picker. User can still pick others. */
    preferSurface?: 'monitor' | 'window' | 'browser';
    /** Cursor visibility: 'always', 'motion' (only when moving), 'never'. Default: 'always'. */
    cursor?: 'always' | 'motion' | 'never';
    /** Capture audio (tab audio or system audio). Default: false. */
    audio?: boolean;
    /** When capturing tab audio, suppress local playback so only the receiver hears it. Default: false. */
    suppressLocalAudioPlayback?: boolean;
    /** Capture system-level audio (not just tab). Requires 'monitor' surface on supported browsers. */
    systemAudio?: 'include' | 'exclude';
    /** Max frame rate (default: browser decides, typically 30). */
    frameRate?: number;
    /** Max width in pixels. */
    width?: number;
    /** Max height in pixels. */
    height?: number;
    /** Full DisplayMediaStreamOptions passthrough. Overrides all above when provided. */
    displayMediaOptions?: DisplayMediaStreamOptions;
    /** MediaRecorder timeslice in ms */
    timeslice?: number;
    /** MediaRecorder MIME type. Auto-detected if omitted. */
    mimeType?: string;
    /** Number of receivers (default: 1, max: 256) */
    n?: number;
    /**
     * Broadcast live (`?live`): the upload starts at once, and viewers join and
     * leave whenever they like, each starting at the next keyframe. Asks the
     * recorder for a keyframe about every 2 s (Chromium honours it). Needs a
     * WebM recording and `n` 1. The viewer URL carries `live`.
     */
    live?: boolean;
    /**
     * Append `?video` to the share URL so browsers render an HTML MSE player
     * instead of raw bytes. Default: **true** for screen sharing.
     */
    viewer?: boolean;
}
export interface ShareWebcamOptions {
    /** Custom pipe path. Auto-generated if omitted. */
    path?: string;
    /** Video constraints (default: true) */
    video?: boolean | MediaTrackConstraints;
    /** Audio constraints (default: true) */
    audio?: boolean | MediaTrackConstraints;
    /** MediaRecorder timeslice in ms */
    timeslice?: number;
    /** MediaRecorder MIME type. Auto-detected if omitted. */
    mimeType?: string;
    /** Number of receivers (default: 1, max: 256) */
    n?: number;
    /**
     * Broadcast live (`?live`): the upload starts at once, and viewers join and
     * leave whenever they like, each starting at the next keyframe. Asks the
     * recorder for a keyframe about every 2 s (Chromium honours it). Needs a
     * WebM recording and `n` 1. The viewer URL carries `live`.
     */
    live?: boolean;
    /**
     * Append `?video` to the share URL so browsers render an HTML MSE player
     * instead of raw bytes. Default: false for webcam.
     */
    viewer?: boolean;
}
export interface ShareAudioOptions {
    /** Custom pipe path. Auto-generated if omitted. */
    path?: string;
    /**
     * Microphone: `true` (default), constraints, or `false` to send only the
     * tab or system audio.
     */
    microphone?: boolean | MediaTrackConstraints;
    /**
     * Also capture tab or system audio through the browser's screen picker
     * (getDisplayMedia). Chromium offers it for a tab, and for the whole screen
     * on Windows and ChromeOS; the user must tick "Share audio". Only the audio
     * is sent. Mixed with the microphone when both are on. Default: false.
     */
    systemAudio?: boolean;
    /** MediaRecorder timeslice in ms */
    timeslice?: number;
    /** MediaRecorder MIME type. Auto-detected if omitted (audio/webm;codecs=opus where supported). */
    mimeType?: string;
    /** Number of receivers (default: 1, max: 256) */
    n?: number;
    /**
     * Broadcast live (`?live`): the upload starts at once, and viewers join and
     * leave whenever they like, each starting at the next keyframe. Asks the
     * recorder for a keyframe about every 2 s (Chromium honours it). Needs a
     * WebM recording and `n` 1. The viewer URL carries `live`.
     */
    live?: boolean;
    /**
     * Append `?video` to the share URL so browsers open the kit's player page,
     * which also plays an audio-only stream. Default: true.
     */
    viewer?: boolean;
}
export interface ReceiveMediaOptions {
    /** Expected MIME type from sender. Auto-detected from X-Hoody-Pipe header if omitted. */
    mimeType?: string;
    /** Playback mode. 'mse' for MediaSource Extensions (live), 'direct' to set video.src to pipe URL. Auto-selects MSE when supported. */
    mode?: 'mse' | 'direct';
    /** Number of receivers (default: 1) */
    n?: number;
    /** Watch a live stream (`?live`) from now on; not with `n` above 1. */
    live?: boolean;
}
export interface MediaSession {
    /** Full receiver URL — share this to let others watch */
    readonly url: string;
    /** The pipe path used */
    readonly path: string;
    /** The underlying MediaStream */
    readonly mediaStream: MediaStream;
    /** The MediaRecorder instance */
    readonly recorder: MediaRecorder;
    /** Actual MIME type used by the recorder */
    readonly mimeType: string;
    /** Whether the session is still active (not stopped) */
    readonly active: boolean;
    /** Whether recording is currently paused */
    readonly paused: boolean;
    /** This share's transfer id (sent as `?transfer=`): `?status&transfer=<id>` on the name is this transfer. */
    readonly transferId: string;
    /**
     * Settles when the upload ends (after stop, or when the transfer ends by
     * itself). Rejects with a PipeTransferError when the transfer failed: the
     * server's `[ERROR]` text (e.g. "Timed out waiting for receivers."), every
     * receiver leaving, or a network error. Capture is stopped either way.
     */
    readonly done: Promise<void>;
    /** Stop streaming, release camera/screen, close pipe. Irreversible. */
    stop(): void;
    /** Pause recording — stops sending new frames but keeps the pipe and tracks alive. */
    pause(): void;
    /** Resume a paused recording. */
    resume(): void;
    /** Mute/unmute the audio track (video keeps streaming). */
    muteAudio(muted: boolean): void;
    /** Mute/unmute the video track (audio keeps streaming). */
    muteVideo(muted: boolean): void;
    /** Get live track settings (resolution, frameRate, deviceId, displaySurface, cursor, etc.) */
    getVideoSettings(): MediaTrackSettings | null;
    /** Get audio track settings */
    getAudioSettings(): MediaTrackSettings | null;
    /** Register a callback for when the session ends (browser revoke, a failed or finished transfer, or manual stop). */
    onEnded(callback: () => void): void;
}
export interface ReceiveSession {
    /** Whether the session is still active */
    readonly active: boolean;
    /** Resolves when playback/stream ends */
    readonly done: Promise<void>;
    /** Stop receiving and release resources */
    stop(): void;
}
/** The browser pages the pipe kit serves. */
export type PipePage = 'send' | 'receive' | 'share' | 'video' | 'progress' | 'noscript';
/** Send page (`/`). The name is the second argument of getPageUrl. */
export interface PipeSendPageOptions {
    /** Receivers the transfer waits for (1-256). */
    n?: number;
    /** Text to send: fills the text box and selects text mode. */
    text?: string;
    /** Start in file or text mode. */
    mode?: 'file' | 'text';
    /** File name for a text or pasted send. */
    filename?: string;
    /** Send the text without a click (text mode only). */
    autostart?: boolean;
}
/** Share page (`/{name}?share`). Capture always waits for the user's click. */
export interface PipeSharePageOptions {
    /** What to share. */
    source?: 'screen' | 'camera' | 'audio';
    /** Share audio with the screen. */
    audio?: boolean;
    /** Hint for the browser's screen picker. */
    surface?: 'monitor' | 'window' | 'browser';
    /** Video quality. */
    quality?: 'low' | 'medium' | 'high';
    /** Frame rate (1-60). */
    fps?: number;
    /** Viewers the stream waits for (1-256). */
    n?: number;
    /**
     * Live broadcast (`?live`): the share starts at once and viewers join and
     * leave at any time through `?video&live=1`. Not with `n` above 1.
     */
    live?: boolean;
}
/** Receive page (`/{name}?receive`). */
export interface PipeReceivePageOptions {
    /** Receivers the transfer waits for (1-256); must match the sender. */
    n?: number;
    /** Download file name (the server's `?filename`). */
    filename?: string;
    /** Start receiving without a click. */
    autostart?: boolean;
    /** Seconds the download waits for the sender (1-3600; the kit's default is 300). */
    wait?: number;
    /** Have the kit hash the transfer (`?sha256` on the download). The page shows no checksum. */
    sha256?: boolean;
}
/** Video player page (`/{name}?video`). */
export interface PipeVideoPageOptions {
    /** Viewers the stream waits for (1-256); must match the sender. */
    n?: number;
    /** Play a live stream (`?live`): joins from now on and keeps up with the newest data. Not with `n` above 1. */
    live?: boolean;
    /** Seconds the player waits for the stream (1-3600; the kit's default is 300). */
    wait?: number;
}
/** Send page without JavaScript (`/noscript`). The name pre-fills its path field. */
export interface PipeNoscriptPageOptions {
    /** Send a file or typed text. */
    mode?: 'file' | 'text';
    /** Seconds the send waits for the receivers (1-3600; the kit's default is 300). */
    wait?: number;
    /** Have the kit hash the transfer (`?sha256` on the send). The page shows no checksum. */
    sha256?: boolean;
}
/** The options each page accepts. The progress page takes none. */
export interface PipePageOptionsMap {
    send: PipeSendPageOptions;
    receive: PipeReceivePageOptions;
    share: PipeSharePageOptions;
    video: PipeVideoPageOptions;
    progress: Record<string, never>;
    noscript: PipeNoscriptPageOptions;
}
/** How openPage opens the page: window.open's target (default `_blank`) and features. */
export interface PipeOpenPageOptions {
    target?: string;
    features?: string;
}
export interface MediaStreamConversion {
    stream: ReadableStream<Uint8Array>;
    recorder: MediaRecorder;
    mimeType: string;
    /**
     * Pause (true) or resume (false) the recording for the caller. Use this
     * rather than `recorder.pause()`: the stream also pauses the recorder while
     * its reader is behind, and resumes only a recording the caller has not
     * paused.
     */
    hold(paused: boolean): void;
    /** Why the stream failed when it outgrew its bound (16 MiB waiting); undefined otherwise. */
    readonly failure: Error | undefined;
}
/**
 * Convert a MediaStream to a ReadableStream<Uint8Array> via MediaRecorder.
 *
 * Each MediaRecorder chunk (fired every `timeslice` ms) is converted to a
 * Uint8Array and enqueued. Blob→ArrayBuffer conversions are chained
 * sequentially to preserve chunk order. The recording follows the reader:
 * while nobody reads (no receiver yet, a slow upload), the recorder pauses
 * once 8 MiB wait and resumes when the reader is back to 4 MiB behind. More
 * than 16 MiB waiting fails the stream with an error that says so and stops
 * the recording.
 */
export declare function mediaStreamToReadableStream(mediaStream: MediaStream, timeslice?: number, mimeType?: string, keyFrameIntervalMs?: number): MediaStreamConversion;
export declare class PipeMedia {
    private readonly baseUrl;
    private readonly basePath;
    private readonly defaultTimeslice;
    private readonly transport;
    /** A given transport may not honour `cache`, so its receive URLs get a unique `_=`. */
    private readonly bustCache;
    constructor(config: PipeMediaConfig);
    /**
     * Create a PipeMedia instance from a HoodyClient + container.
     * Automatically resolves the pipe kit URL, and sends through `client.http`
     * so the client's injected transport and kitAuth apply
     * (lib/pipe-transport.ts).
     */
    static fromClient(client: any, container: any, serviceIndex?: number): PipeMedia;
    /**
     * Generate a random 24-char hex path with a media file extension.
     * Uses crypto.getRandomValues for secure randomness.
     */
    static randomPath(mimeType?: string): string;
    /**
     * Auto-detect the most compatible MediaRecorder MIME type.
     * Prefers widely-supported codecs over "best quality".
     *
     * When a MediaStream is provided, the codec selection adapts to the actual
     * tracks present: video+audio → vp8,opus; video-only → vp8 (no opus).
     * This is critical for MSE playback — if the MIME declares an opus audio
     * track but the WebM data has none, MSE rejects the init segment with
     * "Initialization segment misses expected opus track".
     * An audio-only stream gets an audio type (audio/webm;codecs=opus first),
     * for the same reason: a video type declares a track the data lacks.
     */
    static pickMimeType(mediaStream?: MediaStream): string;
    /**
     * Check if the current browser supports pipe media streaming.
     * Requires: MediaRecorder, ReadableStream, fetch with streaming body (duplex: 'half'),
     * a secure context, and navigator.mediaDevices.
     */
    static isSupported(): boolean;
    /**
     * Build the full pipe URL for a given path.
     *
     * Encodes PER SEGMENT. Whole-value `encodeURIComponent` turns a multi-segment
     * channel like `cam/1` into `cam%2F1`, which the server's segment-wise router
     * answers with 400.
     *
     * Rejects `.` and `..` segments (checked after percent-decoding, since `%2e%2e`
     * normalises identically). Preserving `/` separators means a caller-supplied
     * path can introduce segments, and without this guard it walks out of the pipe
     * route entirely — measured against this exact expression:
     *
     *     '../../x' -> /api/x      '..' -> /api/v1/      'a/../../b' -> /api/v1/b
     *
     * with the caller's bearer token still attached. `validatePipePath` does not
     * cover it either; it checks only length and reserved names.
     *
     * Deliberately inlined rather than importing `encodePipePath` from
     * `pipe-stream.ts`: this module is browser-only and dependency-free, and
     * pipe-stream imports `node:net`/`node:fs`/`node:stream`/`node:url` — pulling
     * it in breaks `build:browser` outright (measured). Keep the two in sync by
     * hand; they encode the same rule, and a test fails if they drift.
     *
     * A name the kit answers itself (`metrics`, `help/`, `/`, ...) throws: see
     * reservedPipePath in pipe-status.ts.
     */
    getUrl(path: string): string;
    /**
     * URL of one of the kit's browser pages, with its settings pre-filled.
     *
     *   send      `/?name=&n=&text=&mode=&filename=&autostart=1` (name optional)
     *   receive   `/{name}?receive&n=&filename=&autostart=1&wait=&sha256=1`
     *   share     `/{name}?share&source=&audio=1|0&surface=&quality=&fps=&n=&live=1`
     *   video     `/{name}?video&n=&live=1&wait=`
     *   progress  `/{name}?progress`
     *   noscript  `/noscript?path={encoded name}&mode=&wait=&sha256=1` (name optional)
     *
     * Pages live under the base path (`/api/v1/pipe`), like the kit's own links.
     * The name is encoded per segment (`/` stays a separator, a leading `/` is
     * kept). The noscript page puts its `path` into the form's URL as it is, so
     * it gets the encoded name, and the form posts to the pipe the SDK uses;
     * its single path field takes no `/`. `n` is written only above 1,
     * `autostart`, `sha256` and `live` only when true. A reserved name, a
     * `.`/`..` segment, a control character or backslash, an option the page
     * does not take, or an out-of-range value throws instead of building a link
     * the page would ignore.
     */
    getPageUrl<P extends PipePage>(page: P, name?: string, options?: PipePageOptionsMap[P]): string;
    /**
     * Open a page from getPageUrl() with `window.open` (new tab by default).
     * Returns the new Window, or null when the browser blocked the popup or the
     * features ask for `noopener`. Call it from a click handler: popup blockers
     * allow window.open only during a user gesture.
     */
    openPage<P extends PipePage>(page: P, name?: string, options?: PipePageOptionsMap[P], open?: PipeOpenPageOptions): Window | null;
    shareScreen(opts?: ShareScreenOptions): Promise<MediaSession>;
    shareWebcam(opts?: ShareWebcamOptions): Promise<MediaSession>;
    /**
     * Stream audio only. Viewers open `session.url` (the `?video` player plays
     * an audio-only stream). With both the microphone and `systemAudio`, the two
     * are mixed into one track. The session ends when any captured track ends
     * (the user stops sharing in the browser UI) or on `stop()`, which releases
     * every captured track.
     */
    shareAudio(opts?: ShareAudioOptions): Promise<MediaSession>;
    sendStream(path: string, stream: ReadableStream, contentType?: string, opts?: {
        signal?: AbortSignal;
        n?: number;
        live?: boolean;
    }): Promise<Response>;
    receiveStream(path: string, opts?: {
        n?: number;
        live?: boolean;
        signal?: AbortSignal;
    }): Promise<Response>;
    /**
     * A receive GET that the browser's HTTP cache neither answers nor holds:
     * Chromium keeps a second GET of an identical URL waiting behind the first
     * (about 20 s), which stalled two tabs receiving one n>1 transfer.
     */
    private receiveGet;
    receiveMedia(path: string, videoElement: HTMLVideoElement, opts?: ReceiveMediaOptions): Promise<ReceiveSession>;
    /**
     * Throw for a bad `path`, or `live` with `n` above 1 or a non-WebM `mimeType`,
     * before any capture starts, so a refused share never turns a camera on.
     */
    private checkSharePath;
    private streamMediaToPipe;
    private uploadMediaSession;
    /**
     * Follow a share's transfer while it uploads and report a failure: a
     * browser hands the upload's response over only once the upload ends, so
     * this is how a live share learns that its transfer failed.
     *
     * The share sent its own transfer id, so every check is about that transfer
     * only, and the `done` event with that id on the name's ?progress stream (a
     * spectator, no receiver slot) is followed between checks; until the
     * transfer was seen, for one retry interval at most (an idle name's stream
     * stays open and would stall the checks). Until the transfer is seen, a check reads the name's plain `?status`, which always
     * answers 200: the first checks run before the upload reaches the kit, and a
     * by-id miss there would be a 404 the browser logs as an error. A record
     * with this share's id counts at once; when another transfer holds the name,
     * this one is asked for by id (`?status&transfer=<id>`, its receipt), as it
     * may already have ended behind it. While the name stays idle, every
     * SHARE_WATCH_IDLE_ASK-th check asks by id too: the transfer may have ended
     * before any check saw it, and the name drops an ended record after 30 s
     * while its receipt stays 10 min. Once seen, every check is by id. A
     * failed record ends the share; a complete one is left to the upload. A 404
     * before the transfer was seen means the upload is not admitted yet (a
     * refused one ends through its own response); after that, a 404 for
     * SHARE_WATCH_MAX_GONE checks in a row (its record expired before a check
     * found the outcome) ends the share as failed. Stops when `signal` aborts.
     */
    private watchShareFailure;
    /** One check of a share's transfer (see watchShareFailure). */
    private shareStatus;
    /** A ?status answer: its HTTP status, and its JSON object when that was a 200 (else null). */
    private statusBody;
    /** Follow the name's ?progress events until this share's transfer ends there, or the stream does. */
    private followShareEvents;
    private receiveMediaDirect;
    private receiveMediaMSE;
}
/**
 * `url` plus a unique `_=` query param, which the pipe kit ignores. For a
 * receive GET that cannot set `cache: 'no-store'` (a client transport, an
 * iframe, a media element): Chromium holds a second GET of an identical URL
 * behind the first in its HTTP cache for about 20 s.
 */
export declare function withCacheBuster(url: string): string;
/**
 * Encode a pipe name for a URL path: each `/`-separated segment is
 * percent-encoded on its own, so `/` stays a separator and a leading `/` is
 * kept. A `.` or `..` segment (also as `%2e`) throws: see PipeMedia.getUrl.
 */
export declare function encodePipeName(path: string): string;
/** `name`, unless the kit answers it itself (its pages, health, metrics): then throw. */
export declare function refuseReservedPipeName(name: string): string;
/**
 * Build a page URL under `root` (pipe base URL + base path). See
 * PipeMedia.getPageUrl for the shapes and the refusals.
 */
export declare function buildPipePageUrl<P extends PipePage>(root: string, page: P, name?: string, options?: PipePageOptionsMap[P]): string;
/** `window.open(url)` for a page URL; see PipeMedia.openPage. */
export declare function openPipePage(url: string, open?: PipeOpenPageOptions): Window | null;

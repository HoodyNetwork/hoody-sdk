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
 * Browser-only: uses MediaRecorder, getDisplayMedia, getUserMedia.
 * Not exported from the Node.js entry point (lib/index.ts).
 */
export interface PipeMediaConfig {
    /** Full pipe kit base URL (e.g. https://proj-ctr-pipe-1.srv.containers.hoody.com) */
    pipeBaseUrl: string;
    /** Path prefix for pipe endpoints (default: '/api/v1/pipe') */
    basePath?: string;
    /** Default MediaRecorder timeslice in ms (default: 100) */
    defaultTimeslice?: number;
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
     * Append `?video` to the share URL so browsers render an HTML MSE player
     * instead of raw bytes. Default: false for webcam.
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
    /** Resolves when the upload fully completes (after stop) */
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
    /** Register a callback for when the session ends (browser revoke, network failure, or manual stop). */
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
export interface MediaStreamConversion {
    stream: ReadableStream<Uint8Array>;
    recorder: MediaRecorder;
    mimeType: string;
}
/**
 * Convert a MediaStream to a ReadableStream<Uint8Array> via MediaRecorder.
 *
 * Each MediaRecorder chunk (fired every `timeslice` ms) is converted to a
 * Uint8Array and enqueued. Blob→ArrayBuffer conversions are chained
 * sequentially to preserve chunk order. No backpressure pause/resume —
 * chunks flow as they arrive and fetch + TCP handle flow control naturally.
 */
export declare function mediaStreamToReadableStream(mediaStream: MediaStream, timeslice?: number, mimeType?: string): MediaStreamConversion;
export declare class PipeMedia {
    private readonly baseUrl;
    private readonly basePath;
    private readonly defaultTimeslice;
    constructor(config: PipeMediaConfig);
    /**
     * Create a PipeMedia instance from a HoodyClient + container.
     * Automatically resolves the pipe kit URL.
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
     */
    static pickMimeType(mediaStream?: MediaStream): string;
    /**
     * Check if the current browser supports pipe media streaming.
     * Requires: MediaRecorder, ReadableStream, fetch with streaming body (duplex: 'half'),
     * a secure context, and navigator.mediaDevices.
     */
    static isSupported(): boolean;
    /** Build the full pipe URL for a given path. */
    getUrl(path: string): string;
    shareScreen(opts?: ShareScreenOptions): Promise<MediaSession>;
    shareWebcam(opts?: ShareWebcamOptions): Promise<MediaSession>;
    sendStream(path: string, stream: ReadableStream, contentType?: string): Promise<Response>;
    receiveStream(path: string, opts?: {
        n?: number;
    }): Promise<Response>;
    receiveMedia(path: string, videoElement: HTMLVideoElement, opts?: ReceiveMediaOptions): Promise<ReceiveSession>;
    private streamMediaToPipe;
    private receiveMediaDirect;
    private receiveMediaMSE;
}

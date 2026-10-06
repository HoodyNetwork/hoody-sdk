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

import { globalFetchPipeTransport, pipeTransportFromClient, type PipeTransport } from './pipe-transport.js';
import { PipeTransferError, StatusLines, errorText, reservedPipePath } from './pipe-status.js';
import { parseSseStream } from './sse-stream.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

  // ── Surface selection ──
  /** What to capture: 'monitor' (full screen), 'window', or 'browser' (tab). Default: user chooses. */
  surfaceType?: 'monitor' | 'window' | 'browser';
  /** Prefer a specific surface type in the picker. User can still pick others. */
  preferSurface?: 'monitor' | 'window' | 'browser';

  // ── Cursor ──
  /** Cursor visibility: 'always', 'motion' (only when moving), 'never'. Default: 'always'. */
  cursor?: 'always' | 'motion' | 'never';

  // ── Audio ──
  /** Capture audio (tab audio or system audio). Default: false. */
  audio?: boolean;
  /** When capturing tab audio, suppress local playback so only the receiver hears it. Default: false. */
  suppressLocalAudioPlayback?: boolean;
  /** Capture system-level audio (not just tab). Requires 'monitor' surface on supported browsers. */
  systemAudio?: 'include' | 'exclude';

  // ── Video quality ──
  /** Max frame rate (default: browser decides, typically 30). */
  frameRate?: number;
  /** Max width in pixels. */
  width?: number;
  /** Max height in pixels. */
  height?: number;

  // ── Advanced ──
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

// ---------------------------------------------------------------------------
// Utility: MediaStream → ReadableStream
// ---------------------------------------------------------------------------

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

/** Recorded bytes waiting for the reader (queued, or still Blobs being converted) at which the recorder pauses. */
const CAPTURE_PAUSE_BYTES = 8 * 1024 * 1024;
/** Waiting bytes at or below which a recorder paused for the reader resumes. */
const CAPTURE_RESUME_BYTES = 4 * 1024 * 1024;
/** Waiting bytes beyond which the stream fails and the recording stops (a recorder that kept sending while paused). */
const CAPTURE_MAX_BYTES = 16 * 1024 * 1024;

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
export function mediaStreamToReadableStream(
  mediaStream: MediaStream,
  timeslice = 100,
  mimeType?: string,
  keyFrameIntervalMs?: number,
): MediaStreamConversion {
  const resolvedMime = mimeType || PipeMedia.pickMimeType(mediaStream);
  // `videoKeyFrameIntervalDuration` is a newer MediaRecorder option; browsers without it ignore it.
  const recorderOptions = keyFrameIntervalMs !== undefined
    ? { mimeType: resolvedMime, videoKeyFrameIntervalDuration: keyFrameIntervalMs } as MediaRecorderOptions
    : { mimeType: resolvedMime };
  const recorder = new MediaRecorder(mediaStream, recorderOptions);

  // Bytes recorded but not read yet: Blobs still being converted, plus the
  // stream's queue (counted by its byte-length strategy).
  let converting = 0;
  let ctrl: ReadableStreamDefaultController<Uint8Array> | undefined;
  const waiting = () => converting + (ctrl ? CAPTURE_PAUSE_BYTES - (ctrl.desiredSize ?? CAPTURE_PAUSE_BYTES) : 0);
  let heldForReader = false;
  let heldByCaller = false;
  let failure: Error | undefined;
  const resumeIfWanted = () => {
    if (heldForReader && waiting() <= CAPTURE_RESUME_BYTES) heldForReader = false;
    if (!heldForReader && !heldByCaller && recorder.state === 'paused') recorder.resume();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ctrl = controller;
      // Chain blob→arrayBuffer conversions to guarantee chunk order
      let enqueueChain = Promise.resolve();

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0 && failure === undefined) {
          const size = e.data.size;
          converting += size;
          if (waiting() > CAPTURE_MAX_BYTES) {
            failure = new Error('recording stopped: more than 16 MiB waited to be sent (the upload is not keeping up)');
            try { controller.error(failure); } catch { /* already closed */ }
            if (recorder.state !== 'inactive') recorder.stop();
            return;
          }
          if (waiting() >= CAPTURE_PAUSE_BYTES) {
            heldForReader = true;
            if (recorder.state === 'recording') recorder.pause();
          }
          enqueueChain = enqueueChain.then(async () => {
            try {
              const buffer = await e.data.arrayBuffer();
              converting -= size;
              if (failure === undefined) controller.enqueue(new Uint8Array(buffer));
            } catch {
              // Stream may have been closed between check and enqueue
              converting -= size;
            }
            resumeIfWanted();
          });
        }
      };

      recorder.onerror = () => {
        try { controller.error(new Error('MediaRecorder error')); } catch { /* already closed */ }
      };

      recorder.onstop = () => {
        // Wait for any pending chunk conversions before closing the stream
        enqueueChain.then(() => {
          try { controller.close(); } catch { /* already closed */ }
        });
      };

      // Stop recording when any track ends (e.g. user clicks "Stop sharing")
      for (const track of mediaStream.getTracks()) {
        track.addEventListener('ended', () => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, { once: true });
      }

      recorder.start(timeslice);
    },

    // The reader took data: resume a recorder paused for it once it caught up.
    pull() {
      resumeIfWanted();
    },

    cancel() {
      // Consumer cancelled the stream (e.g. fetch abort) — stop the recorder
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
  }, { highWaterMark: CAPTURE_PAUSE_BYTES, size: (chunk) => chunk.byteLength });

  return {
    stream,
    recorder,
    mimeType: recorder.mimeType || resolvedMime,
    hold(paused: boolean) {
      heldByCaller = paused;
      if (paused) {
        if (recorder.state === 'recording') recorder.pause();
      } else {
        resumeIfWanted();
      }
    },
    get failure() { return failure; },
  };
}

// ---------------------------------------------------------------------------
// PipeMedia class
// ---------------------------------------------------------------------------

export class PipeMedia {
  private readonly baseUrl: string;
  private readonly basePath: string;
  private readonly defaultTimeslice: number;
  private readonly transport: PipeTransport;
  /** A given transport may not honour `cache`, so its receive URLs get a unique `_=`. */
  private readonly bustCache: boolean;

  constructor(config: PipeMediaConfig) {
    this.baseUrl = config.pipeBaseUrl.replace(/\/+$/, '');
    this.basePath = (config.basePath ?? '/api/v1/pipe').replace(/\/+$/, '');
    this.defaultTimeslice = config.defaultTimeslice ?? 100;
    this.transport = config.transport ?? globalFetchPipeTransport();
    this.bustCache = config.transport !== undefined;
  }

  /**
   * Create a PipeMedia instance from a HoodyClient + container.
   * Automatically resolves the pipe kit URL, and sends through `client.http`
   * so the client's injected transport and kitAuth apply
   * (lib/pipe-transport.ts).
   */
  static fromClient(client: any, container: any, serviceIndex = 1): PipeMedia {
    const pipeBaseUrl = client.getKitUrl('pipe', container, serviceIndex);
    const transport = pipeTransportFromClient(client);
    return new PipeMedia({ pipeBaseUrl, ...(transport ? { transport } : {}) });
  }

  // -------------------------------------------------------------------------
  // Static helpers
  // -------------------------------------------------------------------------

  /**
   * Generate a random 24-char hex path with a media file extension.
   * Uses crypto.getRandomValues for secure randomness.
   */
  static randomPath(mimeType?: string): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const ext = mimeToExtension(mimeType || PipeMedia.pickMimeType());
    return `${hex}.${ext}`;
  }

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
  static pickMimeType(mediaStream?: MediaStream): string {
    if (typeof MediaRecorder === 'undefined') return 'video/webm';

    const hasAudio = mediaStream ? mediaStream.getAudioTracks().length > 0 : true;
    if (mediaStream && hasAudio && mediaStream.getVideoTracks().length === 0) {
      for (const mime of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
        if (MediaRecorder.isTypeSupported(mime)) return mime;
      }
      return 'audio/webm';
    }

    const candidates = hasAudio
      ? [
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp9,opus',
          'video/webm',
          'video/mp4',
        ]
      : [
          // Video-only: omit audio codec to avoid MSE init segment mismatch
          'video/webm;codecs=vp8',
          'video/webm;codecs=vp9',
          'video/webm',
          'video/mp4',
        ];

    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return 'video/webm';
  }

  /**
   * Check if the current browser supports pipe media streaming.
   * Requires: MediaRecorder, ReadableStream, fetch with streaming body (duplex: 'half'),
   * a secure context, and navigator.mediaDevices.
   */
  static isSupported(): boolean {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof ReadableStream !== 'undefined' &&
      typeof fetch !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      // Request.prototype having duplex support indicates fetch streaming body works
      typeof Request !== 'undefined' &&
      'body' in Request.prototype
    );
  }

  // -------------------------------------------------------------------------
  // URL helpers
  // -------------------------------------------------------------------------

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
  getUrl(path: string): string {
    const encoded = encodePipeName(path);
    refuseReservedPipeName(path);
    return `${this.baseUrl}${this.basePath}/${encoded}`;
  }

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
  getPageUrl<P extends PipePage>(page: P, name?: string, options?: PipePageOptionsMap[P]): string {
    return buildPipePageUrl(`${this.baseUrl}${this.basePath}`, page, name, options);
  }

  /**
   * Open a page from getPageUrl() with `window.open` (new tab by default).
   * Returns the new Window, or null when the browser blocked the popup or the
   * features ask for `noopener`. Call it from a click handler: popup blockers
   * allow window.open only during a user gesture.
   */
  openPage<P extends PipePage>(
    page: P,
    name?: string,
    options?: PipePageOptionsMap[P],
    open?: PipeOpenPageOptions,
  ): Window | null {
    return openPipePage(this.getPageUrl(page, name, options), open);
  }

  // -------------------------------------------------------------------------
  // Share screen
  // -------------------------------------------------------------------------

  async shareScreen(opts?: ShareScreenOptions): Promise<MediaSession> {
    this.checkSharePath(opts?.path, opts);
    const displayOpts: DisplayMediaStreamOptions = opts?.displayMediaOptions
      ?? buildDisplayMediaOptions(opts);
    const mediaStream = await navigator.mediaDevices.getDisplayMedia(displayOpts);
    // Default viewer=true for screen sharing — share URL opens an HTML player in browsers
    const streamOpts = buildStreamOpts(opts);
    if (streamOpts.viewer === undefined) streamOpts.viewer = true;
    return this.streamMediaToPipe(mediaStream, streamOpts);
  }

  // -------------------------------------------------------------------------
  // Share webcam
  // -------------------------------------------------------------------------

  async shareWebcam(opts?: ShareWebcamOptions): Promise<MediaSession> {
    this.checkSharePath(opts?.path, opts);
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: opts?.video ?? true,
      audio: opts?.audio ?? true,
    });
    return this.streamMediaToPipe(mediaStream, buildStreamOpts(opts));
  }

  // -------------------------------------------------------------------------
  // Share audio (microphone, optionally tab/system audio)
  // -------------------------------------------------------------------------

  /**
   * Stream audio only. Viewers open `session.url` (the `?video` player plays
   * an audio-only stream). With both the microphone and `systemAudio`, the two
   * are mixed into one track. The session ends when any captured track ends
   * (the user stops sharing in the browser UI) or on `stop()`, which releases
   * every captured track.
   */
  async shareAudio(opts?: ShareAudioOptions): Promise<MediaSession> {
    const microphone = opts?.microphone ?? true;
    const systemAudio = opts?.systemAudio ?? false;
    if (microphone === false && !systemAudio) {
      throw new Error('shareAudio needs the microphone, systemAudio, or both');
    }
    this.checkSharePath(opts?.path, opts);
    const captured: MediaStream[] = [];
    const release = () => {
      for (const s of captured) for (const t of s.getTracks()) t.stop();
    };
    let mediaStream: MediaStream;
    let mixer: AudioContext | undefined;
    let mixed: MediaStream | undefined;
    try {
      if (microphone !== false) {
        captured.push(await navigator.mediaDevices.getUserMedia({ audio: microphone, video: false }));
      }
      if (systemAudio) {
        if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
          throw new Error('Tab or system audio capture is not supported in this browser');
        }
        // The picker needs a video request; the video track stays unrecorded
        // and only keeps the browser's "Stop sharing" control working.
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
          systemAudio: 'include',
        } as DisplayMediaStreamOptions);
        captured.push(display);
        if (display.getAudioTracks().length === 0) {
          throw new Error('No tab or system audio was shared: tick "Share audio" in the browser picker');
        }
      }
      const audioTracks = captured.flatMap(s => s.getAudioTracks());
      if (audioTracks.length > 1) {
        // MediaRecorder records one audio track only: mix them.
        mixer = new AudioContext();
        const dest = mixer.createMediaStreamDestination();
        mixed = dest.stream;
        for (const track of audioTracks) mixer.createMediaStreamSource(new MediaStream([track])).connect(dest);
        mediaStream = mixed;
      } else {
        mediaStream = new MediaStream(audioTracks);
      }
    } catch (err) {
      release();
      if (mixed) for (const t of mixed.getTracks()) t.stop();
      if (mixer) void mixer.close().catch(() => {});
      throw err;
    }

    const streamOpts = buildStreamOpts(opts);
    if (streamOpts.viewer === undefined) streamOpts.viewer = true;
    let session: MediaSession;
    try {
      session = this.streamMediaToPipe(mediaStream, streamOpts);
    } catch (err) {
      // streamMediaToPipe stopped its recorder and the mixed track.
      release();
      if (mixer) void mixer.close().catch(() => {});
      throw err;
    }
    session.onEnded(() => {
      release();
      if (mixer) void mixer.close().catch(() => {});
    });
    // A captured track the session does not record (a mixed source, the
    // display video track) ends the session too.
    for (const s of captured) {
      for (const track of s.getTracks()) {
        track.addEventListener('ended', () => session.stop(), { once: true });
      }
    }
    return session;
  }

  // -------------------------------------------------------------------------
  // Low-level: send any ReadableStream
  // -------------------------------------------------------------------------

  async sendStream(
    path: string,
    stream: ReadableStream,
    contentType?: string,
    opts?: { signal?: AbortSignal; n?: number; live?: boolean },
  ): Promise<Response> {
    let url = this.getUrl(path);
    if (opts?.live === true) url += liveQuery('sendStream', opts.n);
    else if (opts?.n && opts.n > 1) url += `?n=${opts.n}`;
    const headers: Record<string, string> = {
      'Content-Type': contentType ?? 'application/octet-stream',
    };
    return this.transport('POST', url, {
      headers,
      body: stream,
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // Low-level: receive raw stream
  // -------------------------------------------------------------------------

  async receiveStream(path: string, opts?: { n?: number; live?: boolean; signal?: AbortSignal }): Promise<Response> {
    let url = this.getUrl(path);
    if (opts?.live === true) url += liveQuery('receiveStream', opts.n);
    else if (opts?.n && opts.n > 1) url += `?n=${opts.n}`;
    return this.receiveGet(url, opts?.signal);
  }

  /**
   * A receive GET that the browser's HTTP cache neither answers nor holds:
   * Chromium keeps a second GET of an identical URL waiting behind the first
   * (about 20 s), which stalled two tabs receiving one n>1 transfer.
   */
  private receiveGet(url: string, signal?: AbortSignal, headers?: Record<string, string>): Promise<Response> {
    return this.transport('GET', this.bustCache ? withCacheBuster(url) : url, {
      cache: 'no-store',
      ...(headers ? { headers } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // Receive media into a <video> element
  // -------------------------------------------------------------------------

  async receiveMedia(
    path: string,
    videoElement: HTMLVideoElement,
    opts?: ReceiveMediaOptions,
  ): Promise<ReceiveSession> {
    const mode = opts?.mode ?? 'mse';

    // Direct URL mode — simplest, most forgiving for late joiners
    if (mode === 'direct') {
      return this.receiveMediaDirect(path, videoElement, opts);
    }

    // MSE mode — true live streaming with chunk-level control
    return this.receiveMediaMSE(path, videoElement, opts);
  }

  // -------------------------------------------------------------------------
  // Internal: stream media to pipe
  // -------------------------------------------------------------------------

  /**
   * Throw for a bad `path`, or `live` with `n` above 1 or a non-WebM `mimeType`,
   * before any capture starts, so a refused share never turns a camera on.
   */
  private checkSharePath(path: string | undefined, live?: { live?: boolean; n?: number; mimeType?: string }): void {
    if (path !== undefined) this.getUrl(path);
    if (live?.live === true) {
      liveQuery('share', live.n);
      if (live.mimeType !== undefined && !isWebmMime(live.mimeType)) {
        throw new RangeError(`share: live needs a WebM recording (got ${live.mimeType})`);
      }
    }
  }

  private streamMediaToPipe(
    mediaStream: MediaStream,
    opts: StreamOpts,
  ): MediaSession {
    const timeslice = opts.timeslice ?? this.defaultTimeslice;

    // If MediaRecorder creation fails (e.g. unsupported mimeType), release the
    // captured tracks immediately so the camera/screen indicator goes away.
    let conversion: MediaStreamConversion;
    try {
      conversion = mediaStreamToReadableStream(mediaStream, timeslice, opts.mimeType, opts.live === true ? LIVE_KEYFRAME_INTERVAL_MS : undefined);
    } catch (err) {
      for (const track of mediaStream.getTracks()) track.stop();
      throw err;
    }

    // Any later startup failure (a refused path, a transport that throws
    // synchronously, e.g. unsupported duplex) stops the recording too: the
    // caller gets no session to stop.
    try {
      // The kit joins live viewers at WebM keyframes; any other recording would join them mid-stream.
      if (opts.live === true && !isWebmMime(conversion.mimeType)) {
        throw new RangeError(`share: live needs a WebM recording; this browser records ${conversion.mimeType}`);
      }
      return this.uploadMediaSession(mediaStream, conversion, opts);
    } catch (err) {
      if (conversion.recorder.state !== 'inactive') conversion.recorder.stop();
      for (const track of mediaStream.getTracks()) track.stop();
      throw err;
    }
  }

  private uploadMediaSession(
    mediaStream: MediaStream,
    conversion: MediaStreamConversion,
    opts: StreamOpts,
  ): MediaSession {
    const { stream, recorder, mimeType } = conversion;
    const pipePath = opts.path ?? PipeMedia.randomPath(mimeType);
    const url = this.getUrl(pipePath);

    // fetchUrl = POST URL for the sender (never needs ?video). The share picks
    // its own transfer id, so its watch asks for this transfer and no other.
    const transferId = newTransferId();
    let fetchUrl = `${url}?transfer=${transferId}`;
    if (opts.live === true) fetchUrl += '&live';
    else if (opts.n && opts.n > 1) fetchUrl += `&n=${opts.n}`;

    // shareUrl = URL for receivers to open in a browser
    // ?video makes the pipe server return an HTML MSE player page
    let shareUrl = url;
    const shareParams: string[] = [];
    if (opts.n && opts.n > 1 && opts.live !== true) shareParams.push(`n=${opts.n}`);
    if (opts.viewer) shareParams.push('video');
    if (opts.live === true) shareParams.push('live');
    if (shareParams.length > 0) shareUrl += '?' + shareParams.join('&');

    let stopped = false;
    let uploadFinished = false;
    let failure: PipeTransferError | undefined;
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    const abortController = new AbortController();

    const endedCallbacks: Array<() => void> = [];
    let endedFired = false;

    // Fire onEnded callbacks exactly once, then auto-stop the session.
    // Called on: browser track end, transfer failure, or manual stop().
    const fireEnded = () => {
      if (endedFired) return;
      endedFired = true;
      for (const cb of endedCallbacks) { try { cb(); } catch { /* ignore */ } }
      // Auto-stop: release tracks + close pipe
      session.stop();
    };

    // The transfer failed: keep the first reason for `done`, end the capture.
    const fail = (err: PipeTransferError) => {
      if (failure === undefined) failure = err;
      fireEnded();
    };

    // POST the stream to the pipe with MIME info in X-Hoody-Pipe header.
    // The kit answers 200 as soon as it takes the upload and reports what
    // happens next in [INFO]/[ERROR] lines: no receivers in time, an idle
    // timeout or every receiver leaving arrive only there. Read them, and end
    // the session on a failure as soon as it shows.
    const uploadPromise = this.transport('POST', fetchUrl, {
      headers: {
        'Content-Type': mimeType,
        'X-Hoody-Pipe': `mimeType=${mimeType}`,
      },
      body: stream,
      signal: abortController.signal,
    }).then(async (res) => {
      const status = new StatusLines();
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        let ended = false;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            status.feed(text, false);
            const failed = status.failed(res.status);
            if (failed) fail(failed);
          }
          ended = true;
          status.feed(text + decoder.decode(), true);
        } catch (err) {
          // Our own abort (the stop() fallback) is not a failure.
          if (!abortController.signal.aborted) {
            fail(new PipeTransferError(`pipe share failed: ${errorText(conversion.failure ?? err)}`, res.status, status.messages));
          }
        } finally {
          if (!ended) void reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      }
      uploadFinished = true;
      if (failure === undefined && !abortController.signal.aborted) {
        const failed = status.failure(res.status, 'pipe share');
        if (failed) fail(failed);
      }
      // The upload is over either way: nothing more can reach the viewers.
      fireEnded();
    }, (err) => {
      uploadFinished = true;
      // Abort errors are expected on manual stop() — swallow them
      if (abortController.signal.aborted) return;
      // Real network failure (or a recording that outgrew its bound) — auto-stop to release camera/screen
      fail(new PipeTransferError(`pipe share failed: ${errorText(conversion.failure ?? err)}`, 0));
    });

    // A browser hands over the upload's response only once the upload ends
    // (fetch streaming uploads are half duplex), so while the capture runs a
    // failure shows only on the name's ?progress events: follow them too.
    const watch = new AbortController();
    void this.watchShareFailure(url, transferId, watch.signal, fail);

    const done = uploadPromise.then(() => {
      if (abortTimer !== undefined) clearTimeout(abortTimer);
      if (failure !== undefined) throw failure;
    });
    // A caller that never awaits `done` must not get an unhandled rejection.
    done.catch(() => undefined);

    // Auto-stop when user revokes sharing via browser chrome ("Stop sharing" button)
    for (const track of mediaStream.getTracks()) {
      track.addEventListener('ended', () => {
        if (!stopped) fireEnded();
      }, { once: true });
    }

    const session: MediaSession = {
      url: shareUrl,
      path: pipePath,
      mediaStream,
      recorder,
      mimeType,
      transferId,
      get active() { return !stopped; },
      get paused() { return recorder.state === 'paused'; },
      done,

      stop() {
        if (stopped) return;
        stopped = true;

        // Notify listeners (idempotent — no-op if already fired by track end or network error)
        fireEnded();
        watch.abort();

        // 1. Stop recorder → triggers final chunk + onstop → closes stream → fetch completes
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }

        // 2. Release camera/screen
        for (const track of mediaStream.getTracks()) {
          track.stop();
        }

        // 3. Fallback abort after 5s if fetch is stuck — skip if already finished
        if (!uploadFinished) {
          abortTimer = setTimeout(() => {
            if (!abortController.signal.aborted) {
              abortController.abort();
            }
          }, 5000);
        }
      },

      pause() {
        if (!stopped) conversion.hold(true);
      },

      resume() {
        if (!stopped) conversion.hold(false);
      },

      muteAudio(muted: boolean) {
        for (const track of mediaStream.getAudioTracks()) {
          track.enabled = !muted;
        }
      },

      muteVideo(muted: boolean) {
        for (const track of mediaStream.getVideoTracks()) {
          track.enabled = !muted;
        }
      },

      getVideoSettings() {
        const track = mediaStream.getVideoTracks()[0];
        return track ? track.getSettings() : null;
      },

      getAudioSettings() {
        const track = mediaStream.getAudioTracks()[0];
        return track ? track.getSettings() : null;
      },

      onEnded(callback: () => void) {
        if (endedFired) {
          // Already ended — fire immediately
          try { callback(); } catch { /* ignore */ }
          return;
        }
        endedCallbacks.push(callback);
      },
    };

    return session;
  }

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
  private async watchShareFailure(
    url: string,
    transferId: string,
    signal: AbortSignal,
    onFailed: (err: PipeTransferError) => void,
  ): Promise<void> {
    const watch: ShareWatch = { transferId, seen: false, idleChecks: 0 };
    const report = (step: ShareWatchStep): boolean => {
      if (signal.aborted) return true;
      if (step.kind === 'failed') {
        onFailed(new PipeTransferError(`pipe share failed: ${step.reason}`, 0));
        return true;
      }
      return step.kind === 'complete';
    };
    let gone = 0;
    while (!signal.aborted) {
      const status = await this.shareStatus(url, watch, signal);
      if (report(status)) return;
      if (status.kind === 'gone') {
        // Gone: the transfer is no longer on the name, so its events would never come.
        if (++gone >= SHARE_WATCH_MAX_GONE) {
          report({ kind: 'failed', reason: 'its transfer ended and the outcome is no longer known' });
          return;
        }
      } else {
        gone = 0;
        if (watch.seen) {
          if (report(await this.followShareEvents(url, watch, signal))) return;
        } else {
          // Not seen yet: the name may be idle, and an idle name's ?progress stream stays
          // open (up to 30 min), which would hold back the next check and its by-id ask.
          // Follow it for one retry interval at most.
          const bounded = new AbortController();
          const stopFollowing = () => bounded.abort();
          signal.addEventListener('abort', stopFollowing, { once: true });
          const timer = setTimeout(stopFollowing, SHARE_WATCH_RETRY_MS);
          try {
            if (report(await this.followShareEvents(url, watch, bounded.signal))) return;
          } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', stopFollowing);
          }
        }
      }
      await abortableDelay(SHARE_WATCH_RETRY_MS, signal);
    }
  }

  /** One check of a share's transfer (see watchShareFailure). */
  private async shareStatus(url: string, watch: ShareWatch, signal: AbortSignal): Promise<ShareWatchStep> {
    if (!watch.seen) {
      const name = await this.statusBody(`${url}?status`, signal);
      if (name.body === null) return { kind: 'unknown' };
      if (name.body.transferId === watch.transferId) return shareRecordStep(name.body, watch);
      // Idle: not admitted yet, or admitted and already ended off the name (the name keeps an ended
      // record 30 s, the kit keeps its receipt by id 10 min). Ask by id on every SHARE_WATCH_IDLE_ASK-th
      // idle check only, so a share whose upload has not arrived yet does not log a 404 on each check.
      // Another transfer on the name: ask for this one by id.
      if (typeof name.body.transferId !== 'string' && ++watch.idleChecks % SHARE_WATCH_IDLE_ASK !== 0) return { kind: 'unknown' };
    }
    const own = await this.statusBody(`${url}?status&transfer=${watch.transferId}`, signal);
    if (own.body !== null) return shareRecordStep(own.body, watch);
    // Unknown id: not admitted yet, or (once seen) ended with its record expired.
    return own.status === 404 && watch.seen ? { kind: 'gone' } : { kind: 'unknown' };
  }

  /** A ?status answer: its HTTP status, and its JSON object when that was a 200 (else null). */
  private async statusBody(statusUrl: string, signal: AbortSignal): Promise<{ status: number; body: Record<string, unknown> | null }> {
    try {
      const res = await this.receiveGet(statusUrl, signal);
      if (signal.aborted || res.status !== 200) {
        void res.body?.cancel().catch(() => undefined);
        return { status: res.status, body: null };
      }
      const body = parseJsonObject(await res.text());
      return { status: 200, body: signal.aborted ? null : body };
    } catch {
      return { status: 0, body: null };
    }
  }

  /** Follow the name's ?progress events until this share's transfer ends there, or the stream does. */
  private async followShareEvents(url: string, watch: ShareWatch, signal: AbortSignal): Promise<ShareWatchStep> {
    let res: Response;
    try {
      res = await this.receiveGet(`${url}?progress`, signal, { Accept: 'text/event-stream' });
    } catch {
      return { kind: 'unknown' };
    }
    if (signal.aborted || res.status !== 200 || !res.body) {
      // 204: the transfer there already ended; the next ?status check says how.
      void res.body?.cancel().catch(() => undefined);
      return { kind: 'unknown' };
    }
    try {
      for await (const ev of parseSseStream(res.body)) {
        if (signal.aborted) return { kind: 'unknown' };
        if (ev.event !== 'done') continue;
        const data = parseJsonObject(ev.data);
        // Another transfer's end on this name: ?status decides about this one.
        if (data?.transferId !== watch.transferId) return { kind: 'unknown' };
        if (data.state === 'failed') {
          return { kind: 'failed', reason: typeof data.reason === 'string' && data.reason ? data.reason : 'the transfer failed' };
        }
        return { kind: 'complete' };
      }
    } catch {
      // Lost: the caller checks ?status, then follows again.
    } finally {
      void res.body.cancel().catch(() => undefined);
    }
    return { kind: 'unknown' };
  }

  // -------------------------------------------------------------------------
  // Internal: receive via direct URL (fallback)
  // -------------------------------------------------------------------------

  private receiveMediaDirect(
    path: string,
    videoElement: HTMLVideoElement,
    opts?: ReceiveMediaOptions,
  ): ReceiveSession {
    let stopped = false;
    let url = this.getUrl(path);
    if (opts?.live === true) url += liveQuery('receiveMedia', opts.n);
    else if (opts?.n && opts.n > 1) url += `?n=${opts.n}`;

    // A media element cannot set a cache mode: a unique URL keeps it from
    // waiting behind another receive of the same pipe.
    videoElement.src = withCacheBuster(url);
    videoElement.play().catch(() => {});

    // Shared idempotent cleanup for both natural completion and manual stop()
    let cleaned = false;
    let resolvePromise: (() => void) | undefined;
    const onEnded = () => { finish(); };
    const onError = () => { finish(); };

    const finish = () => {
      if (cleaned) return;
      cleaned = true;
      stopped = true;
      videoElement.removeEventListener('ended', onEnded);
      videoElement.removeEventListener('error', onError);
      // Reset element on error — prevents stale error state from persisting
      if (videoElement.error) {
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
      }
      resolvePromise?.();
    };

    const done = new Promise<void>((resolve) => {
      resolvePromise = resolve;
      videoElement.addEventListener('ended', onEnded, { once: true });
      videoElement.addEventListener('error', onError, { once: true });
    });

    return {
      get active() { return !stopped; },
      done,
      stop() {
        if (stopped) return;
        finish();
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
      },
    };
  }

  // -------------------------------------------------------------------------
  // Internal: receive via MSE (live streaming)
  // -------------------------------------------------------------------------

  private async receiveMediaMSE(
    path: string,
    videoElement: HTMLVideoElement,
    opts?: ReceiveMediaOptions,
  ): Promise<ReceiveSession> {
    // If MSE is completely unavailable, go direct immediately (no fetch wasted)
    if (typeof MediaSource === 'undefined') {
      return this.receiveMediaDirect(path, videoElement, opts);
    }

    // If caller provided a MIME type that MSE can't handle, skip to direct
    if (opts?.mimeType && !MediaSource.isTypeSupported(opts.mimeType)) {
      return this.receiveMediaDirect(path, videoElement, opts);
    }

    let fetchUrl = this.getUrl(path);
    if (opts?.live === true) fetchUrl += liveQuery('receiveMedia', opts.n);
    else if (opts?.n && opts.n > 1) fetchUrl += `?n=${opts.n}`;

    const abortController = new AbortController();
    const response = await this.receiveGet(fetchUrl, abortController.signal);

    if (!response.ok || !response.body) {
      throw new Error(`Pipe receive failed: ${response.status} ${response.statusText}`);
    }

    // Detect MIME from sender's X-Hoody-Pipe header or use explicit option
    const pipeHeader = response.headers.get('X-Hoody-Pipe') ?? '';
    const headerMime = parsePipeHeader(pipeHeader, 'mimeType');
    let mimeType = opts?.mimeType ?? headerMime ?? 'video/webm;codecs=vp8';

    // Build MIME variants to try (handles audio codec mismatch)
    const mimeVariants = buildMimeVariants(mimeType);

    // Read the first chunk — we need it to probe the correct MIME type.
    // The init segment (first MediaRecorder chunk) contains the WebM header
    // which declares which tracks exist (video, audio, or both). If we create
    // a SourceBuffer with codecs=vp8,opus but the stream has no audio track,
    // MSE rejects with "Initialization segment misses expected opus track".
    const reader = response.body!.getReader();
    const { done: firstDone, value: firstChunk } = await reader.read();
    if (firstDone || !firstChunk) {
      abortController.abort();
      throw new Error('Pipe stream ended before init segment');
    }

    // Probe: try each MIME variant by appending the first chunk to a temporary
    // SourceBuffer. The first variant that doesn't error is the correct one.
    let probeResult = await probeMimeType(firstChunk, mimeVariants);
    if (!probeResult) {
      abortController.abort();
      void reader.cancel().catch(() => undefined);
      throw new Error(
        `MSE cannot decode this stream. Tried: ${mimeVariants.join(', ')}. Use mode: 'direct'.`,
      );
    }
    mimeType = probeResult;

    let stopped = false;
    let resolvePromise: (() => void) | undefined;
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    videoElement.src = objectUrl;

    // Eviction: keep at most EVICT_BUFFER_SECONDS of data behind currentTime
    const EVICT_BUFFER_SECONDS = 30;
    const EVICT_KEEP_BEHIND = 5; // seconds to keep before currentTime
    const MIN_EVICT_RANGE = 2;   // minimum seconds to evict (prevents micro-eviction loops)

    // Shared finish logic — sets stopped, cleans up listeners, resolves done
    const onVideoEnded = () => { finish(); };
    const onVideoError = () => { finish(); };

    // Live: playback events also keep the playhead in the buffered data
    // (set in sourceopen), since playback can reach a gap after the last append.
    const PLAYBACK_EVENTS = ['waiting', 'stalled', 'timeupdate'] as const;
    let onLivePlayback: (() => void) | null = null;
    const detachLivePlayback = () => {
      if (!onLivePlayback) return;
      for (const t of PLAYBACK_EVENTS) videoElement.removeEventListener(t, onLivePlayback);
      onLivePlayback = null;
    };

    // Attach error listener early — catches decode/source errors during the entire session
    videoElement.addEventListener('error', onVideoError, { once: true });
    // Every end of the session (playback ended, a video or SourceBuffer error,
    // a network error, stop()) runs this once: the request is aborted, the body
    // reader cancelled, the object URL revoked and the listeners removed.
    let finished = false;
    let revoked = false;
    const revokeUrl = () => {
      if (revoked) return;
      revoked = true;
      URL.revokeObjectURL(objectUrl);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      stopped = true;
      abortController.abort();
      void reader.cancel().catch(() => undefined);
      revokeUrl();
      videoElement.removeEventListener('ended', onVideoEnded);
      videoElement.removeEventListener('error', onVideoError);
      detachLivePlayback();
      resolvePromise?.();
    };

    const done = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;

      mediaSource.addEventListener('sourceopen', async () => {
        let sourceBuffer: SourceBuffer;
        try {
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        } catch (err) {
          finish();
          return;
        }

        // Seed the SourceBuffer with the first chunk (already read during probe)
        const pendingChunks: Uint8Array[] = [firstChunk];
        let streamDone = false;
        let quotaRetries = 0;
        const MAX_QUOTA_RETRIES = 3;
        // Backpressure cap: if MSE processing falls far
        // behind the reader, `pendingChunks` can grow without bound and OOM
        // the tab. Drop OLDEST pending chunks when the queue exceeds the cap;
        // dropping tail is what MediaRecorder-like live-feed consumers expect
        // for recovery after a stall.
        const MAX_PENDING_CHUNKS = 256;

        // Evict data older than EVICT_BUFFER_SECONDS behind currentTime.
        // Returns true if a remove() was issued (caller should wait for updateend).
        const tryEvict = (): boolean => {
          try {
            if (sourceBuffer.updating || sourceBuffer.buffered.length === 0) return false;
            const bufferedStart = sourceBuffer.buffered.start(0);
            const bufferedEnd = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
            if (bufferedEnd - bufferedStart < EVICT_BUFFER_SECONDS) return false;
            const evictEnd = Math.max(0, videoElement.currentTime - EVICT_KEEP_BEHIND);
            if (evictEnd > bufferedStart && evictEnd - bufferedStart >= MIN_EVICT_RANGE) {
              sourceBuffer.remove(0, evictEnd);
              return true; // updateend will fire when done
            }
          } catch { /* ignore eviction errors */ }
          return false;
        };

        const finishPlayback = () => {
          try {
            if (mediaSource.readyState === 'open' && !sourceBuffer.updating) {
              mediaSource.endOfStream();
            }
          } catch { /* already ended */ }
          revokeUrl();
          // Wait for video to finish playing all buffered content.
          // Error listener is already attached early (after setting src).
          if (videoElement.ended) {
            finish();
          } else {
            videoElement.addEventListener('ended', onVideoEnded, { once: true });
          }
        };

        const appendNext = () => {
          if (stopped || mediaSource.readyState !== 'open') return;
          if (pendingChunks.length > 0 && !sourceBuffer.updating) {
            const chunk = pendingChunks.shift()!;
            try {
              sourceBuffer.appendBuffer(chunk as BufferSource);
              quotaRetries = 0; // reset on success
            } catch (err) {
              if (err instanceof DOMException && err.name === 'QuotaExceededError') {
                if (quotaRetries < MAX_QUOTA_RETRIES) {
                  quotaRetries++;
                  pendingChunks.unshift(chunk); // retry after eviction
                  try {
                    const evictEnd = Math.max(0, videoElement.currentTime - EVICT_KEEP_BEHIND);
                    const buffStart = sourceBuffer.buffered.length > 0 ? sourceBuffer.buffered.start(0) : 0;
                    if (sourceBuffer.buffered.length > 0 && evictEnd > buffStart && evictEnd - buffStart >= MIN_EVICT_RANGE) {
                      sourceBuffer.remove(0, evictEnd);
                      return; // updateend → appendNext retries
                    }
                    // Nothing behind currentTime to evict — seek forward to create room
                    if (sourceBuffer.buffered.length > 0) {
                      const liveEdge = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
                      videoElement.currentTime = Math.max(videoElement.currentTime, liveEdge - 1);
                    }
                  } catch { /* ignore */ }
                  // Seek doesn't trigger updateend — schedule retry manually
                  setTimeout(appendNext, 50);
                  return;
                }
                quotaRetries = 0;
                // Max retries exceeded — drop chunk to prevent infinite loop
              }
              // Non-quota error or exhausted retries — skip chunk, schedule next
              setTimeout(appendNext, 0);
            }
          } else if (streamDone && pendingChunks.length === 0 && !sourceBuffer.updating) {
            finishPlayback();
          }
        };

        // Live (`?live`): a late viewer's media starts at the stream's current
        // time, not 0, and a viewer that fell behind skips whole Clusters, which
        // leaves gaps. Keep the playhead in the buffered data: when it sits
        // before a range, or within 0.1 s of a range's end with a later range
        // waiting, move it to the next range's start. A user's seek is never
        // overridden, and a paused playhead moves only from before the first
        // range (nothing to show there yet).
        const keepLivePlayhead = () => {
          if (opts?.live !== true || stopped || videoElement.seeking) return;
          try {
            const b = sourceBuffer.buffered;
            const t = videoElement.currentTime;
            const paused = videoElement.paused;
            for (let i = 0; i < b.length; i++) {
              if (t < b.start(i)) {
                if (!paused || i === 0) videoElement.currentTime = b.start(i);
                return;
              }
              if (t < b.end(i) - 0.1 || i === b.length - 1) return;
            }
          } catch { /* ignore */ }
        };
        if (opts?.live === true && !stopped) {
          onLivePlayback = keepLivePlayhead;
          for (const t of PLAYBACK_EVENTS) videoElement.addEventListener(t, onLivePlayback);
        }

        sourceBuffer.addEventListener('updateend', () => {
          keepLivePlayhead();
          // Evict first; if eviction started, wait for its updateend before appending
          if (!tryEvict()) {
            appendNext();
          }
        });

        // SourceBuffer errors are fatal — once in error state, further appendBuffer
        // calls throw InvalidStateError. Abort the stream and finish cleanly.
        sourceBuffer.addEventListener('error', () => {
          try {
            if (mediaSource.readyState === 'open') mediaSource.endOfStream('decode');
          } catch { /* ignore */ }
          finish();
        });

        // Start playing as soon as we have data
        videoElement.play().catch(() => {});

        try {
          while (true) {
            const { done: readerDone, value } = await reader.read();
            if (readerDone || stopped) {
              streamDone = true;
              appendNext();
              break;
            }
            // Use the Uint8Array directly — value.buffer can include trailing
            // garbage from pooled ArrayBuffers in some engines
            pendingChunks.push(value);
            // Drop oldest when queue exceeds cap — MSE append is slower than
            // reader on stalled consumers; unbounded growth OOMs the tab.
            //
            // Trade-off: dropping from the head of the
            // queue can break WebM keyframe dependencies — a Cluster header
            // may be dropped while its dependent P-frames remain queued,
            // producing decode artifacts until the NEXT keyframe arrives and
            // the SourceBuffer resynchronizes (~1s at 1 kf/s). This is the
            // standard live-video policy: newer frames are more valuable
            // than older ones, and a stalled consumer is already showing bad
            // video. A keyframe-aware drop would require parsing the WebM
            // EBML structure, which is too expensive on the hot path.
            while (pendingChunks.length > MAX_PENDING_CHUNKS) {
              pendingChunks.shift();
            }
            appendNext();
          }
        } catch (err) {
          if (!stopped) {
            try { mediaSource.endOfStream('network'); } catch { /* ignore */ }
          }
          finish();
        }
      }, { once: true });
    });

    return {
      get active() { return !stopped; },
      done,
      stop() {
        if (stopped) return;
        finish();
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** How long a share waits before it checks its name again. */
const SHARE_WATCH_RETRY_MS = 3000;
/** Checks in a row that find no transfer of a running share before it is ended as failed (about 30 s). */
const SHARE_WATCH_MAX_GONE = 10;
/** Idle checks of a not-yet-seen share per check that also asks the kit for its transfer by id (about 12 s). */
const SHARE_WATCH_IDLE_ASK = 4;

/** What a ?status record of this share's own transfer says. */
function shareRecordStep(body: Record<string, unknown>, watch: ShareWatch): ShareWatchStep {
  const state = body.state;
  if (state === 'failed') return { kind: 'failed', reason: typeof body.reason === 'string' && body.reason ? body.reason : 'the transfer failed' };
  if (state === 'complete') return { kind: 'complete' };
  // Waiting or streaming: from here on, an unknown id means its record expired.
  watch.seen = true;
  return { kind: 'live' };
}

/** What a share's watch knows: its own transfer id, and whether that transfer was seen live on the name. */
interface ShareWatch {
  readonly transferId: string;
  seen: boolean;
  /** Checks that found the name idle before the transfer was seen. */
  idleChecks: number;
}

/** A share's own transfer id: 22 base64url characters (128 random bits), as the kit's `?transfer=` takes. */
function newTransferId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** One finding of a share's watch: its transfer is live, ended (failed or complete), gone from the name, or not known. */
type ShareWatchStep =
  | { kind: 'live' | 'complete' | 'gone' | 'unknown' }
  | { kind: 'failed'; reason: string };

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Resolves after `ms`, or at once when `signal` aborts. */
function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

function mimeToExtension(mimeType: string): string {
  const base = mimeType.split(';')[0]!.trim();
  const map: Record<string, string> = {
    'video/webm': 'webm',
    'video/mp4': 'mp4',
    'video/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
  };
  return map[base] ?? 'webm';
}

function parsePipeHeader(header: string, key: string): string | undefined {
  // Format: "key1=value1, key2=value2"
  // Values can contain commas and semicolons (e.g. mimeType=video/webm;codecs=vp8,opus)
  // A new key starts with ", <word>=" pattern, so we use a regex boundary.
  const prefix = key + '=';
  let start = -1;
  if (header.startsWith(prefix)) {
    start = prefix.length;
  } else {
    const idx = header.indexOf(', ' + prefix);
    if (idx !== -1) start = idx + 2 + prefix.length;
  }
  if (start === -1) return undefined;

  // Value extends until the next ", <key>=" boundary or end of string
  const rest = header.slice(start);
  const nextKey = rest.search(/, [a-zA-Z0-9_]+=/);
  return nextKey !== -1 ? rest.slice(0, nextKey).trim() : rest.trim();
}

/**
 * Probe which MIME type works for a given init segment by trying each variant
 * with a temporary MediaSource + SourceBuffer. Returns the first MIME that
 * successfully accepts the chunk, or undefined if none work.
 */
function probeMimeType(initChunk: Uint8Array, variants: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    let idx = 0;

    const tryNext = (): void => {
      if (idx >= variants.length) { resolve(undefined); return; }
      const mime = variants[idx]!;
      idx++;

      if (!MediaSource.isTypeSupported(mime)) { tryNext(); return; }

      const ms = new MediaSource();
      const url = URL.createObjectURL(ms);
      const video = document.createElement('video');
      video.src = url;

      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
      };

      ms.addEventListener('sourceopen', () => {
        let sb: SourceBuffer;
        try { sb = ms.addSourceBuffer(mime); }
        catch { cleanup(); tryNext(); return; }

        let resolved = false;
        sb.addEventListener('updateend', () => {
          if (resolved) return;
          resolved = true;
          // appendBuffer succeeded — this MIME works
          try { ms.endOfStream(); } catch { /* ignore */ }
          cleanup();
          resolve(mime);
        });
        sb.addEventListener('error', () => {
          if (resolved) return;
          resolved = true;
          // appendBuffer failed (e.g. "misses expected opus track")
          try { ms.endOfStream(); } catch { /* ignore */ }
          cleanup();
          tryNext();
        });

        try { sb.appendBuffer(initChunk as BufferSource); }
        catch { cleanup(); tryNext(); }
      }, { once: true });

      // Timeout: if sourceopen never fires
      setTimeout(() => { cleanup(); tryNext(); }, 2000);
    };

    tryNext();
  });
}

/**
 * Build a list of MIME type variants to try with addSourceBuffer.
 * Given 'video/webm;codecs=vp8,opus', returns:
 *   1. 'video/webm;codecs=vp8,opus'   (original, video+audio)
 *   2. 'video/webm;codecs=vp8'         (video-only — handles audio track mismatch)
 *   3. 'video/webm'                     (base type, no codecs)
 * This handles the common MSE error "Initialization segment misses expected opus track"
 * when the sender declares audio codecs but the stream is actually video-only.
 */
function buildMimeVariants(mimeType: string): string[] {
  const variants: string[] = [mimeType];
  const [base, codecsPart] = mimeType.split(';').map(s => s.trim());
  if (!base) return variants;

  if (codecsPart) {
    // Extract individual codecs
    const codecsMatch = codecsPart.match(/codecs=(.+)/);
    if (codecsMatch) {
      const codecs = codecsMatch[1]!.split(',').map(c => c.trim());
      // Audio codecs to try removing
      const audioCodecs = new Set(['opus', 'vorbis', 'aac', 'mp4a.40.2', 'flac']);
      const videoOnly = codecs.filter(c => !audioCodecs.has(c));
      if (videoOnly.length > 0 && videoOnly.length < codecs.length) {
        variants.push(`${base};codecs=${videoOnly.join(',')}`);
      }
    }
    // Base type (no codecs at all)
    if (!variants.includes(base)) {
      variants.push(base);
    }
  }
  return variants;
}

/** Build DisplayMediaStreamOptions from our convenience properties. */
function buildDisplayMediaOptions(opts?: ShareScreenOptions): DisplayMediaStreamOptions {
  const video: Record<string, unknown> = {};

  if (opts?.surfaceType) video.displaySurface = opts.surfaceType;
  if (opts?.cursor) video.cursor = opts.cursor;
  if (opts?.frameRate) video.frameRate = { ideal: opts.frameRate };
  if (opts?.width) video.width = { ideal: opts.width };
  if (opts?.height) video.height = { ideal: opts.height };

  const result: DisplayMediaStreamOptions & Record<string, unknown> = {
    video: Object.keys(video).length > 0 ? video : true,
  };

  // Audio
  if (opts?.audio) {
    const audio: Record<string, unknown> = {};
    if (opts.suppressLocalAudioPlayback) {
      audio.suppressLocalAudioPlayback = true;
    }
    result.audio = Object.keys(audio).length > 0 ? audio : true;
  } else {
    result.audio = false;
  }

  // Chrome-specific: system audio and surface preference
  if (opts?.systemAudio) result.systemAudio = opts.systemAudio;
  if (opts?.preferSurface) {
    // preferCurrentTab only applies to 'browser' (tab capture)
    if (opts.preferSurface === 'browser') {
      result.preferCurrentTab = true;
    }
    // surfaceSwitching lets user switch to other surfaces even with preference
    result.surfaceSwitching = 'include';
  }

  return result;
}

type StreamOpts = { path?: string; timeslice?: number; mimeType?: string; n?: number; viewer?: boolean; live?: boolean };

/** Keyframe interval asked of the recorder for a live share: a late viewer joins at the next one. */
const LIVE_KEYFRAME_INTERVAL_MS = 2000;

function isWebmMime(mime: string): boolean {
  return /^(video|audio)\/webm\b/i.test(mime.trim());
}

/** `?live` for a URL, after refusing `n` above 1 (the kit answers 400). */
function liveQuery(op: string, n: number | undefined): string {
  if (n !== undefined && n > 1) throw new RangeError(`${op}: live cannot be combined with n above 1`);
  return '?live';
}

/** Build stream options object, omitting undefined keys to satisfy exactOptionalPropertyTypes. */
function buildStreamOpts(opts?: StreamOpts): StreamOpts {
  const result: StreamOpts = {};
  if (opts?.path !== undefined) result.path = opts.path;
  if (opts?.timeslice !== undefined) result.timeslice = opts.timeslice;
  if (opts?.mimeType !== undefined) result.mimeType = opts.mimeType;
  if (opts?.n !== undefined) result.n = opts.n;
  if (opts?.viewer !== undefined) result.viewer = opts.viewer;
  if (opts?.live !== undefined) result.live = opts.live;
  return result;
}

// ---------------------------------------------------------------------------
// Pipe names and page URLs
// ---------------------------------------------------------------------------

const MAX_PIPE_RECEIVERS = 256;
/** The longest `wait` the server takes, in seconds. */
const MAX_PIPE_WAIT_S = 3600;
/** The server's limit, counted on the encoded name (its path after the prefix). */
const MAX_PIPE_NAME_LENGTH = 1024;
/** The longest `text` the send page takes, and the longest `filename` a page or the server keeps. */
const MAX_PAGE_TEXT = 100_000;
const MAX_PAGE_FILENAME = 255;
/**
 * What the no-JavaScript page keeps of its `path` field; it drops anything else.
 * An encoded name always fits, unless it has more than one segment (`/`).
 */
const NOSCRIPT_PATH = /^[a-zA-Z0-9._~:@!$&'()*+,;=%-]+$/;

let cacheBusterCount = 0;

/**
 * `url` plus a unique `_=` query param, which the pipe kit ignores. For a
 * receive GET that cannot set `cache: 'no-store'` (a client transport, an
 * iframe, a media element): Chromium holds a second GET of an identical URL
 * behind the first in its HTTP cache for about 20 s.
 */
export function withCacheBuster(url: string): string {
  cacheBusterCount = (cacheBusterCount + 1) % 1_679_616;
  const unique = Date.now().toString(36) + cacheBusterCount.toString(36) + Math.random().toString(36).slice(2, 8);
  return `${url}${url.includes('?') ? '&' : '?'}_=${unique}`;
}

/**
 * Encode a pipe name for a URL path: each `/`-separated segment is
 * percent-encoded on its own, so `/` stays a separator and a leading `/` is
 * kept. A `.` or `..` segment (also as `%2e`) throws: see PipeMedia.getUrl.
 */
export function encodePipeName(path: string): string {
  return String(path)
    .split('/')
    .map(segment => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // Malformed escape cannot decode to a dot segment.
      }
      if (segment === '.' || segment === '..' || decoded === '.' || decoded === '..') {
        throw new Error(
          `Invalid pipe path: "${path}" contains a "${segment}" path segment. ` +
            'Relative segments are not allowed because they change which endpoint is called.',
        );
      }
      return encodeURIComponent(segment);
    })
    .join('/');
}

/** `name`, unless the kit answers it itself (its pages, health, metrics): then throw. */
export function refuseReservedPipeName(name: string): string {
  if (reservedPipePath(name) !== null) {
    throw new Error(`Pipe name "${name}" is reserved by the server; choose another name`);
  }
  return name;
}

/** Encode a pipe name the pages can use, or throw why it cannot work. */
function checkedPipeName(name: unknown, page: PipePage): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError(`The ${page} page needs a pipe name`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f\\]/.test(name)) {
    throw new Error(`Invalid pipe name ${JSON.stringify(name)}: the server refuses control characters and backslashes`);
  }
  const encoded = encodePipeName(name);
  refuseReservedPipeName(name);
  if (encoded.length > MAX_PIPE_NAME_LENGTH) {
    throw new RangeError(`Pipe name is ${encoded.length} characters once encoded; the server allows ${MAX_PIPE_NAME_LENGTH}`);
  }
  return encoded;
}

const PAGE_OPTIONS: { readonly [P in PipePage]: ReadonlyArray<keyof PipePageOptionsMap[P] & string> } = {
  send: ['n', 'text', 'mode', 'filename', 'autostart'],
  receive: ['n', 'filename', 'autostart', 'wait', 'sha256'],
  share: ['source', 'audio', 'surface', 'quality', 'fps', 'n', 'live'],
  video: ['n', 'live', 'wait'],
  progress: [],
  noscript: ['mode', 'wait', 'sha256'],
};

const OPTION_ENUMS: Record<string, readonly string[]> = {
  mode: ['file', 'text'],
  source: ['screen', 'camera', 'audio'],
  surface: ['monitor', 'window', 'browser'],
  quality: ['low', 'medium', 'high'],
};

function integerIn(key: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${key} must be an integer from ${min} to ${max} (got ${String(value)})`);
  }
  return value;
}

/** The wire value of one page option, or undefined when it is not written. */
function pageOptionValue(key: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  switch (key) {
    case 'n':
      // 1 is every page's default, as in the kit's own links.
      return integerIn('n', value, 1, MAX_PIPE_RECEIVERS) > 1 ? String(value) : undefined;
    case 'fps':
      return String(integerIn('fps', value, 1, 60));
    case 'wait':
      return String(integerIn('wait', value, 1, MAX_PIPE_WAIT_S));
    case 'audio':
      if (typeof value !== 'boolean') throw new TypeError('audio must be a boolean');
      return value ? '1' : '0';
    case 'autostart':
    case 'sha256':
      if (typeof value !== 'boolean') throw new TypeError(`${key} must be a boolean`);
      return value ? '1' : undefined;
    case 'live':
      if (typeof value !== 'boolean') throw new TypeError('live must be a boolean');
      return value ? '1' : undefined;
    case 'text':
    case 'filename': {
      if (typeof value !== 'string') throw new TypeError(`${key} must be a string`);
      // The pages cut longer values off; refuse them instead.
      const max = key === 'text' ? MAX_PAGE_TEXT : MAX_PAGE_FILENAME;
      if (value.length > max) throw new RangeError(`${key} is ${value.length} characters; the page keeps ${max}`);
      return value === '' ? undefined : value;
    }
    default: {
      const allowed = OPTION_ENUMS[key]!;
      if (typeof value !== 'string' || !allowed.includes(value)) {
        throw new RangeError(`${key} must be one of ${allowed.join(', ')} (got ${String(value)})`);
      }
      return value;
    }
  }
}

/**
 * Build a page URL under `root` (pipe base URL + base path). See
 * PipeMedia.getPageUrl for the shapes and the refusals.
 */
export function buildPipePageUrl<P extends PipePage>(
  root: string,
  page: P,
  name?: string,
  options?: PipePageOptionsMap[P],
): string {
  const keys = PAGE_OPTIONS[page] as readonly string[] | undefined;
  if (keys === undefined) throw new RangeError(`Unknown pipe page "${String(page)}"`);
  const opts = (options ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(opts)) {
    if (!keys.includes(key)) throw new TypeError(`The ${page} page takes no "${key}" option`);
  }
  if (opts['live'] === true && typeof opts['n'] === 'number' && opts['n'] > 1) {
    throw new RangeError('live cannot be combined with n above 1');
  }

  const query: string[] = [];
  let path: string;
  if (page === 'send') {
    path = '/';
    if (name !== undefined) {
      checkedPipeName(name, page);
      query.push(`name=${encodeURIComponent(name)}`);
    }
  } else if (page === 'noscript') {
    path = '/noscript';
    if (name !== undefined) {
      // The page writes `path` into its form's URL unchanged, so it gets the
      // encoded name: the upload then reaches the pipe every other URL names
      // (a literal `%`, a space or `$` in the name included).
      const encoded = checkedPipeName(name, page);
      if (!NOSCRIPT_PATH.test(encoded)) {
        throw new Error(`The noscript page takes a name of one segment, without "/" (got ${JSON.stringify(name)})`);
      }
      query.push(`path=${encodeURIComponent(encoded)}`);
    }
  } else {
    path = `/${checkedPipeName(name, page)}`;
    query.push(page);
  }
  for (const key of keys) {
    const value = pageOptionValue(key, opts[key]);
    if (value !== undefined) query.push(`${key}=${encodeURIComponent(value)}`);
  }
  return `${root}${path}${query.length > 0 ? `?${query.join('&')}` : ''}`;
}

/** `window.open(url)` for a page URL; see PipeMedia.openPage. */
export function openPipePage(url: string, open?: PipeOpenPageOptions): Window | null {
  const opener = (globalThis as { open?: (url?: string, target?: string, features?: string) => Window | null }).open;
  if (typeof opener !== 'function') throw new Error('openPage needs a browser window (window.open)');
  return opener.call(globalThis, url, open?.target ?? '_blank', open?.features);
}

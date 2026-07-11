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

// ---------------------------------------------------------------------------
// Utility: MediaStream → ReadableStream
// ---------------------------------------------------------------------------

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
export function mediaStreamToReadableStream(
  mediaStream: MediaStream,
  timeslice = 100,
  mimeType?: string,
): MediaStreamConversion {
  const resolvedMime = mimeType || PipeMedia.pickMimeType(mediaStream);
  const recorder = new MediaRecorder(mediaStream, { mimeType: resolvedMime });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Chain blob→arrayBuffer conversions to guarantee chunk order
      let enqueueChain = Promise.resolve();

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          enqueueChain = enqueueChain.then(async () => {
            try {
              const buffer = await e.data.arrayBuffer();
              controller.enqueue(new Uint8Array(buffer));
            } catch {
              // Stream may have been closed between check and enqueue
            }
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

    cancel() {
      // Consumer cancelled the stream (e.g. fetch abort) — stop the recorder
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
  });

  return { stream, recorder, mimeType: recorder.mimeType || resolvedMime };
}

// ---------------------------------------------------------------------------
// PipeMedia class
// ---------------------------------------------------------------------------

export class PipeMedia {
  private readonly baseUrl: string;
  private readonly basePath: string;
  private readonly defaultTimeslice: number;

  constructor(config: PipeMediaConfig) {
    this.baseUrl = config.pipeBaseUrl.replace(/\/+$/, '');
    this.basePath = (config.basePath ?? '/api/v1/pipe').replace(/\/+$/, '');
    this.defaultTimeslice = config.defaultTimeslice ?? 100;
  }

  /**
   * Create a PipeMedia instance from a HoodyClient + container.
   * Automatically resolves the pipe kit URL.
   */
  static fromClient(client: any, container: any, serviceIndex = 1): PipeMedia {
    const pipeBaseUrl = client.getKitUrl('pipe', container, serviceIndex);
    return new PipeMedia({ pipeBaseUrl });
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
   */
  static pickMimeType(mediaStream?: MediaStream): string {
    if (typeof MediaRecorder === 'undefined') return 'video/webm';

    const hasAudio = mediaStream ? mediaStream.getAudioTracks().length > 0 : true;

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

  /** Build the full pipe URL for a given path. */
  getUrl(path: string): string {
    return `${this.baseUrl}${this.basePath}/${encodeURIComponent(path)}`;
  }

  // -------------------------------------------------------------------------
  // Share screen
  // -------------------------------------------------------------------------

  async shareScreen(opts?: ShareScreenOptions): Promise<MediaSession> {
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
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: opts?.video ?? true,
      audio: opts?.audio ?? true,
    });
    return this.streamMediaToPipe(mediaStream, buildStreamOpts(opts));
  }

  // -------------------------------------------------------------------------
  // Low-level: send any ReadableStream
  // -------------------------------------------------------------------------

  async sendStream(
    path: string,
    stream: ReadableStream,
    contentType?: string,
  ): Promise<Response> {
    const url = this.getUrl(path);
    const headers: Record<string, string> = {};
    if (contentType) headers['Content-Type'] = contentType;

    return fetch(url, {
      method: 'POST',
      headers,
      body: stream,
      duplex: 'half',
    } as RequestInit);
  }

  // -------------------------------------------------------------------------
  // Low-level: receive raw stream
  // -------------------------------------------------------------------------

  async receiveStream(path: string, opts?: { n?: number }): Promise<Response> {
    let url = this.getUrl(path);
    if (opts?.n && opts.n > 1) url += `?n=${opts.n}`;
    return fetch(url);
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

  private streamMediaToPipe(
    mediaStream: MediaStream,
    opts: { path?: string; timeslice?: number; mimeType?: string; n?: number; viewer?: boolean },
  ): MediaSession {
    const timeslice = opts.timeslice ?? this.defaultTimeslice;

    // If MediaRecorder creation fails (e.g. unsupported mimeType), release the
    // captured tracks immediately so the camera/screen indicator goes away.
    let stream: ReadableStream<Uint8Array>;
    let recorder: MediaRecorder;
    let mimeType: string;
    try {
      ({ stream, recorder, mimeType } = mediaStreamToReadableStream(
        mediaStream, timeslice, opts.mimeType,
      ));
    } catch (err) {
      for (const track of mediaStream.getTracks()) track.stop();
      throw err;
    }

    const pipePath = opts.path ?? PipeMedia.randomPath(mimeType);
    const url = this.getUrl(pipePath);

    // fetchUrl = POST URL for the sender (never needs ?video)
    let fetchUrl = url;
    if (opts.n && opts.n > 1) fetchUrl += `?n=${opts.n}`;

    // shareUrl = URL for receivers to open in a browser
    // ?video makes the pipe server return an HTML MSE player page
    let shareUrl = url;
    const shareParams: string[] = [];
    if (opts.n && opts.n > 1) shareParams.push(`n=${opts.n}`);
    if (opts.viewer) shareParams.push('video');
    if (shareParams.length > 0) shareUrl += '?' + shareParams.join('&');

    let stopped = false;
    let uploadFinished = false;
    let abortTimer: ReturnType<typeof setTimeout> | undefined;
    const abortController = new AbortController();

    const endedCallbacks: Array<() => void> = [];
    let endedFired = false;

    // Fire onEnded callbacks exactly once, then auto-stop the session.
    // Called on: browser track end, network failure, or manual stop().
    const fireEnded = () => {
      if (endedFired) return;
      endedFired = true;
      for (const cb of endedCallbacks) { try { cb(); } catch { /* ignore */ } }
      // Auto-stop: release tracks + close pipe
      session.stop();
    };

    // POST the stream to the pipe with MIME info in X-Hoody-Pipe header.
    // Wrap in try/catch: if fetch throws synchronously (e.g. unsupported duplex),
    // we must release the capture immediately to avoid leaking camera/screen.
    let uploadPromise: Promise<void>;
    try {
      uploadPromise = fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'X-Hoody-Pipe': `mimeType=${mimeType}`,
        },
        body: stream,
        signal: abortController.signal,
        duplex: 'half',
      } as RequestInit).then(async (res) => {
        // Drain response body to confirm transfer is fully complete
        try { await res.text(); } catch { /* ignore */ }
        uploadFinished = true;
        // Treat non-2xx as failure (server rejected the upload)
        if (!res.ok && !abortController.signal.aborted && !stopped) {
          fireEnded();
        }
      }, (err) => {
        uploadFinished = true;
        // Abort errors are expected on manual stop() — swallow them
        if (abortController.signal.aborted) return;
        // Real network failure — auto-stop to release camera/screen
        if (!stopped) fireEnded();
      });
    } catch (err) {
      // Synchronous fetch failure — release capture immediately
      if (recorder.state !== 'inactive') recorder.stop();
      for (const track of mediaStream.getTracks()) track.stop();
      throw err;
    }

    const done = uploadPromise.then(() => {
      if (abortTimer !== undefined) clearTimeout(abortTimer);
    });

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
      get active() { return !stopped; },
      get paused() { return recorder.state === 'paused'; },
      done,

      stop() {
        if (stopped) return;
        stopped = true;

        // Notify listeners (idempotent — no-op if already fired by track end or network error)
        fireEnded();

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
        if (!stopped && recorder.state === 'recording') {
          recorder.pause();
        }
      },

      resume() {
        if (!stopped && recorder.state === 'paused') {
          recorder.resume();
        }
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
    if (opts?.n && opts.n > 1) url += `?n=${opts.n}`;

    videoElement.src = url;
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
    if (opts?.n && opts.n > 1) fetchUrl += `?n=${opts.n}`;

    const abortController = new AbortController();
    const response = await fetch(fetchUrl, { signal: abortController.signal });

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

    // Attach error listener early — catches decode/source errors during the entire session
    videoElement.addEventListener('error', onVideoError, { once: true });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      stopped = true;
      videoElement.removeEventListener('ended', onVideoEnded);
      videoElement.removeEventListener('error', onVideoError);
      resolvePromise?.();
    };

    const done = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;

      mediaSource.addEventListener('sourceopen', async () => {
        let sourceBuffer: SourceBuffer;
        try {
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          abortController.abort();
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
          URL.revokeObjectURL(objectUrl);
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

        sourceBuffer.addEventListener('updateend', () => {
          // Evict first; if eviction started, wait for its updateend before appending
          if (!tryEvict()) {
            appendNext();
          }
        });

        // SourceBuffer errors are fatal — once in error state, further appendBuffer
        // calls throw InvalidStateError. Abort the stream and finish cleanly.
        sourceBuffer.addEventListener('error', () => {
          try { reader.cancel(); } catch { /* ignore */ }
          try { abortController.abort(); } catch { /* ignore */ }
          try {
            if (mediaSource.readyState === 'open') mediaSource.endOfStream('decode');
          } catch { /* ignore */ }
          URL.revokeObjectURL(objectUrl);
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
            URL.revokeObjectURL(objectUrl);
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
        stopped = true;
        abortController.abort();
        videoElement.pause();
        videoElement.removeAttribute('src');
        videoElement.load();
        URL.revokeObjectURL(objectUrl);
        // Clean up any finishPlayback listeners
        videoElement.removeEventListener('ended', onVideoEnded);
        videoElement.removeEventListener('error', onVideoError);
        resolvePromise?.();
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

type StreamOpts = { path?: string; timeslice?: number; mimeType?: string; n?: number; viewer?: boolean };

/** Build stream options object, omitting undefined keys to satisfy exactOptionalPropertyTypes. */
function buildStreamOpts(opts?: { path?: string; timeslice?: number; mimeType?: string; n?: number; viewer?: boolean }): StreamOpts {
  const result: StreamOpts = {};
  if (opts?.path !== undefined) result.path = opts.path;
  if (opts?.timeslice !== undefined) result.timeslice = opts.timeslice;
  if (opts?.mimeType !== undefined) result.mimeType = opts.mimeType;
  if (opts?.n !== undefined) result.n = opts.n;
  if (opts?.viewer !== undefined) result.viewer = opts.viewer;
  return result;
}

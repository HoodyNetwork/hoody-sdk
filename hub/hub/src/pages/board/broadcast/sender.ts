// The sender: the capture recorded as WebM and sent as one streaming POST (the same live path as the pipe's own
// share page).
//
// Contract, in plain words:
//   - startSender(stream, mime, deps, onEnd) starts the recorder and the upload at once (a live stream starts with
//     nobody watching). Chunks every 100 ms, a keyframe asked every 2 s (Chromium honours it), so a late viewer
//     joins within about 2 s. Chunks keep their order: each is converted after the one before.
//   - Recorded bytes the upload has not taken yet are capped (16 MiB): past it the send ends as 'slow' instead of
//     growing without bound. A chunk that cannot be read ends it as 'recorder' (a lost chunk would break every
//     viewer's stream).
//   - stop() ends the recording and closes the body, so the stream ends for every viewer; the pipe answers once the
//     body ended. If no answer comes within 5 s the upload is aborted: the user asked to stop, so it ends as
//     'stopped' either way. The browser's own "Stop sharing" (a track ending) does the same, as 'track-ended'.
//   - A failure the sender decides itself ('slow', 'recorder') and cancel() (the Board going away) abort the upload
//     at once, dropping what is queued: nothing more leaves after the end is reported.
//   - onEnd is called exactly once: stopped | track-ended | refused {status, line} (a non-2xx answer: the pipe
//     refused the sender) | server {line} (the pipe ended it first, with a 2xx: its last [ERROR] line, such as the
//     idle timeout or a shutdown, or '' when it gave none) | network
//     (the upload failed while live) | slow | recorder | no-picture. Every end stops the capture's tracks.
//   - A recording that gives no bytes within FIRST_DATA_MS of its start ends as 'no-picture', aborted like a failure:
//     the browser accepted the capture but delivers no picture (Chromium's Element Capture does that for an area it
//     cannot isolate), and viewers would wait on an empty stream while the Board shows the broadcast live.
//   - Nothing is ever resent: a new Start is a new sender.
//   - What is recorded is the capture through the frame keeper (frames.ts: a still Board still gives a frame every
//     half second, so late viewers keep getting join points); the keeper ends with every end, and a keeper failure ends
//     the broadcast as recorder. The capture's own tracks
//     are the ones watched for the browser's Stop sharing and stopped at the end.
import { keepFrames, type KeptStream } from './frames';

export type SenderEnd =
  | { kind: 'stopped' }
  | { kind: 'track-ended' }
  | { kind: 'refused'; status: number; line: string }
  | { kind: 'server'; line: string }
  | { kind: 'network' }
  | { kind: 'slow' }
  | { kind: 'recorder' }
  | { kind: 'no-picture' };

export interface UploadResult { readonly status: number; readonly text: string }

interface RecorderLike {
  state: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}
export type RecorderCtor = new (stream: MediaStream, opts: Record<string, unknown>) => RecorderLike;

export interface SenderDeps {
  readonly MediaRecorder: RecorderCtor;
  /** One streaming upload of the body (core upload() through the pipe's live route). */
  upload(body: ReadableStream<Uint8Array>, mime: string, signal: AbortSignal): Promise<UploadResult>;
  readonly setTimeout?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout?: (t: unknown) => void;
  /** The frame keeper (frames.ts keepFrames by default); it calls onFail when it can no longer pass video on. */
  readonly keepFrames?: (stream: MediaStream, onFail: () => void) => KeptStream;
}

export interface Sender {
  stop(): void;
  /** Ends at once: the upload is aborted and the queue dropped (reported as 'stopped'). */
  cancel(): void;
  /** Bytes handed to the upload so far. */
  sent(): number;
  /** True once it is ending or ended (Stop, a track ending, a failure): nothing new should start on its behalf. */
  ending(): boolean;
}

export const TIMESLICE_MS = 100;
export const KEYFRAME_MS = 2000;
export const MAX_QUEUE_BYTES = 16 * 1024 * 1024;
export const STOP_ANSWER_MS = 5000;
export const FIRST_DATA_MS = 6000;
const VIDEO_BPS = 2_500_000, AUDIO_BPS = 96_000;

/** The last [ERROR] line of a pipe answer, without its tag ('' when none). */
export function errorLine(text: string): string {
  let out = '';
  for (const l of text.split('\n')) if (l.indexOf('[ERROR]') === 0) out = l.replace(/^\[ERROR\]\s*/, '').trim();
  return out;
}

export function startSender(stream: MediaStream, mime: string, deps: SenderDeps, onEnd: (e: SenderEnd) => void): Sender {
  const later = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = deps.clearTimeout ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const ac = new AbortController();
  let ended = false, stopping: SenderEnd | null = null, closed = false, pending = 0, sent = 0;
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  let stopTimer: unknown = null, firstTimer: unknown = null;
  let recorder: RecorderLike | null = null;
  let chain: Promise<void> = Promise.resolve();

  let kept: KeptStream | null = null;
  function stopTracks() {
    try { kept?.stop(); } catch { /* the keeper's */ }
    for (const t of stream.getTracks()) { try { t.stop(); } catch { /* gone */ } }
  }
  function closeBody() {
    if (closed) return;
    closed = true;
    try { ctrl?.close(); } catch { /* errored */ }
  }
  function finish(e: SenderEnd, abort = false) {
    if (ended) return;
    ended = true;
    if (stopTimer !== null) cancel(stopTimer);
    if (firstTimer !== null) { cancel(firstTimer); firstTimer = null; }
    if (abort) { closed = true; try { ac.abort(); } catch { /* done */ } }
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* done */ }
    closeBody();
    stopTracks();
    onEnd(e);
  }
  /** Ends the stream on purpose: the body closes, the pipe answers, or the upload is cut after STOP_ANSWER_MS. */
  function stopWith(e: SenderEnd) {
    if (ended || stopping) return;
    stopping = e;
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); else void chain.then(closeBody); } catch { void chain.then(closeBody); }
    stopTracks();
    stopTimer = later(() => { ac.abort(); finish(e); }, STOP_ANSWER_MS);
  }

  const body = new ReadableStream<Uint8Array>(
    { start(c) { ctrl = c; }, cancel() { closed = true; } },
    { highWaterMark: 0, size: (chunk) => chunk.byteLength },
  );
  const hasAudio = stream.getAudioTracks().length > 0;
  try {
    // A keeper that can no longer pass video on ends the broadcast like a recorder failure.
    const keeperFailed = () => { if (!stopping) finish({ kind: 'recorder' }, true); };
    kept = deps.keepFrames ? deps.keepFrames(stream, keeperFailed) : keepFrames(stream, undefined, keeperFailed);
    recorder = new deps.MediaRecorder(kept.stream, {
      mimeType: mime, videoBitsPerSecond: VIDEO_BPS, ...(hasAudio ? { audioBitsPerSecond: AUDIO_BPS } : {}), videoKeyFrameIntervalDuration: KEYFRAME_MS,
    });
  } catch {
    finish({ kind: 'recorder' }, true);
    return { stop() {}, cancel() {}, sent: () => 0, ending: () => true };
  }
  const rec = recorder;
  rec.ondataavailable = (ev) => {
    const blob = ev.data;
    if (!blob || !blob.size || ended || closed) return;
    if (firstTimer !== null) { cancel(firstTimer); firstTimer = null; }
    pending += blob.size;
    if (pending - (ctrl?.desiredSize ?? 0) > MAX_QUEUE_BYTES) { finish({ kind: 'slow' }, true); return; }
    chain = chain.then(() => (ended || closed ? null : blob.arrayBuffer())).then((buf) => {
      pending -= blob.size;
      if (!buf || ended || closed) return;
      try { ctrl?.enqueue(new Uint8Array(buf)); sent += buf.byteLength; } catch { /* closed */ }
    }, () => {
      pending -= blob.size;
      finish({ kind: 'recorder' }, true);
    });
  };
  rec.onstop = () => { void chain.then(closeBody); };
  rec.onerror = () => { if (!stopping) finish({ kind: 'recorder' }, true); };
  for (const t of stream.getTracks()) t.addEventListener('ended', () => stopWith({ kind: 'track-ended' }));

  let upload: Promise<UploadResult>;
  try { upload = deps.upload(body, mime, ac.signal); } catch (e) { upload = Promise.reject(e); }
  upload.then((r) => {
    if (stopping) { finish(stopping); return; }
    const line = errorLine(r.text);
    if (r.status < 200 || r.status >= 300) finish({ kind: 'refused', status: r.status, line });
    else finish({ kind: 'server', line });
  }, () => { finish(stopping ?? { kind: 'network' }); });
  try { rec.start(TIMESLICE_MS); } catch { finish({ kind: 'recorder' }, true); }
  if (!ended) firstTimer = later(() => { firstTimer = null; if (!stopping) finish({ kind: 'no-picture' }, true); }, FIRST_DATA_MS);

  return { stop: () => stopWith({ kind: 'stopped' }), cancel: () => finish(stopping ?? { kind: 'stopped' }, true), sent: () => sent, ending: () => ended || stopping !== null };
}

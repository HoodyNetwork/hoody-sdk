// The frame keeper: a still Board still gives the recorder a frame every half second.
//
// A tab capture delivers a frame only when something in it repaints, and MediaRecorder encodes only the frames it
// gets: a still Board makes no frames, so no keyframes, and a viewer who joins late (the pipe starts them at a
// keyframe) waits until something on the Board changes. Measured (Chromium, a still canvas track, the Hub's recorder
// settings): no join point in 20 s; with a copy every second, joins 2-4 s apart; every half second, 2-2.7 s apart
// and the first at 0.7 s (the recorder asks a keyframe every 2 s; a still frame costs ~1 KB).
//
// Contract, in plain words:
//   - keepFrames(stream, env, onFail) returns the stream to record. Where the browser has
//     MediaStreamTrackProcessor, MediaStreamTrackGenerator and VideoFrame (Chromium), its video goes through them:
//     every captured frame passes on, and after half a second with no new frame the last one goes out again (a
//     copy). Nothing is drawn on the page. Audio tracks are kept as they are.
//   - What goes out keeps time order: one write at a time; a frame whose timestamp is not after the last one sent
//     (a late captured frame after a copy) goes out restamped just after it. While a write is pending only the newest
//     frame waits (an older waiting one is dropped), and no copy is made: a stalled generator holds at most the
//     frame being written, one waiting frame and the kept copy.
//   - Without those APIs, or when setting them up fails (anything already set up is undone), the stream is recorded
//     as it is (kept: false).
//   - stop() (the broadcast ends, the Board unmounts) and the source ending end it: the timer goes, the kept and the
//     waiting frame are closed, pending writes are aborted, the generator stops. A write the generator refuses ends
//     it the same way and calls onFail once (the broadcast cannot go on without video). Every frame is closed once.
//     The source's own tracks are not touched here: their "ended" (the browser's Stop sharing) still ends the
//     broadcast.
export const STILL_MS = 500;
// Checked four times per STILL_MS, so a copy goes out STILL_MS to 1.25 × STILL_MS after the last frame (a check that
// runs every STILL_MS and a little early would skip a whole period).
const CHECK_MS = STILL_MS / 4;

interface FrameLike { readonly timestamp: number; clone(): FrameLike; close(): void }
type ProcessorCtor = new (init: { track: MediaStreamTrack }) => { readonly readable: ReadableStream<FrameLike> };
type GeneratorCtor = new (init: { kind: 'video' }) => MediaStreamTrack & { readonly writable: WritableStream<FrameLike> };
type FrameCtor = new (src: FrameLike, init: { timestamp: number }) => FrameLike;
type StreamCtor = new (tracks: MediaStreamTrack[]) => MediaStream;

export interface FrameEnv {
  MediaStreamTrackProcessor?: ProcessorCtor;
  MediaStreamTrackGenerator?: GeneratorCtor;
  VideoFrame?: FrameCtor;
  MediaStream?: StreamCtor;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
  now?: () => number;
}

export interface KeptStream { readonly stream: MediaStream; readonly kept: boolean; stop(): void }

const g = globalThis as unknown as FrameEnv;
export const browserFrameEnv = (): FrameEnv => ({
  MediaStreamTrackProcessor: g.MediaStreamTrackProcessor,
  MediaStreamTrackGenerator: g.MediaStreamTrackGenerator,
  VideoFrame: g.VideoFrame,
  MediaStream: g.MediaStream,
});

const closeQuietly = (f: FrameLike | null | undefined) => { try { f?.close(); } catch { /* already closed */ } };

export function keepFrames(stream: MediaStream, env: FrameEnv = browserFrameEnv(), onFail: () => void = () => {}): KeptStream {
  const asIs: KeptStream = { stream, kept: false, stop() {} };
  const video = stream.getVideoTracks()[0];
  const { MediaStreamTrackProcessor: Proc, MediaStreamTrackGenerator: Gen, VideoFrame: Frame, MediaStream: Stream } = env;
  if (!video || !Proc || !Gen || !Frame || !Stream) return asIs;
  const every = env.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const unevery = env.clearInterval ?? ((id: unknown) => clearInterval(id as ReturnType<typeof setInterval>));
  const now = env.now ?? (() => performance.now());

  let proc: InstanceType<ProcessorCtor> | null = null, gen: InstanceType<GeneratorCtor> | null = null;
  let reader: ReadableStreamDefaultReader<FrameLike> | null = null;
  let rd: ReadableStreamDefaultReader<FrameLike>, wr: WritableStreamDefaultWriter<FrameLike>, gn: InstanceType<GeneratorCtor>;
  let out: MediaStream;
  try {
    proc = new Proc({ track: video });
    gen = new Gen({ kind: 'video' });
    out = new Stream([gen, ...stream.getAudioTracks()]);
    reader = proc.readable.getReader();
    wr = gen.writable.getWriter();
    rd = reader; gn = gen;
  } catch {
    // Undo what was set up: a reader holds the processor's frames, a generator is a live track.
    if (reader) reader.cancel().catch(() => undefined);
    else if (proc) proc.readable.cancel().catch(() => undefined);
    try { gen?.stop(); } catch { /* gone */ }
    return asIs;
  }

  let last: FrameLike | null = null;     // a copy of the last frame sent, owned here
  let lastAt = 0;                        // now() when the last frame was sent
  let lastTs = -Infinity;                // the timestamp of the last frame sent
  let writing = false;                   // a write is pending
  let waiting: FrameLike | null = null;  // the newest frame waiting for it, owned here
  let done = false;
  let timer: unknown = null;

  const end = () => {
    if (done) return;
    done = true;
    if (timer !== null) unevery(timer);
    timer = null;
    closeQuietly(last); last = null;
    closeQuietly(waiting); waiting = null;
    rd.cancel().catch(() => undefined);
    wr.abort().catch(() => undefined);
    try { gn.stop(); } catch { /* gone */ }
  };
  const fail = () => { if (done) return; end(); onFail(); };

  // Writes `f` (owned) in time order, one at a time; the generator takes and closes what it accepts.
  const write = (f: FrameLike) => {
    let frame = f;                       // the one frame owned here: `f`, or its restamped copy once `f` is closed
    try {
      if (frame.timestamp <= lastTs) { const re = new Frame(f, { timestamp: lastTs + 1 }); closeQuietly(f); frame = re; }
      const keep = frame.clone();
      closeQuietly(last);
      last = keep;
    } catch {
      closeQuietly(frame); fail(); return;
    }
    lastAt = now();
    lastTs = frame.timestamp;
    writing = true;
    wr.write(frame).then(() => {
      writing = false;
      if (done) return;
      const next = waiting;
      waiting = null;
      if (next) write(next);
    }, () => { closeQuietly(frame); fail(); });
  };
  const offer = (f: FrameLike) => {
    if (done) { closeQuietly(f); return; }
    if (writing) { closeQuietly(waiting); waiting = f; return; }
    write(f);
  };

  const pump = (): void => {
    rd.read().then((r) => {
      if (r.done || done) { closeQuietly(r.value); end(); return; }
      offer(r.value);
      pump();
    }, end);
  };
  pump();

  timer = every(() => {
    if (done || writing || !last) return;
    const at = now();
    if (at - lastAt < STILL_MS) return;
    let copy: FrameLike;
    try { copy = new Frame(last, { timestamp: lastTs + Math.max(1, Math.round((at - lastAt) * 1000)) }); } catch { fail(); return; }
    write(copy);
  }, CHECK_MS);

  return { stream: out, kept: true, stop: end };
}

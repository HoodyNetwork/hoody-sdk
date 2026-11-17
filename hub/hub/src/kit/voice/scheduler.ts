// The playback scheduler of a page, engine-free: Talk's reply outputs and Read aloud /
// preview clips go through one queue, one output at a time, and leave as device-rate blocks for the playback worklet.
// No AudioContext, socket or timer lives in the core (Scheduler); createPlayback() is the thin binding to the worklet.
// What it promises:
//   - Audio is kept as Int16 at its source rate. A fractional cursor resamples it to the device rate as blocks are
//     pulled; a block never spans two outputs or a gap, so a device frame maps back to one source position.
//   - played_to is the integer source position the device actually rendered (the worklet's own count, never what was
//     only handed over), excluding underrun silence, never past what was received and never past the first gap.
//   - Marks go out every 250 ms while an output advances; the final mark equals output.end's samples only when every
//     sample was received and rendered.
//   - Damage: audio whose offset jumps past what was received makes the output damaged. Later audio may play, but its
//     marks stop at the gap start, so a cumulative mark never certifies a hole. Audio overlapping what was received is
//     dropped whole.
//   - Bounds: unplayed audio across outputs above 12 s (play lead) or 60 s (no play lead) is refused as `overflow` and
//     dropped (never marked played); the caller stops speech. A clip is admitted only while no Talk session holds the
//     scheduler, unplayed audio is under 10 s, and no other decoded clip waits.
//   - Talk owns the scheduler while a Talk session is open: opening it flushes every clip.
//   - Input is checked before any state changes: rates are integers in RATE_MIN..RATE_MAX, ids, offsets and sample
//     counts are safe non-negative integers, and at most MAX_OUTPUTS outputs are queued at once (start() refuses more).
//   - Memory: audio the device rendered is released as it plays (whole chunks behind the rendered position), so what is
//     held is bounded by the unplayed-audio bound plus one chunk per output. Contiguous audio is coalesced into chunks
//     of up to COALESCE_MAX samples, and an output takes at most MAX_GAPS gaps (more is `overflow`), so tiny packets
//     cannot pile up chunk objects. Unplayed audio is counted from running totals, never by rescanning chunks.
//   - An output.end below what was received is contradictory: it is reported as `contradicts`, the received audio
//     still plays, and marks never pass the declared samples.

export const MARK_EVERY_MS = 250;
export const BOUND_PLAY_LEAD_S = 12;
export const BOUND_NO_LEAD_S = 60;
export const CLIP_ADMIT_S = 10;
export const CLIP_MAX_S = 30;
export const CLIP_MAX_BYTES = 2 * 1024 * 1024;
/** Device-rate audio the worklet may hold ahead of what it has played: what a stop can still lose, at most. */
export const DEVICE_LEAD_MS = 120;
/** The largest block handed over at once (device frames are cut into blocks of at most this many ms). */
const BLOCK_MS = 40;
/** Source and device rates the scheduler accepts (Hz, integers). */
export const RATE_MIN = 8000;
export const RATE_MAX = 192000;
/** Outputs queued at once, Talk outputs and clips together. */
export const MAX_OUTPUTS = 32;
/** Contiguous audio is appended into one chunk until it holds this many samples. */
export const COALESCE_MAX = 4800;
/** Gaps (offset jumps) one output may take; audio past the last is refused as `overflow`. */
export const MAX_GAPS = 16;

export type AudioResult = 'ok' | 'overlap' | 'damaged' | 'unknown' | 'overflow' | 'invalid';
export type EndResult = 'ok' | 'unknown' | 'invalid' | 'contradicts';
export interface Mark { out: number; played_to: number }

/** `pcm` is owned (a copy) and may have spare capacity: samples are pcm[0 .. len). */
interface Chunk { offset: number; pcm: Int16Array; len: number }
interface Output {
  out: number;
  clip: boolean;
  rate: number;
  chunks: Chunk[];
  /** The end of the highest audio received (the next expected offset). */
  next: number;
  /** The first gap's start, once the output is damaged. */
  gapAt: number | null;
  /** Gaps taken so far (at most MAX_GAPS). */
  gaps: number;
  /** Samples received in all, and samples released (whole chunks behind the rendered position). */
  received: number;
  released: number;
  /** output.end's samples (a clip's length), once known. */
  samples: number | null;
  /** output.end's declared samples when they were below what was received (marks stop there). */
  declared: number | null;
  /** The fractional source position handed to the device. */
  cursor: number;
  /** The integer source position the device rendered. */
  played: number;
  /** The exact (fractional) source position the device rendered: a flush hands kept outputs over again from here. */
  rendered: number;
  marked: number;
  markedAt: number;
}

/** One block for the worklet: `frames` device frames of one output, source position cursor0 + k * step at frame k. */
export interface Block {
  id: number;
  out: number;
  data: Float32Array;
  /** data.length at creation: the binding transfers `data` to the worklet, which detaches it (length 0 after). */
  frames: number;
  cursor0: number;
  step: number;
  /** The fractional source position just past the block (the cursor after it). */
  cursorEnd: number;
  /** The source position just past the last sample this block reads (played never passes it). */
  srcEnd: number;
}

const clampS16 = (v: number): number => (v > 32767 ? 32767 : v < -32768 ? -32768 : v);
const count = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
/** A source or device rate the scheduler accepts. */
export const rateOk = (r: number): boolean => Number.isInteger(r) && r >= RATE_MIN && r <= RATE_MAX;

export class Scheduler {
  private outs: Output[] = [];
  private blocks = new Map<number, { block: Block; out: Output }>();
  private nextBlock = 1;
  private nextClip = -1;
  private talk = false;
  private playLead = false;
  /** Chunks visited while counting unplayed audio (a test hook: admission work must stay O(outputs), not O(chunks)). */
  private scans = 0;

  /** The session's agent lists bot_voice_play_lead: the 12 s bound instead of 60 s. Set when a Talk session opens. */
  setPlayLead(on: boolean): void { this.playLead = on; }

  /** The bound on unplayed audio, in seconds. */
  bound(): number { return this.playLead ? BOUND_PLAY_LEAD_S : BOUND_NO_LEAD_S; }

  /** Received audio not yet rendered, in seconds, across every output. */
  unplayedSeconds(): number {
    let s = 0;
    for (const o of this.outs) s += this.unplayedOf(o) / o.rate;
    return s;
  }

  private unplayedOf(o: Output): number {
    // Received, less what was released, less what was rendered of the chunks still held (only those starting before
    // `played`: reclaim keeps at most the one or two around it, so this loop is short).
    let n = o.received - o.released;
    for (const c of o.chunks) {
      this.scans++;
      if (c.offset >= o.played) break;
      n -= Math.min(c.len, o.played - c.offset);
    }
    return n;
  }

  /** A Talk session opened: it owns the scheduler until talkClosed(). Every clip is flushed; true when one was. */
  talkOpened(): boolean {
    this.talk = true;
    const had = this.outs.some((o) => o.clip);
    this.drop((o) => o.clip);
    return had;
  }
  talkClosed(): void { this.talk = false; }
  talkOpen(): boolean { return this.talk; }

  /** output.start: a reply output of the Talk session at the session's out_rate. False when refused. */
  start(out: number, rate: number): boolean {
    if (!this.talk || !count(out) || !rateOk(rate) || this.find(out) || this.outs.length >= MAX_OUTPUTS) return false;
    this.outs.push(this.fresh(out, false, rate));
    this.outs.sort((a, b) => (a.clip === b.clip ? a.out - b.out : a.clip ? 1 : -1));
    return true;
  }

  /** output.audio for a started output (see the contract). */
  audio(out: number, offset: number, pcm: Int16Array): AudioResult {
    if (!count(out) || !count(offset) || !(pcm instanceof Int16Array) || !count(offset + pcm.length)) return 'invalid';
    const o = this.find(out);
    if (!o || o.clip || o.samples !== null) return 'unknown';
    if (!pcm.length) return 'ok';
    if (offset < o.next) return 'overlap';
    if ((this.unplayedSeconds() + pcm.length / o.rate) > this.bound()) return 'overflow';
    let r: AudioResult = 'ok';
    if (offset > o.next) {
      if (o.gaps >= MAX_GAPS) return 'overflow';
      o.gaps++;
      if (o.gapAt === null) o.gapAt = o.next;
      // An open run's last frame may have stepped past its end (downsampling) into where this audio now starts.
      if (o.cursor > offset) this.rebase(o, offset);
      r = 'damaged';
    }
    this.append(o, offset, pcm);
    o.next = offset + pcm.length;
    o.received += pcm.length;
    return r;
  }

  /** Adds received audio: appended to the last chunk when contiguous and that chunk has room, else a new owned chunk. */
  private append(o: Output, offset: number, pcm: Int16Array): void {
    const n = pcm.length, last = o.chunks.at(-1);
    if (last && last.offset + last.len === offset && last.len + n <= COALESCE_MAX) {
      if (last.len + n > last.pcm.length) {
        const grown = new Int16Array(Math.min(COALESCE_MAX, Math.max(last.pcm.length * 2, last.len + n)));
        grown.set(last.pcm.subarray(0, last.len));
        last.pcm = grown;
      }
      last.pcm.set(pcm, last.len);
      last.len += n;
      return;
    }
    const own = new Int16Array(n >= COALESCE_MAX ? n : Math.min(COALESCE_MAX, Math.max(256, n * 2)));
    own.set(pcm);
    o.chunks.push({ offset, pcm: own, len: n });
  }

  /** output.end: the output holds `samples` samples in all. */
  end(out: number, samples: number): EndResult {
    if (!count(out) || !count(samples)) return 'invalid';
    const o = this.find(out);
    if (!o || o.clip || o.samples !== null) return 'unknown';
    if (samples < o.next) {
      // Fewer samples than were received: everything received still plays, marks stop at the declared count.
      o.samples = o.next;
      o.declared = samples;
      return 'contradicts';
    }
    o.samples = samples;
    if (o.next < samples && o.gapAt === null) o.gapAt = o.next;
    return 'ok';
  }

  /** Whether a clip may be handed over now (see the contract). */
  admitClip(): boolean {
    if (this.talk || this.unplayedSeconds() >= CLIP_ADMIT_S) return false;
    return !this.outs.some((o) => o.clip && o.played === 0 && o.cursor === 0);
  }

  /** A decoded clip (mono Int16 at `rate`); its local id, or null when not admitted or too long. */
  clip(pcm: Int16Array, rate: number): number | null {
    if (!rateOk(rate) || !pcm.length || pcm.length / rate > CLIP_MAX_S || this.outs.length >= MAX_OUTPUTS || !this.admitClip()) return null;
    const o = this.fresh(this.nextClip--, true, rate);
    o.chunks.push({ offset: 0, pcm: pcm.slice(), len: pcm.length });
    o.next = pcm.length;
    o.received = pcm.length;
    o.samples = pcm.length;
    this.outs.push(o);
    return o.out;
  }

  /** Whether any clip is queued or playing. */
  clipActive(): boolean { return this.outs.some((o) => o.clip); }

  /**
   * The next block for the device: at most `maxFrames` frames at `deviceRate`, of the first output in order that has
   * audio to hand over. A later output starts only once every received sample of the ones before it was handed over
   * and their end is known. Null when there is nothing to hand over (an underrun, or nothing queued).
   */
  pull(maxFrames: number, deviceRate: number): Block | null {
    if (!rateOk(deviceRate) || !(maxFrames >= 1)) return null;
    for (const o of this.outs) {
      const r = this.pullFrom(o, Math.floor(maxFrames), deviceRate);
      if (r !== 'done') return r;
    }
    return null;
  }

  private pullFrom(o: Output, maxFrames: number, deviceRate: number): Block | null | 'done' {
    const step = o.rate / deviceRate;
    const ci = o.chunks.findIndex((c) => o.cursor < c.offset + c.len);
    if (ci < 0) return o.samples !== null ? 'done' : null;
    const c = o.chunks[ci]!;
    // A cursor in a gap (damaged audio) jumps to the audio after it.
    if (o.cursor < c.offset) o.cursor = c.offset;
    let runEnd = c.offset + c.len, j = ci + 1;
    for (; j < o.chunks.length && o.chunks[j]!.offset === runEnd; j++) runEnd += o.chunks[j]!.len;
    // Closed: nothing can extend this run (the output ended, or audio after a gap follows it), so it plays to its last
    // sample. Open: interpolation reads s[i + 1], so a frame needs a sample after its own.
    const closed = j < o.chunks.length || (o.samples !== null && runEnd >= o.next);
    const limit = closed ? runEnd : runEnd - 1;
    const need = Math.ceil((limit - o.cursor) / step - 1e-9);
    const frames = Math.min(maxFrames, need);
    if (frames <= 0) return null;
    const data = new Float32Array(frames);
    const cursor0 = o.cursor;
    for (let k = 0; k < frames; k++) {
      const pos = cursor0 + k * step;
      const i = Math.floor(pos);
      const a = this.sampleAt(o, i, ci), b = i + 1 < runEnd ? this.sampleAt(o, i + 1, ci) : a;
      data[k] = (a + (b - a) * (pos - i)) / 32768;
    }
    o.cursor = cursor0 + frames * step;
    const whole = closed && frames === need;
    if (whole) o.cursor = Math.max(o.cursor, runEnd);
    // A gap follows this run: its last frame may overshoot past audio after the gap (downsampling steps over several
    // source samples). The next run starts at its own offset instead; the gap's timing is not kept anyway.
    if (whole && j < o.chunks.length) o.cursor = Math.min(o.cursor, o.chunks[j]!.offset);
    const block: Block = { id: this.nextBlock++, out: o.out, data, frames, cursor0, step, cursorEnd: o.cursor, srcEnd: whole ? runEnd : Math.floor(o.cursor) };
    this.blocks.set(block.id, { block, out: o });
    return block;
  }

  private sampleAt(o: Output, i: number, from: number): number {
    for (let j = from; j < o.chunks.length; j++) {
      const c = o.chunks[j]!;
      if (i < c.offset) break;
      if (i < c.offset + c.len) return c.pcm[i - c.offset]!;
    }
    return 0;
  }

  /**
   * Audio after a gap starts at `at`, which the open run's last frame had stepped past (the run's own timing ended in the
   * gap; the audio after it is not part of that frame). Everything that position reached, the cursor, what was rendered
   * and played, and what the blocks already handed over will report, stops at `at`, so the new audio is pulled, kept and
   * handed over again by a flush from there.
   */
  private rebase(o: Output, at: number): void {
    o.cursor = at;
    o.played = Math.min(o.played, at);
    o.rendered = Math.min(o.rendered, at);
    for (const b of this.blocks.values()) {
      if (b.out !== o) continue;
      b.block.cursorEnd = Math.min(b.block.cursorEnd, at);
      b.block.srcEnd = Math.min(b.block.srcEnd, at);
    }
  }

  /** The worklet rendered `frames` frames of block `id` (cumulative for that block). */
  played(id: number, frames: number): void {
    const b = this.blocks.get(id);
    if (!b) return;
    if (!Number.isFinite(frames)) return;
    const len = b.block.frames, n = Math.max(0, Math.min(Math.floor(frames), len));
    const exact = n >= len ? b.block.cursorEnd : b.block.cursor0 + n * b.block.step;
    const pos = n >= len ? b.block.srcEnd : Math.min(b.block.srcEnd, Math.floor(exact + 1e-9));
    const o = b.out;
    if (pos > o.played) o.played = pos;
    if (exact > o.rendered) o.rendered = exact;
    if (n >= len) this.blocks.delete(id);
    this.reclaim(o);
  }

  /** Releases chunks wholly behind what was rendered (interpolation reads floor(pos) and the sample after it). */
  private reclaim(o: Output): void {
    const keepFrom = Math.min(o.played, Math.floor(o.rendered));
    let k = 0;
    while (k < o.chunks.length && o.chunks[k]!.offset + o.chunks[k]!.len <= keepFrom) o.released += o.chunks[k++]!.len;
    if (k) o.chunks.splice(0, k);
  }

  /** PCM samples held across every output (rendered audio is released as it plays). */
  heldSamples(): number {
    let n = 0;
    for (const o of this.outs) for (const c of o.chunks) n += c.len;
    return n;
  }

  /** Chunks visited by unplayed-audio counting so far (test hook). */
  scanCount(): number { return this.scans; }

  /** Chunk objects held across every output. */
  heldChunks(): number {
    let n = 0;
    for (const o of this.outs) n += o.chunks.length;
    return n;
  }

  /** The marks due now (see the contract); finished outputs leave the queue. */
  marks(now: number): Mark[] {
    const out: Mark[] = [];
    for (const o of [...this.outs]) {
      const to = this.markable(o);
      const done = this.finished(o);
      if (!o.clip && to > o.marked && (done || now - o.markedAt >= MARK_EVERY_MS)) {
        out.push({ out: o.out, played_to: to });
        o.marked = to;
        o.markedAt = now;
      }
      if (done) this.remove(o);
    }
    return out;
  }

  private markable(o: Output): number {
    let to = Math.min(o.played, o.next);
    if (o.gapAt !== null) to = Math.min(to, o.gapAt);
    if (o.declared !== null) to = Math.min(to, o.declared);
    return to;
  }

  /** Every received sample was handed over and rendered, and no more can come. */
  private finished(o: Output): boolean {
    if (o.samples === null) return false;
    // o.next is the end of the last audio received (audio arrives in offset order); chunks may already be released.
    return o.played >= Math.min(o.next, o.samples) && ![...this.blocks.values()].some((b) => b.out === o);
  }

  /**
   * Flush: every output (or, with `uptoOut`, every Talk output up to it, output.stop) leaves at once; the marks they
   * owe are returned at their true rendered position. The caller first lets the worklet report what it rendered.
   */
  flush(uptoOut?: number): Mark[] {
    const hit = (o: Output) => uptoOut === undefined || (!o.clip && o.out <= uptoOut);
    const marks: Mark[] = [];
    for (const o of this.outs) {
      if (!hit(o) || o.clip) continue;
      const to = this.markable(o);
      if (to > o.marked) marks.push({ out: o.out, played_to: to });
    }
    this.drop(hit);
    // The worklet dropped every block it held: what it had not rendered of the kept outputs is handed over again, from
    // the exact rendered position (resampling advances fractionally; the integer `played` would repeat audio).
    for (const o of this.outs) o.cursor = Math.min(o.cursor, o.rendered);
    this.blocks.clear();
    return marks;
  }

  /** Blocks handed to the device and not yet fully rendered (the binding clears the worklet on a flush). */
  pendingBlocks(): number { return this.blocks.size; }

  private drop(hit: (o: Output) => boolean): void {
    for (const o of this.outs.filter(hit)) this.remove(o);
  }
  private remove(o: Output): void {
    this.outs = this.outs.filter((x) => x !== o);
    for (const [id, b] of this.blocks) if (b.out === o) this.blocks.delete(id);
  }
  private current(): Output | undefined { return this.outs[0]; }
  private find(out: number): Output | undefined { return this.outs.find((o) => o.out === out); }
  private fresh(out: number, clip: boolean, rate: number): Output {
    return { out, clip, rate, chunks: [], next: 0, gapAt: null, gaps: 0, received: 0, released: 0, samples: null, declared: null, cursor: 0, played: 0, rendered: 0, marked: 0, markedAt: -Infinity };
  }
}

// ---- clips ----

export type ClipRefusal = 'too_large' | 'too_long' | 'undecodable';

/** Decodes an answer's bytes (a copy, released after conversion) to mono Int16 at the buffer's own rate. */
export async function decodeClip(ctx: BaseAudioContext, bytes: Uint8Array): Promise<{ pcm: Int16Array; rate: number } | { refused: ClipRefusal }> {
  if (bytes.length > CLIP_MAX_BYTES) return { refused: 'too_large' };
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
  } catch {
    return { refused: 'undecodable' };
  }
  if (!(buf.duration > 0) || !buf.numberOfChannels) return { refused: 'undecodable' };
  if (buf.duration > CLIP_MAX_S) return { refused: 'too_long' };
  const n = buf.length, ch = buf.numberOfChannels, pcm = new Int16Array(n);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const c of chans) s += c[i]!;
    pcm[i] = clampS16(Math.round((s / ch) * 32767));
  }
  return { pcm, rate: buf.sampleRate };
}

// ---- the binding to the playback worklet ----

/** Messages between the binding and playback.worklet.ts. */
export type ToWorklet = { type: 'block'; id: number; data: Float32Array } | { type: 'flush'; seq: number };
export type FromWorklet = { type: 'played'; id: number; frames: number } | { type: 'flushed'; seq: number } | { type: 'need' };

export interface PlaybackPort {
  postMessage(m: ToWorklet, transfer?: Transferable[]): void;
  onmessage: ((e: { data: FromWorklet }) => void) | null;
}

/**
 * Keeps the worklet fed from the scheduler (at most DEVICE_LEAD_MS ahead) and the scheduler told what was rendered.
 * flush() resolves once the worklet dropped its queue and reported what it rendered, with the marks to send.
 */
export function feed(s: Scheduler, port: PlaybackPort, deviceRate: number) {
  let handed = 0, rendered = new Map<number, number>(), flushSeq = 0;
  const waiting = new Map<number, () => void>();
  const sizes = new Map<number, number>();
  const lead = () => handed;
  const top = () => {
    // Nothing is handed over while a flush is pending: the worklet would play it after dropping its queue.
    if (waiting.size) return;
    const max = Math.floor((deviceRate * BLOCK_MS) / 1000);
    const allow = Math.floor((deviceRate * DEVICE_LEAD_MS) / 1000);
    // Each block is cut to what the allowance has left, so the worklet never holds more than DEVICE_LEAD_MS.
    while (lead() < allow) {
      const b = s.pull(Math.min(max, allow - lead()), deviceRate);
      if (!b) break;
      sizes.set(b.id, b.frames);
      handed += b.frames;
      port.postMessage({ type: 'block', id: b.id, data: b.data }, [b.data.buffer]);
    }
  };
  port.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'played') {
      if (!sizes.has(m.id) || !Number.isFinite(m.frames)) return;
      const was = rendered.get(m.id) ?? 0, size = sizes.get(m.id)!;
      const now = Math.min(size, Math.max(was, m.frames));
      handed -= now - was;
      s.played(m.id, now);
      if (now >= size) { rendered.delete(m.id); sizes.delete(m.id); } else rendered.set(m.id, now);
      top();
    } else if (m.type === 'need') top();
    else if (m.type === 'flushed') waiting.get(m.seq)?.();
  };
  return {
    /** New audio or a clip arrived: hand over what fits. */
    poke: top,
    /** Resolves once the worklet dropped its queue (or after `waitMs`: a suspended context may not answer). */
    flush(uptoOut?: number, waitMs = 300): Promise<Mark[]> {
      const seq = ++flushSeq;
      return new Promise((resolve) => {
        const finish = () => {
          if (!waiting.delete(seq)) return;
          clearTimeout(t);
          handed = 0; rendered = new Map(); sizes.clear();
          resolve(s.flush(uptoOut));
          top();
        };
        const t = setTimeout(finish, waitMs);
        waiting.set(seq, finish);
        port.postMessage({ type: 'flush', seq });
      });
    },
  };
}

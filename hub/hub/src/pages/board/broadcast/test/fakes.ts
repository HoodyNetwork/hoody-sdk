// Test fakes for the broadcast: a capture (tracks that can end), a MediaRecorder and a pipe upload you drive by hand.
// Tests only (never imported by the page).
import type { RecorderCtor, UploadResult } from '../sender';

export class FakeTrack extends EventTarget {
  stopped = false;
  constructor(readonly kind: 'video' | 'audio', private readonly settings: Record<string, unknown> = { displaySurface: 'browser' }) { super(); }
  getSettings() { return this.settings; }
  stop() { this.stopped = true; }
  /** The browser's own "Stop sharing". */
  end() { this.dispatchEvent(new Event('ended')); }
  restrictTo?: (t: unknown) => Promise<void>;
  cropTo?: (t: unknown) => Promise<void>;
}

export function fakeStream(o: { audio?: boolean; video?: boolean; surface?: string } = {}) {
  const video = o.video === false ? [] : [new FakeTrack('video', { displaySurface: o.surface ?? 'browser' })];
  const audio = o.audio ? [new FakeTrack('audio', {})] : [];
  const all = [...video, ...audio];
  const stream = { getTracks: () => all, getVideoTracks: () => video, getAudioTracks: () => audio } as unknown as MediaStream;
  return { stream, video: video[0], audio: audio[0], all };
}

export class FakeRecorder {
  static last: FakeRecorder | null = null;
  static supported = new Set(['video/webm;codecs=vp8', 'video/webm;codecs=vp8,opus', 'video/webm']);
  static isTypeSupported(t: string) { return FakeRecorder.supported.has(t); }
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  timeslice: number | undefined;
  constructor(readonly stream: MediaStream, readonly opts: Record<string, unknown>) { FakeRecorder.last = this; }
  start(t?: number) { this.state = 'recording'; this.timeslice = t; }
  stop() { if (this.state === 'inactive') return; this.state = 'inactive'; this.onstop?.(); }
  /** One recorded chunk. */
  chunk(bytes: number[] | Blob) { this.ondataavailable?.({ data: bytes instanceof Blob ? bytes : new Blob([new Uint8Array(bytes)]) }); }
}
export const Recorder = FakeRecorder as unknown as RecorderCtor & { isTypeSupported(t: string): boolean };

/** An upload you answer by hand; it records the bytes the body carried. */
export function fakeUpload() {
  const calls: Array<{ body: ReadableStream<Uint8Array>; mime: string; signal: AbortSignal; bytes: number[]; closed: boolean; answer(r: UploadResult): void; fail(): void }> = [];
  const upload = (body: ReadableStream<Uint8Array>, mime: string, signal: AbortSignal): Promise<UploadResult> => new Promise((resolve, reject) => {
    const c = { body, mime, signal, bytes: [] as number[], closed: false, answer: resolve, fail: () => reject(new TypeError('Failed to fetch')) };
    calls.push(c);
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    const reader = body.getReader();
    const pump = (): void => { void reader.read().then((r) => { if (r.done) { c.closed = true; return; } c.bytes.push(...r.value); pump(); }, () => { c.closed = true; }); };
    pump();
  });
  return { upload, calls };
}

export const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

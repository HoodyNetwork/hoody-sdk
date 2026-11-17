// What this browser can do for a broadcast (the checks of the pipe's own share page, src/pages/share.ts).
//
// Contract, in plain words:
//   - unsupported(env) → null when Start may be offered, else why not (the first that applies):
//     framed (a Hub page inside another page: changes are refused there and the capture needs its permission),
//     insecure (no secure context), no-capture (no getDisplayMedia: phones, old browsers), no-recorder (no
//     MediaRecorder), no-stream-upload (fetch cannot send a ReadableStream body: every browser but Chromium ones
//     today), no-webm (no WebM recording: the pipe joins late viewers at WebM keyframes only), no-crypto.
//   - pickMime(MR, audio) → the recording type: WebM only, VP8 first (what every player decodes), declaring
//     exactly the tracks the capture has; '' when none is supported.
export type Unsupported = 'framed' | 'insecure' | 'no-capture' | 'no-recorder' | 'no-stream-upload' | 'no-webm' | 'no-crypto';

interface RecorderCtor { isTypeSupported(type: string): boolean }

export interface BrowserEnv {
  readonly framed: boolean;
  readonly isSecureContext?: boolean;
  readonly mediaDevices?: { getDisplayMedia?: unknown } | undefined;
  readonly MediaRecorder?: RecorderCtor | undefined;
  readonly Request?: typeof Request | undefined;
  readonly ReadableStream?: typeof ReadableStream | undefined;
  readonly crypto?: { getRandomValues?: unknown } | undefined;
}

/** The live browser's environment. */
export function browserEnv(framed: boolean): BrowserEnv {
  const g = globalThis as unknown as Record<string, unknown> & { navigator?: Navigator };
  return {
    framed,
    isSecureContext: g.isSecureContext === true,
    mediaDevices: g.navigator?.mediaDevices as BrowserEnv['mediaDevices'],
    MediaRecorder: g.MediaRecorder as RecorderCtor | undefined,
    Request: g.Request as typeof Request | undefined,
    ReadableStream: g.ReadableStream as typeof ReadableStream | undefined,
    crypto: g.crypto as BrowserEnv['crypto'],
  };
}

/** fetch() can send a ReadableStream body: it reads the duplex option and does not turn the stream into text. */
export function canStreamUpload(env: Pick<BrowserEnv, 'Request' | 'ReadableStream'>): boolean {
  const R = env.Request, RS = env.ReadableStream;
  if (typeof R !== 'function' || typeof RS !== 'function') return false;
  try {
    let duplexRead = false;
    const init = { method: 'POST', body: new RS(), get duplex() { duplexRead = true; return 'half'; } } as RequestInit;
    const hasType = new R('https://hoody.invalid/', init).headers.has('Content-Type');
    return duplexRead && !hasType;
  } catch {
    return false;
  }
}

const VIDEO_AUDIO = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus'];
const VIDEO_ONLY = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];

export function pickMime(MR: RecorderCtor | undefined, audio: boolean): string {
  if (!MR || typeof MR.isTypeSupported !== 'function') return '';
  for (const type of audio ? VIDEO_AUDIO : VIDEO_ONLY) {
    try { if (MR.isTypeSupported(type)) return type; } catch { /* next */ }
  }
  return '';
}

export function unsupported(env: BrowserEnv): Unsupported | null {
  if (env.framed) return 'framed';
  if (env.isSecureContext !== true) return 'insecure';
  if (!env.mediaDevices || typeof env.mediaDevices.getDisplayMedia !== 'function') return 'no-capture';
  if (!env.MediaRecorder) return 'no-recorder';
  if (!canStreamUpload(env)) return 'no-stream-upload';
  if (!pickMime(env.MediaRecorder, false)) return 'no-webm';
  if (!env.crypto || typeof env.crypto.getRandomValues !== 'function') return 'no-crypto';
  return null;
}

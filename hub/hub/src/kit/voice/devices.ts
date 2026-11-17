// Microphone and speaker access for Talk: echo cancellation, noise suppression and
// automatic gain on, mono. Speaker choice needs setSinkId, which some browsers lack: sinkSupported() says so, and the
// device picker hides the speaker list instead of offering a choice that does nothing.

import { hostEnv } from '../../core/host-env';

export interface MicOptions { deviceId?: string }

/** The browser's media devices; none off a web page (a terminal host has no `navigator`, and even asking for it stops there). */
const mediaDevices = (): MediaDevices | undefined => (hostEnv().browserPage === true && typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined);

export function micConstraints(o: MicOptions = {}): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      ...(o.deviceId ? { deviceId: { exact: o.deviceId } } : {}),
    },
    video: false,
  };
}

export type MicRefusal = 'unsupported' | 'denied' | 'not_found' | 'busy' | 'failed';

export async function openMic(o: MicOptions = {}): Promise<MediaStream | { refused: MicRefusal }> {
  const md = mediaDevices();
  if (!md?.getUserMedia) return { refused: 'unsupported' };
  try {
    return await md.getUserMedia(micConstraints(o));
  } catch (e) {
    const n = (e as { name?: string })?.name;
    return { refused: n === 'NotAllowedError' || n === 'SecurityError' ? 'denied'
      : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'not_found'
      : n === 'NotReadableError' || n === 'AbortError' ? 'busy' : 'failed' };
  }
}

/** Whether the browser reported echo cancellation on for the track (false: warn that the bot may hear itself). */
export function echoCancellationReported(stream: MediaStream): boolean {
  const t = stream.getAudioTracks()[0];
  return t?.getSettings?.().echoCancellation === true;
}

export function stopStream(stream: MediaStream): void {
  for (const t of stream.getTracks()) t.stop();
}

export interface Device { id: string; label: string }

/** Audio inputs and outputs; labels are empty until the page was granted the microphone once. */
export async function listDevices(): Promise<{ inputs: Device[]; outputs: Device[] }> {
  const md = mediaDevices();
  if (!md?.enumerateDevices) return { inputs: [], outputs: [] };
  let all: MediaDeviceInfo[];
  try { all = await md.enumerateDevices(); } catch { return { inputs: [], outputs: [] }; }
  const pick = (k: MediaDeviceKind) => all.filter((d) => d.kind === k && d.deviceId).map((d) => ({ id: d.deviceId, label: d.label }));
  return { inputs: pick('audioinput'), outputs: pick('audiooutput') };
}

/** Calls `fn` when devices come or go; returns the unsubscribe. */
export function onDeviceChange(fn: () => void): () => void {
  const md = mediaDevices();
  if (!md?.addEventListener) return () => {};
  md.addEventListener('devicechange', fn);
  return () => md.removeEventListener('devicechange', fn);
}

type SinkCtx = AudioContext & { setSinkId?: (id: string) => Promise<void> };

export function sinkSupported(ctx?: AudioContext): boolean {
  if (ctx) return typeof (ctx as SinkCtx).setSinkId === 'function';
  return typeof AudioContext !== 'undefined' && typeof (AudioContext.prototype as SinkCtx).setSinkId === 'function';
}

/** Routes the context to speaker `id` ('' = the default); false when unsupported or refused. */
export async function setSink(ctx: AudioContext, id: string): Promise<boolean> {
  const f = (ctx as SinkCtx).setSinkId;
  if (typeof f !== 'function') return false;
  try { await f.call(ctx, id); return true; } catch { return false; }
}

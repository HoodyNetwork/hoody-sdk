// talkLive.ts: the Talk code that only loads on the Mic press (the lazy chunk): the audio
// engine with its worklets, capture, device access and the socket. session.ts takes this object through `load`, so its
// tests run on a fake.
import { botVoiceRoute, openSocket, type HubSocket, type SocketHandlers, type Target } from '@core';
import {
  CAPTURE_PROCESSOR,
  CAPTURE_RATE,
  echoCancellationReported,
  listDevices,
  onDeviceChange,
  openMic,
  SendQueue,
  setSink,
  sinkSupported,
  startCapture,
  stopStream,
  voiceEngine,
  type CaptureHandle,
  type MicOptions,
  type MicRefusal,
  type VoiceEngine,
} from '@kit';

export type { VoiceEngine };
export interface TalkLive {
  captureRate: number;
  engine(): Promise<VoiceEngine>;
  openMic(o: MicOptions): Promise<MediaStream | { refused: MicRefusal }>;
  capture(ctx: AudioContext, stream: MediaStream, onFrame: (pcm: Int16Array) => void): CaptureHandle;
  stopStream(stream: MediaStream): void;
  echoOn(stream: MediaStream): boolean;
  devices: typeof listDevices;
  onDeviceChange: typeof onDeviceChange;
  sinkSupported(ctx: AudioContext): boolean;
  setSink(ctx: AudioContext, id: string): Promise<boolean>;
  queue(send: (seq: number, pcm: Int16Array) => boolean): SendQueue;
  socket(o: { botId: string; target: Target | null; realm: string | undefined; query: Record<string, string> }, h: SocketHandlers): HubSocket;
}

export const talkLive: TalkLive = {
  captureRate: CAPTURE_RATE,
  engine: voiceEngine,
  openMic,
  capture: (ctx, stream, onFrame) => startCapture(ctx, stream, CAPTURE_PROCESSOR, onFrame),
  stopStream,
  echoOn: echoCancellationReported,
  devices: listDevices,
  onDeviceChange,
  sinkSupported,
  setSink,
  queue: (send) => new SendQueue(send),
  socket: (o, h) => openSocket(botVoiceRoute, { params: { id: o.botId }, query: o.query, target: o.target, realm: o.realm }, h),
};

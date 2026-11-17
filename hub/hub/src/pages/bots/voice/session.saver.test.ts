// The session on the real pending store (shared.js registry, boot()): what the store loaded reaches the machine before any
// save, or the first save would remove every row it loaded, another tab's included (saver.load makes those rows held).
import { boot, signIn } from '@core/test/env';
import { describe, expect, it, vi } from 'vitest';
import { createPendingSaver, loadPending, savePending, type VoiceWhere } from './pending';
import { createTalkSession, type TalkEnv } from './session';
import type { TalkLive } from './talkLive';

const NOW = 1_800_000_000_000;
const A: VoiceWhere = { computer: 'c1', realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', bot: 'bot-a' };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function make() {
  const handlers: Parameters<TalkLive['socket']>[1][] = [];
  const eng = { ctx: {}, scheduler: { talkOpened: vi.fn(), talkClosed: vi.fn(), unplayedSeconds: () => 0 }, blocked: () => false, resume: async () => true, onChange: () => () => undefined, setMarkSink: vi.fn(), start: vi.fn(), audio: vi.fn(), end: vi.fn(), flush: async () => [] };
  const live = {
    captureRate: 16000, engine: async () => eng, openMic: async () => ({ id: 'm' }), capture: () => ({ rate: 48000, stop() { /* */ } }), stopStream() { /* */ }, echoOn: () => true,
    devices: async () => ({ inputs: [], outputs: [] }), onDeviceChange: () => () => undefined, sinkSupported: () => false, setSink: async () => true,
    queue: () => ({ push() { /* */ }, pump() { /* */ }, size: () => 0, clear() { /* */ } }),
    socket(_o: unknown, h: Parameters<TalkLive['socket']>[1]) { handlers.push(h); return { gen: 1, send: () => true, close() { /* */ } }; },
  } as unknown as TalkLive;
  const env: TalkEnv = { now: () => NOW, timer: () => () => undefined, phone: () => false, hidden: () => false, onVisibility: () => () => undefined, onPageHide: () => () => undefined, wakeLock: async () => null, lock: { locks: null, channel: () => null, timer: () => () => undefined } };
  const session = createTalkSession({ where: A, botId: 'bot-a', target: null, realm: A.realm, load: async () => live, env, api: { check: async () => ({ ready: true, stt: null, tts: null }), cancel: async () => 'failed', turn: async () => ({ running: false }) } });
  return { session, handlers };
}
const stored = () => {
  const r = loadPending(A, NOW);
  return r.s === 'ok' ? r.notes.map((n) => [n.conn, n.utt]) : 'unreadable';
};

describe('the first save of a session', () => {
  it('keeps every row the store held at creation, and adds what this connection lost', async () => {
    boot();
    signIn();
    savePending(A, [{ conn: 'old', utt: 1, at: NOW - 5000 }, { conn: 'other-tab', utt: 2, at: NOW - 4000 }], [], NOW);
    const w = make();
    expect(w.session.snapshot().voice.notes).toHaveLength(2);
    w.session.press();
    await settle();
    w.handlers[0]!.onText!(JSON.stringify({ type: 'session', epoch: 1, conn: 'K', in_rate: 16000, out_rate: 24000, vad: false }));
    w.handlers[0]!.onText!(JSON.stringify({ type: 'vad.start', utt: 3 }));
    w.session.end();
    expect(stored()).toEqual([['old', 1], ['other-tab', 2], ['K', 3]]);
  });
  it('a press with no loss keeps them too', async () => {
    boot();
    signIn();
    savePending(A, [{ conn: 'old', utt: 1, at: NOW - 5000 }], [], NOW);
    const w = make();
    w.session.press();
    await settle();
    w.session.end();
    expect(stored()).toEqual([['old', 1]]);
  });
  it('a row saved by another tab after this session loaded stays through its saves', async () => {
    boot();
    signIn();
    savePending(A, [{ conn: 'old', utt: 1, at: NOW - 5000 }], [], NOW);
    const w = make();
    createPendingSaver({ ...A }).save([{ conn: 'late', utt: 9, at: NOW - 100 }], NOW);
    w.session.press();
    await settle();
    w.session.end();
    expect(stored()).toEqual([['old', 1], ['late', 9]]);
  });
});

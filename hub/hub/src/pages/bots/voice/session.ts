// session.ts: one Bot's Talk session in the page. It builds the
// real ports around the runner (runner.ts) and keeps what the machine does not: the microphone stream, the
// capture, the send queue and the view of the frames. useBotVoice wraps it for React; its tests give it fakes.
//
// What it promises:
//   - Bound at creation: the computer, realm and Bot are captured once and every port uses that capture (the socket,
//     Stop answer's cancel, the view read, the pending store). Another Bot is another session, never this one re-aimed.
//   - The press handler starts resume, getUserMedia and voice/check together. A grant that settles after End, a newer
//     press or dispose stops its own stream and reaches nothing: it never dispatches a `started` whose stopTracks would
//     stop the stream of the session that replaced it.
//   - Audio keeps its order: a control frame that must follow audio (ptt.up, input.commit, every other control frame)
//     waits behind audio still queued; playback marks do not wait. A captured frame is never resent.
//   - Reading: a text the wire module calls invalid, or a binary frame it cannot read, ends the connection as a protocol
//     failure; a frame type from a newer agent is ignored.
//   - Teardown: dispose stops everything through the machine's `stale` (tracks, socket, persist), then flushes playback
//     and drops the mark sink; nothing it owned outlives it. End flushes too: the person asked for quiet.
//   - Hidden: a phone ends at once. A desktop runs the mute transition, stops the track once muted, and ends when no
//     reply plays or after HIDDEN_MAX_MS. Back in view it stays muted until the person unmutes (the track is reopened).
import { voiceInitial, voicePendingOf, voiceStep, type MaybeSent, type VoiceEvent, type VoiceMode, type VoiceState } from '@kit/pure';
import {
  voiceConnectQuery as connectQuery,
  voiceDecodeOutputAudio as decodeOutputAudio,
  voiceEncodeClientFrame as encodeClientFrame,
  voiceEncodeInputAudio as encodeInputAudio,
  voiceParseServerFrame as parseServerFrame,
} from '@kit/pure';
import type { HubSocket, SocketOutcome, Target } from '@core';
import { hostEnv } from '@core';
import { rowForUtterance } from '../logic';
import type { LogRow, VoiceCheck } from '../data';
import { createPendingSaver, type PendingSaver, type VoiceWhere } from './pending';
import { createVoiceRunner, type ClientFrame, type ServerFrame, type VoicePorts, type VoiceRunner, type VoiceSocket, type VoiceSocketEvents } from './runner';
import { acquireTabLock, browserLockEnv, lockName, type LockEnv, type TabLockRelease } from './tabLock';
import { TALK_VIEW_START, talkViewStep, type TalkView } from './talkView';
import type { TalkLive, VoiceEngine } from './talkLive';

export const HIDDEN_MAX_MS = 60000;
/** How long a socket may take to say `session`, and the audio engine to resume. */
export const CONNECT_WAIT_MS = 20000;
export const RESUME_WAIT_MS = 3000;
/** A readiness check that has not answered by then counts as a check that failed: Talk goes on as checkUnknown. */
export const CHECK_WAIT_MS = 10000;
const HIDDEN_CHECK_MS = 1000;
const DRAIN_MS = 40;
/** Phases with no connection and none coming: nothing on screen can stop the sound. */
const OVER: ReadonlySet<VoiceState['phase']> = new Set(['ended', 'busyElsewhere', 'notReady', 'connectFailed', 'budget']);
const NO_MIC = { refused: 'failed' as const };
const STOP_POLL_MS = 2000;
const LEVEL_EVERY_MS = 100;

/** The page's reads and sends, bound to the captured Bot by whoever builds the session. */
export interface TalkApi {
  check(): Promise<VoiceCheck>;
  cancel(turnId: string): Promise<'matched' | 'notMatched' | 'failed'>;
  /** The Bot's turn now, for Stop answer's evidence. */
  turn(): Promise<{ running: boolean; turnId?: string }>;
}
export interface TalkEnv {
  now(): number;
  timer(ms: number, fn: () => void): () => void;
  /** A touch device: hidden ends the session, hands-free is not offered. */
  phone(): boolean;
  hidden(): boolean;
  /** Calls fn on visibilitychange; pagehide on page leaving. Each returns its unsubscribe. */
  onVisibility(fn: () => void): () => void;
  onPageHide(fn: () => void): () => void;
  wakeLock(): Promise<{ release(): Promise<void> | void } | null>;
  lock: LockEnv;
}

export function browserTalkEnv(): TalkEnv {
  return {
    now: () => Date.now(),
    timer(ms, fn) {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
    phone: () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    hidden: () => !hostEnv().visible(),
    onVisibility: (fn) => hostEnv().onVisibilityChange(fn),
    onPageHide: (fn) => hostEnv().onLifecycle('pagehide', fn),
    async wakeLock() {
      const wl = (navigator as Navigator & { wakeLock?: { request(k: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
      if (!wl) return null;
      try { return await wl.request('screen'); } catch { return null; }
    },
    lock: browserLockEnv(),
  };
}

export interface TalkDevice { id: string; label: string }
export interface TalkSnapshot {
  voice: VoiceState;
  view: TalkView;
  level: number;
  handsFree: boolean;
  /** notReady: the check that said so. */
  check?: VoiceCheck;
  overflow?: 'lead' | 'old';
  /** Part of a reply's audio was lost (an offset gap): marks stop at the gap. */
  damaged: boolean;
  /** The browser paused the sound while live. */
  suspended: boolean;
  inputs: readonly TalkDevice[];
  outputs: readonly TalkDevice[];
  input?: string;
  output?: string;
  canChooseOutput: boolean;
  /** Notes loaded from the store: "couldn't confirm", not "may have been sent". */
  restored: ReadonlySet<string>;
}

export interface TalkSession {
  snapshot(): TalkSnapshot;
  subscribe(fn: () => void): () => void;
  press(): void;
  tryAnyway(): void;
  takeOver(): void;
  enableSound(): void;
  end(): void;
  pttDown(): void;
  pttUp(): void;
  mode(m: VoiceMode): void;
  mute(): void;
  unmute(): void;
  /** Stop answer on `turnId`, the turn shown at the press: the machine captures it and never asks again. */
  stopAnswer(turnId: string): void;
  stopSpeaking(): void;
  chooseInput(id: string): void;
  chooseOutput(id: string): void;
  caps(c: { stopSpeech: boolean; textKey: boolean; playLead: boolean }): void;
  /** The log rows the page holds now: a maybe-sent note settles only on a row naming its exact (conn, utt). */
  rows(rows: readonly LogRow[]): void;
  dispose(): void;
}

export interface TalkOptions {
  where: VoiceWhere;
  botId: string;
  target: Target | null;
  realm: string | undefined;
  load: () => Promise<TalkLive>;
  api: TalkApi;
  env?: TalkEnv;
  saver?: PendingSaver;
  /** A gate of the Bot's own was announced: the page reads the Bot view again. */
  onOwnGate?: () => void;
  initialMode?: VoiceMode;
}

const noteKey = (n: { conn: string; utt: number }): string => `${n.conn}#${n.utt}`;
const MEDIA_OK = (m: MediaStream | { refused: unknown }): m is MediaStream => !('refused' in m);

export function createTalkSession(o: TalkOptions): TalkSession {
  const env = o.env ?? browserTalkEnv();
  const saver = o.saver ?? createPendingSaver(o.where);
  const lock = lockName(o.where);
  let live: TalkLive | null = null;
  let engine: VoiceEngine | null = null;
  let stream: MediaStream | null = null;
  let capture: { stop(): void } | null = null;
  let pumpNow: (() => void) | null = null;
  let closeLink: (() => void) | null = null;
  let playLead = false;
  let gone = false;
  let pressN = 0;
  let levelAt = 0;
  let hiddenAt: number | null = null;
  let cancelHidden: (() => void) | null = null;
  let cancelPoll: (() => void) | null = null;
  let polling = false;
  let tracksStoppedByHide = false;
  let overflowFor: string | null = null;
  let offPage: (() => void) | null = null;
  let wake: { release(): Promise<void> | void } | null = null;
  // This tab's last voice lock, until it can be taken again: a reopen (a mode change) waits for it.
  let lockFreed: Promise<void> = Promise.resolve();
  // The person pressed Mute, and has not pressed Unmute: a new connection comes back muted too.
  let wantMuted = false;
  /** Counts input choices, made live or not, so a device request answered after a newer choice never replaces it. */
  let inputN = 0;
  let wakeAsked = false;
  let wakeAsk = 0;
  let pendingMic: MediaStream | null = null;
  let offDevices: (() => void) | null = null;
  let offEngine: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const read = saver.load(env.now());
  const restoredNotes: MaybeSent[] = read.s === 'ok' ? read.notes : [];
  let snap: TalkSnapshot = {
    voice: { ...voiceInitial(o.initialMode ?? 'ptt'), notes: restoredNotes },
    view: TALK_VIEW_START,
    level: 0,
    handsFree: false,
    damaged: false,
    suspended: false,
    inputs: [],
    outputs: [],
    canChooseOutput: false,
    restored: new Set(restoredNotes.map(noteKey)),
  };
  const publish = (patch: Partial<TalkSnapshot>) => {
    snap = { ...snap, ...patch };
    for (const fn of [...listeners]) { try { fn(); } catch { /* a listener never stops the session */ } }
  };

  function dropStream(): void {
    const c = capture, m = stream, l = live, waiting = pendingMic;
    capture = null;
    stream = null;
    pendingMic = null;
    if (waiting && l) { try { l.stopStream(waiting); } catch { /* stopped already */ } }
    if (c) { try { c.stop(); } catch { /* stopped already */ } }
    if (m && l) { try { l.stopStream(m); } catch { /* stopped already */ } }
    if (snap.level !== 0) publish({ level: 0 });
  }

  function onCaptured(pcm: Int16Array): void {
    if (gone) return;
    const s = runner.state();
    runner.dispatch({ type: 'audio', gen: s.gen, pcm });
    pumpNow?.();
    const t = env.now();
    if (t - levelAt >= LEVEL_EVERY_MS || levelAt === 0) {
      levelAt = t;
      let peak = 0;
      for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]!); if (a > peak) peak = a; }
      const heard = s.phase === 'live' ? peak / 32768 : 0;
      if (heard !== snap.level) publish({ level: heard });
    }
  }

  /** Install a granted stream: capture runs from now on (the machine drops what it cannot send). */
  function holdStream(m: MediaStream): void {
    dropStream();
    stream = m;
    tracksStoppedByHide = false;
    if (live && engine) {
      try { capture = live.capture(engine.ctx, m, onCaptured); } catch { capture = null; }
      void refreshDevices();
      publish({ handsFree: !env.phone() && safeEcho(m) });
    }
  }
  const safeEcho = (m: MediaStream): boolean => {
    try { return live?.echoOn(m) === true; } catch { return false; }
  };
  async function refreshDevices(): Promise<void> {
    if (!live) return;
    try {
      const d = await live.devices();
      if (!gone) publish({ inputs: d.inputs, outputs: d.outputs, canChooseOutput: !!engine && live.sinkSupported(engine.ctx) });
    } catch { /* the lists stay as they were */ }
  }

  const ports: VoicePorts = {
    now: () => env.now(),
    timer: (ms, fn) => env.timer(ms, fn),
    persist(ids) {
      const now = env.now();
      // Only a connection still up has identities in flight: once it is lost the machine's own list already holds them.
      const up = ['live', 'muting', 'muted'].includes(runner.state().phase);
      saver.save(hiddenAt !== null && up ? whatAnEndStores(now) : ids, now);
    },
    stopTracks: () => dropStream(),
    flushPlayback() {
      if (currentFlush) return currentFlush();
      if (engine) void engine.flush().catch(() => undefined);
    },
    cancelTurn: (id) => o.api.cancel(id),
    open: (opt, on) => openLink(opt, on),
  };

  let currentFlush: (() => void) | null = null;

  function openLink(opt: Parameters<VoicePorts['open']>[0], on: VoiceSocketEvents): VoiceSocket {
    const l = live, e = engine;
    if (!l || !e) throw new Error('not loaded');
    let closed = false, opened = false, sock: HubSocket | null = null, rate = 0, replyNow = '';
    let releaseLock: TabLockRelease | null = null;
    let cancelConnect: (() => void) | null = null;
    // Behind a waiting control, audio waits too: one order, so a later utterance never overtakes the last one's ptt.up.
    const hold: Array<{ frame: ClientFrame } | { seq: number; pcm: Int16Array; at: number }> = [];
    let cancelDrain: (() => void) | null = null;
    const queue = l.queue((seq, pcm) => sock?.send(encodeInputAudio(seq, pcm, l.captureRate as 16000)) === true);
    const rawSend = (f: ClientFrame) => {
      try { sock?.send(encodeClientFrame(f)); } catch { /* a frame the wire refuses is not sent */ }
    };
    const pump = () => {
      const now = env.now();
      queue.pump(now);
      while (queue.size() === 0 && hold.length) {
        const h = hold.shift()!;
        if ('frame' in h) rawSend(h.frame);
        else { queue.push(h.seq, h.pcm, h.at); queue.pump(now); }
      }
      // Capture ticks stop when the track does (a hidden tab): what still waits drains on its own.
      if (!closed && !cancelDrain && (queue.size() > 0 || hold.length > 0)) {
        cancelDrain = env.timer(DRAIN_MS, () => { cancelDrain = null; if (!closed) pump(); });
      }
    };
    const marks = (m: { out: number; played_to: number }[]) => {
      for (const x of m) rawSend({ type: 'playback.mark', out: x.out, played_to: x.played_to });
    };
    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (pumpNow === pump) pumpNow = null;
      if (currentFlush === flushAll) currentFlush = null;
      cancelDrain?.();
      cancelDrain = null;
      if (closeLink === close) closeLink = null;
      queue.clear();
      hold.length = 0;
      try { e.setMarkSink(null); e.scheduler.talkClosed(); } catch { /* the engine is gone */ }
      cancelConnect?.();
      cancelConnect = null;
      const r = releaseLock;
      releaseLock = null;
      if (r) lockFreed = r();
    };
    const close = () => {
      const s = sock;
      cleanup();
      if (s) { try { s.close(); } catch { /* closed already */ } }
    };
    /** The connection broke the protocol: it ends here, as a protocol failure. */
    const broken = () => {
      if (closed) return;
      close();
      on.closed(1002);
    };
    pumpNow = pump;
    currentFlush = flushAll;
    closeLink = close;

    // A whole flush takes a worklet round trip and drops every output it finds: what outputs do meanwhile waits for it,
    // or the flush would drop them too. A new session's flush, and the machine's (a press, Stop).
    let flushing: Array<() => void> | null = null;
    let flushesOpen = 0;
    function flushGate(): Promise<{ out: number; played_to: number }[]> {
      flushing = []; // this flush also drops what waited for the one before it
      flushesOpen++;
      const open = () => {
        if (--flushesOpen > 0) return;
        const wait = flushing ?? [];
        flushing = null;
        if (!closed) for (const g of wait) g();
      };
      return e!.flush().then((m) => { open(); return m; }, (err: unknown) => { open(); throw err; });
    }
    function flushAll(): void {
      void flushGate().then((m) => { if (!closed) marks(m); }, () => undefined);
    }
    const play = (f: () => void) => {
      if (flushing) flushing.push(f);
      else f();
    };
    const onFrame = (f: ServerFrame) => {
      if (f.type === 'session') { cancelConnect?.(); cancelConnect = null; }
      switch (f.type) {
        case 'session': {
          rate = f.out_rate;
          try { e.scheduler.talkOpened(); e.setMarkSink(marks); } catch { /* the engine is gone */ }
          void flushGate().catch(() => undefined);
          break;
        }
        case 'output.start':
          if (f.reply_id !== replyNow) {
            replyNow = f.reply_id;
            if (snap.damaged) publish({ damaged: false });
          }
          play(() => e.start(f.out, rate));
          break;
        case 'output.end':
          play(() => e.end(f.out, f.samples));
          break;
        case 'output.stop':
          play(() => void e.flush(f.upto_out).then(marks, () => undefined));
          break;
        case 'own_gate.pending':
          try { o.onOwnGate?.(); } catch { /* the page's read is its own */ }
          break;
      }
      on.frame(f);
      if (!gone) publish({ view: talkViewStep(snap.view, f) });
    };
    const onOutcome = (out: SocketOutcome) => {
      if (closed) return;
      switch (out.kind) {
        case 'open':
          opened = true;
          return;
        case 'budget':
        case 'locks':
          cleanup();
          // A slot cut after the session opened is a lost connection; before, the budget's refusal.
          if (opened) on.closed(1006);
          else on.slotRefused();
          return;
        case 'refused':
          cleanup();
          on.frame({ type: 'refused', code: out.code ?? '', message: '', ...(out.retryAfterMs !== null ? { retry_after_secs: Math.round(out.retryAfterMs / 1000) } : {}) });
          on.closed(4000 + out.status);
          return;
        case 'closed':
          cleanup();
          on.closed(out.code);
          return;
        case 'unknown':
        case 'not_sent':
          cleanup();
          on.closed(1006);
          return;
        case 'stale':
          cleanup();
          api.dispose();
          return;
      }
    };
    // Asked by another tab, this Talk ends as the agent's takeover frame would end it: the words say where voice went.
    const asked = () => {
      if (gone || closed) return;
      on.frame({ type: 'takeover', by: 'another tab' });
      if (!closed) close();
    };
    // A socket that opens and never says `session`, or a handshake that hangs, counts as lost.
    cancelConnect = env.timer(CONNECT_WAIT_MS, () => {
      cancelConnect = null;
      if (closed) return;
      close();
      on.closed(1006);
    });
    void lockFreed.then(() => (closed || gone ? null : acquireTabLock(env.lock, lock, opt.takeover, asked))).then((release) => {
      if (closed || gone) { if (release) lockFreed = release(); return; }
      if (!release) {
        cleanup();
        on.frame({ type: 'refused', code: 'voice_busy', message: '' });
        on.closed(4409);
        return;
      }
      releaseLock = release;
      sock = l.socket(
        { botId: o.botId, target: o.target, realm: o.realm, query: connectQuery({ mode: opt.mode, takeover: opt.takeover, speak: opt.speak, playLead, inRate: l.captureRate as 16000, ...(opt.require ? { require: opt.require } : {}) }) },
        {
          onOutcome,
          onText(raw) {
            if (closed) return;
            const f = parseServerFrame(raw);
            if (f.type === 'invalid') return broken();
            if (f.type === 'unknown') return;
            onFrame(f);
          },
          onBinary(data) {
            if (closed) return;
            const a = decodeOutputAudio(data);
            if (!a) return broken();
            play(() => {
              const r = e.audio(a.out, a.offset, a.pcm);
              if (r === 'damaged' && !snap.damaged) publish({ damaged: true });
              if (r === 'overflow') overflowed();
            });
          },
        },
      );
    });
    return {
      send(frame) {
        if (queue.size() > 0 || hold.length > 0) hold.push({ frame });
        else rawSend(frame);
      },
      sendAudio(seq, pcm) {
        if (hold.length > 0) hold.push({ seq, pcm, at: env.now() });
        else queue.push(seq, pcm, env.now());
        pump();
      },
      close,
    };
  }

  /** The client bound was crossed: speech stops by the same rule as the person's own stop, once per reply. */
  function overflowed(): void {
    const s = runner.state();
    const turn = s.reply?.turnId ?? '';
    if (overflowFor === turn) return;
    overflowFor = turn;
    publish({ overflow: playLead ? 'lead' : 'old' });
    if (s.caps.stopSpeech && s.reply) runner.dispatch({ type: 'stopSpeaking' });
    else if (s.reply) runner.dispatch({ type: 'stopAnswer', turnId: s.reply.turnId });
  }

  function pollStop(stopId: number): void {
    if (gone) return;
    cancelPoll = env.timer(STOP_POLL_MS, () => {
      cancelPoll = null;
      const cur = runner.state().stop;
      if (gone || !cur || cur.outcome || cur.id !== stopId) { polling = false; return; }
      o.api.turn().then(
        (t) => { if (!gone) runner.dispatch({ type: 'botView', stop: stopId, running: t.running, ...(t.turnId !== undefined ? { turnId: t.turnId } : {}) }); },
        () => undefined,
      ).finally(() => {
        const after = runner.state().stop;
        if (!gone && after && !after.outcome && after.id === stopId) pollStop(stopId);
        else polling = false;
      });
    });
  }

  function onState(s: VoiceState): void {
    const wasLive = snap.voice.phase === 'live' || snap.voice.phase === 'muting' || snap.voice.phase === 'muted';
    const isLive = s.phase === 'live' || s.phase === 'muting' || s.phase === 'muted';
    const justEnded = OVER.has(s.phase) && !OVER.has(snap.voice.phase);
    const patch: Partial<TalkSnapshot> = { voice: s };
    // A new connection starts its view again (the session frame does too; a loss has none).
    if (wasLive && !isLive) {
      overflowFor = null;
      Object.assign(patch, { damaged: false, overflow: undefined, view: { ...snap.view, activity: 'listening' as const } });
    }
    publish(patch);
    // Reconnecting keeps playing what it has. A session that is over has no Stop to offer, so it stops.
    if (justEnded && engine) void engine.flush().catch(() => undefined);
    if (s.stop && !s.stop.outcome && !polling) {
      polling = true;
      pollStop(s.stop.id);
    }
    if (isLive && !wakeAsked) {
      wakeAsked = true;
      const ask = ++wakeAsk;
      void env.wakeLock().then((w) => {
        if (gone || ask !== wakeAsk) { void w?.release(); return; }
        wake = w;
      });
    }
    if (!isLive && wakeAsked) {
      wakeAsked = false;
      wakeAsk++;
      const w = wake;
      wake = null;
      void w?.release();
    }
    // It just came live hidden on a desktop, after the person's Mute, or with the track a hide stopped: the mute
    // transition starts now, before any sound goes out. Unmute is what asks for a new track.
    if (s.phase === 'live' && (hiddenAt !== null || wantMuted || tracksStoppedByHide)) { wantMuted = true; runner.dispatch({ type: 'mute' }); }
    // Hidden on a desktop: once the mute transition is done, the track stops.
    if (s.phase === 'muted' && hiddenAt !== null && stream) {
      tracksStoppedByHide = true;
      dropStream();
    }
  }

  const runner: VoiceRunner = createVoiceRunner(snap.voice, ports, onState);

  function hiddenCheck(): void {
    cancelHidden = null;
    if (gone || hiddenAt === null) return;
    const s = runner.state();
    const replyPlays = s.reply !== undefined || (engine?.scheduler.unplayedSeconds() ?? 0) > 0;
    const muted = s.phase === 'muted';
    if ((muted && !replyPlays) || env.now() - hiddenAt >= HIDDEN_MAX_MS) {
      if (s.phase !== 'off' && s.phase !== 'ended') api.end();
      return;
    }
    cancelHidden = env.timer(HIDDEN_CHECK_MS, hiddenCheck);
  }
  function whatAnEndStores(now: number) {
    return voicePendingOf(voiceStep(runner.state(), { type: 'end' }, now).state, now);
  }
  function onVisibility(): void {
    if (gone) return;
    if (!env.hidden()) {
      hiddenAt = null;
      cancelHidden?.();
      cancelHidden = null;
      return;
    }
    const s = runner.state();
    if (s.phase === 'off' || s.phase === 'ended') return;
    if (env.phone()) return api.end();
    hiddenAt = env.now();
    // The browser can drop a hidden tab with no pagehide: what an End would store goes in the store now, and stays in
    // every save while hidden (a plain save lists only the machine's notes, not what is still in flight).
    try { saver.save(whatAnEndStores(hiddenAt), hiddenAt); } catch { /* a store that refuses keeps nothing */ }
    // A hide's Mute stands like the person's own: Unmute is what ends it, also across a reconnect.
    if (s.phase === 'live') { wantMuted = true; runner.dispatch({ type: 'mute' }); }
    else if (s.phase === 'muted') { tracksStoppedByHide = true; dropStream(); }
    cancelHidden = env.timer(HIDDEN_CHECK_MS, hiddenCheck);
  }
  // Made once per mount and possibly thrown away unused (React may call an initializer twice): the page's events are
  // listened to only from the first press. Leaving the page: what is unsettled becomes notes and is stored while it still
  // can be; the session can start again if the page comes back from the browser's back-forward cache.
  /** The hide stopped the track: what goes back to live (Unmute, a mode change) opens a new one first; refused, it stays muted. */
  function withNewTrack(then: () => void): void {
    const l = live;
    if (!tracksStoppedByHide || !l) return then();
    const n = pressN, gen = runner.state().gen;
    void l.openMic(snap.input ? { deviceId: snap.input } : {}).then((m) => {
      if (!MEDIA_OK(m)) return;
      if (gone || n !== pressN || runner.state().gen !== gen || runner.state().phase !== 'muted') { try { l.stopStream(m); } catch { /* stopped already */ } return; }
      holdStream(m);
      then();
    }, () => undefined);
  }

  function listen(): void {
    if (offPage) return;
    const a = env.onVisibility(onVisibility);
    const b = env.onPageHide(() => { if (!gone && runner.state().phase !== 'off') api.end(); });
    offPage = () => { a(); b(); };
  }

  function press(): void {
    if (gone) return;
    listen();
    wantMuted = false;
    runner.dispatch({ type: 'press' });
    const st = runner.state();
    if (st.phase !== 'starting') return;
    const n = ++pressN;
    const gen = st.gen;
    const startStale = () => gone || n !== pressN || runner.state().gen !== gen || runner.state().phase !== 'starting';
    dropStream();
    // All three start in the press handler's own turn: the code first only where the module has not loaded.
    const liveP = live ? Promise.resolve(live) : o.load();
    const engineP = liveP.then(async (l) => {
      if (gone) throw new Error('disposed');
      live = l;
      if (startStale()) throw new Error('stale');
      const e = await l.engine();
      engine = e;
      if (gone) throw new Error('disposed');
      if (!offEngine) offEngine = e.onChange(() => { if (!gone) publish({ suspended: e.blocked() && runner.state().phase === 'live' }); });
      // A resume that never settles reads as blocked below, not as a Talk that starts forever.
      await new Promise<void>((done) => {
        const off = env.timer(RESUME_WAIT_MS, done);
        void e.resume().then(() => { off(); done(); }, () => { off(); done(); });
      });
      return e;
    });
    // A grant is this session's from the moment it arrives, so End reaches it while the check or the engine still waits.
    const micP = liveP.then(async (l) => {
      if (startStale()) return NO_MIC;
      const m = await l.openMic(snap.input ? { deviceId: snap.input } : {});
      if (!MEDIA_OK(m)) return m;
      if (startStale()) {
        try { l.stopStream(m); } catch { /* stopped already */ }
        return NO_MIC;
      }
      pendingMic = m;
      return m;
    });
    // A check that never answers (a stalled token refresh) must not hold Starting, with the microphone open, for ever.
    const checkP = new Promise<VoiceCheck>((res, rej) => {
      const off = env.timer(CHECK_WAIT_MS, () => rej(new Error('voice check timed out')));
      o.api.check().then((v) => { off(); res(v); }, (e: unknown) => { off(); rej(e); });
    });
    void Promise.allSettled([engineP, micP, checkP]).then(([eng, mic, chk]) => {
      const m = mic.status === 'fulfilled' ? mic.value : NO_MIC;
      const owned = MEDIA_OK(m) && pendingMic === m;
      if (owned) pendingMic = null;
      const stale = startStale();
      if (stale || (MEDIA_OK(m) && !owned)) {
        if (owned && live) { try { live.stopStream(m); } catch { /* stopped already */ } }
        return;
      }
      const stopHere = () => { if (MEDIA_OK(m) && live) { try { live.stopStream(m); } catch { /* stopped already */ } } };
      const started = (result: Extract<VoiceEvent, { type: 'started' }>['result']) => runner.dispatch({ type: 'started', gen, result });
      if (!MEDIA_OK(m)) return started(m.refused === 'denied' ? 'denied' : 'noDevice');
      if (chk.status === 'fulfilled' && !chk.value.ready) {
        publish({ check: chk.value });
        stopHere();
        return started('notReady');
      }
      if (eng.status !== 'fulfilled') {
        stopHere();
        return started('playbackBlocked');
      }
      holdStream(m);
      if (eng.value.blocked()) return started('playbackBlocked');
      started(chk.status === 'fulfilled' ? 'ready' : 'checkUnknown');
    });
    if (!offDevices) void liveP.then((l) => { if (!gone && !offDevices) offDevices = l.onDeviceChange(() => void refreshDevices()); }, () => undefined);
  }

  const api: TalkSession = {
    snapshot: () => snap,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    press,
    tryAnyway: () => runner.dispatch({ type: 'tryAnyway' }),
    takeOver() {
      // The busy refusal stopped the tracks, so a take over opens the microphone first. A refusal reads as a press's would.
      const l = live;
      if (gone || !l || runner.state().phase !== 'busyElsewhere') return;
      const n = ++pressN, gen = runner.state().gen;
      const current = () => !gone && n === pressN && runner.state().gen === gen && runner.state().phase === 'busyElsewhere';
      const refused = (why: string) => {
        if (!current()) return;
        runner.dispatch({ type: 'press' });
        const st = runner.state();
        if (st.phase === 'starting') runner.dispatch({ type: 'started', gen: st.gen, result: why === 'denied' ? 'denied' : 'noDevice' });
      };
      void l.openMic(snap.input ? { deviceId: snap.input } : {}).then((m) => {
        if (!MEDIA_OK(m)) return refused(m.refused);
        if (!current()) { try { l.stopStream(m); } catch { /* stopped already */ } return; }
        holdStream(m);
        runner.dispatch({ type: 'takeOver' });
      }, () => refused('failed'));
    },
    enableSound() {
      const e = engine;
      if (e) void e.resume();
      press();
    },
    end() {
      const e = engine;
      runner.dispatch({ type: 'end' });
      if (e) void e.flush().catch(() => undefined);
    },
    pttDown() {
      const e = engine;
      if (e?.blocked()) void e.resume();
      runner.dispatch({ type: 'pttDown' });
    },
    pttUp: () => runner.dispatch({ type: 'pttUp' }),
    mode: (m) => withNewTrack(() => runner.dispatch({ type: 'switch', mode: m, speak: runner.state().speak })),
    mute() {
      wantMuted = true;
      runner.dispatch({ type: 'mute' });
    },
    unmute: () => withNewTrack(() => { wantMuted = false; runner.dispatch({ type: 'unmute' }); }),
    stopAnswer: (turnId) => runner.dispatch({ type: 'stopAnswer', turnId }),
    stopSpeaking: () => runner.dispatch({ type: 'stopSpeaking' }),
    chooseInput(id) {
      publish({ input: id });
      const k = ++inputN;
      const l = live, s = stream;
      if (!l || !s) return;
      const n = pressN;
      void l.openMic({ deviceId: id }).then((m) => {
        if (!MEDIA_OK(m)) return;
        // Only the input chosen last may take over: an earlier choice answered late stops its own track.
        if (gone || n !== pressN || k !== inputN || !stream) { try { l.stopStream(m); } catch { /* stopped already */ } return; }
        holdStream(m);
      }, () => undefined);
    },
    chooseOutput(id) {
      publish({ output: id });
      const l = live, e = engine;
      if (l && e) void l.setSink(e.ctx, id);
    },
    caps(c) {
      playLead = c.playLead;
      runner.dispatch({ type: 'caps', caps: { stopSpeech: c.stopSpeech, textKey: c.textKey } });
    },
    rows(rows) {
      for (const n of runner.state().notes) {
        if (n.kind !== 'maybeSent' || n.settled) continue;
        const hit = rowForUtterance(rows, n.conn, n.utt);
        if (hit) runner.dispatch({ type: 'logRow', seq: hit.seq, conn: n.conn, utt: n.utt });
      }
    },
    dispose() {
      if (gone) return;
      const e = engine;
      runner.dispose();
      gone = true;
      closeLink?.();
      dropStream();
      if (e) void e.flush().catch(() => undefined);
      cancelHidden?.();
      cancelPoll?.();
      offPage?.();
      offDevices?.();
      offEngine?.();
      const w = wake;
      wake = null;
      wakeAsked = false;
      void w?.release();
      listeners.clear();
    },
  };
  return api;
}

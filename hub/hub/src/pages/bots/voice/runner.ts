// runner.ts: runs the Talk machine (kit voice machine: step, Effects) against ports the page supplies.
// The machine decides; the runner only carries its effects out and turns their results back into events.
// useBotVoice gives it the real ports: core openSocket, kit capture and the page's one playback scheduler,
// cancelBotTurn, timers and pending.ts. Tests give it fakes.
//
// What it promises:
//   - One event at a time, in arrival order: an event raised while effects run (a fake socket answering at once, a timer
//     of 0 ms) waits for them to finish.
//   - Every async result is fenced twice. It names the generation its effect carried (the machine drops other
//     generations), and it comes from the socket the runner holds now: a frame or close of a socket the runner replaced
//     or closed is dropped before it reaches the machine.
//   - cancelTurn sends the turn id the effect captured, never a newer one, and answers with the effect's own Stop id; a
//     port that throws or rejects answers 'failed' (the machine allows one resend of the same request).
//   - A port that throws never stops the runner. A socket that cannot open closes at once (code 1006).
//   - After dispose nothing reaches the machine or a port: the step running when dispose was called runs only its
//     shutdown effects (stopTracks, close, persist; never a send, open, timer, cancelTurn or flushPlayback), `stale`
//     runs, then timers are cleared, the socket closed, late answers dropped.
//   - Shutdown never depends on the clock: each event reads it once (a clock that throws or answers a non-number keeps
//     the last good reading) and persist uses that reading. If `stale` itself cannot step, the runner still stops the
//     tracks, clears timers and closes the socket; it writes no persist then (only the machine knows which identities
//     a loss leaves unsettled, so what was stored before stays).
import { voicePendingOf as pendingOf, voiceStep as step, type PendingIdentity, type VoiceEffect as Effect, type VoiceEvent, type VoiceMode as Mode, type VoiceState } from '@kit/pure';

/** The wire frames, as the machine takes and gives them. */
export type ServerFrame = Extract<VoiceEvent, { type: 'frame' }>['frame'];
export type ClientFrame = Extract<Effect, { type: 'send' }>['frame'];

/** The socket a port opened: send and close only. */
export interface VoiceSocket {
  send(frame: ClientFrame): void;
  sendAudio(seq: number, pcm: Int16Array): void;
  close(): void;
}
/** What a socket tells the runner. A port calls these at most until it reports `closed` (or the runner closes it). */
export interface VoiceSocketEvents {
  frame(frame: ServerFrame): void;
  closed(code: number): void;
  /** The stream-budget slot or the one-tab lock was refused before the socket opened. */
  slotRefused(): void;
}
export interface VoiceOpen {
  mode: Mode;
  speak: boolean;
  takeover: boolean;
  require?: 'stt' | 'stt,tts';
}
export interface VoicePorts {
  open(o: VoiceOpen, on: VoiceSocketEvents): VoiceSocket;
  stopTracks(): void;
  flushPlayback(): void;
  /** cancelBotTurn {turn_id}: matched (that turn was cancelled), notMatched (it was not running), failed (not known). */
  cancelTurn(turnId: string): Promise<'matched' | 'notMatched' | 'failed'>;
  /** Run `fn` once after `ms`; the returned function cancels it. */
  timer(ms: number, fn: () => void): () => void;
  /** The unsettled maybe-sent identities to store (pending.ts savePending). */
  persist(ids: PendingIdentity[]): void;
  now(): number;
}

export interface VoiceRunner {
  dispatch(e: VoiceEvent): void;
  state(): VoiceState;
  /** Stops everything (the machine's `stale`), then drops every later result. */
  dispose(): void;
}

/** The effects that only end things: after dispose they still run; every other effect is dropped. */
const SHUTDOWN: ReadonlySet<Effect['type']> = new Set(['stopTracks', 'close', 'persist']);

export function createVoiceRunner(init: VoiceState, ports: VoicePorts, onState?: (s: VoiceState) => void): VoiceRunner {
  let s = init, gone = false, running = false, staleRan = false;
  let now = 0;
  const queue: VoiceEvent[] = [];
  const timers = new Set<() => void>();
  let sock: { id: number; socket: VoiceSocket | null } | null = null;
  let sockIds = 0;

  const safe = (f: () => void) => {
    try { f(); } catch { /* a port's failure never stops the runner */ }
  };
  function closeSocket(): void {
    const cur = sock;
    sock = null;
    if (cur?.socket) safe(() => cur.socket!.close());
  }
  function open(fx: Extract<Effect, { type: 'open' }>): void {
    closeSocket();
    const id = ++sockIds, gen = fx.gen;
    const mine = () => !gone && sock?.id === id;
    const holder: { id: number; socket: VoiceSocket | null } = { id, socket: null };
    sock = holder;
    const on: VoiceSocketEvents = {
      frame: (frame) => { if (mine()) dispatch({ type: 'frame', gen, frame }); },
      closed: (code) => {
        if (!mine()) return;
        sock = null;
        dispatch({ type: 'closed', gen, code });
      },
      slotRefused: () => {
        if (!mine()) return;
        sock = null;
        dispatch({ type: 'slotRefused', gen });
      },
    };
    try {
      const socket = ports.open({ mode: fx.mode, speak: fx.speak, takeover: fx.takeover, ...(fx.require ? { require: fx.require } : {}) }, on);
      if (sock === holder) holder.socket = socket;
      else safe(() => socket.close()); // it reported its end while opening
    } catch {
      on.closed(1006);
    }
  }
  function run(fx: Effect): void {
    switch (fx.type) {
      case 'open': return open(fx);
      case 'close': return closeSocket();
      case 'send': { const cur = sock?.socket; if (cur) safe(() => cur.send(fx.frame)); return; }
      case 'sendAudio': { const cur = sock?.socket; if (cur) safe(() => cur.sendAudio(fx.seq, fx.pcm)); return; }
      case 'stopTracks': return safe(() => ports.stopTracks());
      case 'flushPlayback': return safe(() => ports.flushPlayback());
      case 'cancelTurn': {
        const stop = fx.stop, turnId = fx.turnId;
        const answer = (result: 'matched' | 'notMatched' | 'failed') => dispatch({ type: 'turnCancelResult', stop, result });
        let p: Promise<'matched' | 'notMatched' | 'failed'>;
        try { p = Promise.resolve(ports.cancelTurn(turnId)); } catch { p = Promise.resolve('failed'); }
        p.then((r) => answer(r === 'matched' || r === 'notMatched' ? r : 'failed'), () => answer('failed'));
        return;
      }
      case 'timer': {
        const gen = fx.gen;
        let cancel: (() => void) | null = null;
        const fire = () => {
          if (cancel) timers.delete(cancel);
          dispatch({ type: 'tick', gen });
        };
        safe(() => {
          cancel = ports.timer(fx.ms, fire);
          timers.add(cancel);
        });
        return;
      }
      case 'persist':
        return persist();
    }
  }
  function drain(): void {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const ev = queue.shift()!;
        readClock();
        let r: ReturnType<typeof step>;
        try { r = step(s, ev, now); } catch { continue; }
        s = r.state;
        if (ev.type === 'stale') staleRan = true;
        if (onState) safe(() => onState(s));
        for (const fx of r.fx) {
          // Disposed while this step's effects ran: its shutdown effects still run (a step that ended in `off` leaves
          // `stale` nothing to do), nothing that sends, opens or starts work does.
          if (gone && !SHUTDOWN.has(fx.type)) continue;
          run(fx);
        }
      }
    } finally {
      running = false;
      if (gone) finish();
    }
  }
  function readClock(): void {
    try {
      const t = ports.now();
      if (typeof t === 'number' && Number.isFinite(t)) now = t;
    } catch { /* the last good reading stands */ }
  }
  function persist(): void {
    safe(() => ports.persist(pendingOf(s, now)));
  }
  function dispatch(e: VoiceEvent): void {
    if (gone) return;
    queue.push(e);
    drain();
  }
  // After dispose's `stale` step ran (and its effects: stop the tracks, close, persist): nothing more.
  function finish(): void {
    queue.length = 0;
    if (!staleRan) {
      // `stale` could not step (a machine failure): still end what it would have ended. No persist: the live state's
      // pendingOf is not the loss's, and a save would remove the stored rows it no longer lists.
      staleRan = true;
      safe(() => ports.stopTracks());
    }
    for (const c of timers) safe(c);
    timers.clear();
    closeSocket();
  }
  readClock();
  return {
    dispatch,
    state: () => s,
    dispose() {
      if (gone) return;
      gone = true;
      // Events still waiting are dropped: `stale` ends everything they could have started.
      queue.length = 0;
      queue.push({ type: 'stale' });
      drain();
    },
  };
}

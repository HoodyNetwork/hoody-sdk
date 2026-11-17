// The pause of the agents on one computer, as the AI tab shows it.
//
// The pause is the computer's: daemon-wide, in every realm. A store holds what is known about it:
//   - state: the agent's {paused, since_ms, gen} or null (never read). States come from three places, a GET, the answer
//     of our own PUT and event.pause_state (apply()); `gen` orders them: a state older than the one held is dropped.
//   - Polling: GET /pause on the first hold(), again every pollMs while at least one surface holds the store and the
//     page is visible, and at once when the page returns to the screen or the window gets focus. No `pause` change
//     topic exists; this is the notification, with event.pause_state on open session streams as the quick path.
//   - set(paused): one PUT, one at a time (a second press while one is out does nothing). Idempotent by state at the
//     agent. A refusal (the agent said no, nothing changed) is `error`. A lost answer is `unsure`: "may be paused",
//     never "paused" and never "failed", until a GET answers; the PUT is not sent again, the read is retried (2, 5,
//     10, then every pollMs) for as long as the store is held.
//   - Nothing here cancels anything: pausing holds each session at its next step.
import { agent, hostEnv } from '@core';

type Settled = Awaited<ReturnType<agent.PauseApi['get']>>;
const LOST = { ok: false, err: { kind: 'pending', code: '', status: 0, retryAfter: null, details: {} } } as const satisfies Settled;

export interface PauseView {
  /** Null until a read answered. */
  state: agent.PauseState | null;
  /** The PUT out now: the button shows it and takes no second press. */
  busy: 'pausing' | 'resuming' | null;
  /** A PUT's answer was lost: the state may or may not be what was asked for, until a GET answers. */
  unsure: { wanted: boolean } | null;
  /** The last request the agent or the network refused (code and status), cleared by the next answered request.
   *  `facts`: the rejection as it came (its words and Details); null for an answer the Hub could not read. */
  error: { code: string; status: number; of: 'read' | 'set'; facts: unknown } | null;
}

export interface PauseDeps {
  api: agent.PauseApi;
  pollMs?: number;
  visible?: () => boolean;
}
export interface PauseStore {
  view(): PauseView;
  subscribe(fn: () => void): () => void;
  /** A surface that shows the pause is on screen: reads at once and keeps polling until the returned release. */
  hold(): () => void;
  /** Read now. */
  refresh(): Promise<void>;
  /** A state from elsewhere (event.pause_state): applied when not older than the one held. */
  apply(s: agent.PauseState): void;
  set(paused: boolean): Promise<void>;
  /** The account or computer changed: forget everything (holds and listeners too: a surface holds again); answers still on their way change nothing. */
  reset(): void;
}

const RETRY = [2000, 5000, 10000] as const;
const EMPTY: PauseView = { state: null, busy: null, unsure: null, error: null };

export function createPauseStore(deps: PauseDeps): PauseStore {
  const pollMs = deps.pollMs ?? 30000;
  const visible = deps.visible ?? (() => hostEnv().visible());
  const subs = new Set<() => void>();
  let v: PauseView = EMPTY;
  let holds = 0, gen = 0, reading = false, readAgain = false, timer: ReturnType<typeof setTimeout> | null = null, fails = 0;
  // Reads are numbered as they start; a lost PUT remembers the last read that started before it was out. Only a read that
  // started after the change can say what is in force, so an older read answering late never clears `unsure`.
  let readSeq = 0, unsureAfter = 0;
  let unlisten: Array<() => void> = [];

  const put = (p: Partial<PauseView>): void => {
    v = { ...v, ...p };
    for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
  };
  const take = (s: agent.PauseState): void => {
    if (v.state && s.gen < v.state.gen) return;
    put({ state: s });
  };
  const clearTimer = (): void => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  /** The next read: soon while a lost PUT or a failed read is unresolved, else every pollMs. */
  const delay = (): number => (v.unsure || v.error?.of === 'read' ? (RETRY[Math.max(fails, 1) - 1] ?? pollMs) : pollMs);
  const plan = (): void => {
    clearTimer();
    if (holds <= 0 || !visible()) return;
    const mine = gen;
    timer = setTimeout(() => { timer = null; if (mine === gen) void refresh(); }, delay());
  };

  async function refresh(): Promise<void> {
    if (reading) { readAgain = true; return; }
    reading = true;
    const mine = gen, seq = ++readSeq;
    let r: Settled;
    try { r = await deps.api.get(); } catch { r = LOST; }
    if (mine !== gen) return; // a reset happened: the guard belongs to the new generation
    reading = false;
    const s = r.ok ? agent.pauseOf(r.body) : null;
    if (s) {
      fails = 0;
      take(s);
      // This read answered after any lost PUT was sent: it says what is in force.
      put({ ...(seq > unsureAfter ? { unsure: null } : {}), ...(v.error ? { error: null } : {}) });
    } else if (!(r.ok === false && r.err.kind === 'stale')) {
      fails++;
      put({ error: r.ok ? { code: 'unreadable', status: 0, of: 'read', facts: null } : { code: r.err.code, status: r.err.status, of: 'read', facts: r.err } });
    }
    if (readAgain) { readAgain = false; if (holds > 0) void refresh(); return; }
    plan();
  }

  async function set(paused: boolean): Promise<void> {
    if (v.busy) return;
    const mine = gen;
    put({ busy: paused ? 'pausing' : 'resuming', error: v.error?.of === 'set' ? null : v.error });
    let r: Settled;
    try { r = await deps.api.set(paused); } catch { r = LOST; }
    if (mine !== gen) return;
    if (r.ok) {
      const s = agent.pauseOf(r.body);
      if (s) { take(s); put({ busy: null, unsure: null, error: null }); plan(); return; }
      unsureAfter = readSeq;
      put({ busy: null, unsure: { wanted: paused } });
    } else if (r.err.kind === 'stale') {
      put({ busy: null });
      return;
    } else if (r.err.kind === 'pending') {
      unsureAfter = readSeq;
      put({ busy: null, unsure: { wanted: paused } });
    } else {
      put({ busy: null, error: { code: r.err.code, status: r.err.status, of: 'set', facts: r.err } });
      return;
    }
    fails = 0;
    void refresh();
  }

  const wake = (): void => { if (holds > 0 && visible()) void refresh(); };
  function listen(): void {
    if (unlisten.length) return;
    const onVis = (): void => { if (visible()) wake(); else clearTimer(); };
    unlisten = [hostEnv().onVisibilityChange(onVis), hostEnv().onLifecycle('focus', wake)];
  }
  function unlistenAll(): void { for (const f of unlisten) f(); unlisten = []; }

  return {
    view: () => v,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    hold() {
      holds++;
      if (holds === 1) { listen(); void refresh(); }
      let done = false;
      const mine = gen;
      return () => {
        if (done || mine !== gen) return; // released once; a hold from before a reset no longer counts
        done = true;
        holds--;
        if (holds === 0) { clearTimer(); unlistenAll(); }
      };
    },
    refresh,
    apply: take,
    set,
    reset() {
      gen++;
      clearTimer();
      holds = 0; unlistenAll(); // surfaces hold again after a reset
      reading = false; readAgain = false; fails = 0; unsureAfter = 0;
      v = EMPTY;
      for (const f of [...subs]) { try { f(); } catch { /* a listener's */ } }
    },
  };
}

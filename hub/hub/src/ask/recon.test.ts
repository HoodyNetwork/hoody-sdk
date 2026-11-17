// recon.test.ts: approval recovery proved against random interleavings.
// Several tabs share one scripted agent (fake.ts), one store and one manual clock; each tab has its own transport,
// which can lose, delay, reorder or hold answers and stall its stream without an error. After every step the safety
// properties hold; at each fair checkpoint (faults off, time passes) every visible tab shows every approval the agent
// has parked. Known hard orderings are fixed seeds (H*, B*, R*), so each stays a regression.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import * as C from './conv';
import type { AgentIO, StreamHandlers } from './data';
import { AskEngine, type Slot, type StoreIO } from './engine';
import { FakeAgent, manualClock, scripts, type Beat, type FakeOptions } from './fake';
import { SETTLED_MAX, type AskStore } from './logic';

const ACCOUNT = '64f0ada00000000000000001';
const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
/** Every parked approval shows within this long once the transport is fair (watchdog + one read + backoff). */
const RECOVER_MS = 40_000;

function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** One browser's localStorage and navigator.locks, as its tabs see them: a write fires the storage event in the
 *  browser's other tabs (an open panel wakes), and the decision lock admits one holder at a time, after a random
 *  wait (lockMs) so two tabs' claims interleave. */
class Browser {
  private st: AskStore = { v: 1, a: {} };
  private chain: Promise<void> = Promise.resolve();
  /** A named case's stale view: a tab's reads return this older copy until its own next write (localStorage across
   *  processes is eventually consistent: a read can miss another process's newest write). */
  readonly staleNext = new Map<number, AskStore>();
  /** Every write, in order (a named case checks what a write carried). */
  readonly writes: AskStore[] = [];
  private burstAt = -1;
  private burst = 0;
  constructor(private readonly clock: ReturnType<typeof manualClock>, private readonly lockMs: () => number) {}
  read(_a?: string): AskStore { return JSON.parse(JSON.stringify(this.st)); }
  io(written: () => void, tab = 0): StoreIO {
    return {
      read: () => { const old = this.staleNext.get(tab); return old ? JSON.parse(JSON.stringify(old)) : this.read(); },
      write: (_a, s) => {
        if (!s) return;
        // No write storm: tabs answering each other's writes at one instant would never settle.
        const now = this.clock.now();
        if (now !== this.burstAt) { this.burstAt = now; this.burst = 0; }
        // (A replayed stream can write a few hundred times at one instant; a loop never stops.)
        if (++this.burst > 5000) throw new Error(`write storm: over 5000 store writes at ${now} ms`);
        this.staleNext.delete(tab); this.st = JSON.parse(JSON.stringify(s)); this.writes.push(this.read()); written();
      },
      lock: (fn) => {
        const p = this.chain.then(() => new Promise<void>((r) => { const ms = this.lockMs(); if (ms) this.clock.set(r, ms); else r(); })).then(fn);
        this.chain = p.catch(() => {});
        return p;
      },
    };
  }
}
/** What every tab's transport reports to the world: decisions sent and their definite refusals, state reads in flight. */
interface Watch {
  decided(tab: number, gate: string, att: string): void;
  refused(gate: string, att: string): void;
  violation(msg: string): void;
}

const MUTATIONS = new Set(['create', 'turn', 'command', 'confirm', 'answer', 'yolo', 'cancel', 'start', 'signIn']);
interface Faults { lose: number; drop: number; delayMax: number; hold: number; stall: boolean; only?: string[]; fail?: string[] }
const FAIR: Faults = { lose: 0, drop: 0, delayMax: 0, hold: 0, stall: false };

/** One tab's transport to the shared agent: answers can be lost (the call ran), dropped (it never left), delayed,
 *  or held until the next fair point (late), and the stream can go silent without an error. */
class TabIO {
  f: Faults = { ...FAIR };
  readonly log: Array<[string, unknown[]]> = [];
  /** A named case's own schedule: the nth call of a method (0-based, this tab) is held or fails. */
  pick: ((prop: string, nth: number) => 'hold' | 'fail' | undefined) | null = null;
  private held: Array<() => void> = [];
  /** The open stream's handlers: a named case can end it with an error (the connection dropped). */
  private streamH: StreamHandlers | null = null;
  dropStream(): void { const h = this.streamH; this.streamH = null; h?.error(); }
  /** Fair points so far: an answer held for "the next fair point" that comes after one has passed is delivered. */
  private rel = 0;
  constructor(private readonly agent: FakeAgent, private readonly clock: ReturnType<typeof manualClock>, private readonly rnd: () => number, private readonly trace: string[], private readonly n: number, private readonly watch: Watch) {}
  release(): void { this.rel++; const h = this.held.splice(0); for (const fn of h) fn(); }
  /** The page that owns the transport: an answer that arrives after its page ended (reload, close) reaches no one. */
  private page = 0;
  endPage(): void { this.page++; }
  io(): AgentIO {
    const page = ++this.page;
    // State reads this page (one engine: a reload is a new page) sent and has no answer for yet.
    let reads = 0;
    return new Proxy(this.agent as any, {
      get: (target, prop: string) => {
        const v = target[prop];
        if (prop === 'alive') return () => target.alive();
        if (prop === 'stream') return (sid: string, cur: any, realm: string, h: StreamHandlers) => {
          this.log.push(['stream', [sid, cur]]);
          if (process.env.RECON_DEBUG) this.trace.push(`  t${this.n} stream open @${this.clock.now()} from ${JSON.stringify(cur)}`);
          // A stalled stream is a hung connection: once it swallows a frame it delivers nothing more, ever, and never
          // errors (TCP does not lose a frame and then carry on; the gateway reports its own gaps as lagged).
          let dead = false;
          const wrapped: StreamHandlers = { open: () => h.open(), error: () => { if (!dead) h.error(); }, frame: (n, raw) => { if (this.f.stall) dead = true; if (!dead) h.frame(n, raw); } };
          const es = target.stream(sid, cur, realm, wrapped);
          this.streamH = { ...wrapped, error: () => { dead = true; es?.close(); h.error(); } };
          return es;
        };
        if (typeof v !== 'function') return v;
        return (...args: unknown[]) => {
          this.log.push([prop, args]);
          if (process.env.RECON_DEBUG && prop !== 'state') this.trace.push(`  t${this.n} call ${prop} @${this.clock.now()}`);
          // `only`: the faults touch just these calls (the named cases aim at one answer).
          const mut = MUTATIONS.has(prop), f = this.f.only && !this.f.only.includes(prop) ? FAIR : this.f, r = this.rnd();
          const nth = this.log.filter(([m]) => m === prop).length - 1;
          // A decision is noted before it can reach the agent (a dropped one may, as far as the page knows).
          const dec = prop === 'confirm' || prop === 'answer' ? { gate: (args[1] as any).gate_id + '#' + (args[1] as any).generation, att: 't' + this.n + ':' + prop + nth } : null;
          if (dec) this.watch.decided(this.n, dec.gate, dec.att);
          const pk = this.pick?.(prop, nth);
          const late0 = r > 1 - f.hold || pk === 'hold', relAt = this.rel;
          // At most the reconcile read and one resync read are out at once. A held answer (one that comes only at the
          // next fair point) is left out: a real read ends by its route's timeout, a held one here does not.
          const counted = prop === 'state' && !late0;
          if (counted && ++reads > 2) this.watch.violation(`tab ${this.n} has ${reads} state reads out at once`);
          const done = () => { if (counted) reads--; };
          if (mut && r < f.drop) { done(); return Promise.reject({ status: 0 }); }   // never left: the page cannot tell
          if (this.f.fail?.includes(prop) || pk === 'fail') { done(); return Promise.reject({ status: 503, code: 'unavailable' }); }   // a read that fails
          const p: Promise<unknown> = v.apply(target, args);
          const lost = mut && r < f.drop + f.lose;
          const delay = f.delayMax ? Math.floor(this.rnd() * f.delayMax) : 0;
          const note = (what: string) => { if (prop === 'confirm' || prop === 'answer' || prop === 'command' || prop === 'turn') this.trace.push(`  t${this.n} ${prop} ${JSON.stringify((args[1] as any)?.gate_id ?? args[1]).slice(0, 40)} ${what}`); };
          p.then(() => note('ran ok' + (lost ? ' (answer lost)' : '')), (e) => note('ran ' + JSON.stringify(e).slice(0, 60)));
          if (process.env.RECON_DEBUG && prop === 'state') p.then((b: any) => this.trace.push(`  t${this.n} state@${this.clock.now()} ${b.incarnation} seq ${b.seq} lead ${JSON.stringify((b.pending_lead_gate_refs ?? (b.pending_gate_ref ? [b.pending_gate_ref] : [])).map((x: any) => x.id))}`), () => {});
          return new Promise((res, rej) => {
            const late = () => late0 && this.rel === relAt;
            p.then((b) => {
              const out = () => { done(); if (process.env.RECON_DEBUG && prop === 'state') this.trace.push(`  t${this.n} state delivered @${this.clock.now()} ${(b as any)?.incarnation} seq ${(b as any)?.seq}`); return lost ? rej({ status: 502, pending: true }) : res(b); };
              if (late()) this.held.push(out); else if (delay) this.clock.set(out, delay); else out();
            }, (e) => {
              const out = () => {
                done();
                // A definite refusal (4xx other than pending) reached the page: that decision was not applied.
                const x = e as any;
                if (dec && !lost && page === this.page && typeof x?.status === 'number' && x.status >= 400 && x.status < 500 && x.code !== 'gate_decision_pending') this.watch.refused(dec.gate, dec.att);
                rej(lost ? { status: 502, pending: true } : e);
              };
              if (late()) this.held.push(out); else if (delay) this.clock.set(out, delay); else out();
            });
          });
        };
      },
    }) as AgentIO;
  }
}

interface Tab { n: number; io: TabIO; eng: AskEngine; hidden: boolean; browser: number }
interface Card { id: string; generation: number; kind: string; helper: boolean; decidable: boolean }

/** The cards a snapshot shows: the session list when the engine has one, else its single gate. */
function cardsOf(snap: any): Card[] {
  if (Array.isArray(snap.gates)) return snap.gates.map((g: any) => ({ id: g.gate.id, generation: g.gate.generation, kind: g.gate.kind, helper: !!g.helper, decidable: !!g.decidable }));
  const g = snap.gate;
  return g ? [{ id: g.id, generation: g.generation, kind: g.kind, helper: false, decidable: !snap.decision?.pending && !snap.decision?.unknown }] : [];
}

class World {
  readonly clock = manualClock();
  /** Browsers (each its own storage and lock); tabs open in browser 0 unless a case says otherwise. */
  readonly browsers: Browser[] = [];
  readonly store: Browser;
  readonly agent: FakeAgent;
  /** Per browser: decisions sent on a gate (id#generation) that no definite refusal answered. */
  private openDec = new Map<string, Set<string>>();
  private violations: string[] = [];
  private lockRnd: () => number;
  readonly tabs: Tab[] = [];
  readonly rnd: () => number;
  private n = 0;
  private texts = 0;
  /** Keys a tab showed as unknown (or queued): they stay on screen until the agent provably settled them. */
  private held = new Set<string>();
  private settled = new Set<string>();
  readonly trace: string[] = [];
  constructor(seed: number, o: Partial<FakeOptions>) {
    this.rnd = rngOf(seed);
    this.lockRnd = rngOf(seed * 104729 + 3);
    this.store = this.browser();
    this.browser();                 // browser 1: another device (no shared storage or lock)
    this.agent = new FakeAgent({ account: ACCOUNT, pace: 50, realms: [REALM], ...o }, this.clock);
  }
  browser(): Browser {
    const b = new Browser(this.clock, () => (this.lockRnd() < 0.5 ? 0 : Math.floor(this.lockRnd() * 300)));
    this.browsers.push(b);
    return b;
  }
  /** Is this gate (id#generation) parked at the agent now? */
  private parkedNow(gate: string): boolean {
    for (const s of ((this.agent as any).ss as Map<string, any>).values()) {
      for (const g of [...(s.gate ? [s.gate] : []), ...s.lanes, ...s.helpers]) if (g.id + '#' + g.generation === gate) return true;
    }
    return false;
  }
  /** May a decision this browser sent on this gate still apply (sent, no definite refusal back)? */
  openDecision(browser: number, gate: string): boolean { return !!this.openDec.get(browser + ' ' + gate)?.size; }
  private watchFor(browser: number): Watch {
    return {
      // (c) one browser never sends a second decision on a gate while an earlier one of its decisions on it may
      // still apply or applied (sent, and no definite refusal came back); tabs and reloads included, and a gate that
      // already ended too (a second POST on a resolved gate is a second send even if the agent refuses it).
      decided: (tab, gate, att) => {
        const k = browser + ' ' + gate, open = this.openDec.get(k) ?? new Set<string>();
        if (open.size) this.violations.push(`tab ${tab} sent a second decision on ${gate} while ${[...open].join(',')} may still apply${this.parkedNow(gate) ? '' : ' (gate ended)'}`);
        open.add(att);
        this.openDec.set(k, open);
      },
      refused: (gate, att) => { this.openDec.get(browser + ' ' + gate)?.delete(att); },
      violation: (msg) => { this.violations.push(msg); },
    };
  }
  async flush(ms = 0): Promise<void> {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); this.clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 50) { this.clock.run(Math.min(50, left)); await drain(); }
  }
  /** The storage a tab of this browser sees: its writes wake the browser's other open panels (the storage event). */
  private storeFor(browser: number, n: number): StoreIO {
    return (this.browsers[browser] as Browser).io(() => {
      for (const o of this.tabs) if (o.n !== n && o.browser === browser && !o.hidden) this.clock.set(() => { if (this.tabs.includes(o) && !o.hidden) o.eng.wake(); }, 0);
    }, n);
  }
  async tab(browser = 0): Promise<Tab> {
    const io = new TabIO(this.agent, this.clock, this.rnd, this.trace, this.n + 1, this.watchFor(browser));
    const eng = new AskEngine(slot, io.io(), this.storeFor(browser, this.n + 1), this.clock);
    const t: Tab = { n: ++this.n, io, eng, hidden: false, browser };
    this.tabs.push(t);
    eng.open();
    await this.flush(100);
    // Approve automatically off, so the agent asks (on, it never parks a confirm).
    eng.setAuto(false);
    await this.flush(100);
    return t;
  }
  async reload(t: Tab): Promise<void> {
    t.eng.end();
    t.eng = new AskEngine(slot, t.io.io(), this.storeFor(t.browser, t.n), this.clock);
    t.eng.open();
    t.hidden = false;
    await this.flush(100);
    t.eng.setAuto(false);
  }
  hide(t: Tab): void { t.hidden = true; t.eng.suspend(); }
  /** The tab goes away (its page closed). */
  close(t: Tab): void { t.eng.end(); t.io.endPage(); this.tabs.splice(this.tabs.indexOf(t), 1); }
  show(t: Tab): void { t.hidden = false; t.eng.resume(); }
  send(t: Tab): boolean {
    const text = 'message ' + ++this.texts;
    const ok = t.eng.send(text, true);
    this.trace.push(`t${t.n} send ${text} -> ${ok}`);
    if (process.env.RECON_DEBUG) this.trace.push('  STORE ' + JSON.stringify(this.store.read(ACCOUNT).a[ACCOUNT]?.map((r: any) => ({ k2: r.k2.slice(3, 11), w: r.w, t: r.t, kw: r.kw?.map((k: string) => k.slice(3, 11)), dk: r.dk?.map((k: string) => k.slice(3, 11)) }))));
    return ok;
  }
  decide(t: Tab, which = 0): boolean {
    const c = cardsOf(t.eng.getSnapshot()).filter((x) => x.decidable && !x.helper)[which];
    if (!c) return false;
    const seen = { id: c.id, generation: c.generation };
    if (c.kind === 'confirm') t.eng.decide(this.rnd() < 0.8 ? 'once' : 'deny', undefined, seen); else t.eng.answer('Yes', seen);
    this.trace.push(`t${t.n} decide ${c.id} [${c.kind}]`);
    if (process.env.RECON_DEBUG) this.trace.push('  DBG ' + JSON.stringify((t.eng as any).book.list.map((x: any) => [x.key, x.gate.kind, x.gate.dnum, x.src, x.at])) + ' att ' + JSON.stringify([...(t.eng as any).attempts.entries()]) + ' closed ' + JSON.stringify((t.eng as any).book.closed) + ' inc ' + (t.eng as any).book.inc + ' seq ' + (t.eng as any).book.seq);
    return true;
  }
  checkAll(t: Tab): void {
    for (const u of Object.values(t.eng.getSnapshot().conv.users)) if (u.state === 'unknown' || u.state === 'queued') t.eng.check(u.id);
    t.eng.checkDecision();
  }
  private shown = new Map<number, string>();
  /** The trace says when a tab's cards change (a failure then shows how a card came and went). */
  noteCards(): void {
    for (const t of this.tabs) {
      const c = cardsOf(t.eng.getSnapshot()).map((x) => x.id + (x.decidable ? '' : '*')).join(',');
      if (this.shown.get(t.n) !== c) { this.shown.set(t.n, c); this.trace.push(`  t${t.n} cards [${c}] agent [${this.sid() ? this.agent.parked(this.sid()!).lead.join(',') : ''}]`); }
    }
  }
  sid(): string | null { const s = (this.agent as any).ss as Map<string, unknown>; return s.size ? ([...s.keys()][0] as string) : null; }
  fair(): void { for (const t of this.tabs) { t.io.f = { ...FAIR }; t.io.release(); } }

  // ---- properties ----
  private keyAdmitted(key: string): boolean {
    const kt = (this.agent as any).keyText as Map<string, string>;
    for (const k of kt.keys()) if (k.endsWith(' ' + key)) return true;
    return ((this.agent as any).createdByKey as Map<string, string>).has(key);
  }
  private textAdmitted(text: string): boolean {
    for (const v of ((this.agent as any).keyText as Map<string, string>).values()) if (v === text || v.split('\n').includes(text)) return true;
    return false;
  }
  /** Safety, after every step. */
  safety(): void {
    // (b) never a second send of one message: across every tab, a text goes out under one key at most.
    const keysByText = new Map<string, Set<string>>();
    for (const t of this.tabs) for (const [m, a] of t.io.log) {
      if (m !== 'turn' && m !== 'command') continue;
      const text = a[1] as string, key = a[2] as string;
      const s = keysByText.get(text) ?? new Set<string>();
      s.add(key); keysByText.set(text, s);
    }
    for (const [text, ks] of keysByText) expect(ks.size, `"${text}" went out under ${ks.size} keys\n${this.trace.join('\n')}`).toBeLessThanOrEqual(1);
    // (c) checked as each decision goes out (watchFor), and the agent never applies two decisions to one gate.
    expect(this.violations, this.trace.join('\n')).toEqual([]);
    for (const [id, k] of this.agent.applied) expect(k, `gate ${id} applied ${k} times`).toBeLessThanOrEqual(1);
    // (d) unknown is never shown as settled: "Not sent" only for a message the agent never admitted, "sent" only for
    // one it did; a row once unknown leaves the screen only when the agent holds its key.
    for (const t of this.tabs) {
      if (t.eng.getSnapshot().phase === 'ended') continue;
      const us = Object.values(t.eng.getSnapshot().conv.users);
      for (const u of us) {
        if (u.state === 'notSent' && u.text) expect(this.textAdmitted(u.text), `tab ${t.n} says "${u.text}" was not sent, but the agent has it\n${this.trace.join('\n')}`).toBe(false);
        if (u.state === 'sent' && u.text && u.key) expect(this.textAdmitted(u.text), `tab ${t.n} says "${u.text}" was sent, but the agent never got it\n${this.trace.join('\n')}`).toBe(true);
        if ((u.state === 'unknown' || u.state === 'queued') && u.key) this.held.add(u.key);
        // A definite "Not sent" (checked above against the agent) settles the key: the page told the person.
        if (u.state === 'notSent' && u.key) this.settled.add(u.key);
      }
    }
    for (const k of this.held) {
      if (this.keyAdmitted(k) || this.settled.has(k)) { this.held.delete(k); continue; }
      const shown = this.tabs.some((t) => t.eng.getSnapshot().phase !== 'ended' && Object.values(t.eng.getSnapshot().conv.users).some((u) => u.key === k));
      const stored = this.browsers.some((br) => JSON.stringify(br.read(ACCOUNT)).includes(k));
      const what = this.tabs.flatMap((t) => t.io.log).filter(([m, x]) => (m === 'turn' || m === 'command' || m === 'create') && JSON.stringify(x).includes(k)).map(([m, x]) => `${m} ${JSON.stringify(x[1]).slice(0, 30)}`)[0] ?? '?';
      expect(shown || stored, `key ${k} (${what}) was unknown and vanished while the agent never got it\n${this.trace.join('\n')}`).toBe(true);
    }
  }
  /** Liveness at a fair point: every visible tab on the conversation shows every gate parked at least 2 s. */
  async recovered(): Promise<void> {
    this.fair();
    await this.flush(RECOVER_MS);
    const sid = this.sid();
    if (!sid) return;
    const s = (this.agent as any).ss.get(sid);
    const now = this.clock.now();
    const parked = [...(s.gate ? [s.gate] : []), ...s.lanes, ...s.helpers].filter((g: any) => now - g.at >= 2000);
    for (const t of this.tabs) {
      const snap = t.eng.getSnapshot();
      if (t.hidden || snap.phase !== 'ready' || t.eng.record?.s !== sid || s.dormant) continue;
      const cs = cardsOf(snap), shown = cs.map((c) => c.id);
      for (const g of parked) expect(shown, `tab ${t.n} does not show ${g.helper ? 'helper ' : ''}gate ${g.id}\n${this.trace.join('\n')}`).toContain(g.id);
      // A lead approval or question is answerable here unless a decision this browser sent on it may still apply
      // (the accepted limit: an unconfirmed decision stays unknown while its gate is parked).
      for (const g of parked) {
        if (g.helper || this.openDecision(t.browser, g.id + '#' + g.generation)) continue;
        const c = cs.find((x) => x.id === g.id && x.generation === g.generation);
        expect(c?.decidable, `tab ${t.n} shows gate ${g.id} but cannot decide it\n${this.trace.join('\n')}`).toBe(true);
      }
    }
  }
}

// ---- random interleavings ----
const SCRIPTS: Beat[][] = [
  scripts.approval,
  scripts.question,
  [{ k: 'text', text: 'Two lanes need you.' }, { k: 'lanes', gates: [{ tool: 'bash', params: { command: 'make a' } }, { tool: 'bash', params: { command: 'make b' } }] }, { k: 'text', text: 'Both done.' }],
  [{ k: 'helper', tool: 'bash', params: { command: 'helper step' }, lifeMs: 25_000 }, ...scripts.approval],
  scripts.dashboard,
];

async function randomRun(seed: number, steps: number): Promise<void> {
  const r0 = rngOf(seed * 7919 + 1);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r0() * xs.length)] as T;
  const script = Array.from({ length: 6 }, () => pick(SCRIPTS));
  // The timing options come from their own generator, so the seeds pinned below keep their earlier runs' choices.
  const r1 = rngOf(seed * 6151 + 5), lag = r1() < 0.3 ? Math.floor(r1() * 4000) : 0;
  const w = new World(seed, {
    script, holdQueued: r0() < 0.5, refLagMs: r0() < 0.3 ? 1500 : 0, noTurnId: r0() < 0.2, ringMax: r0() < 0.2 ? 40 : 1024,
    stateGapMs: r1() < 0.4 ? Math.floor(r1() * 600) : 0, replayGapMs: r1() < 0.3 ? Math.floor(r1() * 600) : 0,
    noiseMs: r1() < 0.3 ? 1000 + Math.floor(r1() * 4000) : 0, answerLagMs: lag, answerFail: lag > 0 && r1() < 0.4, rateLimitOnce: r1() < 0.15,
  });
  const a = await w.tab();
  w.send(a);
  for (let i = 0; i < steps; i++) {
    const t = pick(w.tabs);
    const x = w.rnd();
    if (x < 0.18) w.send(t);
    else if (x < 0.34) w.decide(t, Math.floor(w.rnd() * 2));
    else if (x < 0.42) { if (t.hidden) w.show(t); else w.hide(t); w.trace.push(`t${t.n} ${t.hidden ? 'hide' : 'show'}`); }
    else if (x < 0.47) { await w.reload(t); w.trace.push(`t${t.n} reload`); }
    else if (x < 0.50 && w.tabs.length < 3) { const n = await w.tab(w.rnd() < 0.15 ? 1 : 0); w.trace.push(`t${n.n} opened (browser ${n.browser})`); }
    else if (x < 0.56) { w.checkAll(t); w.trace.push(`t${t.n} check`); }
    else if (x < 0.66) { t.io.f = { lose: w.rnd() * 0.4, drop: w.rnd() * 0.15, delayMax: Math.floor(w.rnd() * 3000), hold: w.rnd() * 0.2, stall: w.rnd() < 0.25 }; w.trace.push(`t${t.n} faults ${JSON.stringify(t.io.f)}`); }
    else if (x < 0.68) { w.agent.dropStreams(); w.trace.push('streams drop'); }
    else if (x < 0.69) { w.agent.reattach(); w.trace.push('agent reattach'); }
    else if (x < 0.72) { await w.recovered(); w.trace.push('fair point'); }
    const ms = Math.floor(w.rnd() * 2500);
    await w.flush(ms);
    w.trace.push(`+${ms}ms`);
    w.noteCards();
    w.safety();
  }
  await w.recovered();
  w.safety();
}

describe('recon: random interleavings keep every approval visible and never send twice', () => {
  // RECON_SEEDS / RECON_STEPS widen the search locally, RECON_LIST reruns given seeds (a failing seed is then pinned
  // below as a regression).
  const n = Number(process.env.RECON_SEEDS) || 40, steps = Number(process.env.RECON_STEPS) || 60, only = Number(process.env.RECON_ONLY) || 0;
  const list = (process.env.RECON_LIST ?? '').split(/[ ,]+/).filter(Boolean).map(Number);
  const seeds = list.length ? list : Array.from({ length: only ? 1 : n }, (_, i) => (only || 1) + i);
  for (const seed of seeds) it(`seed ${seed}`, async () => { await randomRun(seed, steps); }, 120_000);
});

// Seeds the wide search (3000 seeds x 150 steps) once failed on, each kept as a regression: 24 (a newer turn key from
// another tab overwrote a pending one: kw), 44 (a snapshot read inside a resolution frame brought a decided gate back;
// the agent resolves before it reports), 73 (a send stored an older turn over another tab's newer one), 159 (a resync
// read /state for its turn but not for the cards: the reopened stream started past a new gate), 211 (a silent
// stream never watched again after one quiet check), 335 (a reload tied another turn to a pending key), 407 (a late
// receipt for an older key cleared a newer key's w), 1077 (a snapshot read held across two re-attaches named an
// incarnation the page never saw and took the book over: the epoch fence reads again). A later harness (storage wakes,
// capture gaps, noise) changed those worlds, so a second search pinned new ones for the guards they no longer reach:
// 45 (a late answer for an older key cleared a newer key's pending mark), 936 (no epoch fence on snapshot reads),
// 135 and 262 (a gate only the resync's replay saw). A third search pinned 233 (two tabs storing and removing one
// decision at one instant, without end: settled request ids (dg) are the evidence that ends it) and 661 (no epoch
// fence on snapshot reads, which 936 no longer reaches).
describe('recon: seeds the wide search found', () => {
  for (const seed of [24, 44, 73, 159, 211, 335, 407, 1077, 45, 936, 135, 262, 233, 661]) it(`seed ${seed} (150 steps)`, async () => { await randomRun(seed, 150); }, 120_000);
});

// ---- named cases (fixed orderings) ----
describe('recon: named cases', () => {
  it('two lead gates parked at once: both cards show and each is decided once', async () => {
    const w = new World(1, { script: [SCRIPTS[2] as Beat[]] });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    expect(cardsOf(a.eng.getSnapshot()).filter((c) => !c.helper)).toHaveLength(2);
    expect(w.decide(a, 0)).toBe(true);
    await w.flush(500);
    expect(w.decide(a, 0)).toBe(true);
    await w.flush(3000);
    w.safety();
    expect(w.agent.parked(w.sid()!).lead).toEqual([]);
  });
  it('a parked gate whose ref is not published yet stays on screen and becomes answerable', async () => {
    const w = new World(2, { script: [scripts.approval], refLagMs: 8000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(1);
    await w.reload(a);
    await w.flush(1000);
    // Reloaded inside the ref window: the approval is seen (its text), not yet answerable, and never dropped.
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(1);
    await w.recovered();
    const c = cardsOf(a.eng.getSnapshot());
    expect(c).toHaveLength(1);
    expect(c[0]!.decidable).toBe(true);
  });
  it('a helper gate outlives the lead turn: its card stays, with no decision buttons', async () => {
    const w = new World(3, { script: [[{ k: 'helper', tool: 'bash', params: { command: 'x' }, lifeMs: 60_000 }, { k: 'text', text: 'Lead done.' }]] });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    expect(w.agent.parked(w.sid()!).helpers).toHaveLength(1);
    await w.recovered();
    const c = cardsOf(a.eng.getSnapshot());
    expect(c.map((x) => x.helper)).toEqual([true]);
    expect(c[0]!.decidable).toBe(false);
    await w.flush(30_000);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(0);
  });
  it('an approval in a command-started turn (frames without turn_id) shows after the idle gap', async () => {
    const w = new World(4, { script: [[{ k: 'text', text: 'first' }], scripts.approval], holdQueued: true, pace: 400 });
    const a = await w.tab();
    w.send(a);
    await w.flush(150);
    w.send(a);                      // a follow-up while the first turn runs: it starts the next turn after a gap
    await w.flush(6000);
    w.safety();
    await w.recovered();
  });
  it('a card rebuilt while its decision is unanswered never offers a second decision', async () => {
    const w = new World(5, { script: [scripts.approval], decisionLost: true, decisionLag: 20_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    expect(w.decide(a)).toBe(true);
    await w.flush(200);
    a.eng.checkDecision();
    await w.flush(1000);
    w.agent.dropStreams();          // reconnect: the snapshot shows the same gate (claimed, still parked)
    await w.flush(2000);
    expect(w.decide(a)).toBe(false);
    await w.reload(a);              // a reload forgets nothing that could send a second decision
    await w.flush(2000);
    w.decide(a);
    await w.flush(30_000);
    w.safety();
  });
  // H1..H3: three high-risk orderings, step for step.
  it('H1 A recovers its older turn and takes B\'s stored turn, queues a follow-up, B ends unseen and its follow-up C parks; resume, then reload: C\'s card shows', async () => {
    const long: Beat[] = [{ k: 'text', text: 'b' }, ...Array.from({ length: 14 }, (): Beat => ({ k: 'tool', name: 'bash', summary: 'step' }))];
    const w = new World(11, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 'step' }], long, scripts.approval], holdQueued: true, pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(100);
    const b = await w.tab();        // tab B on the same conversation
    w.hide(a);                      // A's turn ends while its dock is closed
    await w.flush(2000);
    w.send(b);                      // tab B starts turn B (stored as the conversation's turn)
    await w.flush(600);
    w.show(a);                      // A recovers its older turn and takes B's stored pointer
    await w.flush(900);
    w.close(b);                     // tab B goes away
    w.send(a);                      // A queues a follow-up during B (known command id)
    await w.flush(100);
    w.hide(a);                      // A closes its dock
    await w.flush(9000);            // B ends unseen; the follow-up starts C, which parks
    expect(w.agent.parked(w.sid()!).lead, w.trace.join('\n')).toHaveLength(1);
    w.show(a);
    await w.flush(2000);
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id), w.trace.join('\n')).toEqual(w.agent.parked(w.sid()!).lead);
    await w.reload(a);
    await w.flush(2000);
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id), w.trace.join('\n')).toEqual(w.agent.parked(w.sid()!).lead);
    w.safety();
    expect(w.tabs.flatMap((t) => t.io.log).filter(([m]) => m === 'command')).toHaveLength(1);
  });
  it('H2 a resume whose replay fails and whose reads hang, while the stream replays an old commit, never hides C\'s card (and a reload shows it)', async () => {
    const w = new World(12, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 'step' }], [{ k: 'text', text: 'two' }], scripts.approval], holdQueued: true, pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(150);
    const b = await w.tab();        // tab B on the same conversation
    await w.flush(50);
    w.send(a);                      // a known-id follow-up
    await w.flush(50);
    w.hide(a);
    await w.flush(6000);            // its turn B runs and completes unseen
    w.send(b);                      // tab B moves on to C, which parks
    await w.flush(4000);
    a.io.f = { ...FAIR, fail: ['replay'], hold: 1, only: ['commandGet', 'turns'] };
    w.show(a);                      // the stream resumes from A's older cursor and replays B's commit
    await w.flush(3000);
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
    a.io.f = { ...FAIR };
    a.io.release();
    await w.flush(1000);
    await w.reload(a);
    await w.flush(2000);
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
    w.safety();
  });
  for (const reopened of [false, true]) {
    it(`H3 a follow-up whose POST answer is still out when the turn ends; the next turn parks later: its card shows before the answer comes (${reopened ? 'dock closed and reopened' : 'dock open'})`, async () => {
      const w = new World(13, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 'step' }], scripts.approval], holdQueued: true, queuedGapMs: 4000, pace: 300 });
      const a = await w.tab();
      w.send(a);
      await w.flush(400);
      a.io.f = { ...FAIR, hold: 1, only: ['command'] };   // admitted; its answer stays out
      w.send(a);
      await w.flush(1500);          // A ends; the turn list sees only A
      if (reopened) { w.hide(a); await w.flush(500); w.show(a); }
      await w.flush(8000);          // the next turn starts after the gap and parks
      expect(w.agent.parked(w.sid()!).lead).toHaveLength(1);
      expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
      w.safety();
      expect(a.io.log.filter(([m]) => m === 'command')).toHaveLength(1);
    });
  }
  it('B1 suspended before the turn ends; the next turn starts and parks before the resume', async () => {
    const w = new World(21, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 's' }], scripts.approval], holdQueued: true, pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(400);
    w.send(a);
    await w.flush(50);
    w.hide(a);
    await w.flush(8000);
    w.show(a);
    await w.flush(1500);
    const c = cardsOf(a.eng.getSnapshot());
    expect(w.agent.parked(w.sid()!).lead.every((id) => c.some((x) => x.id === id))).toBe(true);
    w.safety();
  });
  it('B6 reopened in the gap after one turn ended and before the next started', async () => {
    const w = new World(26, { script: [[{ k: 'text', text: 'one' }], scripts.approval], holdQueued: true, pace: 600 });
    const a = await w.tab();
    w.send(a);
    await w.flush(200);
    w.send(a);
    await w.flush(900);             // the first turn ends; the next waits one pace
    await w.reload(a);
    await w.flush(6000);
    const c = cardsOf(a.eng.getSnapshot());
    expect(w.agent.parked(w.sid()!).lead.every((id) => c.some((x) => x.id === id))).toBe(true);
    w.safety();
  });
  it('B2 a late successful POST for an older turn never hides the newer turn\'s card (and a reload shows it)', async () => {
    const w = new World(22, { script: [[{ k: 'text', text: 'one' }], [{ k: 'text', text: 'two' }], scripts.approval], pace: 200 });
    const a = await w.tab();
    w.send(a);
    await w.flush(50);
    const b = await w.tab();        // tab B on the same conversation
    await w.flush(3000);
    a.io.f = { ...FAIR, hold: 1, only: ['turn'] };   // Two's answer stays out
    w.send(a);
    await w.flush(3000);                              // Two runs and ends
    w.send(b);                                        // Three, from the other tab, parks
    await w.flush(4000);
    a.io.release();                                   // Two's answer lands late
    await w.flush(500);
    w.safety();
    await w.recovered();
    await w.reload(a);
    await w.recovered();
  });
  it('B3 a stale receipt for an older turn never marks the newer turn done or hides its card', async () => {
    const w = new World(23, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 's' }], scripts.approval], pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(50);
    const b = await w.tab();        // tab B on the same conversation
    a.io.f = { ...FAIR, hold: 1, only: ['receipt'] };
    await w.flush(4000);                              // the turn ends; A's receipt reads stay out
    w.send(b);
    await w.flush(4000);
    a.io.release();
    await w.flush(500);
    w.safety();
    await w.recovered();
  });
  it('B4 a receipt that lands after the history was read again never settles the newer turn', async () => {
    const w = new World(24, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 's' }], scripts.approval], pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(50);
    const b = await w.tab();        // tab B on the same conversation
    a.io.f = { ...FAIR, hold: 1, only: ['receipt'] };
    await w.flush(4000);
    w.send(b);
    await w.flush(3000);
    w.agent.dropStreams();                            // A reconnects and reads the session again
    await w.flush(2000);
    a.io.release();
    await w.flush(500);
    w.safety();
    await w.recovered();
  });
  it('B5 a late command read, a store merge and a Dismiss of the old row leave the newer card alone', async () => {
    const w = new World(25, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 's' }, { k: 'text', text: 'done' }], scripts.approval], holdQueued: true, pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(50);
    const b = await w.tab();        // tab B on the same conversation
    await w.flush(400);
    w.send(a);                                        // a queued follow-up with a command id
    await w.flush(100);
    await w.reload(a);                                // its row is text-less now, read back by id
    a.io.f = { ...FAIR, hold: 1, only: ['commandGet'] };
    await w.flush(6000);                              // its turn runs; the read stays out
    w.send(b);
    await w.flush(4000);
    const row = Object.values(a.eng.getSnapshot().conv.users).find((u) => !u.text && u.via === 'command');
    if (row) a.eng.dismiss(row.id);
    a.io.release();
    await w.flush(500);
    w.safety();
    await w.recovered();
  });
  it('B7 a reload of a completed record whose follow-up has no command id still shows the follow-up turn\'s card', async () => {
    const w = new World(27, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 's' }], scripts.approval], holdQueued: true, pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(400);
    a.io.f = { ...FAIR, lose: 1, only: ['command'] };   // the follow-up ran, its answer (and id) never came
    w.send(a);
    await w.flush(100);
    a.io.f = { ...FAIR };
    w.hide(a);
    await w.flush(8000);
    await w.reload(a);
    w.safety();
    await w.recovered();
    expect(Object.values(a.eng.getSnapshot().conv.users).some((u) => u.via === 'command' && u.state === 'unknown')).toBe(true);
  });
  it('B8 a follow-up POST out across the turn\'s end, answered after the next turn parked: card stays, row settles', async () => {
    const w = new World(28, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 's' }], scripts.approval], holdQueued: true, pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(400);
    a.io.f = { ...FAIR, hold: 1, only: ['command'] };
    w.send(a);
    await w.flush(8000);
    const before = cardsOf(a.eng.getSnapshot()).map((c) => c.id);
    expect(w.agent.parked(w.sid()!).lead.every((id) => before.includes(id))).toBe(true);
    a.io.release();
    await w.flush(1000);
    expect(cardsOf(a.eng.getSnapshot()).map((c) => c.id)).toEqual(before);
    w.safety();
    await w.recovered();
  });
  it('B9 Recent says unknown, not Done, over a follow-up whose outcome is unknown', async () => {
    const w = new World(29, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 's' }]], holdQueued: true, pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(400);
    a.io.f = { ...FAIR, lose: 1, only: ['command'] };
    w.send(a);
    await w.flush(6000);
    a.eng.loadRecent();
    await w.flush(100);
    expect(a.eng.getSnapshot().recent?.find((r: any) => r.current)?.ph).toBe('unknown');
  });
  it('recovery cost: an idle visible panel reads the session at most a few times a minute and never storms', async () => {
    const w = new World(30, { script: [[{ k: 'text', text: 'one' }]] });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    const n0 = a.io.log.filter(([m]) => m === 'state').length, s0 = a.io.log.filter(([m]) => m === 'stream').length;
    await w.flush(5 * 60_000);
    const reads = a.io.log.filter(([m]) => m === 'state').length - n0, opens = a.io.log.filter(([m]) => m === 'stream').length - s0;
    expect(reads).toBeLessThanOrEqual(5 * 3);
    expect(opens).toBeLessThanOrEqual(5);
  });
  it('reloaded inside the ref window with a dead stream: the snapshot alone keeps the card (not answerable), then it becomes answerable', async () => {
    const w = new World(6, { script: [scripts.approval], refLagMs: 30_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    a.io.f = { ...FAIR, stall: true };
    await w.reload(a);
    await w.flush(2000);
    const c = cardsOf(a.eng.getSnapshot());
    expect(c).toHaveLength(1);      // seen with its text, its address still coming
    expect(c[0]!.decidable).toBe(false);
    a.io.f = { ...FAIR };
    await w.flush(40_000);
    const d = cardsOf(a.eng.getSnapshot());
    expect(d.map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
    expect(d[0]!.decidable).toBe(true);
  });
  it('a snapshot read before a resolution, landing after it, never brings the card back', async () => {
    const w = new World(7, { script: [scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    a.io.f = { ...FAIR, hold: 1, only: ['state'] };
    a.eng.wake();                   // a read goes out and stays out
    await w.flush(10);
    expect(w.decide(a)).toBe(true);
    await w.flush(1000);            // decided; the resolution frame arrives
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(0);
    a.io.release();                 // the older snapshot (still showing the gate) lands; later reads stay out
    await w.flush(100);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(0);
    a.io.f = { ...FAIR };
    a.io.release();
    await w.flush(1000);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(0);
    w.safety();
  });
  it('a stream that hangs while idle, after a quiet check found nothing, is still watched: a later approval shows', async () => {
    const w = new World(34, { script: [[{ k: 'text', text: 'one' }], scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    a.io.f = { ...FAIR, stall: true };
    await w.flush(35_000);          // one quiet check: nothing missed
    const b = await w.tab();
    w.send(b);                      // another tab's turn parks; A's hung stream swallows it
    await w.flush(5000);
    a.io.f = { ...FAIR };
    await w.flush(RECOVER_MS);
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
  });
  it('failed snapshot reads are retried with backoff: the card shows long before the quiet watchdog', async () => {
    const w = new World(35, { script: [scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    a.io.f = { ...FAIR, stall: true, fail: ['state'] };
    await w.reload(a);              // the history reads fine; the snapshot fails; the stream hangs
    await w.flush(1500);
    a.io.f = { ...FAIR, stall: true };
    await w.flush(10_000);
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
  });
  it('waking the page (visible again, online, another tab wrote) reads the session at once', async () => {
    const w = new World(36, { script: [[{ k: 'text', text: 'one' }], scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    a.io.f = { ...FAIR, stall: true };
    const b = await w.tab();
    w.send(b);
    await w.flush(5000);            // A's stream hung on the first frame; the approval is parked
    a.io.f = { ...FAIR };
    a.eng.wake();
    await w.flush(2000);
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
  });
  it('K1 a turn key whose answer is lost, then another tab sends a newer turn: the older key stays stored, shows after a reload, and goes on Dismiss', async () => {
    const w = new World(37, { script: [[{ k: 'text', text: 'one' }], [{ k: 'text', text: 'two' }], [{ k: 'text', text: 'three' }]], pace: 100 });
    const a = await w.tab();
    w.send(a);
    await w.flush(2000);
    const b = await w.tab();
    a.io.f = { ...FAIR, drop: 1, only: ['turn'] };   // A's turn never leaves; A cannot tell
    w.send(a);
    await w.flush(500);
    const lost = (a.io.log.filter(([m]) => m === 'turn').pop()![1] as unknown[])[2] as string;
    w.send(b);                                        // B sends a newer turn under its own key
    await w.flush(2000);
    expect(JSON.stringify(w.store.read(ACCOUNT))).toContain(lost);
    await w.reload(b);
    await w.flush(2000);
    const row = Object.values(b.eng.getSnapshot().conv.users).find((u) => u.key === lost);
    expect(row).toMatchObject({ state: 'unknown', reason: 'ask.otherTab', text: '' });
    b.eng.check(row!.id);                             // nothing can tie it to a turn: no read, no send
    await w.flush(500);
    expect(b.io.log.filter(([m, x]) => m === 'turn' && (x as unknown[])[2] === lost)).toHaveLength(0);
    b.eng.dismiss(row!.id);
    await w.flush(10);
    expect(JSON.stringify(w.store.read(ACCOUNT).a[ACCOUNT]?.map((r) => r.kw ?? []))).not.toContain(lost);
    w.safety();
  });
  it('K1 a late receipt for an older turn key leaves pending the newer key a tab sent and closed before its receipt', async () => {
    const w = new World(71, { script: [[{ k: 'text', text: 'one' }], [{ k: 'text', text: 'two' }], [{ k: 'text', text: 'three' }]], pace: 100 });
    const a = await w.tab();
    w.send(a);
    await w.flush(2000);
    const b = await w.tab();
    await w.flush(500);
    a.io.f = { ...FAIR, hold: 1, only: ['turn'] };   // A's receipt waits
    w.send(a);
    await w.flush(500);
    b.io.f = { ...FAIR, hold: 1, only: ['turn'] };   // so does B's, for a newer key
    w.send(b);
    await w.flush(500);
    const rec = () => w.store.read(ACCOUNT).a[ACCOUNT]?.[0];
    const newer = rec()?.k2;
    expect(rec()?.w).toBe(true);
    w.close(b);                                       // B's receipt reaches no one now
    a.io.f = { ...FAIR };
    a.io.release();                                   // A's older receipt lands
    await w.flush(300);
    expect(rec()?.k2).toBe(newer);
    expect(rec()?.w, w.trace.join('\n')).toBe(true);
    await w.flush(3000);
    w.safety();
  });
  it('a resync snapshot of an incarnation the page never saw, landing after the page moved on, never takes the cards over', async () => {
    const long: Beat[] = [{ k: 'text', text: 'a' }, ...scripts.approval];
    const w = new World(38, { script: [long] });
    const a = await w.tab();
    w.send(a);
    await w.flush(5000);            // the turn runs and parks
    const states = () => a.io.log.filter(([m]) => m === 'state').length;
    a.io.pick = (p) => (p === 'state' ? 'fail' : undefined);
    w.agent.reattach();             // incarnation 2: this page's reads of it fail
    await w.flush(500);
    const k = states();
    a.io.pick = (p, n) => (p === 'state' ? (n === k ? 'hold' : 'fail') : undefined);
    w.hide(a); w.show(a);           // the resume's resync reads incarnation 2; that answer stays out
    await w.flush(500);
    w.agent.reattach();             // incarnation 3
    a.io.pick = (p, n) => (p === 'state' && n === k ? 'hold' : undefined);
    await w.flush(35_000);          // the page reads incarnation 3
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
    a.io.pick = null;
    a.io.release();                 // the incarnation-2 snapshot lands
    await w.flush(RECOVER_MS);
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
  });
  it('another tab starts work while this one is idle: its card shows here too', async () => {
    const w = new World(31, { script: [[{ k: 'text', text: 'one' }], scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(2000);
    const b = await w.tab();
    w.send(b);
    await w.flush(5000);
    const c = cardsOf(a.eng.getSnapshot());
    expect(c.length).toBeGreaterThan(0);
    w.safety();
    await w.recovered();
  });
  it('a stream that goes silent without an error is noticed and the card shows', async () => {
    const w = new World(32, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 's' }, ...scripts.approval]], pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(200);
    a.io.f = { ...FAIR, stall: true };
    await w.flush(5000);
    a.io.f = { ...FAIR };
    await w.flush(RECOVER_MS);
    const c = cardsOf(a.eng.getSnapshot());
    expect(c.length).toBe(w.agent.parked(w.sid()!).lead.length);
    w.safety();
  });
  it('a re-attach (new incarnation) with a parked gate: the card comes back under its new id', async () => {
    const w = new World(33, { script: [scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    w.agent.reattach();
    await w.recovered();
    const c = cardsOf(a.eng.getSnapshot());
    expect(c.map((x) => x.id)).toEqual(w.agent.parked(w.sid()!).lead);
    w.safety();
  });
});

/** The agent's next state read answers with `edit` applied to its body: a snapshot the contract allows (its content
 *  read after its watermark), aimed at one ordering. */
function patchState(w: World, edit: (b: any) => any): void {
  const ag = w.agent as any, orig = ag.state;
  ag.state = function (this: unknown, ...args: unknown[]) { ag.state = orig; return (orig.apply(ag, args) as Promise<any>).then((b) => edit(b)); };
}
const NO_GATES = (b: any) => { const o = { ...b, state: 'running' }; for (const f of ['pending_gate', 'pending_gate_ref', 'pending_lead_gates', 'pending_lead_gate_refs']) delete o[f]; return o; };
const decided = (t: Tab) => t.eng.getSnapshot().conv.turns.flatMap((x) => x.decided);

// Orderings across tabs and reloads, part 1.
describe('recon: orderings, part 1', () => {
  it('another tab\'s decision whose outcome is unknown is taken in: this tab offers no second one, open or reloaded', async () => {
    const w = new World(41, { script: [scripts.approval], decisionLost: true, decisionLag: 120_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    const b = await w.tab();
    await w.flush(2000);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.decidable)).toEqual([true]);
    expect(w.decide(a)).toBe(true); // its answer is lost; the agent applies it two minutes later
    await w.flush(500);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.decidable), w.trace.join('\n')).toEqual([false]);
    expect(w.decide(b)).toBe(false);
    await w.reload(b);
    await w.flush(2000);
    expect(w.decide(b)).toBe(false);
    w.safety();
  });
  it('a tab whose dock was closed while another tab decided takes that decision in when it opens', async () => {
    const w = new World(56, { script: [scripts.approval], decisionLost: true, decisionLag: 120_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    const b = await w.tab();
    await w.flush(2000);
    w.hide(b);
    expect(w.decide(a)).toBe(true); // its answer is lost
    await w.flush(500);
    w.show(b);
    await w.flush(0);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.decidable), w.trace.join('\n')).toEqual([false]);
    w.safety();
  });
  it('two tabs click the same card at once: one decision goes out', async () => {
    const w = new World(42, { script: [scripts.approval], decisionLost: true, decisionLag: 120_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    const b = await w.tab();
    await w.flush(2000);
    w.decide(a);
    w.decide(b);
    await w.flush(2000);
    w.safety();
    expect(w.tabs.flatMap((t) => t.io.log).filter(([m]) => m === 'confirm'), w.trace.join('\n')).toHaveLength(1);
  });
  it('an answer refused because another client\'s answer is still being applied keeps the card; when that answer fails the card is answerable', async () => {
    const w = new World(43, { script: [scripts.question], answerLagMs: 3000, answerFail: true });
    const b = await w.tab();
    w.send(b);
    await w.flush(4500);
    // Another client of the session (the agent's own terminal, say) answers; that answer is being applied.
    const g = (w.agent as any).ss.get(w.sid()).gate;
    void w.agent.answer(w.sid()!, { gate_id: g.id, generation: g.generation, answer: 'No' } as any).catch(() => {});
    await w.flush(200);
    let left = false;
    const un = b.eng.subscribe(() => { if (!cardsOf(b.eng.getSnapshot()).length) left = true; });
    expect(w.decide(b)).toBe(true); // refused without details: the other answer may still fail
    await w.flush(300);
    un();
    expect(left, 'the card left the screen, even if only for a moment').toBe(false);
    const lead = () => w.agent.parked(w.sid()!).lead;
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.id), w.trace.join('\n')).toEqual(lead());
    await w.flush(4000);            // the other answer fails: rolled back, the question is still parked
    expect(lead()).toHaveLength(1);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => [c.id, c.decidable]), w.trace.join('\n')).toEqual([[lead()[0], true]]);
    (w.agent as any).o.answerFail = false;
    expect(w.decide(b)).toBe(true);
    await w.flush(5000);
    expect(lead()).toEqual([]);
    w.safety();
  });
  it('a decision refused 429, then a retry whose request never left, then a reload: the card is not decidable', async () => {
    const w = new World(44, { script: [scripts.approval], rateLimitOnce: true });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    expect(w.decide(a)).toBe(true); // 429: not applied
    await w.flush(500);
    expect(cardsOf(a.eng.getSnapshot()).map((c) => c.decidable)).toEqual([true]);
    a.io.f = { ...FAIR, drop: 1, only: ['confirm'] };
    expect(w.decide(a)).toBe(true); // never reached the agent; the page cannot tell
    await w.flush(500);
    a.io.f = { ...FAIR };
    await w.reload(a);
    await w.flush(2000);
    expect(cardsOf(a.eng.getSnapshot()).map((c) => [c.id, c.decidable]), w.trace.join('\n')).toEqual([[w.agent.parked(w.sid()!).lead[0], false]]);
    expect(w.decide(a)).toBe(false);
    w.safety();
  });
  it('A2 an older snapshot with the same watermark, landing after a newer one, keeps an unknown decision unknown', async () => {
    const w = new World(45, { script: [scripts.approval], decisionLost: true, decisionLag: 120_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    a.io.f = { ...FAIR, stall: true };
    await w.reload(a);              // its stream is dead: the card comes from snapshots alone
    await w.flush(2000);
    const lead = w.agent.parked(w.sid()!).lead;
    expect(cardsOf(a.eng.getSnapshot()).map((c) => c.id)).toEqual(lead);
    const k = a.io.log.filter(([m]) => m === 'state').length;
    a.io.pick = (p, n) => (p === 'state' && n === k ? 'hold' : undefined);
    patchState(w, NO_GATES);        // read 1: content from before the gate parked, same watermark; its answer stays out
    a.eng.wake();
    await w.flush(10);
    w.hide(a); w.show(a);           // read 2 (the resume's resync) shows the gate
    await w.flush(1000);
    expect(cardsOf(a.eng.getSnapshot()).map((c) => [c.id, c.decidable]), w.trace.join('\n')).toEqual([[lead[0], true]]);
    expect(w.decide(a)).toBe(true); // its answer is lost
    await w.flush(500);
    a.io.pick = null;
    a.io.release();                 // read 1 lands
    await w.flush(500);
    a.io.f = { ...FAIR };
    a.eng.checkDecision();
    await w.flush(3000);
    expect(cardsOf(a.eng.getSnapshot()).map((c) => [c.id, c.decidable]), w.trace.join('\n')).toEqual([[lead[0], false]]);
    expect(w.decide(a)).toBe(false);
    w.safety();
  });
  it('A3 a snapshot whose watermark predates turn A\'s end shows turn B\'s approval; A\'s end and B\'s opening replay after it: the card shows throughout', async () => {
    const w = new World(46, { script: [[{ k: 'text', text: 'one' }, { k: 'tool', name: 'bash', summary: 's' }], scripts.approval], holdQueued: true, pace: 300 });
    const a = await w.tab();
    w.send(a);
    await w.flush(150);
    w.send(a);                      // a follow-up: turn B starts when A ends
    a.io.f = { ...FAIR, stall: true };
    await w.flush(8000);            // A ends and B parks, unseen
    const sid = w.sid()!, lead = w.agent.parked(sid).lead;
    expect(lead).toHaveLength(1);
    const ring = (w.agent as any).ring as Array<{ sid: string; env: any }>;
    const doneA = ring.find((x) => x.sid === sid && x.env.event.type === 'event.agent_done')!.env.seq as number;
    a.io.f = { ...FAIR };
    patchState(w, (b) => ({ ...b, seq: doneA - 1 }));
    let seen = false;
    for (let i = 0; i < 100; i++) {
      await w.flush(500);
      const c = cardsOf(a.eng.getSnapshot()).map((x) => x.id);
      if (c.includes(lead[0]!)) seen = true;
      else expect(seen, `the card went away after it showed (${i * 500} ms)\n${w.trace.join('\n')}`).toBe(false);
    }
    expect(seen, w.trace.join('\n')).toBe(true);
    w.safety();
  });
  it('A4 an approval only the resync\'s replay saw shows within seconds while unrelated frames keep the stream busy', async () => {
    const steps = Array.from({ length: 8 }, (): Beat => ({ k: 'tool', name: 'bash', summary: 'step' }));
    const o: Partial<FakeOptions> = { script: [[{ k: 'text', text: 'one' }], [{ k: 'text', text: 'b' }, ...steps, ...scripts.approval]], pace: 300, replayGapMs: 800, noiseMs: 1000 };
    // Both runs are the same deterministic world: the first finds when the other tab's gate parks.
    const run = async (showAt: number | null): Promise<{ w: World; a: Tab; at: number }> => {
      const w = new World(47, o);
      const a = await w.tab();
      w.send(a);
      await w.flush(3000);
      const b = await w.tab();
      w.hide(a);                    // A's dock is closed while another tab starts a turn
      w.send(b);
      const t0 = w.clock.now();
      if (showAt === null) {
        while (!w.agent.parked(w.sid()!).lead.length && w.clock.now() - t0 < 30_000) await w.flush(50);
      } else {
        await w.flush(showAt);
        w.show(a);                  // the snapshot names a turn A never saw: its resync reads /state before the gate parks and /replay after
        await w.flush(6000);
      }
      return { w, a, at: w.clock.now() - t0 };
    };
    const { at } = await run(null);
    const { w, a } = await run(at - 400);
    const lead = w.agent.parked(w.sid()!).lead;
    expect(lead).toHaveLength(1);
    expect(cardsOf(a.eng.getSnapshot()).map((c) => c.id), w.trace.join('\n')).toEqual(lead);
    w.safety();
  });
  it('A5 nine decisions with unknown outcomes: at most eight go out, and none is decidable again after a reload', async () => {
    const gates = Array.from({ length: 9 }, (_, i) => ({ tool: 'bash', params: { command: 'make ' + i } }));
    const w = new World(48, { script: [[{ k: 'text', text: 'Nine lanes.' }, { k: 'lanes', gates }]] });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(9);
    a.io.f = { ...FAIR, drop: 1, only: ['confirm'] };
    for (let i = 0; i < 9; i++) { w.decide(a); await w.flush(500); }
    expect(a.io.log.filter(([m]) => m === 'confirm'), w.trace.join('\n')).toHaveLength(8);
    a.io.f = { ...FAIR };
    await w.reload(a);
    await w.flush(2000);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(9);
    expect(cardsOf(a.eng.getSnapshot()).filter((c) => c.decidable), w.trace.join('\n')).toEqual([]);
    expect(w.decide(a)).toBe(false);
    w.safety();
  });
  it('A5 ten tabs each send a message that never leaves: no key is forgotten', async () => {
    const w = new World(49, { script: [[{ k: 'text', text: 'one' }]] });
    const first = await w.tab();
    w.send(first);
    await w.flush(3000);
    const ten: Tab[] = [];
    for (let i = 0; i < 10; i++) ten.push(await w.tab());   // all open on the idle conversation first
    for (const t of ten) {
      t.io.f = { ...FAIR, drop: 1, only: ['turn', 'command'] };
      w.send(t);
      await w.flush(200);
      w.safety();
    }
    // The ninth open key is refused before it goes ("Not sent"), never stored over an older one.
    expect(ten.some((t) => Object.values(t.eng.getSnapshot().conv.users).some((u) => u.state === 'notSent' && u.reason === 'ask.tooManyQueued'))).toBe(true);
    // Every key that went out (as far as its tab knows) is still stored once all the tabs are gone.
    const keys = w.tabs.slice(1).flatMap((t) => t.io.log).filter(([m]) => m === 'turn' || m === 'command').map(([, x]) => x[2] as string);
    expect(new Set(keys).size).toBeGreaterThanOrEqual(8);
    for (const t of [...w.tabs]) w.close(t);
    const st = JSON.stringify(w.store.read(ACCOUNT));
    for (const k of keys) expect(st, `key ${k} was forgotten`).toContain(k);
    const b = await w.tab();
    await w.flush(2000);
    const shown = Object.values(b.eng.getSnapshot().conv.users).map((u) => u.key);
    for (const k of keys) expect(shown, `key ${k} is not shown after a reload`).toContain(k);
    w.safety();
  });
  it('a snapshot without the gate, read while the decision\'s 200 is out, keeps the attempt: the Decided row shows', async () => {
    const w = new World(53, { script: [scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    a.io.f = { ...FAIR, hold: 1, only: ['confirm'], stall: true };
    expect(w.decide(a)).toBe(true); // applied; its 200 stays out and the stream swallows the resolution
    await w.flush(2100);
    a.io.f = { ...FAIR, hold: 1, only: ['confirm'] };
    a.eng.wake();                   // the snapshot no longer shows the gate
    await w.flush(500);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(0);
    a.io.f = { ...FAIR };
    a.io.release();
    await w.flush(500);
    expect(decided(a), w.trace.join('\n')).toHaveLength(1);
    w.safety();
  });
  it('a lost answer for a gate that already closed frees its journal entry', async () => {
    const w = new World(54, { script: [scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    a.io.f = { ...FAIR, hold: 1, lose: 1, only: ['confirm'] };
    expect(w.decide(a)).toBe(true); // applied; the resolution closes the card while the answer is out
    await w.flush(1000);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(0);
    a.io.f = { ...FAIR, hold: 1, only: ['state'] };   // no snapshot meanwhile: the lost answer alone settles it
    a.io.release();                 // the answer is lost: the gate is over, so the decision settles
    await w.flush(500);
    expect(Object.keys(w.store.read(ACCOUNT).a[ACCOUNT]?.[0]?.da ?? {}), w.trace.join('\n')).toEqual([]);
    a.io.f = { ...FAIR };
    a.io.release();
    await w.flush(500);
    w.safety();
  });
  it('another client\'s resolution, then an older snapshot still showing the gate: the card stays gone', async () => {
    const w = new World(55, { script: [scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    a.io.f = { ...FAIR, hold: 1, only: ['state'] };
    a.eng.wake();                   // a read goes out and stays out
    await w.flush(10);
    const g = (w.agent as any).ss.get(w.sid()).gate;
    await w.agent.confirm(w.sid()!, { gate_id: g.id, generation: g.generation, approved: true, request_id: 'hx-000000000000000000000000' } as any);
    await w.flush(500);             // the resolution frame closes the card
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(0);
    let back = false;
    const un = a.eng.subscribe(() => { if (cardsOf(a.eng.getSnapshot()).length) back = true; });
    a.io.f = { ...FAIR };
    a.io.release();                 // the older snapshot lands
    await w.flush(100);
    un();
    expect(back, 'the resolved card came back, even if only for a moment').toBe(false);
    expect(cardsOf(a.eng.getSnapshot()), w.trace.join('\n')).toHaveLength(0);
    w.safety();
  });
  it('a late answer for an older turn key leaves a newer key from another tab unknown', async () => {
    const w = new World(57, { script: [[{ k: 'text', text: 'one' }], [{ k: 'text', text: 'two' }], [{ k: 'text', text: 'three' }]], pace: 100 });
    const a = await w.tab();
    w.send(a);
    await w.flush(2000);
    const b = await w.tab();
    await w.flush(500);
    a.io.f = { ...FAIR, hold: 1, only: ['turn'] };
    w.send(a);                      // two: admitted; its answer stays out
    await w.flush(1500);            // two runs and ends
    b.io.f = { ...FAIR, drop: 1, only: ['turn'] };
    w.send(b);                      // three, from B: it never leaves, and B cannot tell
    await w.flush(200);
    const lost = (b.io.log.filter(([m]) => m === 'turn').pop()![1] as unknown[])[2] as string;
    a.io.f = { ...FAIR };
    a.io.release();                 // two's answer lands late
    await w.flush(500);
    w.close(a);
    b.io.f = { ...FAIR };
    await w.reload(b);
    await w.flush(2000);
    expect(Object.values(b.eng.getSnapshot().conv.users).find((u) => u.key === lost)?.state, w.trace.join('\n')).toBe('unknown');
    w.safety();
  });
  it('a decision answered after the stream already closed its card still shows its Decided row', async () => {
    const w = new World(50, { script: [scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    a.io.f = { ...FAIR, hold: 1, only: ['confirm'] };
    expect(w.decide(a)).toBe(true); // applied; its 200 stays out while the resolution frame arrives
    await w.flush(1000);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(0);
    a.io.f = { ...FAIR };
    a.io.release();
    await w.flush(500);
    expect(decided(a), w.trace.join('\n')).toHaveLength(1);
    w.safety();
  });
});

void C;

// Orderings across tabs and reloads, part 2.
const pick = (t: Tab, id: string) => cardsOf(t.eng.getSnapshot()).find((c) => c.id === id);
const decideId = (t: Tab, id: string) => { const c = pick(t, id); if (c) t.eng.decide('once', undefined, { id: c.id, generation: c.generation }); };
describe('recon: orderings, part 2', () => {
  it('another tab\'s decision refused 429 frees the card here; a later decision here never stores it again', async () => {
    const w = new World(61, { script: [SCRIPTS[2] as Beat[]], rateLimitOnce: true });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    const b = await w.tab();
    await w.flush(2000);
    const [g, h] = w.agent.parked(w.sid()!).lead as [string, string];
    a.io.f = { ...FAIR, hold: 1, only: ['confirm'] };
    decideId(a, g);                 // its answer is held: B takes the attempt in
    await w.flush(500);
    expect(pick(b, g)?.decidable).toBe(false);
    a.io.f = { ...FAIR };
    a.io.release();                 // 429: A's decision was not applied
    await w.flush(500);
    expect(pick(b, g)?.decidable, w.trace.join('\n')).toBe(true);
    decideId(b, h);
    await w.flush(2000);
    w.close(a);
    await w.reload(b);
    await w.flush(2000);
    expect(pick(b, g)?.decidable, w.trace.join('\n')).toBe(true);
    w.safety();
    await w.recovered();
  });
  it('another tab\'s decision applied while this tab still shows the gate: its card stays closed until its own read, no second decision', async () => {
    const w = new World(72, { script: [scripts.approval] });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    const b = await w.tab();
    await w.flush(2000);
    b.io.f = { ...FAIR, hold: 1, only: ['state'], stall: true };   // B hears nothing for now
    expect(w.decide(a)).toBe(true);
    await w.flush(1500);            // A's answer lands: the gate is over, and A says so in the store
    expect(w.agent.parked(w.sid()!).lead).toEqual([]);
    expect(cardsOf(b.eng.getSnapshot()).map((x) => x.decidable), w.trace.join('\n')).toEqual([false]);
    expect(w.decide(b)).toBe(false);
    b.io.f = { ...FAIR };
    b.io.release();
    await w.flush(3000);
    expect(cardsOf(b.eng.getSnapshot())).toHaveLength(0);
    w.safety();
  });
  it('a refusal is kept for its gate only while the gate is parked: the gate\'s end clears it', async () => {
    const w = new World(74, { script: [SCRIPTS[2] as Beat[]], rateLimitOnce: true });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    const [g] = w.agent.parked(w.sid()!).lead as [string, string];
    const rec = () => w.store.read(ACCOUNT).a[ACCOUNT]?.[0];
    decideId(a, g);                 // 429: refused, the gate stays answerable
    await w.flush(1000);
    expect(Object.keys(rec()?.dr ?? {})).toHaveLength(1);
    decideId(a, g);                 // applied: the gate ends
    await w.flush(2000);
    expect(w.agent.parked(w.sid()!).lead).not.toContain(g);
    expect(rec()?.dr, w.trace.join('\n')).toBeUndefined();
    w.safety();
  });
  it('a definite refusal stays evidence for its gate however many other decisions settle meanwhile: a closed dock reopens with the card answerable', async () => {
    const w = new World(73, { script: [SCRIPTS[2] as Beat[]], rateLimitOnce: true });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    const b = await w.tab();
    await w.flush(2000);
    const [g] = w.agent.parked(w.sid()!).lead as [string, string];
    a.io.f = { ...FAIR, hold: 1, only: ['confirm'] };
    decideId(a, g);                 // its answer is held: B takes the attempt in
    await w.flush(500);
    expect(pick(b, g)?.decidable).toBe(false);
    b.eng.suspend();                // B's dock closes: no storage wakes reach it
    const wake = b.eng.wake.bind(b.eng);
    b.eng.wake = () => {};
    a.io.f = { ...FAIR };
    a.io.release();                 // 429: not applied, the gate stays answerable
    await w.flush(500);
    // Many other decisions settle meanwhile (modelled in the store: more settled request ids than it keeps).
    const st = w.store.read(ACCOUNT);
    const r0 = st.a[ACCOUNT]![0]!;
    const many = Array.from({ length: SETTLED_MAX + 4 }, (_, i) => 'hx-' + (0xabc000 + i).toString(16).padStart(24, '0'));
    (w.store as any).st = { ...st, a: { ...st.a, [ACCOUNT]: [{ ...r0, dg: [...(r0.dg ?? []), ...many].slice(-SETTLED_MAX) }, ...st.a[ACCOUNT]!.slice(1)] } } as any;
    b.eng.wake = wake;
    b.eng.resume();
    await w.flush(3000);
    b.eng.checkNow();
    await w.flush(3000);
    expect(pick(b, g)?.decidable, w.trace.join('\n')).toBe(true);
    w.safety();
  });
  it('A1 another tab\'s ordinary save that read the store before this tab\'s claim never leaves the claim lost', async () => {
    const w = new World(62, { script: [scripts.approval], decisionLost: true, decisionLag: 120_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    const b = await w.tab();
    await w.flush(2000);
    const before = w.store.read(ACCOUNT);
    expect(w.decide(a)).toBe(true); // claimed and stored; its answer is lost
    await w.flush(500);
    w.store.staleNext.set(b.n, before);
    const mark = w.store.writes.length;
    (b.eng as any).save();          // an ordinary save (as a stream's progress saves): it read the store as it was before A's claim
    await w.flush(0);
    expect(w.store.writes.slice(mark).some((st) => !st.a[ACCOUNT]?.[0]?.da), 'the stale save went through\n' + w.trace.join('\n')).toBe(true);
    w.close(a);
    await w.reload(b);
    await w.flush(2000);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.decidable), w.trace.join('\n')).toEqual([false]);
    expect(w.decide(b)).toBe(false);
    w.safety();
  });
  it('A1 a third tab\'s stale save drops another tab\'s decision from the store: a tab that took it in never offers the card meanwhile', async () => {
    const w = new World(69, { script: [scripts.approval], decisionLost: true, decisionLag: 120_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    const b = await w.tab();
    const c = await w.tab();
    await w.flush(2000);
    const before = w.store.read(ACCOUNT);
    expect(w.decide(b)).toBe(true); // its answer is lost
    await w.flush(500);
    expect(cardsOf(a.eng.getSnapshot()).map((x) => x.decidable)).toEqual([false]);
    let offered = false;
    const un = a.eng.subscribe(() => { if (cardsOf(a.eng.getSnapshot()).some((x) => x.decidable)) offered = true; });
    w.store.staleNext.set(c.n, before);
    (c.eng as any).save();          // C's view predates B's claim; A hears the write before B does
    await w.flush(500);
    un();
    expect(offered, 'A offered the card while B\'s decision may still apply\n' + w.trace.join('\n')).toBe(false);
    expect(Object.keys(w.store.read(ACCOUNT).a[ACCOUNT]?.[0]?.da ?? {})).toHaveLength(1);
    w.safety();
  });
  it('A1 a decision another tab settled is not stored again by the tab that sent it, while that tab has not seen the end yet', async () => {
    const w = new World(70, { script: [scripts.approval], decisionLost: true, decisionLag: 3000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    const b = await w.tab();
    await w.flush(2000);
    expect(w.decide(a)).toBe(true); // its answer is lost; the agent applies it three seconds later
    await w.flush(200);
    a.io.f = { ...FAIR, hold: 1, only: ['state'], stall: true };   // A hears nothing more for now
    await w.flush(4000);            // B sees the resolution and settles the decision
    expect(cardsOf(b.eng.getSnapshot())).toHaveLength(0);
    expect(w.store.read(ACCOUNT).a[ACCOUNT]?.[0]?.da, w.trace.join('\n')).toBeUndefined();
    a.io.f = { ...FAIR };
    a.io.release();
    await w.flush(2000);
    w.safety();
  });
  it('A3 eight decisions settled while their answers were out, the page closed, the replay moved on: the next approval is decidable', async () => {
    const gates = Array.from({ length: 8 }, (_, i) => ({ tool: 'bash', params: { command: 'make ' + i } }));
    const w = new World(63, { ringMax: 6, script: [[{ k: 'text', text: 'Eight lanes.' }, { k: 'lanes', gates }, { k: 'text', text: 'Now one more.' }, { k: 'confirm', tool: 'bash', params: { command: 'deploy' } }]] });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    expect(cardsOf(a.eng.getSnapshot())).toHaveLength(8);
    a.io.f = { ...FAIR, hold: 1, only: ['confirm'] };
    for (let i = 0; i < 8; i++) { w.decide(a); await w.flush(300); }
    await w.flush(3000);
    expect(w.agent.parked(w.sid()!).lead).toHaveLength(1);
    w.close(a);                     // the answers never came back
    for (let i = 0; i < 8; i++) (w.agent as any).emit(w.sid(), undefined, 'event.usage_update', { n: i });   // unrelated frames push the old ones out of the replay
    const b = await w.tab();
    await w.flush(3000);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.decidable), w.trace.join('\n')).toEqual([true]);
    w.safety();
    await w.recovered();
  });
  it('A2 a tab opened while another tab\'s decision was stored never stores it again after that tab\'s refusal', async () => {
    const w = new World(65, { script: [scripts.approval], rateLimitOnce: true });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    a.io.f = { ...FAIR, hold: 1, only: ['confirm'] };
    expect(w.decide(a)).toBe(true); // stored; its answer is held
    await w.flush(500);
    const b = await w.tab();        // opens on the record that holds A's decision
    await w.flush(2000);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.decidable)).toEqual([false]);
    a.io.f = { ...FAIR };
    a.io.release();                 // 429: not applied; A lets it go
    await w.flush(500);
    (b.eng as any).save();          // an ordinary save from B's record copy
    w.close(a);
    await w.reload(b);
    await w.flush(2000);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.decidable), w.trace.join('\n')).toEqual([true]);
    w.safety();
  });
  it('A2 a save that runs before this tab hears another tab\'s refusal never stores that decision again', async () => {
    const w = new World(66, { script: [scripts.approval], rateLimitOnce: true });
    const a = await w.tab();
    w.send(a);
    await w.flush(4500);
    const b = await w.tab();
    await w.flush(2000);
    a.io.f = { ...FAIR, hold: 1, only: ['confirm'] };
    expect(w.decide(a)).toBe(true); // B takes it in
    await w.flush(500);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.decidable)).toEqual([false]);
    a.io.f = { ...FAIR };
    a.io.release();                 // 429: A lets it go
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(w.store.read(ACCOUNT).a[ACCOUNT]?.[0]?.da).toBeUndefined();
    (b.eng as any).save();          // B saves before its storage event is delivered
    await w.flush(500);
    w.close(a);
    await w.reload(b);
    await w.flush(2000);
    expect(cardsOf(b.eng.getSnapshot()).map((c) => c.decidable), w.trace.join('\n')).toEqual([true]);
    w.safety();
  });
  it('A3 a snapshot that went out before another tab\'s decision was taken in never retires it', async () => {
    const w = new World(67, { script: [[{ k: 'text', text: 'one' }], scripts.approval], decisionLost: true, decisionLag: 120_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    const b = await w.tab();
    await w.flush(2000);
    b.io.f = { ...FAIR, hold: 1, only: ['state'], stall: true };
    b.eng.wake();
    w.send(a);                      // the next turn parks an approval
    await w.flush(4500);            // B's reads are held, its stream is dead: B has not seen the gate
    const g = w.agent.parked(w.sid()!).lead[0] as string;
    decideId(a, g);                 // its answer is lost (the agent applies it two minutes later): B takes it in
    await w.flush(500);
    b.io.f = { ...FAIR, stall: true };
    b.io.release();                 // B's older snapshots (no gate yet) land; a later read shows the gate
    await w.flush(40_000);
    expect(pick(b, g)?.decidable, w.trace.join('\n')).toBe(false);
    w.safety();
  });
  it('A3 a snapshot that shows a gate before its ref never retires another tab\'s decision on it', async () => {
    const w = new World(68, { script: [[{ k: 'text', text: 'one' }], scripts.approval], refLagMs: 6000, decisionLost: true, decisionLag: 120_000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(3000);
    const b = await w.tab();
    await w.flush(2000);
    b.io.f = { ...FAIR, stall: true };   // B learns of the gate from snapshots only
    w.send(a);                      // the next turn parks an approval
    await w.flush(4500);
    const g = w.agent.parked(w.sid()!).lead[0] as string;
    expect(g).toBeTruthy();
    decideId(a, g);                 // its answer is lost (the agent applies it two minutes later)
    await w.flush(500);             // B takes it in and reads: the gate shows without its ref (being addressed)
    await w.flush(40_000);          // the ref is published and read
    expect(pick(b, g)?.decidable, w.trace.join('\n')).toBe(false);
    w.safety();
  });
  it('a stream lost while a resync\'s reads are out never stacks a second resync on them', async () => {
    const w = new World(64, { script: [scripts.approval], stateGapMs: 4000, replayGapMs: 4000 });
    const a = await w.tab();
    w.send(a);
    await w.flush(500);
    a.eng.checkNow();               // a resync: its reads take four seconds
    await w.flush(100);
    a.io.dropStream();
    await w.flush(1500);            // the stream's retry read is out too
    a.eng.checkNow();
    await w.flush(100);
    w.safety();
    await w.recovered();
  });
});

// The Broadcaster's test rig: fake capture, recorder, pipe (upload + progress) and alias service, driven by hand.
// Tests only (never imported by the page).
import { vi } from 'vitest';
import { Broadcaster, type BroadcastDeps, type Outcome, type ProgressCallbacks } from '../broadcaster';
import type { BroadcastAlias } from '../link';
import type { UploadResult } from '../sender';
import { Recorder, fakeStream, flush } from './fakes';

export const computer = { id: 'c1', name: 'Box', project_id: 'p1', server_name: 'sv1' };
export const other = { ...computer, id: 'c2' };
export const live = (n = 1) => JSON.stringify({ state: 'streaming', hasSender: true, activeReceivers: n, live: true });

export function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const p = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; }

export function rig(o: { pick?: () => Promise<MediaStream> } = {}) {
  const timers: Array<{ fn: () => void; ms: number; dead: boolean }> = [];
  const uploads: Array<{ name: string; transfer: string; key: string; signal: AbortSignal; answer(r: UploadResult): void; fail(): void }> = [];
  const progress: Array<{ name: string; cb: ProgressCallbacks; closed: boolean }> = [];
  const creates: Array<{ v: { computer: string; name: string }; d: ReturnType<typeof deferred<Outcome<BroadcastAlias | null>>> }> = [];
  const removes: Array<{ v: { computer: string; alias: string }; d: ReturnType<typeof deferred<Outcome<unknown>>> }> = [];
  const renews: Array<{ v: { computer: string; alias: string; until: string }; d: ReturnType<typeof deferred<Outcome<unknown>>> }> = [];
  const visFns = new Set<() => void>();
  let hidden = false;
  const ctx = { alive: true };
  const streams: Array<ReturnType<typeof fakeStream>> = [];
  const deps: BroadcastDeps = {
    getDisplayMedia: vi.fn(o.pick ?? (async () => { const s = fakeStream(); streams.push(s); return s.stream; })),
    MediaRecorder: Recorder,
    upload: (_t, name, transfer, key, body, _m, signal) => new Promise((resolve, reject) => {
      uploads.push({ name, transfer, key, signal, answer: resolve, fail: () => reject(new Error('net')) });
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      void body.getReader().read();
    }),
    openProgress: (_t, name, cb) => { const h = { name, cb, closed: false }; progress.push(h); return { close: () => { h.closed = true; } }; },
    createLink: (v) => { const d = deferred<Outcome<BroadcastAlias | null>>(); creates.push({ v, d }); return d.p; },
    removeLink: (v) => { const d = deferred<Outcome<unknown>>(); removes.push({ v, d }); return d.p; },
    checkCreate: vi.fn(async () => true),
    renewLink: (v) => { const d = deferred<Outcome<unknown>>(); renews.push({ v, d }); return d.p; },
    checkRemove: vi.fn(async () => true),
    checkRenew: vi.fn(async () => true),
    findLink: vi.fn(async () => null),
    capture: () => ctx,
    alive: (c) => c === ctx && ctx.alive,
    now: () => 1_000_000,
    setTimeout: (fn, ms) => { const t = { fn, ms, dead: false }; timers.push(t); return t; },
    clearTimeout: (t) => { (t as { dead: boolean }).dead = true; },
    visibility: { hidden: () => hidden, on: (fn) => { visFns.add(fn); return () => visFns.delete(fn); } },
  };
  const b = new Broadcaster(deps);
  const fire = (ms: number) => { for (const t of timers.filter((x) => x.ms === ms && !x.dead)) { t.dead = true; t.fn(); } };
  const setHidden = (h: boolean) => { hidden = h; for (const fn of [...visFns]) fn(); };
  /** A realm or account switch: the context of Start is no longer the current one. */
  const switchRealm = () => { ctx.alive = false; };
  return { b, deps, timers, uploads, progress, creates, removes, renews, streams, fire, setHidden, visFns, switchRealm };
}

export const alias = (name: string, o: Partial<BroadcastAlias> = {}): BroadcastAlias => ({ id: 'al1', name, url: 'https://abc.sv1.alias.test', enabled: true, expiresAt: '', createdAt: '', ...o });

export async function goLive(r: ReturnType<typeof rig>, c = computer) {
  void r.b.start(c, { audio: false, area: null });
  await flush();
  r.progress.at(-1)!.cb.onEvent('state', live(2));
  await flush();
}


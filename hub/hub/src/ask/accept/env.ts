// The world the journal's acceptance tests run in: core booted as a signed-in tab, the three Ask journal keys
// registered in shared.js (the real rows), `localStorage` replaced by the
// production-faithful FakeLocalStorage, and the REAL core partitioned() adapter on top of it. Nothing about the journal's
// storage is stubbed: the only fake things are the browser's storage bytes (with its faults) and the agent.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';
import { boot, OTHER, UID } from '../../core/test/env';
import { setIdentity } from '../../core/ctx';
import { AskEngine, type Slot, type StoreIO } from '../engine';
import { FakeAgent, manualClock, type FakeOptions } from '../fake';
import * as J from '../journal';
import { bindDestForTests, resetPageForTests } from '../journal/testing';
import { FakeLocalStorage, installFakeStorage } from './storage-fake';

export { OTHER, UID };
export const ACCOUNT = UID;
export const REALM = 'f1f1f1f1f1f1f1f1f1f1f1f1';
export const HANDLE = 'atlas.tlas';
export const HANDLE2 = 'orion.ion1';
export const REQ = 'hub_ai_req_v1';
export const MIG = 'hub_ai_mig_v1';
export const LEASE = 'hub_ai_lease_v1';
export const JOURNAL = 'hub_ai_journal_v1';
export const slot: Slot = { account: ACCOUNT, project: '6a0000000000000000000001', computer: 'c0a7150000000000000000a1', realm: REALM, name: 'atlas' };
/** A well-formed request key (hx- + 32 hex) and a decision request id (hx- + 24 hex). */
export const KEY = (c: string) => 'hx-' + c.repeat(32);
export const RID = (c: string) => 'hx-' + c.repeat(24);

export interface World {
  fs: FakeLocalStorage;
  clock: ReturnType<typeof manualClock>;
  agent: FakeAgent;
  /** This tab's journal (the real boxes over the fake storage). */
  j: J.Journal;
  /** A second tab's journal (its own in-memory state, the same storage bytes). */
  jB: J.Journal;
  flush(ms?: number): Promise<void>;
  /** A dock engine for the computer (this tab), opened and settled. */
  dock(): Promise<AskEngine>;
  /** A second dock over tab B's journal: a page reloaded after an unsettled create (its rows have no text). */
  dockB(): Promise<AskEngine>;
  /** An engine pinned to one session, on tab A (j) or tab B (jB). */
  pinned(sid: string, tab?: 'A' | 'B'): AskEngine;
  /** Run an action as the other tab (its storage writes reach this tab as storage events). */
  asB<T>(fn: () => T): T;
  /** Wire the registry's storage listener for these engines: a storage event heals and wakes them. */
  listen(...engines: AskEngine[]): void;
  dispose(): void;
}

export interface WorldOptions extends Partial<FakeOptions> {
  quota?: number;
}

/** A fresh tab and agent. Call dispose() (afterEach). */
export function world(o: WorldOptions = {}): World {
  resetPageForTests();                      // a fresh page: no cached boxes, claims or consumed tickets
  boot();                                   // signs in UID on the native happy-dom storage, real shared.js
  const native = globalThis.localStorage;
  const fs = new FakeLocalStorage();
  for (let i = 0; i < native.length; i++) { const k = native.key(i)!; fs.seed(k, native.getItem(k)!); }
  const restore = installFakeStorage(fs);
  if (o.quota !== undefined) fs.quota = o.quota;
  setIdentity({ id: ACCOUNT, banned: false });
  const clock = manualClock();
  const { quota: _q, ...fo } = o;
  const agent = bindDestForTests(new FakeAgent({ account: ACCOUNT, pace: 10, realms: [REALM], ...fo }, clock), slot.computer);
  const j = new J.Journal();
  const jB = new J.Journal();
  const listeners: Array<() => void> = [];
  const flush = async (ms = 0) => {
    const drain = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); clock.run(0); } };
    await drain();
    for (let left = ms; left > 0; left -= 10) { clock.run(Math.min(10, left)); await drain(); }
  };
  const w: World = {
    fs, clock, agent, j, jB, flush,
    async dock() {
      const eng = new AskEngine(slot, agent, memStore(), clock, { journal: { j, handle: HANDLE } });
      eng.open();
      await flush();
      return eng;
    },
    async dockB() {
      const store = { read: (a: string) => jB.dockRead(a, { v: 1, a: {} }), apply: (a: string, op: any) => jB.dockApply(a, op) } as StoreIO;
      const eng = new AskEngine(slot, agent, store, clock, { journal: { j: jB, handle: HANDLE } });
      eng.open();
      await flush(900);
      return eng;
    },
    pinned(sid, tab = 'A') {
      const jj = tab === 'A' ? j : jB;
      return new AskEngine(slot, agent, jj.view(HANDLE, sid), clock, { sid, journal: { j: jj, handle: HANDLE } });
    },
    asB: (fn) => fs.asTab('B', fn),
    listen(...engines) {
      const wake = (e: Event) => {
        const k = (e as StorageEvent).key;
        if (k !== null && k !== JOURNAL && k !== REQ) return;
        for (const eng of engines) { eng.heal(); eng.wake(); }
      };
      globalThis.addEventListener('storage', wake);
      listeners.push(() => globalThis.removeEventListener('storage', wake));
    },
    dispose() {
      for (const l of listeners.splice(0)) l();
      restore();
    },
  };
  return w;
}

function memStore(): StoreIO {
  let st: any = { v: 1, a: {} };
  return { read: () => JSON.parse(JSON.stringify(st)), write: (_a: string, s: any) => { if (s) st = JSON.parse(JSON.stringify(s)); } } as any;
}

/** Switch the account core shows (the journal's real boxes follow it). */
export function showAccount(id: string): void { setIdentity({ id, banned: false }); }

// ---- small readers used by the tests ----
export const users = (snap: any, C: any) => C.blocks(snap.conv, 0).filter((b: any) => b.k === 'user').map((b: any) => b.msg);
export const posts = (agent: FakeAgent, m: string) => agent.log.filter((x) => x[0] === m);
/** Stored request entries read straight from the fake bytes (not through the code under test). */
export function storedEntries(fs: FakeLocalStorage, account = ACCOUNT): Array<{ k: string; kind: string; h: string; r: string; s: string | null; c: string; g?: string }> {
  const raw = fs.peek(REQ);
  if (!raw) return [];
  try {
    const doc = JSON.parse(raw);
    const m = doc?.a?.[account];
    if (!m || typeof m !== 'object') return [];
    return Object.entries(m).filter(([k]) => !k.startsWith('~')).map(([, v]) => v as any);
  } catch { return []; }
}
export const storedKeys = (fs: FakeLocalStorage, account = ACCOUNT) => storedEntries(fs, account).map((e) => e.k);
export const tick = () => new Promise<void>((r) => setTimeout(r, 0));
export async function settleReal(n = 30): Promise<void> { for (let i = 0; i < n; i++) await tick(); }
export const never = <T = never>() => new Promise<T>(() => {});
void vi;

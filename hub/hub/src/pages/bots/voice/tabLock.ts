// tabLock.ts: one Talk per Bot in this browser. A Web Lock named for the computer, realm and Bot
// is held while a voice socket is up. Taking over asks the holder over a BroadcastChannel to end, then waits for the lock.
// What it promises:
//   - `acquire` answers a release function, or null when another tab holds the lock (and, on a take over, kept it past
//     TAKEOVER_WAIT_MS). It never throws. A release is safe to call twice, and its promise says when the lock can be
//     taken again: the browser lets go only after the holder's promise reaction, so a request in the same task, or the
//     next microtask, would be refused by this tab's own lock (Chromium, Firefox and WebKit alike).
//   - A browser without Web Locks has no lock to take: acquire answers a release that does nothing, and the agent's own
//     voice_busy refusal is then the only guard.
//   - While the lock is held, an "end" asked by another tab calls `onAsked`, once per ask. After release nothing does.

import { hostEnv, type HostChannel, type HostLocks } from '@core';

export const TAKEOVER_WAIT_MS = 3000;

export interface LockEnv {
  locks: HostLocks | null;
  channel(name: string): HostChannel | null;
  timer(ms: number, fn: () => void): () => void;
}

export const lockName = (w: { computer: string; realm: string; bot: string }): string => `hoody-bot-voice:${w.computer}:${w.realm}:${w.bot}`;

export function browserLockEnv(): LockEnv {
  return {
    get locks() { return hostEnv().locks; },
    channel: (name) => hostEnv().channel(name),
    timer(ms, fn) {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
  };
}

const END = 'end';

export type TabLockRelease = () => Promise<void>;

export async function acquireTabLock(env: LockEnv, name: string, takeover: boolean, onAsked: () => void): Promise<TabLockRelease | null> {
  const openChannel = () => {
    try { return env.channel(name); } catch { return null; }
  };
  if (!env.locks) return () => Promise.resolve();
  if (takeover) {
    const c = openChannel();
    try { c?.post(END); } catch { /* a closed channel asks no one */ }
    try { c?.close(); } catch { /* closed already */ }
  }
  let abort: AbortController | null = null;
  let cancelWait: (() => void) | null = null;
  if (takeover && typeof AbortController === 'function') {
    const a = (abort = new AbortController());
    cancelWait = env.timer(TAKEOVER_WAIT_MS, () => a.abort());
  }
  return new Promise<TabLockRelease | null>((resolve) => {
    const opts = takeover ? (abort ? { signal: abort.signal } : {}) : { ifAvailable: true };
    let settled = false;
    const answer = (r: TabLockRelease | null) => {
      if (settled) { void r?.(); return; }
      settled = true;
      resolve(r);
    };
    let freed: Promise<unknown> = Promise.resolve();
    freed = env.locks!.request(name, opts, (lock) => {
      cancelWait?.();
      if (lock === null) { answer(null); return Promise.resolve(); }
      return new Promise<void>((done) => {
        const ch = openChannel();
        const off = ch?.onMessage((m) => { if (m === END) onAsked(); });
        let landed: Promise<void> | null = null;
        answer(() => {
          if (landed) return landed;
          off?.();
          if (ch) { try { ch.close(); } catch { /* closed already */ } }
          done();
          landed = freed.then(() => undefined, () => undefined).then(() => new Promise<void>((res) => { env.timer(0, res); }));
          return landed;
        });
      });
    }).catch(() => { cancelWait?.(); answer(null); });
  });
}

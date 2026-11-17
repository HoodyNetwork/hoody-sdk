// The browser's Env for the provider flows: timers, clock, visibility, a fresh
// Idempotency-Key and the key fingerprint (first 8 bytes of SHA-256, hex, as the agent reports it). `alive`
// follows the page's context: flows end quietly once it is false.
import type { Env, Stop } from './api';
import { hostEnv } from '../host-env';

/** `scale` shortens every wait (fixtures at instant latency use 1/1000 so a read-back at 2, 8 and 25 s shows in a shot). */
export function browserEnv(alive: () => boolean, scale = 1): Env {
  return {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms * scale)),
    now: () => Date.now(),
    hidden: () => { try { return !hostEnv().visible(); } catch { return false; } }, // no document: not hidden, as before
    visible: (stop: Stop) =>
      new Promise<void>((resolve) => {
        let off: (() => void) | null = null;
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          if (off) off();
          stop.wake = undefined;
          resolve();
        };
        const check = () => {
          if (hostEnv().visible() || stop.stopped) done();
        };
        stop.wake = done;
        off = hostEnv().onVisibilityChange(check);
        if (finished) off(); // a host that calls back inside the registration finished the wait before `off` existed
        check();
      }),
    newKey: () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    digest: async (secret) => {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
        return Array.from(new Uint8Array(buf).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        return null;
      }
    },
    alive,
  };
}

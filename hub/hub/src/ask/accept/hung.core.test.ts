// Acceptance, CORE: the REAL core api() and liveIO with a request that is never answered (it
// ends only when the exchange aborts it, as a real fetch does). A create, a turn and a command (message and stop) are agent routes,
// so core sends them through a kit plan bounded by route.timeoutMs or the kit default (core/kit.ts TIMEOUT): past it the send ends,
// and because the entry was journaled before the wire it ends UNKNOWN (C9: it may have been admitted), never failed and never
// "Sending…". The entry stays for the by-key read, and nothing is sent again.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, calls, onFetch, GATEWAY_VERSION, TARGET, UID, R1 } from '../../core/test/env';
import { setIdentity } from '../../core/ctx';
import { liveIO, routes } from '../data';
import { createBody } from '../logic';
import { Journal, SendToken, guardIO, type Op } from '../journal';
import { resetPageForTests } from '../journal/testing';

const K = (c: string, n = 32) => 'hx-' + c.repeat(n);
const base = () => ({ acct: UID, container: TARGET.container.id, h: 'atlas.tlas', r: R1 });
const KIT_DEFAULT = 30000; // core/kit.ts TIMEOUT: an agent route without its own timeoutMs
afterEach(() => { vi.useRealTimers(); });

const ops: Array<[string, number | undefined, (k: string) => Op, (g: any, k: string, t: any) => Promise<unknown>]> = [
  ['create', routes.create.timeoutMs, (k) => ({ ...base(), route: 'create', key: k }) as Op, (g, k, t) => g.create(createBody(R1, TARGET.container.id)!, k, R1, [t])],
  ['turn', routes.turn.timeoutMs, (k) => ({ ...base(), route: 'turn', key: k, sid: 's1', c: K('1'), files: false }) as Op, (g, k, t) => g.turn('s1', 'hi', k, R1, undefined, undefined, [t])],
  ['command', routes.command.timeoutMs, (k) => ({ ...base(), route: 'command', key: k, sid: 's1', c: K('1'), cmd: 'message' }) as Op, (g, k, t) => g.command('s1', 'hi', k, R1, [t])],
  ['stop', routes.command.timeoutMs, (k) => ({ ...base(), route: 'command', key: k, sid: 's1', c: K('1'), cmd: 'stop' }) as Op, (g, k, t) => g.stop('s1', k, R1, [t])],
];

describe('a send the agent never answers ends unknown at its route\'s bound, kept and not sent again', () => {
  for (const [route, ms, mk, call] of ops) {
    it(`${route}: unknown past its bound, the entry kept, one wire request`, async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      resetPageForTests();
      boot();
      setIdentity({ id: UID, banned: false });
      // The create reads /version first (gatedCreate): that answers at once; the send itself is never answered (admitted or not, the answer never comes before the abort).
      onFetch((c) => (c.method === 'GET' && /\/version$/.test(new URL(c.url).pathname) ? { status: 200, body: GATEWAY_VERSION } : { status: 200, delayMs: 2_000_000_000 }));
      const j = new Journal();
      const g = guardIO(liveIO(TARGET), { acct: UID, container: TARGET.container.id }) as any;
      const k = j.mint((route === 'stop' ? 'command' : route) as any)!;
      const a = j.admit(mk(k), new SendToken()) as any;
      expect('kind' in a, JSON.stringify(a)).toBe(false);
      const before = calls.length;
      let out: any = 'still sending';
      void j.post(a, (t) => call(g, k, t)).then((o) => { out = o; });
      await vi.advanceTimersByTimeAsync((ms ?? KIT_DEFAULT) + 1000);
      expect(out, 'the send ended').not.toBe('still sending');
      expect(out).toMatchObject({ kind: 'sent', v: { t: 'unknown' } });
      expect(j.pending().some((e: any) => e.k === k), 'the entry is kept for the by-key read').toBe(true);
      await vi.advanceTimersByTimeAsync(300_000);
      expect(calls.slice(before).filter((c) => c.method === 'POST'), 'sent once, never again').toHaveLength(1);
    });
  }
});

// A temporary program's stop holds its C9 lock until a fresh read PROVES it:
// the temp-stop route takes no idempotency key, so a lock freed without proof would let the
// next press send a second stop. The program gone from the read, or reading stopped, proves it; a read still
// showing it running, or no fresh read, proves nothing.
import { describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { temporaryStopProves as tempProves } from '@core';
import { routes } from './data';
import { many } from './fixtures';
import type { RawOverview } from './logic';

type Opts = { lock?: string; lockKey?: (v: unknown) => unknown; proves?: unknown; reads?: unknown[]; input?: (v: unknown) => { target?: unknown } };
const declared = vi.hoisted(() => new Map<unknown, Opts>());
vi.mock('@core', async (orig) => {
  const core = await orig<typeof Core>();
  return {
    ...core,
    defineMutation: (route: unknown, opts: Opts) => {
      declared.set(route, opts);
      return (core.defineMutation as (r: unknown, o: unknown) => unknown)(route, opts);
    },
  };
});

const QID = 'quick_1760000000_1';
const withTemp = (status: string | null): RawOverview => ({
  ...many,
  temporary: status === null ? [] : (many.temporary ?? []).map((t) => (t.temporary_id === QID ? { ...t, status } : t)),
});

describe('programs: a temporary stop is freed only by proof', () => {
  it('the temp stop declares its own lock and a proves, so a plain fresh read never frees it', () => {
    const m = declared.get(routes.tempStop);
    expect(m?.lock).toBe('daemon.temporary.stop');
    expect(m?.lockKey?.({ id: QID })).toEqual({ id: QID });
    expect(typeof m?.proves).toBe('function');
    expect(m?.reads?.length).toBe(1);
  });

  it('the temp stop goes to the computer of the press, so Check completes the lock on that computer', () => {
    const target = { project: { id: 'p'.repeat(24) }, container: { id: 'a'.repeat(24), server_name: 'n12' } };
    expect(declared.get(routes.tempStop)?.input?.({ id: QID, port: null, target }).target).toBe(target);
  });

  it('a read without the program, or with it stopped, proves the stop', () => {
    expect(tempProves({ id: QID }, [[withTemp(null)]])).toBe('applied');
    expect(tempProves({ id: QID }, [[withTemp('exited')]])).toBe('applied');
    expect(tempProves({ id: QID }, [[withTemp('stopped')]])).toBe('applied');
  });

  it('a read still showing it running, an unreadable answer or no fresh answer proves nothing', () => {
    expect(tempProves({ id: QID }, [[withTemp('running')]])).toBeUndefined();
    expect(tempProves({ id: QID }, [[withTemp('backoff')]])).toBeUndefined();
    expect(tempProves({ id: QID }, [[{ nope: true }]])).toBeUndefined();
    expect(tempProves({ id: QID }, [[]])).toBeUndefined();
    expect(tempProves({ id: QID }, [])).toBeUndefined();
    expect(tempProves(undefined, [[withTemp(null)]])).toBeUndefined();
  });

  it('an overview without the temporary list proves nothing about a temporary program', () => {
    const { temporary: _gone, ...noList } = withTemp('running');
    expect(tempProves({ id: QID }, [[noList]])).toBeUndefined();
  });
});

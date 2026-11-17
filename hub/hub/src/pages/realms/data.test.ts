// Vitest: the New realm page's live I/O hands its own liveness to every computer write, so the transport stops
// a PUT that is still waiting (core's lock, a sign-in) once the page is left.
import { describe, expect, it } from 'vitest';
import { liveIo, setRealmsInput, type SetRealms } from './data';

describe('live computer writes', () => {
  it('carry the page liveness down to the PUT input, and it turns false once the page is left', async () => {
    let mounted = true;
    const seen: Parameters<SetRealms['mutateAsync']>[0][] = [];
    const m: SetRealms = {
      mutateAsync: async (v) => { seen.push(v); return { outcome: 'done' }; },
      holdOf: async () => undefined,
      heldByOther: async () => undefined,
      complete: async () => false,
      dismiss: async () => false,
    };
    const io = liveIo(m, () => mounted);
    expect(await io.writeRealms('c'.repeat(24), ['a'.repeat(24)])).toEqual({ outcome: 'done' });
    const v = seen[0]!;
    const input = setRealmsInput(v) as { still?: () => boolean; body: unknown };
    expect(input.body).toEqual({ realm_ids: ['a'.repeat(24)] });
    expect(input.still?.()).toBe(true);
    mounted = false;
    expect(input.still?.()).toBe(false);
    expect(await io.writeRealms('c'.repeat(24), ['a'.repeat(24)])).toEqual({ outcome: 'failed', notSent: true });
    expect(seen).toHaveLength(1);
  });

  it('say how a settle ended: another page holds it, core kept it, or no hold is left', async () => {
    const base = { mutateAsync: async () => ({ outcome: 'done' }), holdOf: async () => 'h1' as string | undefined, heldByOther: async () => undefined as unknown, complete: async () => true, dismiss: async () => true };
    const c = 'c'.repeat(24), set = ['a'.repeat(24)];
    expect(await liveIo({ ...base, heldByOther: async () => ({ page: 'computers' }) }, () => true).settleRealms(c, set, 'dismiss')).toBe('other');
    expect(await liveIo({ ...base, dismiss: async () => false }, () => true).settleRealms(c, set, 'dismiss')).toBe('kept');
    expect(await liveIo(base, () => true).settleRealms(c, set, 'dismiss', 'h1')).toBe('settled');
    expect(await liveIo({ ...base, holdOf: async () => undefined }, () => true).settleRealms(c, set, 'applied')).toBe('settled');
  });
});

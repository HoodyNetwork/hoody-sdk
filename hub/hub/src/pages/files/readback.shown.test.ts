// Vitest: a Check again judges only the holds its control shows (core readBack({ hold })).
// Each call carries its own proof slot; `out.notApplied` only when every shown hold's own
// read proved it not made (its slot set), never from a false answer alone or a bare read-back.
import { describe, expect, it, vi } from 'vitest';
import { readBackShown } from './data';

type Only = { hold: string; proof?: { notApplied: boolean } };
const holdsOf = (calls: readonly (readonly unknown[])[]) => calls.map((c) => (c[0] as Only | undefined)?.hold);

describe('readBackShown', () => {
  it('reads back each shown hold on its own, once each, true only when every one was proved', async () => {
    const rb = vi.fn(async (only?: Only) => only?.hold !== 'b');
    expect(await readBackShown(rb, ['a'])).toBe(true);
    expect(holdsOf(rb.mock.calls)).toEqual(['a']);
    rb.mockClear();
    expect(await readBackShown(rb, ['a', 'b', 'a'])).toBe(false);
    expect(holdsOf(rb.mock.calls)).toEqual(['a', 'b']);
  });
  it('falls back to the whole read-back when nothing is shown or a shown hold has no send token', async () => {
    const rb = vi.fn(async () => true);
    expect(await readBackShown(rb, [])).toBe(true);
    expect(await readBackShown(rb, ['a', undefined])).toBe(true);
    expect(rb.mock.calls).toEqual([[], []]);
  });
  it('says "not made" only when every shown hold\'s own read set its slot', async () => {
    // `made`: which holds' reads prove not made (set their slot); every answer is false.
    const rbOf = (made: readonly string[]) => vi.fn(async (only?: Only) => {
      if (only?.proof && made.includes(only.hold)) only.proof.notApplied = true;
      return false;
    });
    const out = { notApplied: true };
    expect(await readBackShown(rbOf(['a', 'b']), ['a', 'b'], out)).toBe(false);
    expect(out.notApplied, 'every shown hold proved not made').toBe(true);
    expect(await readBackShown(rbOf(['a']), ['a', 'b'], out)).toBe(false);
    expect(out.notApplied, 'one shown hold proved nothing').toBe(false);
    out.notApplied = true;
    expect(await readBackShown(rbOf([]), ['a'], out)).toBe(false);
    expect(out.notApplied, 'a false answer alone').toBe(false);
    out.notApplied = true;
    expect(await readBackShown(rbOf(['a']), ['a', undefined], out)).toBe(false);
    expect(out.notApplied, 'a bare read-back').toBe(false);
    // Each read gets a fresh slot of its own.
    const rb = rbOf(['a', 'b']);
    await readBackShown(rb, ['a', 'b'], out);
    const slots = rb.mock.calls.map((c) => (c[0] as Only).proof);
    expect(slots[0]).not.toBe(slots[1]);
  });
});

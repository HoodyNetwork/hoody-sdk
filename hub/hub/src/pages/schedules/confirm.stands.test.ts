// Vitest: an open loop question (turn it back on, or run once) closes when a poll changes which one the row asks,
// instead of rewording itself under the person's pointer; a delete question is not tied to the loop's state.
import { describe, expect, it } from 'vitest';
import { confirmStands, type SchedRow } from './logic';

const row = (confirm: SchedRow['confirm']) => ({ confirm }) as SchedRow;

describe('confirmStands', () => {
  it('keeps the loop question while the row asks the same one', () => {
    expect(confirmStands({ kind: 'loop', variant: 'resume' }, row('resume'))).toBe(true);
    expect(confirmStands({ kind: 'loop', variant: 'once' }, row('once'))).toBe(true);
  });
  it('closes it when the row now asks the other one or none', () => {
    expect(confirmStands({ kind: 'loop', variant: 'resume' }, row('once'))).toBe(false);
    expect(confirmStands({ kind: 'loop', variant: 'once' }, row(undefined))).toBe(false);
  });
  it('leaves a delete question alone', () => {
    expect(confirmStands({ kind: 'delete' }, row('resume'))).toBe(true);
  });
});

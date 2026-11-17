// Vitest: which held changes leave on/off unknown. Run now on an errored loop also turns it back
// on (its confirm is 'resume'), so while that run is held its switch shows nothing settled; running a paused loop once
// changes nothing about on/off.
import { describe, expect, it } from 'vitest';
import type { SchedRow } from './logic';
import { type Op, onOffUnknown } from './parts/ops';

const row = (confirm: SchedRow['confirm']) => ({ confirm }) as SchedRow;
const op = (act: Op['act'], status: Op['status'], r?: SchedRow): Op => ({ act, status, ...(r ? { row: r } : {}) });

describe('onOffUnknown', () => {
  it('a held turn on/off of any source', () => {
    for (const act of ['pause', 'curl.pause', 'loop.pause'] as const) {
      expect(onOffUnknown(op(act, 'unknown'))).toBe(true);
      expect(onOffUnknown(op(act, 'working'))).toBe(true);
      expect(onOffUnknown(op(act, 'failed'))).toBe(false);
    }
  });

  it('a held Run now that resumes an errored loop', () => {
    expect(onOffUnknown(op('loop.run', 'unknown', row('resume')))).toBe(true);
    expect(onOffUnknown(op('loop.run', 'working', row('resume')))).toBe(true);
    expect(onOffUnknown(op('loop.run', 'failed', row('resume')))).toBe(false);
    expect(onOffUnknown(op('loop.run', 'refused', row('resume')))).toBe(false);
  });

  it('not a run once of a paused loop, nor other acts', () => {
    expect(onOffUnknown(op('loop.run', 'unknown', row('once')))).toBe(false);
    expect(onOffUnknown(op('loop.run', 'unknown', row(undefined)))).toBe(false);
    expect(onOffUnknown(op('loop.run', 'unknown'))).toBe(false);
    expect(onOffUnknown(op('run', 'unknown', row('resume')))).toBe(false);
    expect(onOffUnknown(op('save', 'unknown'))).toBe(false);
    expect(onOffUnknown(undefined)).toBe(false);
  });
});

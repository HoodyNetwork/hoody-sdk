// Vitest (New script): the bytes sent are the bytes checked; a stale verdict cannot unlock Make it live;
// a schedule, code, computer or folder change drops the verdict; withSchedule writes exactly one Hub-owned schedule line.
import { describe, expect, it } from 'vitest';
import { header, withSchedule, type Verdict } from '../logic';
import { bytesToSend, sha256Hex, snapshotOf, verdictFor, verdictHolds, type Snapshot } from './snapshot';

const READY: Verdict = { verdict: 'ready', errors: [], missing: [] };
const AT = { project: 'p1', compId: 'c1', exec: 1 };
const snap = async (code: string, schedule: string | null, at = AT): Promise<Snapshot> => { const r = await snapshotOf(code, schedule, at); if (!r.ok) throw new Error(r.why); return r.snapshot; };

describe('withSchedule', () => {
  it('a schedule the kit reads after other syntax on its line (a block comment ending there) is refused, never cut with it', () => {
    const text = '/* heading\n*/ // @schedule 0 8 * * 1\nexport default 1;';
    expect(header(text).schedules).toEqual([1]);
    expect(withSchedule(text, null)).toEqual({ error: 'unplaceable' });
    expect(withSchedule(text, '0 9 * * 1')).toEqual({ error: 'unplaceable' });
  });
  it('adds one schedule line at the end of the header; replaces every existing one in the first one\'s place', () => {
    expect(withSchedule('// @label X\nexport default 1;', '0 8 * * 1')).toEqual({ text: '// @label X\n// @schedule 0 8 * * 1\nexport default 1;' });
    const two = '// @schedule 1 1 * * *\n// @label X\n  // @schedule 2 2 * * *\nexport default 1;';
    expect(withSchedule(two, '0 8 * * 1')).toEqual({ text: '// @schedule 0 8 * * 1\n// @label X\nexport default 1;' });
    expect(header((withSchedule(two, '0 8 * * 1') as { text: string }).text).schedules).toHaveLength(1);
  });
  it('null removes every schedule line, an empty one too; without one the code is unchanged', () => {
    expect(withSchedule('// @schedule 1 1 * * *\n// @schedule\nexport default 1;', null)).toEqual({ text: 'export default 1;' });
    expect(withSchedule('export default 1;', null)).toEqual({ text: 'export default 1;' });
  });
  it('refuses a schedule that could carry a second directive or is not five fields; refuses an unplaceable header', () => {
    expect(withSchedule('x', '0 8 * *\n// @token k')).toEqual({ error: 'bad_schedule' });
    expect(withSchedule('x', '0 8 * *')).toEqual({ error: 'bad_schedule' });
    expect(withSchedule('#!/usr/bin/env bun\nx', '0 8 * * 1')).toEqual({ error: 'unplaceable' });
    expect(withSchedule('/* open\nx', '0 8 * * 1')).toEqual({ error: 'unplaceable' });
  });
  it('a schedule-like line below the header is code, never touched', () => {
    expect(withSchedule('export default 1;\n// @schedule 9 9 * * *', null)).toEqual({ text: 'export default 1;\n// @schedule 9 9 * * *' });
  });
});

describe('the reviewed snapshot', () => {
  it('the bytes sent are the bytes checked, hashed', async () => {
    const s = await snap('export default 1;', '0 8 * * 1');
    expect(s.bytes).toBe('// @schedule 0 8 * * 1\nexport default 1;');
    expect(s.hash).toBe(await sha256Hex(s.bytes));
    expect(await bytesToSend(verdictFor(s, READY), s)).toBe(s.bytes);
  });
  it('a verdict of other bytes, schedule, project, computer or folder never holds and sends nothing', async () => {
    const s = await snap('export default 1;', '0 8 * * 1');
    const v = verdictFor(s, READY);
    for (const other of [await snap('export default 2;', '0 8 * * 1'), await snap('export default 1;', '0 9 * * 1'), await snap('export default 1;', null), await snap('export default 1;', '0 8 * * 1', { project: 'p1', compId: 'c2', exec: 1 }), await snap('export default 1;', '0 8 * * 1', { project: 'p1', compId: 'c1', exec: 2 }),
      // the same container id in another project is another computer
      await snap('export default 1;', '0 8 * * 1', { project: 'p2', compId: 'c1', exec: 1 })]) {
      expect(verdictHolds(v, other)).toBe(false);
      expect(await bytesToSend(v, other)).toBeNull();
    }
  });
  it('only a ready verdict holds; a snapshot whose bytes were changed after hashing sends nothing', async () => {
    const s = await snap('export default 1;', null);
    expect(verdictHolds(verdictFor(s, { verdict: 'needs_fix', errors: [], blocking: ['x'] }), s)).toBe(false);
    expect(verdictHolds(verdictFor(s, { verdict: 'unknown', errors: [] }), s)).toBe(false);
    expect(verdictHolds(null, s)).toBe(false);
    const tampered = { ...s, bytes: `${s.bytes}\n// more` };
    expect(verdictHolds(verdictFor(s, READY), tampered)).toBe(true);
    expect(await bytesToSend(verdictFor(s, READY), tampered)).toBeNull();
  });
  it('a schedule that cannot be placed makes no snapshot', async () => {
    expect(await snapshotOf('#!/bin/sh\nx', '0 8 * * 1', AT)).toEqual({ ok: false, why: 'unplaceable' });
  });
});

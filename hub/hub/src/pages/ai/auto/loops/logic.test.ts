// Loops list, pure parts: which loops count toward the computer's 8-loop limit (the daemon's own rule), the
// chat title of a loop, and the Every / Runs / Spent / State words' inputs.
import { describe, expect, it } from 'vitest';
import { LOOP_CAP, activeCount, chatTitle, everyOf, loopRow, loopsOf, sessionsToRead, spentOf } from './logic';

const raw = (o: Record<string, unknown> = {}) => ({
  id: 'loop_0000aaaa', session_id: 's1', prompt: 'Check CI on main', interval_ms: 1800000, max_runs: 50, run_count: 7,
  paused: false, state: 'running', realm: 'global', ...o,
});

describe('loops: the active count (not paused and not ended)', () => {
  it('counts running and firing loops that are not paused, across every realm the list holds', () => {
    const rows = loopsOf({ items: [
      raw(), raw({ id: 'b', state: 'firing', realm: 'aaaaaaaaaaaaaaaaaaaaaaa1' }),
      raw({ id: 'c', state: 'paused', paused: true }), raw({ id: 'd', state: 'error', paused: true }),
      raw({ id: 'e', state: 'firing', paused: true }), raw({ id: 'f', state: 'ended', paused: true }),
      raw({ id: 'g', state: 'expired', paused: true }), raw({ id: 'h', state: 'stopped', paused: true }),
    ], meta: { total: 8 } }).map(loopRow);
    expect(activeCount(rows)).toBe(2);
    expect(LOOP_CAP).toBe(8);
  });
  it('a row the agent did not describe (no state, odd paused) never counts as active', () => {
    const rows = loopsOf({ items: [raw({ state: undefined }), raw({ id: 'b', paused: 'no' }), raw({ id: 'c', state: 'warp' })] }).map(loopRow);
    expect(activeCount(rows)).toBe(0);
    expect(rows.map((r) => r.state)).toEqual(['unknown', 'running', 'unknown']);
  });
  it('groups rows: active, paused (paused, after errors, paused mid-run) and over (finished, expired, stopped)', () => {
    const g = (o: Record<string, unknown>) => loopRow(loopsOf({ items: [raw(o)] })[0]!).group;
    expect(g({})).toBe('active');
    expect(g({ state: 'firing' })).toBe('active');
    expect(g({ state: 'paused', paused: true })).toBe('paused');
    expect(g({ state: 'error', paused: true })).toBe('paused');
    expect(g({ state: 'firing', paused: true })).toBe('paused');
    for (const s of ['ended', 'expired', 'stopped']) expect(g({ state: s, paused: true })).toBe('over');
  });
});

describe('loops: list parsing', () => {
  it('reads the kit envelope: a non-list answer fails the read, a row without ids is dropped, never guessed', () => {
    // Not a listing: the read fails, never "no loops".
    expect(() => loopsOf(null)).toThrow();
    expect(() => loopsOf({ items: 'x' })).toThrow();
    expect(() => loopsOf({})).toThrow();
    expect(loopsOf({ items: [] })).toEqual([]);
    expect(loopsOf({ items: [raw(), { prompt: 'no ids' }, raw({ session_id: '' })] })).toHaveLength(1);
  });
  it('the row key holds the realm, session and loop (the same loop id cannot clash across chats)', () => {
    const a = loopRow(loopsOf({ items: [raw()] })[0]!);
    const b = loopRow(loopsOf({ items: [raw({ session_id: 's2' })] })[0]!);
    expect(a.key).not.toBe(b.key);
    expect(a.prompt).toBe('Check CI on main');
  });
  it('the prompt shows as one line', () => {
    expect(loopRow(loopsOf({ items: [raw({ prompt: '  Check CI\n\n  then report\tnow ' })] })[0]!).prompt).toBe('Check CI then report now');
  });
});

describe('loops: chat titles', () => {
  it('name first, then the first line of the first message, else null', () => {
    expect(chatTitle({ session: { id: 's1', name: ' Fix the failing checkout tests ', first_message: 'x' } })).toBe('Fix the failing checkout tests');
    expect(chatTitle({ session: { id: 's1', first_message: '\n Why is checkout red?\nmore' } })).toBe('Why is checkout red?');
    expect(chatTitle({ session: { id: 's1' } })).toBeNull();
    // No session in the answer: the read fails, never "untitled".
    expect(() => chatTitle({})).toThrow();
    expect(() => chatTitle(null)).toThrow();
  });
  it('reads each chat once, in its own realm, at most 20', () => {
    const rows = loopsOf({ items: [
      raw(), raw({ id: 'b' }), raw({ id: 'c', session_id: 's1', realm: 'aaaaaaaaaaaaaaaaaaaaaaa1' }),
      ...Array.from({ length: 30 }, (_, i) => raw({ id: `x${i}`, session_id: `t${i}` })),
    ] }).map(loopRow);
    const reads = sessionsToRead(rows);
    expect(reads).toHaveLength(20);
    expect(reads.slice(0, 3)).toEqual([{ sid: 's1', realm: 'global' }, { sid: 's1', realm: 'aaaaaaaaaaaaaaaaaaaaaaa1' }, { sid: 't0', realm: 'global' }]);
  });
});

describe('loops: Every, Runs, Spent', () => {
  it('Every in the largest whole unit', () => {
    expect(everyOf(1800000)).toEqual({ unit: 'min', n: 30 });
    expect(everyOf(3600000)).toEqual({ unit: 'h', n: 1 });
    expect(everyOf(7200000)).toEqual({ unit: 'h', n: 2 });
    expect(everyOf(90000)).toEqual({ unit: 's', n: 90 });
    expect(everyOf(60000)).toEqual({ unit: 'min', n: 1 });
  });
  it('Runs keep the count and the ceiling', () => {
    const r = loopRow(loopsOf({ items: [raw()] })[0]!);
    expect(r.runs).toEqual({ n: 7, max: 50 });
  });
  it('Spent: dollars when spent, free after runs that cost nothing, nothing before the first run', () => {
    expect(spentOf(loopRow(loopsOf({ items: [raw({ spent_usd: 0.04 })] })[0]!))).toEqual({ k: 'usd', v: 0.04 });
    expect(spentOf(loopRow(loopsOf({ items: [raw({ spent_usd: 0.004 })] })[0]!))).toEqual({ k: 'small' });
    expect(spentOf(loopRow(loopsOf({ items: [raw()] })[0]!))).toEqual({ k: 'free' });
    expect(spentOf(loopRow(loopsOf({ items: [raw({ run_count: 0 })] })[0]!))).toEqual({ k: 'none' });
  });
});

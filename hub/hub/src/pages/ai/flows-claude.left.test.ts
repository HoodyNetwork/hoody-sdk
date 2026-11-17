// typeSetup and an attempt the person has left: nothing more is written, a terminal this call made is closed again (also when
// the command was already on its way), and the call ends quietly. A terminal handed in is the caller's to close.
import { describe, expect, it } from 'vitest';
import { GONE, type Api, type TermOwned } from './api';
import { typeSetup } from './flows-claude';
import type { Settled } from './types';

const ok = (body: unknown = {}): Settled<unknown> => ({ ok: true, body });
const OWNED: TermOwned = { n: 15007, inc: 'inc-1' };
type Name = 'termCaps' | 'termCreate' | 'termWait' | 'termWrite' | 'termDelete';

/** A fake terminal API: `leaveAt` is the call during which the person leaves (its answer still arrives). */
function fake(leaveAt: Name | null) {
  const calls: Name[] = [];
  let gone = false;
  const answer = (name: Name, body: unknown = {}) => () => {
    calls.push(name);
    if (name === leaveAt) gone = true;
    return Promise.resolve(ok(body));
  };
  const api = {
    termCaps: answer('termCaps'),
    termCreate: answer('termCreate', { status: 'ok', terminal_id: '8001', pid: 1, incarnation: 'inc-9' }),
    termWait: answer('termWait'),
    termWrite: answer('termWrite'),
    termDelete: answer('termDelete'),
  } as unknown as Api;
  return { api, calls, left: () => gone };
}

describe('typeSetup, the attempt left', () => {
  it('left while the computer is asked for terminals: no terminal is made', async () => {
    const f = fake('termCaps');
    expect(await typeSetup(f.api, 'login', 'u', null, f.left)).toEqual({ state: 'stale' });
    expect(f.calls).toEqual(['termCaps']);
  });
  it('left while the terminal is made or readied: the command is not written and that terminal is closed', async () => {
    for (const at of ['termCreate', 'termWait'] as const) {
      const f = fake(at);
      expect(await typeSetup(f.api, 'install', 'u', null, f.left)).toEqual({ state: 'stale' });
      expect(f.calls).not.toContain('termWrite');
      expect(f.calls.filter((c) => c === 'termDelete')).toHaveLength(1);
      expect(f.calls[f.calls.length - 1]).toBe('termDelete');
    }
  });
  it('left while the command is on its way: the terminal this call made is closed, and the answer is not "typed"', async () => {
    const f = fake('termWrite');
    expect(await typeSetup(f.api, 'login', 'u', null, f.left)).toEqual({ state: 'stale' });
    expect(f.calls).toEqual(['termCaps', 'termCreate', 'termWait', 'termWrite', 'termDelete']);
  });
  it('a terminal handed in is never closed here: left before the write nothing is sent at all', async () => {
    const before = fake(null);
    expect(await typeSetup(before.api, 'login', 'u', OWNED, () => true)).toEqual({ state: 'stale' });
    expect(before.calls).toEqual([]);
    const during = fake('termWrite');
    expect(await typeSetup(during.api, 'login', 'u', OWNED, during.left)).toEqual({ state: 'stale' });
    expect(during.calls).toEqual(['termWrite']);
  });
  it('a stale answer once the terminal was made closes that terminal: from the readying, and from the write', async () => {
    for (const at of ['termWait', 'termWrite'] as const) {
      const f = fake(null);
      (f.api as unknown as Record<string, unknown>)[at] = () => {
        f.calls.push(at);
        return Promise.resolve({ ok: false, err: GONE });
      };
      expect(await typeSetup(f.api, 'login', 'u', null, f.left)).toEqual({ state: 'stale' });
      expect(f.calls[f.calls.length - 1]).toBe('termDelete');
      expect(f.calls.filter((c) => c === 'termWrite')).toHaveLength(at === 'termWrite' ? 1 : 0);
    }
    // A terminal handed in is its owner's: a stale write closes nothing.
    const kept = fake(null);
    (kept.api as unknown as Record<string, unknown>).termWrite = () => Promise.resolve({ ok: false, err: GONE });
    expect(await typeSetup(kept.api, 'login', 'u', OWNED, kept.left)).toEqual({ state: 'stale' });
    expect(kept.calls).toEqual([]);
  });
  it('every call of one press, the closing included, goes to the computer shown when it began (api.termOn)', async () => {
    // The page api sends to the computer shown at each send; termOn() is asked once, at the start, and answers calls
    // that stay on that computer.
    const shown = fake(null);
    const first = fake('termWait');
    let asked = 0;
    const api = { ...shown.api, termOn: () => { asked += 1; return first.api; } } as Api;
    expect(await typeSetup(api, 'install', 'u', null, first.left)).toEqual({ state: 'stale' });
    expect(asked).toBe(1);
    expect(first.calls).toEqual(['termCaps', 'termCreate', 'termWait', 'termDelete']);
    expect(shown.calls).toEqual([]);
  });
  it('not left: the command is written once and the terminal is kept', async () => {
    const f = fake(null);
    expect(await typeSetup(f.api, 'login', 'u', null, f.left)).toMatchObject({ state: 'typed' });
    expect(f.calls).toEqual(['termCaps', 'termCreate', 'termWait', 'termWrite']);
  });
});

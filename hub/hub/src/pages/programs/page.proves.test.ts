// A fresh overview frees a start, stop or boot sent from either page (the lock is shared with Computers) only
// when it shows the effect (core programProves, shared with the Computers Programs tab): 'applied' completes it in core; anything else proves nothing.
import { describe, expect, it } from 'vitest';
import { programOp, programProves as readProves } from '@core';
import { many } from './fixtures';
import type { RawOverview } from './logic';

const web = (patch: Record<string, unknown>): RawOverview => ({ ...many, programs: many.programs.map((p) => (p.id === 1 ? { ...p, ...patch } : p)) });
const stopped = web({ status: 'stopped', instances: [{ port: 3000, status: 'stopped' }] });
const id = (act: 'start' | 'stop' | 'boot', boot?: boolean, port: number | null = null, pid = '1') => programOp({ id: pid, act, port, range: false, ...(boot !== undefined ? { boot } : {}) }).identity;

describe('programs: what a fresh overview proves', () => {
  it('a stop is applied only when the program reads stopped', () => {
    expect(readProves('stop')(id('stop'), [[stopped]])).toBe('applied');
    expect(readProves('stop')(id('stop'), [[many]])).toBeUndefined();
  });

  it('a start is applied when the program reads up, and not by a stopped read', () => {
    expect(readProves('start')(id('start'), [[many]])).toBe('applied');
    expect(readProves('start')(id('start'), [[stopped]])).toBeUndefined();
  });

  it('a boot is applied only when the boot flag reads the asked value', () => {
    const on = web({ boot: true });
    const off = web({ boot: false });
    expect(readProves('boot')(id('boot', true), [[on]])).toBe('applied');
    expect(readProves('boot')(id('boot', false), [[off]])).toBe('applied');
    expect(readProves('boot')(id('boot', true), [[off]])).toBeUndefined();
  });

  it('a program missing from the read proves nothing', () => {
    expect(readProves('stop')(id('stop', undefined, null, '999'), [[stopped]])).toBeUndefined();
  });

  it('a one-port stop is applied only when that port reads stopped', () => {
    const range = { id: 130, name: 'pool', status: 'running', states_known: true, hoody_kit: false, autorestart: 'always', port_range: { start: 16000, end: 16001 } };
    const ov = (a: string, b: string): RawOverview => ({ ...many, programs: [...many.programs, { ...range, status: a === 'stopped' && b === 'stopped' ? 'stopped' : 'running', instances: [{ port: 16000, status: a }, { port: 16001, status: b }] }] as RawOverview['programs'] });
    expect(readProves('stop')(id('stop', undefined, 16000, '130'), [[ov('stopped', 'running')]])).toBe('applied');
    expect(readProves('stop')(id('stop', undefined, 16001, '130'), [[ov('stopped', 'running')]])).toBeUndefined();
    // A whole stop of a range needs every part stopped: one still running proves nothing.
    expect(readProves('stop')(programOp({ id: '130', act: 'stop', port: null, range: true }).identity, [[ov('stopped', 'running')]])).toBeUndefined();
    expect(readProves('stop')(programOp({ id: '130', act: 'stop', port: null, range: true }).identity, [[ov('stopped', 'stopped')]])).toBe('applied');
  });

  it('no fresh answer, an unreadable answer or a missing identity proves nothing', () => {
    expect(readProves('stop')(id('stop'), [[]])).toBeUndefined();
    expect(readProves('stop')(id('stop'), [])).toBeUndefined();
    expect(readProves('stop')(id('stop'), [[{ nope: 1 }]])).toBeUndefined();
    expect(readProves('stop')(undefined, [[stopped]])).toBeUndefined();
  });

  it("a read whose select reshapes the wire proves through wireOf (the Computers tab's programs read)", () => {
    const wire = new WeakMap<object, unknown>();
    const shaped = { a: [] };
    wire.set(shaped, stopped);
    expect(readProves('stop', (a) => wire.get(a as object))(id('stop'), [[shaped]])).toBe('applied');
    expect(readProves('stop')(id('stop'), [[shaped]])).toBeUndefined();
  });
});

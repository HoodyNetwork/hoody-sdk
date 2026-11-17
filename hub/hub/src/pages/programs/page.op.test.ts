// One program change on both pages: Programs builds every daemon program change
// (start, stop, restart, boot) through core's programOp, so the same press is the same body and the same
// shared-lock identity as the Computers Programs tab's (computers/programs.op.test.ts checks that side), for a
// single program, a range program and a lazy one.
import { describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import { programOp } from '@core';
import { pressChange, routes } from './data';

// The options each Programs mutation was declared with (data.ts defineMutation), by route: the test reads the
// page's own startM/stopM/restartM/bootM, not only pressChange.
type Opts = { lock?: string; lockKey?: (v: unknown) => unknown; proves?: unknown; input?: (v: unknown) => { body?: unknown } };
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

const target = { project: { id: 'p'.repeat(24) }, container: { id: 'a'.repeat(24), server_name: 'n12' } };

const cases = [
  { name: 'single', id: '1', range: false },
  { name: 'range', id: '130', range: true },
  { name: 'lazy', id: '7', range: false },
];

describe('programOp: one body and one lock for a program change', () => {
  it('stops and restarts a range program as a whole, never a start or a part', () => {
    expect(programOp({ id: '130', act: 'stop', port: null, range: true }).identity).toEqual({ id: '130', port: null, all: true });
    expect(programOp({ id: '130', act: 'stop', port: 16001, range: true }).identity).toEqual({ id: '130', port: 16001, all: false });
    expect(programOp({ id: '130', act: 'start', port: null, range: true }).body).not.toHaveProperty('all');
  });

  for (const c of cases) {
    for (const act of ['start', 'stop', 'restart', 'boot'] as const) {
      it(`${c.name} ${act}: Programs sends programOp's change under its lock`, () => {
        const op = programOp({ id: c.id, act, port: null, range: c.range, boot: true });
        const prog = pressChange({ kind: 'prog', id: c.id, action: act, port: null, range: c.range, boot: true, target });
        expect(prog).toEqual(op);
        const m = declared.get(routes[act]);
        const pv = { id: c.id, port: null, range: c.range, boot: true, target };
        expect(m?.lock).toBe(op.lock);
        expect(m?.lockKey?.(pv)).toEqual(op.identity);
        expect(m?.input?.(pv).body).toEqual(op.body);
        // A fresh read proves start, stop and boot; a restart reads running before and after, so only its receipt proves it.
        expect(typeof m?.proves).toBe(act === 'restart' ? 'undefined' : 'function');
      });
    }
  }
});

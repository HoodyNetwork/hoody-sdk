// One program change on both pages: the Computers Programs tab builds every daemon
// program change (start, stop, restart, boot) through core's programOp, the builder the Programs page sends with too
// (programs/page.op.test.ts checks that side), for a single program, a range program and a lazy one.
import { describe, expect, it } from 'vitest';
import { programOp, type ProgramAct } from '@core';
import { computersTable, subjectOf } from './data';

const C = { id: 'a'.repeat(24), project_id: 'p'.repeat(24), server_name: 'n12' };
const KEYS: Record<ProgramAct, string> = { start: 'programStart', stop: 'programStop', restart: 'programRestart', boot: 'programBoot' };
const cases = [
  { name: 'single', id: '1', range: false },
  { name: 'range', id: '130', range: true },
  { name: 'lazy', id: '7', range: false },
];

describe('computers: program changes through programOp', () => {
  for (const c of cases) {
    for (const act of ['start', 'stop', 'restart', 'boot'] as const) {
      it(`${c.name} ${act}: the Programs tab sends programOp's change under its lock`, () => {
        const op = programOp({ id: c.id, act, port: null, range: c.range, boot: true });
        const ch = computersTable.changes?.[KEYS[act]];
        const v = { ...subjectOf(C), program: c.id, range: c.range, boot: true };
        expect(ch?.lock).toBe(op.lock);
        expect(ch?.lockKey?.(v)).toEqual(op.identity);
        expect((ch?.input?.(v) as { body: unknown }).body).toEqual(op.body);
      });
    }
  }
});

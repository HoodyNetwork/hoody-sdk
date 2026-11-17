// programs.test.ts: the daemon program routes and the one program-change builder.
import { describe, expect, it } from 'vitest';
import { programLock, programOp, programRoutes, type ProgramAct } from './programs';

describe('programRoutes', () => {
  it('targets the daemon kit, program index 1; only restart is idempotent', () => {
    for (const r of Object.values(programRoutes)) {
      expect(r.scope).toBe('kit');
      expect(r.kit).toBe('daemon');
      expect(r.index).toBe(1);
      expect(r.path.startsWith('/api/v1/daemon/')).toBe(true);
    }
    expect(Object.entries(programRoutes).filter(([, r]) => r.idem).map(([k]) => k)).toEqual(['restart']);
    expect(programRoutes.restartReceipt.method).toBe('GET');
    expect(programRoutes.restartReceipt.path).toBe(programRoutes.restart.path);
  });
  it('every body programOp builds fits its route', () => {
    const route = { start: programRoutes.start, stop: programRoutes.stop, restart: programRoutes.restart, boot: programRoutes.boot };
    for (const act of ['start', 'stop', 'restart', 'boot'] as ProgramAct[])
      for (const port of [null, 16001])
        for (const range of [false, true]) {
          const op = programOp({ id: '7', act, port, range, boot: true });
          for (const k of Object.keys(op.body)) expect(route[act].body).toContain(k);
        }
  });
});

describe('programOp', () => {
  it('a whole stop or restart of a range program covers every part; a part or a start never does', () => {
    expect(programOp({ id: '130', act: 'stop', port: null, range: true })).toEqual({ lock: programLock.stop, identity: { id: '130', port: null, all: true }, body: { all: true } });
    expect(programOp({ id: '130', act: 'stop', port: 16001, range: true }).identity).toEqual({ id: '130', port: 16001, all: false });
    expect(programOp({ id: '130', act: 'restart', port: null, range: true }).body).toEqual({ all: true, wait: true });
    expect(programOp({ id: '130', act: 'start', port: null, range: true }).body).toEqual({ wait: true });
    expect(programOp({ id: '1', act: 'boot', port: null, range: false, boot: false })).toEqual({ lock: 'daemon.program.boot', identity: { id: '1', boot: false }, body: { boot: false } });
  });
  it('keeps the lock names both pages share', () => {
    expect(programLock).toEqual({ start: 'daemon.program.start', stop: 'daemon.program.stop', restart: 'daemon.program.restart', boot: 'daemon.program.boot' });
  });
});

// program-model.test.ts: the shared program overview model and the proofs of program changes.
import { describe, expect, it } from 'vitest';
import { programModel, programProof, programProves, restartReceiptVerdict, temporaryStopProves } from './program-model';

const prog = (o: Record<string, unknown>) => ({ id: 7, name: 'web', states_known: true, enabled: true, instances: [], ...o });
const ov = (programs: unknown[], extra: Record<string, unknown> = {}) => ({ programs, features: ['restart', 'boot_switch'], ...extra });

describe('programModel', () => {
  it('parses the daemon overview; anything else is null', () => {
    expect(programModel(null)).toBeNull();
    expect(programModel({ programs: 'x' })).toBeNull();
    const m = programModel(ov([prog({ status: 'running', instances: [{ port: 8080, status: 'running', uptime_s: 5 }] }), prog({ id: 7 })]))!;
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toMatchObject({ key: 'prog:7', id: '7', state: 'running', port: 8080, up: 5, scope: 'yours' });
    expect(m.counts).toMatchObject({ total: 1, running: 1 });
  });
  it('names are cleaned of control characters and bounded', () => {
    const m = programModel(ov([prog({ name: 'a\u0000b‮  c' + 'x'.repeat(200) })]))!;
    expect(m.rows[0]!.name.startsWith('ab c')).toBe(true);
    expect(m.rows[0]!.name.length).toBe(80);
  });
});

describe('programProof / programProves', () => {
  const row = (o: Record<string, unknown>) => programModel(ov([prog(o)]))!.rows[0]!;
  it('start: running or starting proves it; stopped does not', () => {
    expect(programProof('start', row({ status: 'running' }), null)).toBe(true);
    expect(programProof('start', row({ status: 'starting' }), null)).toBe(true);
    expect(programProof('start', row({ status: 'stopped' }), null)).toBe(false);
  });
  it('stop: only a known stopped program (or a lazy idle one) proves it; restarting proves nothing', () => {
    expect(programProof('stop', row({ status: 'stopped' }), null)).toBe(true);
    expect(programProof('stop', row({ status: 'stopped', lazy_load: true }), null)).toBe(true);
    expect(programProof('stop', row({ status: 'backoff' }), null)).toBe(false);
    expect(programProof('stop', row({ status: 'stopped', states_known: false }), null)).toBe(false);
  });
  it('a port action needs that exact port in the read; boot reads the boot flag; a missing row is gone', () => {
    const ranged = { port_range: { start: 8000, end: 8003 }, instances: [{ port: 8001, status: 'running' }] };
    expect(programProof('start', row(ranged), 8001)).toBe(true);
    expect(programProof('start', row(ranged), 8002)).toBe(false);
    expect(programProof('boot', row({ boot: true }), null, { boot: true })).toBe(true);
    expect(programProof('boot', row({ boot: false }), null, { boot: true })).toBe(false);
    expect(programProof('stop', null, null)).toBe('gone');
  });
  it('a restart is never proved by state: only its receipt completes it', () => {
    expect(programProof('restart', row({ status: 'running' }), null)).toBe(false);
    expect(restartReceiptVerdict({ state: 'completed', outcome: 'restarted' })).toBe('completed');
    expect(restartReceiptVerdict({ state: 'completed', outcome: 'failed' })).toBe('failed');
    expect(restartReceiptVerdict({ state: 'running' })).toBe('unknown');
    expect(restartReceiptVerdict(null)).toBe('unknown');
  });
  it('programProves reads the newest fresh overview for the named program; no verdict otherwise', () => {
    const p = programProves('start');
    expect(p({ id: '7', port: null }, [[ov([prog({ status: 'stopped' })]), ov([prog({ status: 'running' })])]])).toBe('applied');
    expect(p({ id: '7', port: null }, [[ov([prog({ status: 'running' })]), ov([prog({ status: 'stopped' })])]])).toBeUndefined();
    expect(p({ id: '8', port: null }, [[ov([prog({ status: 'running' })])]])).toBeUndefined();
    expect(p({ id: '7' }, [[]])).toBeUndefined();
    expect(p(undefined, [[ov([prog({ status: 'running' })])]])).toBeUndefined();
    expect(programProves('boot')({ id: '7', boot: true }, [[ov([prog({ boot: true })])]])).toBe('applied');
  });
  it('temporaryStopProves: gone from an answer that carries the temporary list, or stopped; else nothing', () => {
    const t = (status: string) => ({ temporary_id: 'quick_1_2', status });
    expect(temporaryStopProves({ id: 'quick_1_2' }, [[ov([], { temporary: [] })]])).toBe('applied');
    expect(temporaryStopProves({ id: 'quick_1_2' }, [[ov([])]])).toBeUndefined();
    expect(temporaryStopProves({ id: 'quick_1_2' }, [[ov([], { temporary: [t('running')] })]])).toBeUndefined();
    expect(temporaryStopProves({ id: 'quick_1_2' }, [[ov([], { temporary: [t('exited')] })]])).toBe('applied');
  });
});

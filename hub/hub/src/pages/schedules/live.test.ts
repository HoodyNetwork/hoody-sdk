// Vitest: the live load over each kit's answers (no core, no network).
import { describe, expect, it } from 'vitest';
import { type Call, type ReadName, loadSchedules } from './live';

const ID = '3f2b8c1e-0a4d-4c55-9e1a-7b6d5a4c3b2a';
const ok = (v: unknown) => Promise.resolve(v);
const fail = (status: number) => Promise.reject({ status });
const ver = () => Promise.resolve({ supported: ['loop_receipts'] });

function world(over: Partial<Record<ReadName, () => Promise<unknown>>> = {}): Call {
  const base: Record<ReadName, () => Promise<unknown>> = {
    overview: () => ok({ programs: [{ name: 'hoody-curl', status: 'running' }, { name: 'hoody-agent', status: 'running' }] }),
    health: () => ok({}),
    info: () => ok({ features: ['entries_all', 'run_now'], utc_offset_seconds: 28800 }),
    entries: () => ok({ total: 2, entries: [{ type: 'managed', id: ID, user: 'user', schedule: '0 2 * * *', name: 'Nightly backup' }, { user: 'root', schedule: '* * * * *', command: 'x' }] }),
    userEntries: () => ok({ total: 0, entries: [] }),
    runs: () => ok({ runs: [{ run_id: 'r1', entry_id: ID, user: 'user', status: 'finished', started_at: '2026-10-23T00:00:00Z', exit_code: 0 }] }),
    execList: () => ok({ schedules: [{ scriptRel: 'a.ts', expression: '0 6 * * *' }] }),
    curlList: () => ok({ items: [{ id: ID, cron: '0 0 9 * * *', request: {} }, { id: 'bad' }] }),
    loops: () => ok({ items: [{ id: 'loop_1', session_id: 's', interval_ms: 6e5, state: 'running' }] }),
  };
  return (name) => (over[name] ?? base[name])();
}

describe('loadSchedules', () => {
  it('merges the four sources and attaches the last run to its entry', async () => {
    const r = await loadSchedules(world(), ver, () => 1);
    expect(r.cron.state).toBe('ok');
    expect(r.cron.items).toHaveLength(1);
    expect(r.cron.items[0]?.last_run?.exit_code).toBe(0);
    expect(r.cron.caps).toMatchObject({ runs: true, run_now: true });
    expect(r.exec.items).toHaveLength(1);
    expect(r.curl.items).toHaveLength(1);
    expect(r.loop.items).toHaveLength(1);
    expect(r.loop.caps.loop_receipts).toBe(true);
    expect(r.utcOffset).toBe(28800);
    expect(r.programsRunning).toBe(2);
  });
  it('counts unparseable hand-written lines as incomplete, never as rows', async () => {
    const r = await loadSchedules(world(), ver);
    expect(r.cron.hand).toHaveLength(0);
    expect(r.cron.complete).toBe(false);
  });
  it('marks a source private on 403 and keeps the others', async () => {
    const r = await loadSchedules(world({ execList: () => fail(403) }), ver);
    expect(r.exec.state).toBe('private');
    expect(r.cron.state).toBe('ok');
  });
  it('reads the agent\'s restriction_unknown as signed out, any other loop failure as failed', async () => {
    const out = await loadSchedules(world({ loops: () => Promise.reject({ status: 503, code: 'restriction_unknown' }) }), ver);
    expect(out.loop.state).toBe('signed_out');
    expect(out.loop.complete).toBe(false);
    expect(out.cron.state).toBe('ok');
    expect((await loadSchedules(world({ loops: () => fail(503) }), ver)).loop.state).toBe('failed');
  });
  it('does not read curl or the agent without the overview', async () => {
    const r = await loadSchedules(world({ overview: () => fail(500) }), ver);
    expect(r.curl.state).toBe('not_checked');
    expect(r.loop.state).toBe('not_checked');
    expect(r.exec.state).toBe('ok');
  });
  it('says stopped for a stopped program, and cron down when its health fails', async () => {
    const r = await loadSchedules(
      world({ overview: () => ok({ programs: [{ name: 'hoody-curl', status: 'stopped', states_known: true }] }), health: () => fail(500) }),
      ver,
    );
    expect(r.curl.state).toBe('stopped');
    expect(r.loop.state).toBe('stopped');
    expect(r.cron.state).toBe('down');
  });
  it('ends the load on a stale call', async () => {
    await expect(loadSchedules(world({ execList: () => Promise.reject({ stale: true }) }), ver)).rejects.toMatchObject({ stale: true });
  });
  it.each([
    ['superseded after send', { status: 401, superseded: true, kind: 'stale' }],
    ['superseded with no kind', { status: 401, superseded: true }],
  ])('ends the load when a loop or version read comes back %s, never showing it as private', async (_n, err) => {
    await expect(loadSchedules(world({ loops: () => Promise.reject(err) }), ver)).rejects.toEqual(err);
    await expect(loadSchedules(world(), () => Promise.reject(err))).rejects.toEqual(err);
    await expect(loadSchedules(world({ execList: () => Promise.reject(err) }), ver)).rejects.toEqual(err);
  });
  it.each([
    ['entries fails while runs is superseded', 0, 0],
    ['entries fails first, runs is superseded later', 0, 20],
    ['runs is superseded first, entries fails later', 20, 0],
  ])('ends the load when %s, never saying cron is down', async (_n, entriesMs, runsMs) => {
    const later = <T,>(ms: number, f: () => Promise<T>) => new Promise<T>((res, rej) => setTimeout(() => f().then(res, rej), ms));
    const gone = { status: 401, superseded: true, kind: 'stale' };
    const r = loadSchedules(world({ entries: () => later(entriesMs, () => fail(500)), runs: () => later(runsMs, () => Promise.reject(gone)) }), ver);
    await expect(r).rejects.toEqual(gone);
  });
  it('still says cron is down when entries fails and runs answers', async () => {
    const later = <T,>(ms: number, f: () => Promise<T>) => new Promise<T>((res, rej) => setTimeout(() => f().then(res, rej), ms));
    const r = await loadSchedules(world({ entries: () => fail(500), runs: () => later(20, () => ok({ runs: [] })) }), ver);
    expect(r.cron.state).toBe('down');
  });
  it('ends the load when the last time-zone read is stale, and keeps the plain fallback for a failure', async () => {
    const lastInfo = (last: () => Promise<unknown>) => {
      let n = 0;
      return () => (++n === 1 ? ok({ features: ['entries_all', 'run_now'], utc_offset_seconds: 28800 }) : last());
    };
    await expect(loadSchedules(world({ info: lastInfo(() => Promise.reject({ stale: true })) }), ver)).rejects.toMatchObject({ stale: true });
    const r = await loadSchedules(world({ info: lastInfo(() => fail(500)) }), ver);
    expect(r.utcOffset).toBeNull();
    expect(r.cron.state).toBe('ok');
  });
});

// send.ts mayLaunch: the launch permission at the transport, end to end through the
// shared machine → runOpenSend → core api() → fetch → FakeKits. Launch-producing rows (resolve, band create, band
// execute, replays included) leave only while mayLaunch() answers true; status reads and Stop always go.
import { describe, expect, it } from 'vitest';
import { boot, onFetch, PROXY, TARGET, type Reply } from '../test/env';
import { FakeKits } from './fakeKits';
import { createRunOpen } from './index';
import { runOpenSend } from './send';

const HOST = new RegExp(`^https://p1-c1-(run|terminal|display)-(\\d+)\\.sv1\\.${PROXY.replace(/\./g, '\\.')}(/[^?]*)(?:\\?(.*))?$`);

function wire(k: FakeKits): void {
  onFetch(async (c): Promise<Reply> => {
    const m = HOST.exec(c.url);
    if (!m) return { status: 599, body: { code: 'UNEXPECTED_HOST' } };
    const query = m[4] ? Object.fromEntries(new URLSearchParams(m[4])) : undefined;
    try {
      const a = await k.send({ kit: m[1] as 'run', index: Number(m[2]) }, c.method, m[3]!, query, c.body ?? undefined);
      return { status: a.status, body: a.body };
    } catch {
      return { status: 0, network: true };
    }
  });
}

/** A machine whose launch permission reads `may.on` at every send. */
function machine(k: FakeKits, may: { on: boolean }) {
  return createRunOpen({ send: runOpenSend({ target: TARGET, mayLaunch: () => may.on }), now: k.now, sleep: k.sleep, random: k.random });
}
const bandExecutes = (k: FakeKits) => k.of('/api/v1/terminal/execute').filter((s) => s.target.index !== 0);

describe('launch permission at the transport (mayLaunch)', () => {
  it('exec_revoked_mid_open_sends_no_execute: the permission drops after the create: no execute leaves, the result is not sent, the terminal is deleted', async () => {
    boot();
    const k = new FakeKits();
    const may = { on: true };
    // The create is the last launch row let out: the permission drops as it arrives.
    k.faults.push((s) => {
      if (s.path === '/api/v1/terminal/create') may.on = false;
      return undefined;
    });
    wire(k);
    const r = await machine(k, may).open({ app: 'htop' });
    expect(k.of('/api/v1/run/resolve')).toHaveLength(1);
    expect(k.of('/api/v1/terminal/create')).toHaveLength(1);
    expect(bandExecutes(k)).toHaveLength(0);
    expect(k.executions).toBe(0);
    expect(r.ok).toBe(false);
    expect(r.notSent).toBe(true);
    expect(r.code).toBe('access_refused');
    expect(k.deletes).toHaveLength(1);
  });

  it('no permission from the start: no resolve leaves, nothing is created', async () => {
    boot();
    const k = new FakeKits();
    wire(k);
    const r = await machine(k, { on: false }).open({ app: 'htop' });
    expect(k.of('/api/v1/run/resolve')).toHaveLength(0);
    expect(k.of('/api/v1/terminal/create')).toHaveLength(0);
    expect(r.notSent).toBe(true);
  });

  it('a throwing permission check refuses like a false one', async () => {
    boot();
    const k = new FakeKits();
    wire(k);
    const m = createRunOpen({ send: runOpenSend({ target: TARGET, mayLaunch: () => { throw new Error('x'); } }), now: k.now, sleep: k.sleep, random: k.random });
    const r = await m.open({ app: 'htop' });
    expect(k.of('/api/v1/run/resolve')).toHaveLength(0);
    expect(r.notSent).toBe(true);
  });

  it('status_and_stop_allowed_without_exec: with the permission gone, the record read, the signal, the DELETE and terminal-0 reads still go', async () => {
    boot();
    const k = new FakeKits();
    const may = { on: true };
    wire(k);
    const m = machine(k, may);
    const r = await m.open({ app: 'htop' });
    expect(r.handle).toBeDefined();
    may.on = false;
    const st = await m.status(r.handle!);
    expect(st.state).toBe('running');
    expect(k.of('/api/v1/terminal/workloads', 'GET').length).toBeGreaterThan(0);
    const c = await m.close(r.handle!);
    expect([c.state, c.code]).toEqual(['stopped', 'stopped']);
    expect(k.sent.some((s) => /\/signal$/.test(s.path))).toBe(true);
    expect(k.deletes).toEqual([{ n: r.handle!.terminal_id, incarnation: r.handle!.incarnation }]);
    // terminal-0's raw execute (the docker reads that OCI status and Stop use) is not a launch: a valid one (as the
    // machine sends it) reaches the kit with the permission gone.
    const before = k.of('/api/v1/terminal/execute').filter((s) => s.target.index === 0).length;
    const raw = await runOpenSend({ target: TARGET, mayLaunch: () => false })({ kit: 'terminal', index: 0 }, 'POST', '/api/v1/terminal/execute', { ephemeral: 'true' }, { command: 'true', mode: 'raw', wait: true, user: 'user' }).then(
      () => 'went',
      (e: { code?: string }) => e.code ?? 'failed',
    );
    expect(raw).not.toBe('preflight_refused');
    expect(raw).not.toBe('ROUTE_REFUSED');
    expect(k.of('/api/v1/terminal/execute').filter((s) => s.target.index === 0)).toHaveLength(before + 1);
  });

  it('exec_revoked_after_resolve_sends_no_create: the permission drops as the resolve arrives: no terminal is created, nothing runs, the result is not sent', async () => {
    boot();
    const k = new FakeKits();
    const may = { on: true };
    k.faults.push((s) => {
      if (s.path === '/api/v1/run/resolve') may.on = false;
      return undefined;
    });
    wire(k);
    const r = await machine(k, may).open({ app: 'htop' });
    expect(k.of('/api/v1/run/resolve')).toHaveLength(1);
    expect(k.of('/api/v1/terminal/create')).toHaveLength(0);
    expect(bandExecutes(k)).toHaveLength(0);
    expect(k.executions).toBe(0);
    expect(r.notSent).toBe(true);
    expect(r.code).toBe('access_refused');
  });

  it('exec_revoked_replay_stays_unknown: the first execute\'s answer is lost, then the permission drops: replays are refused, the launch stays unknown (never "didn\'t start")', async () => {
    boot();
    const k = new FakeKits();
    const may = { on: true };
    // The permission drops as the first execute arrives (it ran); then its answer is lost.
    k.faults.push((s) => {
      if (s.path === '/api/v1/terminal/execute' && s.target.index !== 0) may.on = false;
      return undefined;
    });
    k.faults.push((s) => (s.path === '/api/v1/terminal/execute' && s.target.index !== 0 ? 'drop-reply' : undefined));
    wire(k);
    const r = await machine(k, may).open({ app: 'htop' });
    expect(bandExecutes(k)).toHaveLength(1);
    expect(k.executions).toBe(1);
    expect(r.notSent).not.toBe(true);
    expect(r.state).toBe('unknown');
    expect(r.code).toBe('start_unconfirmed');
    expect(k.deletes).toHaveLength(0);
  });
});

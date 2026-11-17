// The id band app launches allocate from. Terminal and display ids are valid only up to 9999 (a launch that makes
// terminal 15001 / display 15001 fails, as "Firefox on display 15001" does), so no
// launch creates terminal-N or display-N above it. Existing launches in 15001-19999 are still read and closed.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '../test/monorepo';
import { FakeKits, type Sent } from './fakeKits';
import { BAND, BOARD_IDS, LEGACY_BAND, route } from './kitRoutes';
import { createRunOpen, parseRunTarget, RUN_OPEN_LIMITS, type RunHandle, type RunSend } from './index';

// HUB_RUNOPEN_RUN_MODEL points the band check at another hoody-run model file (a scratch copy).
const RUN_MODEL = monorepoPath(process.env.HUB_RUNOPEN_RUN_MODEL, 'hoody-kit', 'hoody-run', 'src', 'model.rs') ?? '';
const COMPUTER = { project: 'p1', computer_id: 'c0ffee' };
const I = '0123456789abcdef0123456789abcdef';
const TAG = '0123456789abcdef';

function machine(k: FakeKits): { m: ReturnType<typeof createRunOpen>; refused: Sent[] } {
  const refused: Sent[] = [];
  const send: RunSend = (target, method, path, query, body) => {
    if (route(target.kit, target.index, method, path, query ?? {}, body) !== null) {
      refused.push({ target, method, path, query: query as Record<string, string>, body });
      return Promise.reject({ notSent: true, code: 'ROUTE_REFUSED' });
    }
    return k.send(target, method, path, query as Record<string, string>, body) as ReturnType<RunSend>;
  };
  return { m: createRunOpen({ send, now: k.now, sleep: k.sleep, random: k.random, computer: COMPUTER }), refused };
}

const created = (k: FakeKits): number[] => k.of('/api/v1/terminal/create').map((s) => Number(s.body.terminal_id));

describe('the launch band creates no terminal or display id above 9999', () => {
  it('the band sits in 1501-9999, above the shells numbered from 1 up, and the machine allocates from exactly it', () => {
    expect(BAND[0]).toBeGreaterThan(1500);
    expect(BAND[1]).toBeLessThanOrEqual(9999);
    expect(BAND[0]).toBeLessThan(BAND[1]);
    const limits = RUN_OPEN_LIMITS();
    expect([limits.bandMin, limits.bandMax]).toEqual([...BAND]);
    // The Board numbers its own sessions below the band, so neither ever lands on the other's ids.
    expect(BOARD_IDS[1]).toBeLessThan(BAND[0]);
  });

  it.skipIf(!existsSync(RUN_MODEL))('hoody-run suggests the same band (SUGGESTED_TERMINAL_BAND)', () => {
    const m = /SUGGESTED_TERMINAL_BAND:\s*\[u16;\s*2\]\s*=\s*\[(\d+),\s*(\d+)\]/.exec(readFileSync(RUN_MODEL, 'utf8'));
    expect(m).not.toBeNull();
    expect([Number(m![1]), Number(m![2])]).toEqual([...BAND]);
  });

  it('an open creates terminal N and display N at the band\'s first free id, never above 9999', async () => {
    const k = new FakeKits();
    k.sessions.set(BAND[0], { incarnation: I, user: 'user', uid: 1000 });
    const { m, refused } = machine(k);
    const r = await m.open({ app: 'htop' });
    expect(r.ok).toBe(true);
    expect(created(k)).toEqual([BAND[0] + 1]);
    const body = k.of('/api/v1/terminal/create')[0]!.body;
    expect(body.display).toBe(body.terminal_id);
    expect(r.handle?.terminal_id).toBe(BAND[0] + 1);
    expect(Number(r.handle?.display)).toBeLessThanOrEqual(9999);
    expect(refused).toEqual([]);
  });

  it('a full band refuses to open rather than create past its last id', async () => {
    const k = new FakeKits();
    for (let n = BAND[0]; n <= BAND[1]; n++) k.sessions.set(n, { incarnation: I, user: 'user', uid: 1000 });
    const { m } = machine(k);
    const r = await m.open({ app: 'htop' });
    expect(r.ok).toBe(false);
    expect(created(k).every((n) => n <= 9999)).toBe(true);
  });

  it('the allowlist refuses a create or execute above 9999, the old band included', () => {
    for (const n of [10000, LEGACY_BAND[0], LEGACY_BAND[1]]) {
      expect(route('terminal', n, 'POST', '/api/v1/terminal/create', { terminal_id: n }, { terminal_id: String(n), exclusive: true, display: String(n), wait_until_display: false, user: 'user' })).toBe('ROUTE_REFUSED');
      expect(route('terminal', n, 'POST', '/api/v1/terminal/execute', { terminal_id: n, skip_display_wait: 'true' }, { command: 'x', wait: false, id: '7', require_staged: true, track: true, incarnation: I, track_label: 'run:app:' + TAG, env: {} })).toBe('ROUTE_REFUSED');
    }
    const n = BAND[1];
    expect(route('terminal', n, 'POST', '/api/v1/terminal/create', { terminal_id: n }, { terminal_id: String(n), exclusive: true, display: String(n), wait_until_display: false, user: 'user' })).toBeNull();
  });
});

describe('a create names the host\'s N as its terminal_id and its display (hoody-terminal takes the display from the body)', () => {
  const create = (b: Record<string, unknown> = {}, drop: string[] = []) => {
    const body: Record<string, unknown> = { terminal_id: '8001', exclusive: true, display: '8001', wait_until_display: false, user: 'user', ...b };
    for (const k of drop) delete body[k];
    return route('terminal', 8001, 'POST', '/api/v1/terminal/create', { terminal_id: '8001' }, body);
  };
  it('the matching body is allowed, as a string or a number', () => {
    expect(create()).toBeNull();
    expect(create({ terminal_id: 8001, display: 8001 })).toBeNull();
  });
  it('a display above 9999, another display, or none is refused', () => {
    for (const display of ['15001', 15001, '19999', '10000', '8002', '', null, ['8001'], { n: 8001 }]) expect(create({ display })).toBe('ROUTE_REFUSED');
    expect(create({}, ['display'])).toBe('ROUTE_REFUSED');
  });
  it('a body terminal_id other than the host\'s N, or none, is refused', () => {
    for (const terminal_id of ['8002', '15001', 15001, null, ['8001']]) expect(create({ terminal_id })).toBe('ROUTE_REFUSED');
    expect(create({}, ['terminal_id'])).toBe('ROUTE_REFUSED');
  });
});

describe('a launch made before, in 15001-19999, is still read and closed', () => {
  it('its handle, compact form and terminal shorthand still parse; ids outside both bands do not', () => {
    expect(parseRunTarget(`${LEGACY_BAND[0]}:${I}:7`)).toMatchObject({ handle: { terminal_id: LEGACY_BAND[0], display: LEGACY_BAND[0] } });
    expect(parseRunTarget(LEGACY_BAND[1])).toEqual({ terminal: LEGACY_BAND[1] });
    expect(parseRunTarget(String(BAND[0]))).toEqual({ terminal: BAND[0] });
    for (const n of [BAND[0] - 1, 10000, LEGACY_BAND[0] - 1, LEGACY_BAND[1] + 1]) expect(parseRunTarget(n)).toBeNull();
  });

  it('the allowlist admits its reads, signal and DELETE (never a create)', () => {
    const n = LEGACY_BAND[0];
    expect(route('terminal', n, 'GET', '/api/v1/terminal/workloads', { terminal_id: n, incarnation: I, command_id: 7 }, undefined)).toBeNull();
    expect(route('terminal', n, 'POST', '/api/v1/terminal/workloads/7/signal', { terminal_id: n }, { incarnation: I, signal: 'TERM' })).toBeNull();
    expect(route('terminal', n, 'DELETE', `/api/v1/terminal/${n}`, { incarnation: I }, undefined)).toBeNull();
    expect(route('display', n, 'GET', '/api/v1/display/windows', { displayId: n }, undefined)).toBeNull();
    expect(route('terminal', 10000, 'GET', '/api/v1/terminal/workloads', { terminal_id: 10000 }, undefined)).toBe('ROUTE_REFUSED');
  });

  it('status and close reach it through the allowlist and end it', async () => {
    const k = new FakeKits();
    const { m, refused } = machine(k);
    const r = await m.open({ app: 'htop' });
    expect(r.ok).toBe(true);
    // Move the launch to the old band, as if an earlier Hub had made it there.
    const from = r.handle!.terminal_id;
    const to = LEGACY_BAND[0];
    k.sessions.set(to, k.sessions.get(from)!);
    k.sessions.delete(from);
    for (const w of k.workloads) if (w.terminal_id === String(from)) w.terminal_id = String(to);
    const old: RunHandle = { ...r.handle!, terminal_id: to, display: to };
    const s = await m.status(old);
    expect(s.state).toBe('running');
    const c = await m.close(old);
    expect([c.state, c.code]).toEqual(['stopped', 'stopped']);
    expect(k.deletes).toEqual([{ n: to, incarnation: old.incarnation }]);
    expect(refused).toEqual([]);
  });
});

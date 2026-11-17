// core/run-open: the Hub drives the SHARED run-open core (byte-identical to the SDK's) and every request it sends
// passes the kit allowlist (route()). The machine's own behaviour is proven by the SDK's 1300-line suite
// (hoody-sdk/tests/unit/run-open-core.test.ts); here: the copy is the same bytes, the facade loads it, the C9
// replay rules hold through the facade, and the allowlist admits exactly what the machine emits.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '../test/monorepo';
import copy from './run-open-core.js?raw';
import served from '../../../../public/auth/hub-run-open-core.js?raw';
import { FakeKits, type Sent } from './fakeKits';
import { carried, SDK_CARRY } from './sdk-carry';
import { createRunOpen, formatRunHandle, parseRunTarget, route, runOpenCodes, scrubResolveAnswer, type RunSend } from './index';

// HUB_RUNOPEN_SDK points the drift tests at another SDK file (red proofs in a scratch copy).
const SDK = monorepoPath(process.env.HUB_RUNOPEN_SDK, 'hoody-sdk-generator', 'hoody-sdk', 'lib', 'run-open-core.js') ?? '';
const count = (text: string, part: string): number => text.split(part).length - 1;
const COMPUTER = { project: 'p1', computer_id: 'c0ffee' };

/** The fake kits' send, behind route(): a request the allowlist refuses fails the test, never reaches the kit. */
function guarded(k: FakeKits): { send: RunSend; refused: Sent[] } {
  const refused: Sent[] = [];
  const send: RunSend = (target, method, path, query, body) => {
    if (route(target.kit, target.index, method, path, query ?? {}, body) !== null) {
      refused.push({ target, method, path, query: query as Record<string, string>, body });
      return Promise.reject({ notSent: true, code: 'ROUTE_REFUSED' });
    }
    return k.send(target, method, path, query as Record<string, string>, body) as ReturnType<RunSend>;
  };
  return { send, refused };
}

function machine(k: FakeKits) {
  const g = guarded(k);
  return { m: createRunOpen({ send: g.send, now: k.now, sleep: k.sleep, random: k.random, computer: COMPUTER }), refused: g.refused };
}

describe('the shared core, byte for byte (plus the listed SDK carry)', () => {
  it('core/run-open/run-open-core.js is the served file, with the carry applied', () => {
    expect(copy).toBe(carried(served));
  });
  it('every carry entry is in this copy exactly once', () => {
    for (const [, to] of SDK_CARRY) expect(count(copy, to)).toBe(1);
  });
  it('the carry applies as nothing to a file that already took it (an SDK that landed it stays in step)', () => {
    for (const [from] of SDK_CARRY) expect(count(copy, from)).toBe(0);
    expect(carried(copy)).toBe(copy);
  });
});

// Drift guard: the SDK copy and the Hub copy may differ only by sdk-carry.ts. Skipped (reported) on a host without
// the SDK tree.
describe.skipIf(!existsSync(SDK))('SDK drift: lib/run-open-core.js differs from the Hub copy only by sdk-carry.ts', () => {
  const sdk = existsSync(SDK) ? readFileSync(SDK, 'utf8') : '';
  it.each(SDK_CARRY.map((e, i) => [i, e] as const))('carry entry %i is either still owed by the SDK (its text once) or already taken (the new text once)', (_i, [from, to]) => {
    const owed = count(sdk, from);
    const taken = count(sdk, to);
    expect(owed === 1 || (owed === 0 && taken === 1)).toBe(true);
  });
  it('the SDK file with the carry applied is this copy byte for byte', () => {
    expect(carried(sdk)).toBe(copy);
  });
  it('the facade reaches the frozen global and its outcome codes', () => {
    const codes = runOpenCodes();
    for (const c of ['start_unconfirmed', 'stop_unconfirmed', 'not_started', 'ready', 'unknown', 'needs_update']) expect(codes).toContain(c);
  });
});

describe('open, observe, close through the facade, all inside the allowlist', () => {
  it('opens a terminal app: resolve before create, a tracked staged execute, a handle naming N, I and C', async () => {
    const k = new FakeKits();
    const { m, refused } = machine(k);
    const r = await m.open({ app: 'htop' });
    expect(r.ok).toBe(true);
    expect(r.handle?.terminal_id).toBe(8001);
    expect(r.handle?.incarnation).toMatch(/^[0-9a-f]{32}$/);
    const order = k.sent.map((s) => s.path);
    expect(order.indexOf('/api/v1/run/resolve')).toBeLessThan(order.indexOf('/api/v1/terminal/create'));
    expect(refused).toEqual([]);
    expect(parseRunTarget(formatRunHandle(r.handle!))).toMatchObject({ handle: { terminal_id: 8001 } });
  });

  it('a lost execute reply is replayed identically (same command id and body), never under a new id', async () => {
    const k = new FakeKits();
    k.faults.push((s) => (s.path === '/api/v1/terminal/execute' ? 'drop-reply' : undefined));
    const { m, refused } = machine(k);
    const r = await m.open({ app: 'htop' });
    const sends = k.of('/api/v1/terminal/execute');
    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
    expect(k.executions).toBe(1);
    expect(r.replayed).toBe(true);
    expect(refused).toEqual([]);
  });

  it('still no answer after the replays: unknown ("may have gone through"), the handle and terminal are kept', async () => {
    const k = new FakeKits();
    for (let i = 0; i < 4; i++) k.faults.push((s) => (s.path === '/api/v1/terminal/execute' ? 'drop-request' : undefined));
    const { m } = machine(k);
    const r = await m.open({ app: 'htop' });
    expect([r.state, r.code]).toEqual(['unknown', 'start_unconfirmed']);
    expect(r.handle).toBeDefined();
    expect(new Set(k.of('/api/v1/terminal/execute').map((s) => s.body.id)).size).toBe(1);
    expect(k.deletes).toEqual([]);
  });

  it('a window app reads ready only from a member window, on display N', async () => {
    const k = new FakeKits();
    k.resolve = FakeKits.resolveAnswer({ title: 'Mousepad', starter: { catalog_id: 'x', opens_in: 'window' } });
    const { m, refused } = machine(k);
    const r = await m.open({ app: 'mousepad' });
    await m.status(r.handle!);
    k.windows = [{ windowId: 1, pid: k.workloads[0]!.members[1] }];
    const s = await m.status(r.handle!);
    expect(s.state).toBe('ready');
    expect(refused).toEqual([]);
  });

  it('close: INT, stopped, then DELETE with the incarnation the machine created', async () => {
    const k = new FakeKits();
    const { m, refused } = machine(k);
    const r = await m.open({ app: 'htop' });
    await m.status(r.handle!);
    const c = await m.close(r.handle!);
    expect([c.state, c.code]).toEqual(['stopped', 'stopped']);
    expect(k.deletes).toEqual([{ n: 8001, incarnation: r.handle!.incarnation }]);
    expect(refused).toEqual([]);
  });

  it('an OCI app closes through terminal-0 raw read probes only, and they pass the raw-only rule', async () => {
    const k = new FakeKits();
    k.behaviour = { oci: true };
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    const { m, refused } = machine(k);
    const r = await m.open({ app: 'alpine' });
    await m.status(r.handle!);
    const c = await m.close(r.handle!);
    expect(c.state).toBe('stopped');
    expect(k.sent.filter((s) => s.target.index === 0 && s.method === 'POST').every((s) => s.body.mode === 'raw' && s.query?.ephemeral === 'true')).toBe(true);
    expect(refused).toEqual([]);
  });

  it('a handle from another computer is refused unsent', async () => {
    const k = new FakeKits();
    const { m } = machine(k);
    const r = await m.open({ app: 'htop' });
    const before = k.sent.length;
    const s = await m.status({ ...r.handle!, computer: { project: 'p2', computer_id: 'beef00' } });
    expect([s.code, s.notSent]).toEqual(['wrong_computer', true]);
    expect(k.sent.length).toBe(before);
  });
});

describe('secrets', () => {
  it('scrubResolveAnswer blanks every launch_env value in place and removes the member', () => {
    const a: Record<string, unknown> = { launch_env: { A: { value: 'secret-1', secret: true }, B: 'secret-2' } };
    const le = a.launch_env as Record<string, unknown>;
    expect(scrubResolveAnswer(a)).toBe(2);
    expect(a.launch_env).toBeUndefined();
    expect(JSON.stringify(le)).not.toContain('secret-');
  });
  it('the resolver secret reaches only the execute env, never the command or the result', async () => {
    const k = new FakeKits();
    const { m } = machine(k);
    const r = await m.open({ app: 'htop' });
    const ex = k.of('/api/v1/terminal/execute')[0]!;
    expect(String(ex.body.command)).not.toContain('ai-secret-value-123');
    expect(JSON.stringify(r)).not.toContain('ai-secret-value-123');
  });
});

describe('env names', () => {
  it('a variable named __proto__ (a legal name, as the Apps options send it) reaches the execute env as itself', async () => {
    const k = new FakeKits();
    const { m, refused } = machine(k);
    // Parsed, so __proto__ is an own entry (an object literal would set the prototype instead).
    const env: Record<string, string> = JSON.parse('{"__proto__":"proto-1","A":"a"}');
    const r = await m.open({ app: 'htop', env });
    expect(r.ok).toBe(true);
    const sent = k.of('/api/v1/terminal/execute')[0]!.body.env;
    expect(Object.getOwnPropertyDescriptor(sent, '__proto__')?.value).toBe('proto-1');
    expect(sent.A).toBe('a');
    expect(refused).toEqual([]);
  });
});

describe('route(): only the allowlist leaves', () => {
  const I = '0123456789abcdef0123456789abcdef';
  const TAG = '0123456789abcdef';
  const ok: Array<[string, number, string, string, Record<string, unknown>, unknown?]> = [
    ['run', 1, 'GET', '/api/v1/run/capabilities', {}],
    ['run', 1, 'GET', '/api/v1/run/catalog', { q: 'text editor' }],
    ['run', 1, 'GET', '/api/v1/run/search', { app: 'gimp', source: 'nix' }],
    ['run', 1, 'POST', '/api/v1/run/resolve', {}, { app: 'jupyterlab', pick: 'first', launch_tag: TAG, launch_env: 'separate', args: ['--x'], pass_env: ['K'] }],
    ['terminal', 0, 'GET', '/api/v1/terminal/capabilities', {}],
    ['terminal', 0, 'GET', '/api/v1/terminal/sessions', {}],
    ['terminal', 0, 'GET', '/api/v1/system/ports', {}],
    ['terminal', 0, 'POST', '/api/v1/terminal/execute', { ephemeral: 'true' }, { command: 'docker ps', mode: 'raw', wait: true }],
    ['terminal', 8001, 'POST', '/api/v1/terminal/create', { terminal_id: 8001 }, { terminal_id: '8001', exclusive: true, display: '8001', wait_until_display: false, user: 'user' }],
    ['terminal', 9999, 'POST', '/api/v1/terminal/execute', { terminal_id: 9999, skip_display_wait: 'true' }, { command: 'x', wait: false, id: '7', require_staged: true, track: true, incarnation: I, track_label: 'run:app:' + TAG, env: {} }],
    // Open with: a window open's execute without skip_display_wait, an execute cwd, a create pinned to bash.
    ['terminal', 8001, 'POST', '/api/v1/terminal/execute', { terminal_id: 8001 }, { command: 'x', wait: false, id: '7', require_staged: true, track: true, incarnation: I, track_label: 'run:app:' + TAG, env: {}, cwd: '/srv/a b' }],
    ['terminal', 8001, 'POST', '/api/v1/terminal/create', { terminal_id: 8001 }, { terminal_id: '8001', exclusive: true, display: '8001', wait_until_display: false, user: 'user', shell: '/bin/bash', cwd: '/srv' }],
    ['terminal', 8001, 'GET', '/api/v1/terminal/workloads', { terminal_id: 8001, incarnation: I, command_id: 7 }],
    // A launch made before, in the old band, is still read, signalled and deleted.
    ['terminal', 15001, 'GET', '/api/v1/terminal/workloads', { terminal_id: 15001, incarnation: I, command_id: 7 }],
    ['terminal', 15001, 'POST', '/api/v1/terminal/workloads/7/signal', { terminal_id: 15001 }, { incarnation: I, signal: 'TERM' }],
    ['terminal', 0, 'POST', '/api/v1/terminal/execute', { terminal_id: 0, ephemeral: 'true' }, { command: 'docker ps', mode: 'raw', user: 'user' }],
    ['terminal', 15001, 'DELETE', '/api/v1/terminal/15001', { incarnation: I }],
    ['display', 15001, 'GET', '/api/v1/display/windows', { displayId: 15001 }],
  ];
  it.each(ok)('allows %s-%s %s %s', (kit, n, m, p, q, b) => expect(route(kit, n, m, p, q, b)).toBeNull());

  const refused: Array<[string, string, number, string, string, Record<string, unknown>, unknown?]> = [
    ['terminal-N below the band', 'terminal', 8000, 'POST', '/api/v1/terminal/create', { terminal_id: 8000 }],
    ['terminal-N above the band (ids are valid up to 9999)', 'terminal', 10000, 'POST', '/api/v1/terminal/create', { terminal_id: 10000 }],
    ['a create in the old band', 'terminal', 15001, 'POST', '/api/v1/terminal/create', { terminal_id: 15001 }, { terminal_id: '15001', exclusive: true, display: '15001', wait_until_display: false, user: 'user' }],
    ['a read past both bands', 'terminal', 20000, 'GET', '/api/v1/terminal/workloads', { terminal_id: 20000 }],
    ['terminal-1 (a user terminal)', 'terminal', 1, 'POST', '/api/v1/terminal/execute', { terminal_id: 1 }],
    ['a body N that is not the host N', 'terminal', 8001, 'POST', '/api/v1/terminal/create', { terminal_id: 8002 }],
    ['DELETE of another N', 'terminal', 15001, 'DELETE', '/api/v1/terminal/15002', { incarnation: I }],
    ['DELETE without the incarnation', 'terminal', 15001, 'DELETE', '/api/v1/terminal/15001', {}],
    ['display of another N', 'display', 15001, 'GET', '/api/v1/display/windows', { displayId: 15002 }],
    ['an unknown query key', 'run', 1, 'GET', '/api/v1/run/catalog', { q: 'x', source: 'nix' }],
    ['a query string inside the path', 'run', 1, 'GET', '/api/v1/run/catalog?q=x', {}],
    ['a run write the Hub never makes', 'run', 1, 'POST', '/api/v1/run/sources', {}],
    ['the old abort route', 'terminal', 15001, 'POST', '/api/v1/terminal/execute/7/abort', {}],
    ['a session command on terminal-0', 'terminal', 0, 'POST', '/api/v1/terminal/execute', { ephemeral: 'true' }, { command: 'id', mode: 'session' }],
    ['terminal-0 execute naming another terminal', 'terminal', 0, 'POST', '/api/v1/terminal/execute', { terminal_id: 15001, ephemeral: 'true' }, { command: 'id', mode: 'raw' }],
    ['a signal naming another terminal', 'terminal', 15001, 'POST', '/api/v1/terminal/workloads/7/signal', { terminal_id: 15002 }],
    ['terminal-0 execute without ephemeral', 'terminal', 0, 'POST', '/api/v1/terminal/execute', {}, { command: 'id', mode: 'raw' }],
    ['run on index 2', 'run', 2, 'GET', '/api/v1/run/capabilities', {}],
    ['an unknown kit', 'files', 1, 'GET', '/api/v1/files/list', {}],
    ['an object query value', 'run', 1, 'GET', '/api/v1/run/catalog', { q: { $gt: '' } }],
    ['a window properties read (no longer sent)', 'display', 15001, 'GET', '/api/v1/display/window/9/properties', {}],
    ['a body key the core never sends', 'run', 1, 'POST', '/api/v1/run/resolve', {}, { app: 'x', source_policy: 'any' }],
    ['a read with a body', 'run', 1, 'GET', '/api/v1/run/catalog', {}, { q: 'x' }],
    ['a write with no body', 'terminal', 8001, 'POST', '/api/v1/terminal/create', { terminal_id: 8001 }],
    ['a DELETE with a body', 'terminal', 15001, 'DELETE', '/api/v1/terminal/15001', { incarnation: I }, { force: true }],
    ['a launch create with a shell other than /bin/bash', 'terminal', 8001, 'POST', '/api/v1/terminal/create', { terminal_id: 8001 }, { terminal_id: '8001', exclusive: true, display: '8001', wait_until_display: false, user: 'user', shell: 'fish' }],
    ['a launch create with a command', 'terminal', 8001, 'POST', '/api/v1/terminal/create', { terminal_id: 8001 }, { terminal_id: '8001', exclusive: true, display: '8001', user: 'user', command: 'id' }],
    ['a launch execute naming a shell', 'terminal', 8001, 'POST', '/api/v1/terminal/execute', { terminal_id: 8001 }, { command: 'x', incarnation: I, shell: 'bash' }],
    ['a launch execute with a reset', 'terminal', 8001, 'POST', '/api/v1/terminal/execute', { terminal_id: 8001, reset: 'true' }, { command: 'x', incarnation: I }],
  ];
  it.each(refused)('refuses %s', (_why, kit, n, m, p, q, b) => expect(route(kit, n, m, p, q, b)).toBe('ROUTE_REFUSED'));
});

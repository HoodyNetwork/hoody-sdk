// The Board's kit requests (items 34e, 36, 42b): boardRoute() admits exactly the BOARD_KIT_ROUTES rows and
// boardSend() sends nothing else, through core's api() and its admission guard.
import { describe, expect, it } from 'vitest';
import { api, outcomeOf } from '../api';
import { boot, calls, onFetch, PROXY, TARGET } from '../test/env';
import { BOARD_DECLARED, boardSend } from './board';
import { BOARD_IDS, BOARD_KIT_ROUTES, boardRoute, route } from './kitRoutes';

const NB = 'k3x9q2m7v1c8b4n6z0p5r2t7';
const NODE = 'a1b2c3d4e5f6a7b8c9d0e1f2g3';
const INC = '0123456789abcdef0123456789abcdef';
const ok = (...a: Parameters<typeof boardRoute>) => expect(boardRoute(...a)).toBeNull();
const no = (...a: Parameters<typeof boardRoute>) => expect(boardRoute(...a)).toBe('ROUTE_REFUSED');
const create = (body: unknown, n = 7, query: Record<string, unknown> = {}) => boardRoute('terminal', n, 'POST', '/api/v1/terminal/create', query, body);

describe('boardRoute: the rows it admits', () => {
  it('terminal sessions, create, DELETE on Board ids 1-8000', () => {
    for (const n of [BOARD_IDS[0], 7, BOARD_IDS[1]]) {
      ok('terminal', n, 'GET', '/api/v1/terminal/sessions', {}, undefined);
      expect(create({ terminal_id: n }, n)).toBeNull();
      expect(create({ terminal_id: n, shell: 'zsh' }, n, { terminal_id: String(n) })).toBeNull();
      ok('terminal', n, 'DELETE', `/api/v1/terminal/${n}`, { incarnation: INC }, undefined);
    }
    for (const shell of ['bash', 'zsh', 'fish', 'sh']) expect(create({ terminal_id: 7, shell })).toBeNull();
  });
  it('create over SSH: host and user together, a port 1-65535, never a secret', () => {
    expect(create({ terminal_id: 7, ssh_host: 'db.example.com', ssh_user: 'deploy' })).toBeNull();
    expect(create({ terminal_id: 7, ssh_host: '10.0.0.5', ssh_user: 'root', ssh_port: 2222 })).toBeNull();
    expect(create({ terminal_id: 7, ssh_host: '2001:db8::1', ssh_user: 'a.b-c_d', ssh_port: 1 })).toBeNull();
    expect(create({ terminal_id: 7, ssh_host: 'h', ssh_user: 'u', ssh_port: 65535 })).toBeNull();
  });
  it('create with exclusive, a boolean, in the body only', () => {
    for (const exclusive of [true, false]) {
      expect(create({ terminal_id: 7, exclusive })).toBeNull();
      expect(create({ terminal_id: 7, shell: 'bash', exclusive })).toBeNull();
      expect(create({ terminal_id: 7, ssh_host: 'h', ssh_user: 'u', ssh_port: 22, exclusive })).toBeNull();
    }
    for (const exclusive of ['true', 1, 0, null, {}, []]) expect(create({ terminal_id: 7, exclusive })).toBe('ROUTE_REFUSED');
    for (const exclusive of [true, 'true']) expect(create({ terminal_id: 7 }, 7, { exclusive })).toBe('ROUTE_REFUSED');
  });
  it('Notes, index 1: notebooks, and one notebook\'s nodes with its read-only query', () => {
    ok('notes', 1, 'GET', '/api/v1/notes/notebooks', {}, undefined);
    ok('notes', 1, 'GET', `/api/v1/notes/notebooks/${NB}/nodes`, {}, undefined);
    ok('notes', 1, 'GET', `/api/v1/notes/notebooks/${NB}/nodes`, { type: 'page', parentId: NB, rootId: NODE, limit: '100', offset: '0' }, undefined);
    ok('notes', 1, 'GET', `/api/v1/notes/notebooks/${NB}/nodes`, { limit: 1, offset: 300 }, undefined);
    ok('notes', 1, 'GET', `/api/v1/notes/notebooks/${NB}/nodes`, { offset: '999999999' }, undefined);
  });
});

describe('boardRoute: everything else stays refused', () => {
  it('every other create key, in the body or the query', () => {
    for (const k of ['ssh_password', 'ssh_key', 'socks5_host', 'socks5_port', 'socks5_user', 'socks5_password', 'user', 'cmd', 'arg', 'env', 'startup_script', 'reset', 'ephemeral', 'cwd_auto_create', 'desktop', 'display', 'cwd', 'x']) {
      expect(create({ terminal_id: 7, [k]: 'v' })).toBe('ROUTE_REFUSED');
      expect(create({ terminal_id: 7 }, 7, { [k]: 'v' })).toBe('ROUTE_REFUSED');
    }
  });
  it('create: the terminal id must be the host\'s N, a known shell, SSH fields well formed and paired', () => {
    expect(create({})).toBe('ROUTE_REFUSED');
    expect(create({ terminal_id: 8 })).toBe('ROUTE_REFUSED');
    expect(create({ terminal_id: '7' })).toBe('ROUTE_REFUSED');
    expect(create({ terminal_id: 7 }, 7, { terminal_id: '8' })).toBe('ROUTE_REFUSED');
    expect(create({ terminal_id: 7 }, 7, { terminal_id: '07' })).toBe('ROUTE_REFUSED');
    for (const shell of ['tcsh', 'powershell', '/bin/bash', 'bash -c id', '', 1]) expect(create({ terminal_id: 7, shell })).toBe('ROUTE_REFUSED');
    expect(create({ terminal_id: 7, ssh_host: 'h' })).toBe('ROUTE_REFUSED');
    expect(create({ terminal_id: 7, ssh_user: 'u' })).toBe('ROUTE_REFUSED');
    expect(create({ terminal_id: 7, ssh_port: 22 })).toBe('ROUTE_REFUSED');
    for (const ssh_port of [0, 65536, 22.5, '22', -1]) expect(create({ terminal_id: 7, ssh_host: 'h', ssh_user: 'u', ssh_port })).toBe('ROUTE_REFUSED');
    for (const ssh_host of ['-oProxyCommand=id', '-v', '-4', 'a b', 'h\n', '', 'x'.repeat(254), 7]) expect(create({ terminal_id: 7, ssh_host, ssh_user: 'u' })).toBe('ROUTE_REFUSED');
    for (const ssh_user of ['-l', '-oX', 'a b', 'u;id', '', 'x'.repeat(65), null]) expect(create({ terminal_id: 7, ssh_host: 'h', ssh_user })).toBe('ROUTE_REFUSED');
  });
  it('Board ids 0 and 8001+ (the run-open band, then the old one), and non-integers', () => {
    for (const n of [0, 8001, 9999, 15000, 15001, 19999, 20000, -1, 7.5, '7']) {
      no('terminal', n, 'GET', '/api/v1/terminal/sessions', {}, undefined);
      expect(create({ terminal_id: n }, n as number)).toBe('ROUTE_REFUSED');
      no('terminal', n, 'DELETE', `/api/v1/terminal/${n}`, { incarnation: INC }, undefined);
    }
  });
  it('DELETE of any other id, without its incarnation, or with another query key or a body', () => {
    no('terminal', 7, 'DELETE', '/api/v1/terminal/8', { incarnation: INC }, undefined);
    no('terminal', 7, 'DELETE', '/api/v1/terminal/07', { incarnation: INC }, undefined);
    no('terminal', 7, 'DELETE', '/api/v1/terminal/sessions', { incarnation: INC }, undefined);
    no('terminal', 7, 'DELETE', '/api/v1/terminal/7', {}, undefined);
    for (const incarnation of ['', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), 'g'.repeat(32), INC + '\n', ' ' + INC.slice(1), 123, true, null, ['x']]) no('terminal', 7, 'DELETE', '/api/v1/terminal/7', { incarnation }, undefined);
    no('terminal', 7, 'DELETE', '/api/v1/terminal/7', { incarnation: INC, force: 'true' }, undefined);
    no('terminal', 7, 'DELETE', '/api/v1/terminal/7', { incarnation: INC }, {});
  });
  it('any Notes write or other Notes path, another index, a bad id or query value', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      no('notes', 1, m, '/api/v1/notes/notebooks', {}, m === 'DELETE' ? undefined : {});
      no('notes', 1, m, `/api/v1/notes/notebooks/${NB}/nodes`, {}, m === 'DELETE' ? undefined : {});
    }
    no('notes', 1, 'GET', `/api/v1/notes/notebooks/${NB}`, {}, undefined);
    no('notes', 1, 'GET', '/api/v1/notes/nodes', {}, undefined);
    no('notes', 1, 'GET', '/api/v1/notes/search', { q: 'x' }, undefined);
    no('notes', 2, 'GET', '/api/v1/notes/notebooks', {}, undefined);
    no('notes', 0, 'GET', '/api/v1/notes/notebooks', {}, undefined);
    for (const id of ['short', 'A1B2C3D4E5F6A7B8C9D0E1F2', 'a'.repeat(29), '../x']) no('notes', 1, 'GET', `/api/v1/notes/notebooks/${id}/nodes`, {}, undefined);
    const nodes = `/api/v1/notes/notebooks/${NB}/nodes`;
    for (const q of [{ offset: 1000000000 }, { offset: '1000000000' }, { parentId: 'x' }, { rootId: '../' }, { limit: '0' }, { limit: '101' }, { limit: '5.5' }, { limit: '05' }, { offset: '-1' }, { offset: 'x' }, { type: 'a b' }, { q: 'x' }, { userId: NB }]) {
      no('notes', 1, 'GET', nodes, q, undefined);
    }
    no('notes', 1, 'GET', '/api/v1/notes/notebooks', {}, {});
  });
  it('a non-object body, a non-scalar query value, a query in the path', () => {
    for (const body of [null, [], 'x', 7, [{ terminal_id: 7 }]]) expect(create(body)).toBe('ROUTE_REFUSED');
    expect(create({ terminal_id: 7 }, 7, { terminal_id: ['7'] })).toBe('ROUTE_REFUSED');
    no('notes', 1, 'GET', `/api/v1/notes/notebooks/${NB}/nodes`, { parentId: [NB] }, undefined);
    no('notes', 1, 'GET', `/api/v1/notes/notebooks/${NB}/nodes`, { limit: { n: 1 } }, undefined);
    no('notes', 1, 'GET', '/api/v1/notes/notebooks?x=1', {}, undefined);
    no('notes', 1, 'GET', '/api/v1/notes/notebooks', null, undefined);
    no('terminal', 7, 'GET', '/api/v1/terminal/sessions', {}, {});
  });
  it('other kits and the run-open rows: the two tables never admit each other\'s requests', () => {
    no('run', 1, 'GET', '/api/v1/run/capabilities', {}, undefined);
    no('terminal', 15001, 'POST', '/api/v1/terminal/create', { terminal_id: '15001' }, { terminal_id: 15001 });
    no('terminal', 0, 'GET', '/api/v1/terminal/sessions', {}, undefined);
    expect(route('terminal', 7, 'POST', '/api/v1/terminal/create', { terminal_id: '7' }, { terminal_id: 7, shell: 'zsh' })).toBe('ROUTE_REFUSED');
    expect(route('terminal', 7, 'DELETE', '/api/v1/terminal/7', {}, undefined)).toBe('ROUTE_REFUSED');
    expect(route('notes', 1, 'GET', '/api/v1/notes/notebooks', {}, undefined)).toBe('ROUTE_REFUSED');
  });
});

// Item 18: Restart terminal = execute on the host's own N with reset=true, the fixed no-op command and the incarnation
// of the shell it restarts (the terminal checks it before resetting: nothing else is ever restarted).
const restart = (query: Record<string, unknown>, body: unknown, n = 7) => boardRoute('terminal', n, 'POST', '/api/v1/terminal/execute', query, body);
const R = { terminal_id: '7', reset: 'true' };
const RB = { command: 'true', incarnation: INC };
describe('boardRoute: the restart row', () => {
  it('admits execute with ?terminal_id=N&reset=true and exactly {command: "true", incarnation} on Board ids 1-8000', () => {
    for (const n of [BOARD_IDS[0], 7, BOARD_IDS[1]]) expect(restart({ terminal_id: String(n), reset: 'true' }, RB, n)).toBeNull();
    expect(restart({ terminal_id: 7, reset: true }, RB)).toBeNull();
  });
  it('refuses another N, a missing or false reset, a missing terminal_id, or any other query key', () => {
    expect(restart({ terminal_id: '8', reset: 'true' }, RB)).toBe('ROUTE_REFUSED');
    expect(restart({ terminal_id: '07', reset: 'true' }, RB)).toBe('ROUTE_REFUSED');
    expect(restart({ terminal_id: '7' }, RB)).toBe('ROUTE_REFUSED');
    for (const reset of ['false', false, '1', '', 'yes']) expect(restart({ terminal_id: '7', reset }, RB)).toBe('ROUTE_REFUSED');
    expect(restart({ reset: 'true' }, RB)).toBe('ROUTE_REFUSED');
    for (const k of ['ephemeral', 'cwd', 'shell', 'user', 'ssh_host', 'skip_display_wait', 'pid']) expect(restart({ ...R, [k]: 'x' }, RB)).toBe('ROUTE_REFUSED');
    expect(restart({ terminal_id: '15001', reset: 'true' }, RB, 15001)).toBe('ROUTE_REFUSED');
  });
  it('refuses any other command, a missing or malformed incarnation, any other body key, or no body', () => {
    for (const command of ['', 'true ', 'rm -rf ~', 'clear', true, null]) expect(restart(R, { command, incarnation: INC })).toBe('ROUTE_REFUSED');
    expect(restart(R, { command: 'true' })).toBe('ROUTE_REFUSED');
    for (const incarnation of ['', 'a'.repeat(31), 'A'.repeat(32), INC + '\n', 123, null]) expect(restart(R, { command: 'true', incarnation })).toBe('ROUTE_REFUSED');
    for (const k of ['env', 'cwd', 'track', 'id', 'wait', 'timeout', 'terminal_id', 'mode', 'user']) expect(restart(R, { ...RB, [k]: 'x' })).toBe('ROUTE_REFUSED');
    expect(restart(R, undefined)).toBe('ROUTE_REFUSED');
    expect(restart(R, 'true')).toBe('ROUTE_REFUSED');
  });
  it('an optional shell query names one of the Board shells (a reset starts the shell the request names)', () => {
    for (const shell of ['bash', 'zsh', 'fish', 'sh']) expect(restart({ ...R, shell }, RB)).toBeNull();
    for (const shell of ['', 'x', '/bin/bash', 'bash ', 'BASH', 'pwsh', 1, true]) expect(restart({ ...R, shell }, RB)).toBe('ROUTE_REFUSED');
    expect(restart({ terminal_id: '7', shell: 'zsh' }, RB)).toBe('ROUTE_REFUSED');
  });
  it('409 SHELL_REPLACED (it comes after the reset) reads pending; a refusal before the reset reads failed', async () => {
    const ex = BOARD_DECLARED.find((d) => d.method === 'POST' && d.match.test('/api/v1/terminal/execute'))!.route;
    for (const [code, kind] of [['SHELL_REPLACED', 'pending'], ['EXECUTE_QUEUE_BUSY', 'failed'], ['INCARNATION_MISMATCH', 'failed']] as const) {
      boot();
      onFetch(() => ({ status: 409, body: { error: code } }));
      const e = await api(ex, { target: TARGET, index: 7, query: R, body: RB }).then(() => null, (x: unknown) => x);
      expect([code, outcomeOf(e, true)]).toEqual([code, kind]);
      expect(calls).toHaveLength(1);
    }
  });
  it('the run-open rows still never admit it, and it never admits theirs', () => {
    expect(route('terminal', 7, 'POST', '/api/v1/terminal/execute', R, RB)).toBe('ROUTE_REFUSED');
    expect(restart({ terminal_id: '7', skip_display_wait: 'true' }, { command: 'ls', wait: true, incarnation: INC, track: true })).toBe('ROUTE_REFUSED');
  });
  it('sends to the program\'s own address, query and body as given; core admission refuses a bad one unsent', async () => {
    boot();
    onFetch(() => ({ status: 200, body: { ok: true } }));
    await boardSend({ kit: 'terminal', index: 7 }, 'POST', '/api/v1/terminal/execute', { target: TARGET, query: R, body: RB });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST https://p1-c1-terminal-7.sv1.${PROXY}/api/v1/terminal/execute?terminal_id=7&reset=true`]);
    expect(calls[0]!.body).toEqual(RB);
    const ex = BOARD_DECLARED.find((d) => d.method === 'POST' && d.match.test('/api/v1/terminal/execute'))!.route;
    await expect(api(ex, { target: TARGET, index: 7, query: R, body: { command: 'ls', incarnation: INC } })).rejects.toMatchObject({ notSent: true });
    await expect(api(ex, { target: TARGET, index: 7, query: { terminal_id: '7' }, body: RB })).rejects.toMatchObject({ notSent: true });
    expect(calls).toHaveLength(1);
  });
});

describe('boardSend over core api()', () => {
  it('declares one kit route per row', () => {
    expect(BOARD_DECLARED).toHaveLength(BOARD_KIT_ROUTES.length);
    for (const d of BOARD_DECLARED) expect(d.route.path).not.toMatch(/[\\^$()[\]{}]/);
  });
  it('sends each allowed request to the program\'s own address, credentials omitted', async () => {
    boot();
    onFetch(() => ({ status: 200, body: { ok: true } }));
    const o = { target: TARGET };
    await boardSend({ kit: 'terminal', index: 7 }, 'GET', '/api/v1/terminal/sessions', o);
    await boardSend({ kit: 'terminal', index: 7 }, 'POST', '/api/v1/terminal/create', { ...o, body: { terminal_id: 7, ssh_host: 'h', ssh_user: 'u', ssh_port: 22 } });
    await boardSend({ kit: 'terminal', index: 7 }, 'DELETE', '/api/v1/terminal/7', { ...o, query: { incarnation: INC } });
    await boardSend({ kit: 'notes', index: 1 }, 'GET', `/api/v1/notes/notebooks/${NB}/nodes`, { ...o, query: { parentId: NB, limit: 100 } });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET https://p1-c1-terminal-7.sv1.${PROXY}/api/v1/terminal/sessions`,
      `POST https://p1-c1-terminal-7.sv1.${PROXY}/api/v1/terminal/create`,
      `DELETE https://p1-c1-terminal-7.sv1.${PROXY}/api/v1/terminal/7?incarnation=${INC}`,
      `GET https://p1-c1-notes-1.sv1.${PROXY}/api/v1/notes/notebooks/${NB}/nodes?parentId=${NB}&limit=100`,
    ]);
    expect(calls[1]!.body).toEqual({ terminal_id: 7, ssh_host: 'h', ssh_user: 'u', ssh_port: 22 });
    expect(calls.every((c) => c.credentials === 'omit')).toBe(true);
  });
  it('a refused request rejects {notSent, ROUTE_REFUSED} and nothing leaves', async () => {
    boot();
    onFetch(() => ({ status: 200, body: {} }));
    const o = { target: TARGET };
    await expect(boardSend({ kit: 'terminal', index: 7 }, 'POST', '/api/v1/terminal/create', { ...o, body: { terminal_id: 7, ssh_password: 'x' } })).rejects.toEqual({ notSent: true, code: 'ROUTE_REFUSED' });
    await expect(boardSend({ kit: 'terminal', index: 7 }, 'DELETE', '/api/v1/terminal/8', { ...o, query: { incarnation: INC } })).rejects.toEqual({ notSent: true, code: 'ROUTE_REFUSED' });
    await expect(boardSend({ kit: 'terminal', index: 7 }, 'DELETE', '/api/v1/terminal/7', o)).rejects.toEqual({ notSent: true, code: 'ROUTE_REFUSED' });
    await expect(boardSend({ kit: 'terminal', index: 15001 }, 'GET', '/api/v1/terminal/sessions', o)).rejects.toEqual({ notSent: true, code: 'ROUTE_REFUSED' });
    await expect(boardSend({ kit: 'notes', index: 1 }, 'POST', '/api/v1/notes/notebooks', { ...o, body: {} })).rejects.toEqual({ notSent: true, code: 'ROUTE_REFUSED' });
    expect(calls).toHaveLength(0);
  });
  it('core admission runs the same guard: a declared route called around boardSend is still refused unsent', async () => {
    boot();
    onFetch(() => ({ status: 200, body: {} }));
    const create = BOARD_DECLARED.find((d) => d.method === 'POST')!.route;
    const del = BOARD_DECLARED.find((d) => d.method === 'DELETE')!.route;
    await expect(api(create, { target: TARGET, index: 7, body: { terminal_id: 8 } })).rejects.toMatchObject({ notSent: true });
    await expect(api(create, { target: TARGET, index: 7, body: { terminal_id: 7, shell: 'tcsh' } })).rejects.toMatchObject({ notSent: true });
    await expect(api(del, { target: TARGET, index: 7, params: { n: '8' }, query: { incarnation: INC } })).rejects.toMatchObject({ notSent: true });
    await expect(api(del, { target: TARGET, index: 7, params: { n: '7' } })).rejects.toMatchObject({ notSent: true });
    await expect(api(del, { target: TARGET, index: 7, params: { n: '7' }, query: { incarnation: 'A'.repeat(32) } })).rejects.toMatchObject({ notSent: true });
    await expect(api(create, { target: TARGET, index: 15001, body: { terminal_id: 15001 } })).rejects.toMatchObject({ notSent: true });
    expect(calls).toHaveLength(0);
  });
});

describe('the code row: the editor\'s extension list, read only', () => {
  const LIST = '/api/v1/code/extensions/list';
  it('admits the one GET on code-1, with no query and no body', () => {
    ok('code', 1, 'GET', LIST, {}, undefined);
  });
  it('refuses any other method, index, path, query or a body', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) no('code', 1, m, LIST, {}, m === 'DELETE' ? undefined : {});
    for (const n of [0, 2, 7, '1']) no('code', n, 'GET', LIST, {}, undefined);
    for (const q of [{ id: '1' }, { id: 1 }, { extension: 'a.b' }]) no('code', 1, 'GET', LIST, q, undefined);
    no('code', 1, 'GET', LIST, {}, {});
    for (const p of ['/api/v1/code/extensions/install', '/api/v1/code/extensions', '/api/v1/code', LIST + '/', LIST + '?id=1']) no('code', 1, 'GET', p, {}, undefined);
    no('notes', 1, 'GET', LIST, {}, undefined);
    no('terminal', 1, 'GET', LIST, {}, undefined);
  });
  it('boardSend reads it from the computer\'s code-1 address, credentials omitted', async () => {
    boot();
    onFetch(() => ({ status: 200, body: { ok: true } }));
    await boardSend({ kit: 'code', index: 1 }, 'GET', LIST, { target: TARGET });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET https://p1-c1-code-1.sv1.${PROXY}${LIST}`]);
    expect(calls[0]!.credentials).toBe('omit');
    await expect(boardSend({ kit: 'code', index: 2 }, 'GET', LIST, { target: TARGET })).rejects.toEqual({ notSent: true, code: 'ROUTE_REFUSED' });
    expect(calls).toHaveLength(1);
  });
});

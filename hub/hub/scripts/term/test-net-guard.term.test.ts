// The test harness's outside-world fence (test-net-guard.ts).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | fetch / WebSocket / net / tls / http / Bun.connect to anything but a listener this process opened are refused before any wire or DNS work, and counted | 'outbound refused' |
// | 2 | A listener the test opened (Bun.serve, node http server) is reachable on loopback | 'own listener reachable' |
// | 3 | No subprocess: Bun.spawn(Sync) and every child_process entry (named imports included) refuse | 'no subprocess' |
// | 4 | Environment: only the kept keys survive; HOME and the config dirs are one fresh empty directory; ~/.hoody is out of reach | 'minimal environment' |
// | 6 | Installed by the preload, not by this file: without the preload this test fails | 'preload installed it' |
// | 7 | A redirect is a new target: one to outside is refused, one to the own listener is followed, 'manual' gets the 3xx, 'error' rejects; fetch's unix/proxy options are refused | 'redirects checked' |
// | 8 | A closed listener is no longer reachable (Bun.serve stop, node server close); a listener's address is its own (127.0.0.1 is not ::1) | 'closed and address-checked' |
// | 5 | The tooling's knobs survive the scrub (UPDATE_GOLDEN, TERM_*, HUB_*, every VAR= the term docs name); credentials do not | 'tooling knobs kept' |
// | 9 | `localhost` is refused even with an own listener (either family); a listen with no host or `localhost` is pinned to 127.0.0.1 | 'names refused, listens pinned' |
// | 10 | `::` answers IPv4 only when dual-stack: an ipv6Only listener is not reachable on 127.0.0.1; 0.0.0.0 is not reachable on ::1 | 'listener families' |
// | 11 | No DNS (node:dns, Bun.dns) and no UDP (node:dgram, Bun.udpSocket) | 'no dns, no udp' |
// | 12 | A Bun Worker starts with the fence (test mode): its outbound fetch is refused | 'worker fenced' |
// | 13 | dns.Resolver / dns.promises.Resolver instances and reverse lookups refused | 'dns Resolver instances refused' |
// | 14 | A node server's permission ends when close() is called, not at the 'close' event (held connections) | 'close() ends the permission when called, while connections keep the server open' |
// Runner mode and the child-process chain (a fence that follows Bun and Node children, vitest workers) cannot run in a
// test (no subprocess here): scripts/term/net-guard-proof.ts proves them; check.ts runs it in the tests gate.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import net, { connect as namedConnect } from 'node:net';
import http from 'node:http';
import { spawnSync, execSync } from 'node:child_process';
import path from 'node:path';
import dns from 'node:dns';
import dgram, { Socket as NamedSocket, createSocket as namedCreateSocket } from 'node:dgram';
import { ENV_RULES, envKept, netGuardHome, netGuardInstalled, netGuardListeners, netGuardMode, netGuardRefusals, scrubEnv } from './test-net-guard';

// Deliberately no installNetGuard() here: the preload must have installed the fence ('preload installed it').

test('outbound refused', async () => {
  const before = netGuardRefusals().length;
  await expect(fetch('https://api.hoody.invalid/api/v1/me')).rejects.toThrow('TERM_NET_DENIED');
  await expect(fetch('http://127.0.0.1:9/')).rejects.toThrow('TERM_NET_DENIED');
  await expect(fetch(new Request('http://localhost:1/x'))).rejects.toThrow('TERM_NET_DENIED');
  expect(() => new WebSocket('wss://example.invalid/socket')).toThrow('TERM_NET_DENIED');
  expect(() => net.connect(443, 'example.invalid')).toThrow('TERM_NET_DENIED');
  expect(() => net.createConnection({ path: '/var/run/docker.sock' })).toThrow('TERM_NET_DENIED');
  expect(() => http.get('http://example.invalid/')).toThrow('TERM_NET_DENIED');
  expect(() => Bun.connect({ hostname: '10.0.0.1', port: 22, socket: { data() {} } })).toThrow('TERM_NET_DENIED');
  // A named import binds the original function: it still ends in the wrapped Bun.connect.
  expect(() => namedConnect(1, '127.0.0.1')).toThrow('TERM_NET_DENIED');
  expect(netGuardRefusals().length - before).toBe(9);
});

test('own listener reachable', async () => {
  const s = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('own') });
  try {
    expect(await (await fetch(`http://127.0.0.1:${s.port}/`)).text()).toBe('own');
  } finally { s.stop(true); }
  const h = http.createServer((_q, r) => r.end('node own'));
  await new Promise<void>((r) => h.listen(0, '127.0.0.1', () => r()));
  try {
    const port = (h.address() as { port: number }).port;
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('node own');
  } finally { h.close(); }
});

test('no subprocess', () => {
  expect(() => Bun.spawn(['true'])).toThrow('TERM_SPAWN_DENIED');
  expect(() => Bun.spawnSync(['true'])).toThrow('TERM_SPAWN_DENIED');
  // node:child_process runs on Bun.spawn(Sync): spawnSync reports the refusal as its error, execSync throws it.
  expect(String(spawnSync('true').error)).toContain('TERM_SPAWN_DENIED');
  expect(() => execSync('true')).toThrow('TERM_SPAWN_DENIED');
});

test('minimal environment', () => {
  for (const k of Object.keys(process.env)) expect(envKept(k, process.env[k]) || ['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'HOODY_CONFIG_DIR'].includes(k)).toBe(true);
  expect(process.env.HOODY_TOKEN).toBeUndefined();
  expect(process.env.HOME).toBe(netGuardHome());
  expect(os.homedir()).toBe(netGuardHome());
  expect(netGuardHome()).toContain('/.term-cache/test-homes/');
  expect(fs.readdirSync(netGuardHome())).toEqual([]);
  expect(fs.existsSync(`${process.env.HOME}/.hoody`)).toBe(false);
  expect(netGuardHome()).not.toBe('/home/user');
});

test('tooling knobs kept: named keys only, each value checked (no prefix retention)', () => {
  const env: Record<string, string | undefined> = { UPDATE_GOLDEN: '1', TERM_HOLD_LONG: '0', TERM_SETTLE_STILL: '5', HUB_PAGE: 'keys',
    GRAPH_FIXTURES_DIR: '/g', SECRETS_PAGE_TIMEOUT_MS: '9', BUN_X: '1', HOODY_TOKEN: 'hdy_x', DB_STORAGE: '/real.sqlite', AWS_SECRET_ACCESS_KEY: 's', OPENAI_API_KEY: 'k',
    // Keys a prefix rule would keep, and named keys carrying a bad or credential-looking value:
    HUB_TOKEN: 'SENTINEL-env', BUN_CONFIG_TOKEN: 'SENTINEL-env', TERM_SECRET: 'SENTINEL-env', HUB_BASE_URL: 'https://api.hoody.invalid',
    HUB_CHECK_PAGE: 'hdy_abcdefghijklmnop', TERM_SETTLE_STILL_X: '1', HUB_CACHE_DIR: 'relative/dir', HUB_SCENARIO: 'a;curl x', BUN_OPTIONS: '--preload=/x/evil.ts', NODE_OPTIONS: '--require /x/evil.cjs' };
  scrubEnv(env);
  expect(Object.keys(env).sort()).toEqual(['GRAPH_FIXTURES_DIR', 'HUB_PAGE', 'SECRETS_PAGE_TIMEOUT_MS', 'TERM_HOLD_LONG', 'TERM_SETTLE_STILL', 'UPDATE_GOLDEN']);
  // Every NAME=value knob the term docs give a reader survives the fence (a new documented knob needs a keep entry).
  const docs = path.join(import.meta.dir, '../../src/term/docs');
  const named = new Set<string>();
  for (const f of fs.readdirSync(docs).filter((n) => n.endsWith('.md'))) {
    for (const m of fs.readFileSync(path.join(docs, f), 'utf8').matchAll(/`([A-Z][A-Z0-9_]{2,})=/g)) named.add(m[1]!);
  }
  expect(named.has('UPDATE_GOLDEN')).toBe(true);
  // NODE_OPTIONS is the fence's
  // own option, named in gates.md as what a gate child is GIVEN (child-env.ts guardEnv); a caller's value is dropped.
  expect([...named].filter((k) => !Object.hasOwn(ENV_RULES, k) && !['HOME', 'XDG_CONFIG_HOME', 'HOODY_CONFIG_DIR', 'NAME', 'NODE_OPTIONS'].includes(k))).toEqual([]);
});

test('preload installed it', () => {
  expect(netGuardInstalled()).toBe(true);
  expect(netGuardMode()).toBe('test');
});

test('names refused, listens pinned', async () => {
  const s = Bun.serve({ port: 0, fetch: () => new Response('own') });
  const port = s.port!;
  try {
    expect(netGuardListeners().find((l) => l.port === port)).toEqual({ address: '127.0.0.1', port, v4: true, v6: false });
    expect(await (await fetch(`http://127.0.0.1:${s.port}/`)).text()).toBe('own');
    await expect(fetch(`http://localhost:${s.port}/`)).rejects.toThrow('TERM_NET_DENIED: fetch [NAME]');
    await expect(fetch(`http://LOCALHOST.:${s.port}/`)).rejects.toThrow('TERM_NET_DENIED');
    expect(() => net.connect(port, 'localhost')).toThrow('TERM_NET_DENIED');
    expect(() => Bun.connect({ hostname: 'localhost', port, socket: { data() {} } })).toThrow('TERM_NET_DENIED');
  } finally { s.stop(true); }
  const s2 = Bun.serve({ port: 0, hostname: 'localhost', fetch: () => new Response('pinned') });
  try {
    expect(netGuardListeners().find((l) => l.port === s2.port)?.address).toBe('127.0.0.1');
    expect(await (await fetch(`http://127.0.0.1:${s2.port}/`)).text()).toBe('pinned');
  } finally { s2.stop(true); }
  const h = http.createServer((_q, r) => r.end('node'));
  await new Promise<void>((r) => h.listen(0, () => r()));
  try {
    expect((h.address() as { address: string }).address).toBe('127.0.0.1');
    await expect(fetch(`http://[::1]:${(h.address() as { port: number }).port}/`)).rejects.toThrow('TERM_NET_DENIED');
  } finally { h.close(); }
});

// IPv6 may be off on the host (lo disable_ipv6 = 1): the v6 wire legs then only check the record and the refusals.
const IPV6 = ((): boolean => { try { return fs.readFileSync('/proc/sys/net/ipv6/conf/lo/disable_ipv6', 'utf8').trim() === '0'; } catch { return false; } })();

test('listener families', async () => {
  const v6only = Bun.serve({ port: 0, hostname: '::', ipv6Only: true, fetch: () => new Response('v6') } as Parameters<typeof Bun.serve>[0]);
  const p6 = v6only.port!;
  try {
    expect(netGuardListeners().find((l) => l.port === p6)).toEqual({ address: '::', port: p6, v4: false, v6: true });
    await expect(fetch(`http://127.0.0.1:${v6only.port}/`)).rejects.toThrow('TERM_NET_DENIED');
    if (IPV6) expect(await (await fetch(`http://[::1]:${v6only.port}/`, { signal: AbortSignal.timeout(5000) })).text()).toBe('v6');
  } finally { v6only.stop(true); }
  const dual = http.createServer((_q, r) => r.end('dual'));
  await new Promise<void>((r) => dual.listen({ port: 0, host: '::' }, () => r()));
  try {
    const port = (dual.address() as { port: number }).port;
    const bindv6only = Number(fs.readFileSync('/proc/sys/net/ipv6/bindv6only', 'utf8').trim());
    expect(netGuardListeners().find((l) => l.port === port)).toEqual({ address: '::', port, v4: bindv6only === 0, v6: true });
    if (bindv6only === 0) expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('dual');
  } finally { dual.close(); }
  const any4 = Bun.serve({ port: 0, hostname: '0.0.0.0', fetch: () => new Response('any4') });
  try {
    await expect(fetch(`http://[::1]:${any4.port}/`)).rejects.toThrow('TERM_NET_DENIED');
    expect(await (await fetch(`http://127.0.0.1:${any4.port}/`)).text()).toBe('any4');
  } finally { any4.stop(true); }
}, 30_000);

test('no dns, no udp', async () => {
  expect(() => dns.lookup('example.invalid', () => {})).toThrow('TERM_NET_DENIED');
  expect(() => dns.resolve4('example.invalid', () => {})).toThrow('TERM_NET_DENIED');
  expect(() => dns.promises.lookup('example.invalid')).toThrow('TERM_NET_DENIED');
  expect(() => dgram.createSocket('udp4')).toThrow('TERM_NET_DENIED');
  expect(() => Bun.dns.lookup('example.invalid')).toThrow('TERM_NET_DENIED');
  expect(() => (Bun as unknown as { udpSocket: (o: object) => unknown }).udpSocket({})).toThrow('TERM_NET_DENIED');
});

// The public constructor and the socket prototype refuse too; no packet is sent (each call throws before
// any socket work). Bun's named builtin exports are snapshots (no syncBuiltinESMExports): a named Socket or
// createSocket still constructs, but it shares the prototype, so it cannot bind, connect or send.
test('udp: constructor and prototype refuse, named imports included', () => {
  expect(() => new (dgram.Socket as unknown as new (t: string) => unknown)('udp4')).toThrow('TERM_NET_DENIED: new dgram.Socket');
  const proto = (dgram.Socket as unknown as { prototype: Record<string, (...a: unknown[]) => unknown> }).prototype;
  expect(NamedSocket.prototype).toBe(proto as never);
  const bare = Object.create(proto) as Record<string, (...a: unknown[]) => unknown>;
  for (const k of ['bind', 'connect', 'send', 'sendto', 'addMembership', 'setBroadcast']) expect(() => bare[k]!('x', 9, '127.0.0.1'), k).toThrow(`TERM_NET_DENIED: dgram.Socket.${k}`);
  type Sock = Record<string, (...a: unknown[]) => unknown>;
  const named: Array<() => Sock> = [() => new (NamedSocket as unknown as new (t: string) => Sock)('udp4'), () => namedCreateSocket('udp4') as unknown as Sock];
  for (const make of named) {
    let s: Sock;
    try { s = make(); } catch (e) { expect(String((e as Error).message)).toContain('TERM_NET_DENIED'); continue; }
    try {
      for (const k of ['bind', 'connect', 'send']) expect(() => s[k]!(Buffer.from('x'), 9, '127.0.0.1'), k).toThrow('TERM_NET_DENIED');
    } finally { s.close?.(); }
  }
});

test('worker fenced', async () => {
  const code = `try { await fetch('http://10.255.255.1/'); postMessage('reached'); } catch (e) { postMessage(String(e && e.message || e)); }`;
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  const w = new Worker(url);
  const said = await new Promise<string>((r) => { w.onmessage = (e) => r(String(e.data)); setTimeout(() => r('timeout'), 20_000); });
  w.terminate();
  expect(said).toContain('TERM_NET_DENIED');
}, 30_000);

test('redirects checked', async () => {
  const s = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: (r) => {
    const p = new URL(r.url).pathname;
    if (p === '/out') return new Response(null, { status: 302, headers: { location: 'https://api.hoody.invalid/api/v1/me' } });
    if (p === '/in') return new Response(null, { status: 307, headers: { location: '/end' } });
    if (p === '/end') return new Response(r.method + ' end');
    return new Response('?');
  } });
  try {
    const base = `http://127.0.0.1:${s.port}`;
    await expect(fetch(base + '/out')).rejects.toThrow('TERM_NET_DENIED');
    expect(await (await fetch(base + '/in', { method: 'POST', body: 'x' })).text()).toBe('POST end');
    expect((await fetch(base + '/out', { redirect: 'manual' })).status).toBe(302);
    await expect(fetch(base + '/in', { redirect: 'error' })).rejects.toThrow('redirect');
    await expect(fetch(base + '/end', { unix: '/var/run/docker.sock' } as RequestInit)).rejects.toThrow('TERM_NET_DENIED');
    await expect(fetch(base + '/end', { proxy: 'http://proxy.invalid:3128' } as RequestInit)).rejects.toThrow('TERM_NET_DENIED');
  } finally { s.stop(true); }
});

test('closed and address-checked', async () => {
  const s = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('own') });
  const port = s.port;
  expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('own');
  await expect(fetch(`http://[::1]:${port}/`)).rejects.toThrow('TERM_NET_DENIED');
  s.stop(true);
  await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow('TERM_NET_DENIED');
  expect(netGuardListeners().some((l) => l.port === port)).toBe(false);
  const h = http.createServer((_q, r) => r.end('node'));
  await new Promise<void>((r) => h.listen(0, '127.0.0.1', () => r()));
  const hp = (h.address() as { port: number }).port;
  expect(await (await fetch(`http://127.0.0.1:${hp}/`)).text()).toBe('node');
  await new Promise<void>((r) => h.close(() => r()));
  await expect(fetch(`http://127.0.0.1:${hp}/`)).rejects.toThrow('TERM_NET_DENIED');
});

test('dns Resolver instances refused', async () => {
  const r = new dns.Resolver();
  expect(() => r.resolve4('example.invalid', () => {})).toThrow('TERM_NET_DENIED');
  expect(() => r.resolve('example.invalid', () => {})).toThrow('TERM_NET_DENIED');
  expect(() => r.reverse('127.0.0.1', () => {})).toThrow('TERM_NET_DENIED');
  const p = new dns.promises.Resolver();
  expect(() => p.resolve4('example.invalid')).toThrow('TERM_NET_DENIED');
  expect(() => p.resolveAny('example.invalid')).toThrow('TERM_NET_DENIED');
  expect(() => dns.reverse('127.0.0.1', () => {})).toThrow('TERM_NET_DENIED');
});

test('close() ends the permission when called, while connections keep the server open', async () => {
  const h = http.createServer((_q, r) => r.end('node'));
  await new Promise<void>((r) => h.listen(0, '127.0.0.1', () => r()));
  const hp = (h.address() as { port: number }).port;
  // A held connection delays the 'close' event until it ends.
  const held = net.connect(hp, '127.0.0.1');
  await new Promise<void>((r) => held.once('connect', () => r()));
  let closed = false;
  h.close(() => { closed = true; });
  expect(closed).toBe(false);
  expect(netGuardListeners().some((l) => l.port === hp)).toBe(false);
  await expect(fetch(`http://127.0.0.1:${hp}/`)).rejects.toThrow('TERM_NET_DENIED');
  expect(() => net.connect(hp, '127.0.0.1')).toThrow('TERM_NET_DENIED');
  held.destroy();
  await new Promise<void>((r) => { const t = setInterval(() => { if (closed) { clearInterval(t); r(); } }, 5); });
});

// Native paths the first guards missed ────────────────────────────────────────────────────────────
test('Bun.$ refused (named import too); new ChildProcess().spawn refused; fetch.preconnect refused', async () => {
  const before = netGuardRefusals().length;
  expect(() => (Bun as unknown as { $: (s: TemplateStringsArray) => unknown }).$`/bin/true`).toThrow('TERM_SPAWN_DENIED: Bun.$ [SHELL_STRING]');
  const { $ } = await import('bun');
  expect(() => $`/bin/true`).toThrow('TERM_SPAWN_DENIED');
  const { ChildProcess } = await import('node:child_process');
  expect(() => (new ChildProcess() as unknown as { spawn: (o: object) => unknown }).spawn({ file: '/bin/true', args: ['/bin/true'], stdio: 'ignore' })).toThrow('TERM_SPAWN_DENIED: ChildProcess.spawn [UNJUDGED]');
  expect(() => (fetch as unknown as { preconnect: (u: string) => void }).preconnect('https://api.hoody.invalid')).toThrow('TERM_NET_DENIED: fetch.preconnect');
  expect(netGuardRefusals().length - before).toBe(4);
});

test('Bun.fetch and its preconnect are read-only (no JS wrap possible): no hub source uses them; the OS boundary covers them', () => {
  const d = Object.getOwnPropertyDescriptor(Bun, 'fetch');
  // If Bun ever makes it writable, wrap it in test-net-guard.ts and drop this census.
  expect(d?.writable || d?.configurable).toBe(false);
  const roots = [path.join(import.meta.dir, '../../src'), import.meta.dir];
  const hits: string[] = [];
  const BAD = /\bBun\.fetch\b|\.preconnect\s*\(|import\s*\{[^}]*\b(fetch|\$)\b[^}]*\}\s*from\s*['"]bun['"]|from\s*['"]bun['"][^\n]*\bfetch\b/;
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p); continue; }
      if (!/\.(m?[jt]sx?)$/.test(e.name) || /\.term\.test\.tsx?$/.test(e.name) || /^zzts-/.test(e.name)) continue;
      const code = fs.readFileSync(p, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      if (BAD.test(code)) hits.push(path.relative(path.join(import.meta.dir, '../..'), p));
    }
  };
  for (const r of roots) walk(r);
  expect(hits).toEqual([]);
// Reads every source file (about 0.45 s alone): one synchronous walk, so under a loaded full suite it ran 30 s and was
// reported "timed out after 5000ms" although its expectations held. The limit bounds a stuck walk, not a slow host.
}, 120_000);

test('os.userInfo().homedir answers the isolated home', () => {
  expect(os.userInfo().homedir).toBe(netGuardHome());
});

test('refusal diagnostics: fixed codes only; a credential in an argument never reaches the error, the journal or output', async () => {
  const CANARY = 'CANARY-hdy_not-a-real-token';
  const before = netGuardRefusals().length;
  const msgs: string[] = [];
  const grab = async (f: () => unknown): Promise<void> => { try { await f(); } catch (e) { msgs.push(String((e as Error)?.message ?? e)); } };
  await grab(() => fetch(`https://${CANARY}.invalid/?token=${CANARY}`));
  await grab(() => fetch(`not a url ${CANARY}`));
  await grab(() => fetch('http://127.0.0.1:1/', { proxy: `http://${CANARY}@p.invalid` } as RequestInit));
  await grab(() => net.connect({ host: `${CANARY}.invalid`, port: 443 }));
  await grab(() => net.createConnection({ path: `/run/${CANARY}.sock` }));
  await grab(() => Bun.connect({ hostname: CANARY, port: 1, socket: { data() {} } }));
  await grab(() => Bun.spawnSync(['curl', `-H`, `Authorization: Bearer ${CANARY}`]));
  await grab(() => execSync(`curl -H 'Authorization: Bearer ${CANARY}'`));
  await grab(() => { const r = spawnSync('curl', [CANARY]); if (r.error) throw r.error; });
  await grab(() => http.get(`http://${CANARY}.invalid/`));
  await grab(() => new WebSocket(`wss://${CANARY}.invalid/`));
  await grab(() => dns.lookup(`${CANARY}.invalid`, () => {}));
  expect(msgs.length).toBeGreaterThanOrEqual(10);
  for (const m of msgs) {
    expect(m).not.toContain(CANARY);
    expect(m).toMatch(/^TERM_(NET|SPAWN)_DENIED: [\w.$]+ \[[A-Z_]+\]/);
  }
  const journal = netGuardRefusals().slice(before);
  expect(journal.length).toBeGreaterThanOrEqual(10);
  expect(journal.join('\n')).not.toContain(CANARY);
});

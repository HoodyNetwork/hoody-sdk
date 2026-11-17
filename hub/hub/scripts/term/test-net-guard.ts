// The terminal test harness's outside-world fence: no terminal test can reach a real API,
// a real config or a real credential, by construction rather than by care. Installed by test-preload.ts, right after
// strict globals and before anything else loads.
//   network     fetch, WebSocket, node:net / node:tls / node:http(s) connects, Bun.connect: refused (TERM_NET_DENIED)
//               unless the target is a NUMERIC loopback address and port of a listener of THIS process that is still
//               open and answers that family (Bun.serve, Bun.listen, net/http server listen; closing it ends the
//               permission). The rules are net-policy.mjs (shared with the Node guard, net-guard-node.mjs): `localhost`
//               is refused (either family); a listen with no host or `localhost` is pinned to 127.0.0.1; `::` answers
//               IPv4 only when dual-stack (no ipv6Only, sysctl bindv6only 0). No DNS at all (node:dns, Bun.dns refused)
//               and no UDP (node:dgram, Bun.udpSocket). fetch never follows a redirect by itself: each hop is checked
//               like the first; Bun's `unix` and `proxy` fetch options are refused. A Bun Worker starts with the guard
//               preloaded (net-guard-runner.ts), in the same mode.
//   subprocess  test mode: Bun.spawn / spawnSync, node:child_process refused (TERM_SPAWN_DENIED). Runner mode
//               (net-guard-runner.ts: gate runners via BUN_OPTIONS, child-env.ts): only Bun or Node (net-policy
//               spawnVerdict), each child given the guard in its environment (guardEnv), so the fence follows the tree.
//               A runner process that turns into a test process (bun test under a runner) tightens to test mode.
//   environment only ENV_KEEP survives (values from a .env or the caller's shell are dropped: tokens, profiles, URLs);
//               HOME, XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_CACHE_HOME and HOODY_CONFIG_DIR point into one fresh empty
//               directory per test process (removed at exit), so ~/.hoody and every dotfile is out of reach.
// Refusals throw at the call (a test sees them) and are counted (netGuardRefusals) so a swallowed one still shows.
// A refusal names a FIXED operation and a fixed reason code only: never an argument, URL, host or path, so a
// credential in a refused call never reaches an error, the journal or test output.
// These JS guards are early diagnostics. The boundary is the OS's: every test entry runs in a loopback-only network
// namespace (netns.sh). Bun.fetch and its preconnect are read-only in Bun and cannot be wrapped here;
// a source census (test-net-guard.term.test.ts) keeps them out of hub code, and the namespace covers them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectVerdict, DNS_METHOD, fenceDgram, guardEnv, listenerOf, pinListenHost, spawnOptionsVerdict, spawnVerdict, V4 } from './net-policy.mjs';
import { exeContext, trustedExecutables } from './net-exec.mjs';
// node:net / tls / http(s) / child_process are imported only AFTER Bun's own connect/spawn are wrapped (below): their
// internals keep the Bun functions they find at load, and a named import (`import { connect } from 'node:net'`) is a
// binding the default-object wraps never reach. Loaded after the wrap, every way through them ends in a wrapped call.

// The keep-list is net-policy.mjs's (one source with the Node test environment, node-test-env.mjs).
export { ENV_KEEP, ENV_RULES, envKept, scrubEnv } from './net-policy.mjs';
import { scrubEnv, scrubRunnerEnv, HOME_KEYS } from './net-policy.mjs';
import { isTestHome, makeTestHome } from './test-homes.mjs';

/** Open listeners of this process (net-policy listenerOf records: address, port, families answered). */
interface Listener { readonly address: string; readonly port: number; readonly v4: boolean; readonly v6: boolean }
const listeners = new Set<Listener>();
const refusals: string[] = [];
let installed = false;
/** 'runner' (gate runners) or 'test' (term tests); only ever tightens to 'test'. */
let mode: 'runner' | 'test' = 'runner';
let home = '';
const HUB = path.resolve(import.meta.dir, '../..');
const BINDV6ONLY = ((): number => { try { return Number(fs.readFileSync('/proc/sys/net/ipv6/bindv6only', 'utf8').trim()) || 0; } catch { return 0; } })();

/** Throws `<code>: <op> [<reason>]`. `op` is a fixed operation label, `reason` a fixed code (net-policy verdict codes or
 *  the guard's own): never caller data. */
function deny(code: 'TERM_NET_DENIED' | 'TERM_SPAWN_DENIED', op: string, reason = 'DENIED'): never {
  refusals.push(`${code} ${op} ${reason}`);
  throw new Error(`${code}: ${op} [${reason}] (terminal tests reach only a listener they opened themselves)`);
}

/** True when host:port is a numeric loopback address of a listener this process opened, still holds and that answers
 *  that family (net-policy.mjs connectVerdict). */
export function netAllowed(host: string | undefined, port: number | undefined): boolean {
  return connectVerdict(listeners, host, port).ok;
}
function needAllowed(host: string | undefined, port: number | undefined, via: string): void {
  const v = connectVerdict(listeners, host, port) as { ok: boolean; code?: string };
  if (!v.ok) deny('TERM_NET_DENIED', via, v.code);
}
function openListener(address: string | undefined, port: number | undefined, ipv6Only = false): Listener | null {
  const l = listenerOf(address, port, { ipv6Only, bindv6only: BINDV6ONLY }) as Listener | null;
  if (l) listeners.add(l);
  return l;
}
/** Open listeners (for the fence's own tests). */
export const netGuardListeners = (): readonly Listener[] => [...listeners];
/** Whether the fence is installed in this process (the term test preload installs it). */
export const netGuardInstalled = (): boolean => installed;
/** The fence's mode in this process. */
export const netGuardMode = (): 'runner' | 'test' => mode;

function checkUrl(u: string | URL, via: string): void {
  let url: URL;
  try { url = new URL(String(u)); } catch { return deny('TERM_NET_DENIED', via, 'BAD_URL'); }
  if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'file:') return;
  const port = url.port ? Number(url.port) : url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80;
  const v = connectVerdict(listeners, url.hostname, port) as { ok: boolean; code?: string };
  if (!v.ok) deny('TERM_NET_DENIED', via, v.code);
}

function connectTarget(a: unknown[]): { host?: string; port?: number; path?: string } {
  const [x, y] = a;
  if (typeof x === 'object' && x !== null) {
    const o = x as { host?: string; hostname?: string; port?: number | string; path?: string };
    return { host: o.host ?? o.hostname ?? 'localhost', ...(o.port !== undefined ? { port: Number(o.port) } : {}), ...(o.path ? { path: o.path } : {}) };
  }
  if (typeof x === 'number' || (typeof x === 'string' && /^\d+$/.test(x))) return { port: Number(x), host: typeof y === 'string' ? y : 'localhost' };
  if (typeof x === 'string') return { path: x };
  return {};
}

function checkConnect(a: unknown[], via: string): void {
  const t = connectTarget(a);
  if (t.path) return deny('TERM_NET_DENIED', via, 'UNIX_SOCKET');
  needAllowed(t.host, t.port, via);
}

/** A node server's listener record: its permission ends when close() is CALLED (the 'close' event waits for every open
 *  connection, and the port must not stay reachable meanwhile). */
const ownedBy = new WeakMap<object, ReturnType<typeof openListener>>();
function noteListen(server: { address(): unknown; once(ev: 'close', fn: () => void): unknown }, ipv6Only: boolean): void {
  const a = server.address();
  if (!a || typeof a !== 'object' || !('port' in a)) return;
  const l = openListener((a as { address?: string }).address, (a as { port: number }).port, ipv6Only);
  if (l) { ownedBy.set(server, l); server.once('close', () => { listeners.delete(l); }); }
}
function endListen(server: object): void { const l = ownedBy.get(server); if (l) { listeners.delete(l); ownedBy.delete(server); } }

function wrap<T extends object>(o: T, k: keyof T, before: (args: unknown[]) => void): void {
  const orig = o[k] as unknown as (...a: unknown[]) => unknown;
  Object.defineProperty(o, k, { configurable: true, writable: true, value: function (this: unknown, ...a: unknown[]) { before(a); return orig.apply(this, a); } });
}

/** The isolated environment of a test process: kept keys only, HOME and config dirs in one fresh empty directory. */
function isolateEnvironment(): void {
  // Under the hub's own cache dir (never the top level of /tmp): .term-cache/test-homes/<random>. A Worker of a test
  // process shares its HOME (already isolated): no second directory.
  // test-homes.mjs: one place for the homes (a new one sweeps the stale homes of processes that died).
  const inherited = isTestHome(process.env.HOME ?? '', undefined, { inherit: true }) ? process.env.HOME! : '';
  scrubEnv(process.env);
  home = inherited || makeTestHome();
  for (const k of HOME_KEYS) process.env[k] = home;
  process.env.NODE_ENV = 'test';
  // os.homedir() asks the password database, not HOME: the default export answers the isolated dir. Known gap: a named
  // `import { homedir } from 'node:os'` binds the original (Bun cannot override a builtin's named exports); Hub code
  // does not read the home directory today (the CLI holds credentials).
  (os as unknown as { homedir: () => string }).homedir = () => home;
  // os.userInfo() reads the password database too: its homedir answers the isolated dir as well.
  const userInfo = os.userInfo.bind(os);
  (os as unknown as { userInfo: (o?: unknown) => unknown }).userInfo = (o?: unknown) => ({ ...(userInfo(o as never) as object), homedir: home });
}

/** vitest's own fork hook, by real path (net-guard-node.mjs REQUIRE_OK). */
const REQUIRE_OK = ((): string[] => { try { return [fs.realpathSync(path.join(HUB, '..', 'node_modules', 'vitest', 'suppress-warnings.cjs'))]; } catch { return []; } })();
/** The executables a runner may start (net-exec.mjs), fixed when the guard installs. */
let trusted: ReturnType<typeof trustedExecutables> | null = null;
/** Runner mode: the child's argv and options, judged (no shell; the ACTUAL executables, net-policy spawnVerdict with
 *  net-exec exeContext) and given the guard (guardEnv). */
function fencedChild(argv: unknown[], opts: Record<string, unknown> | undefined, via: string): Record<string, string | undefined> {
  if (mode === 'test') deny('TERM_SPAWN_DENIED', via, 'TEST_MODE');
  const o = opts ?? {};
  const sv = spawnOptionsVerdict(o, { fork: via === 'child_process.fork', requireOk: REQUIRE_OK }) as { ok: boolean; code?: string };
  if (!sv.ok) deny('TERM_SPAWN_DENIED', via, sv.code);
  const v = spawnVerdict(argv.map(String), HUB, process.execPath, exeContext(trusted!, o)) as { ok: boolean; code?: string };
  if (!v.ok) deny('TERM_SPAWN_DENIED', via, v.code);
  return guardEnv(HUB, (o.env as Record<string, string | undefined> | undefined) ?? process.env);
}

/**
 * Installs the fence (once per process; a second call may only TIGHTEN runner -> test).
 *   test    (default; test-preload.ts): no subprocess, isolated environment.
 *   runner  (net-guard-runner.ts, via BUN_OPTIONS from child-env.ts): fenced children only; environment cut to the
 *           named runner keys (scrubRunnerEnv), children get guardEnv's allowlist.
 */
export async function installNetGuard(o: { mode?: 'runner' | 'test' } = {}): Promise<void> {
  const want = o.mode ?? 'test';
  if (installed) {
    if (want === 'test' && mode !== 'test') { mode = 'test'; process.env.HUB_NET_FENCE = 'test'; isolateEnvironment(); }
    return;
  }
  installed = true;
  mode = want;
  trusted = trustedExecutables();
  process.env.HUB_NET_FENCE = mode;
  // Environment first: nothing after this reads a caller's token, profile or API address. Runner mode keeps the named
  // runner keys only (net-policy runnerKept); test mode isolates further (own HOME).
  if (mode === 'test') isolateEnvironment(); else scrubRunnerEnv(process.env);

  // Listeners this process opens are the only reachable targets.
  // Bun's own properties are writable but not configurable: assigned, never redefined.
  const B = Bun as unknown as Record<string, unknown>;
  // Each listener is allowed while open: its stop() ends the permission (wrapped on the returned object).
  const keepWhileOpen = <T extends { port?: number; hostname?: string; stop: (...a: unknown[]) => unknown }>(s: T): T => {
    const l = openListener(s.hostname, s.port);
    if (l) {
      const stop = s.stop.bind(s);
      Object.defineProperty(s, 'stop', { configurable: true, writable: true, value: (...a: unknown[]) => { listeners.delete(l); return stop(...a); } });
    }
    return s;
  };
  // Bound to a numeric address the fence chose (no host / `localhost` -> 127.0.0.1) so ownership is exact.
  const pinned = (o: unknown): Record<string, unknown> => {
    const x = (o ?? {}) as Record<string, unknown>;
    return x.unix ? x : { ...x, hostname: pinListenHost(x.hostname as string | undefined) };
  };
  const keepPinned = <T extends { port?: number; stop: (...a: unknown[]) => unknown }>(s: T, opt: Record<string, unknown>): T => {
    const l = opt.unix ? null : openListener(opt.hostname as string, s.port, opt.ipv6Only === true);
    if (l) {
      const stop = s.stop.bind(s);
      Object.defineProperty(s, 'stop', { configurable: true, writable: true, value: (...a: unknown[]) => { listeners.delete(l); return stop(...a); } });
    }
    return s;
  };
  void keepWhileOpen;
  const serve = B.serve as (o: unknown) => { port: number; hostname: string; stop: (...a: unknown[]) => unknown };
  B.serve = (o: unknown) => { const p = pinned(o); return keepPinned(serve(p), p); };
  const listenTcp = B.listen as (o: unknown) => { port?: number; hostname?: string; stop: (...a: unknown[]) => unknown };
  B.listen = (o: unknown) => { const p = pinned(o); return keepPinned(listenTcp(p), p); };
  // No UDP, no DNS: a datagram or a lookup is traffic the listener rule cannot judge.
  if (typeof B.udpSocket === 'function') B.udpSocket = () => deny('TERM_NET_DENIED', 'Bun.udpSocket');
  const bdns = B.dns as Record<string, unknown> | undefined;
  if (bdns) for (const k of Object.keys(bdns)) if (typeof bdns[k] === 'function') { try { bdns[k] = () => deny('TERM_NET_DENIED', `Bun.dns.${k}`); } catch { /* read-only */ } }
  // Bun's shell ($) runs programs natively, outside every spawn wrap: refused in both modes (a shell line cannot be
  // judged). Writable: a later `import { $ } from 'bun'` binds this refusing one.
  if (B.$ !== undefined) B.$ = Object.assign(() => deny('TERM_SPAWN_DENIED', 'Bun.$', 'SHELL_STRING'), { nothrow: () => B.$, throws: () => B.$, cwd: () => B.$, env: () => B.$, escape: (x: string) => x, braces: () => deny('TERM_SPAWN_DENIED', 'Bun.$', 'SHELL_STRING') });
  // A Bun Worker runs the guard first (same mode: HUB_NET_FENCE in the shared environment).
  const g0 = globalThis as unknown as Record<string, unknown>;
  if (typeof g0.Worker === 'function') {
    const W = g0.Worker as new (u: unknown, o?: Record<string, unknown>) => unknown;
    const runnerPre = path.join(import.meta.dir, 'net-guard-runner.ts');
    const GW = function (this: unknown, u: unknown, o: Record<string, unknown> = {}) {
      // Only the guard is preloaded: a caller's preload or runtime startup flag would run before or beside it.
      if (o.preload !== undefined && !(Array.isArray(o.preload) && o.preload.length === 0)) deny('TERM_SPAWN_DENIED', 'Worker', 'PRELOAD');
      const ov = spawnOptionsVerdict({ execArgv: o.execArgv }) as { ok: boolean; code?: string };
      if (!ov.ok) deny('TERM_SPAWN_DENIED', 'Worker', ov.code);
      return new W(u, { ...o, preload: [runnerPre] });
    } as unknown as typeof Worker;
    Object.setPrototypeOf(GW, W);
    Object.defineProperty(g0, 'Worker', { configurable: true, writable: true, value: GW });
  }
  const connect = B.connect as (x: unknown) => unknown;
  B.connect = (o: { hostname?: string; port?: number; unix?: string }) => {
    if (o?.unix) deny('TERM_NET_DENIED', 'Bun.connect', 'UNIX_SOCKET');
    needAllowed(o?.hostname, o?.port, 'Bun.connect');
    return connect(o);
  };
  // Subprocesses (node:child_process runs on these): none in test mode; fenced Bun/Node children in runner mode.
  for (const k of ['spawn', 'spawnSync'] as const) {
    const orig = B[k] as (...a: unknown[]) => unknown;
    B[k] = (...a: unknown[]) => {
      if (mode === 'test') deny('TERM_SPAWN_DENIED', `Bun.${k}`, 'TEST_MODE');
      const [x, y] = a as [unknown, Record<string, unknown> | undefined];
      if (Array.isArray(x)) return orig(x, { ...(y ?? {}), env: fencedChild(x, y, `Bun.${k}`) });
      const o2 = (x ?? {}) as Record<string, unknown>;
      return orig({ ...o2, env: fencedChild((o2.cmd as unknown[]) ?? [], o2, `Bun.${k}`) });
    };
  }
  const net = (await import('node:net')).default;
  const tls = (await import('node:tls')).default;
  const http = (await import('node:http')).default;
  const https = (await import('node:https')).default;
  const cp = (await import('node:child_process')).default;
  for (const S of [net.Server, http.Server, https.Server]) {
    // http(s).Server inherit net.Server's listen: wrap each own listen once (a double wrap records a listener twice).
    if (!Object.prototype.hasOwnProperty.call(S.prototype, 'listen')) continue;
    const listen = S.prototype.listen as (...a: unknown[]) => unknown;
    S.prototype.listen = function (this: import('node:net').Server, ...a: unknown[]) {
      // Pinned like Bun.serve: listen(port[, host]...) / listen({ port, host, ipv6Only }); a unix path is left alone.
      let ipv6Only = false;
      if (a[0] && typeof a[0] === 'object' && !(a[0] as { path?: string }).path) { const o = a[0] as { host?: string; ipv6Only?: boolean }; ipv6Only = o.ipv6Only === true; a[0] = { ...o, host: pinListenHost(o.host) }; }
      else if (typeof a[0] === 'number' || (typeof a[0] === 'string' && /^\d+$/.test(a[0]))) { if (typeof a[1] === 'string') a[1] = pinListenHost(a[1]); else a.splice(1, 0, V4); }
      this.once('listening', () => noteListen(this, ipv6Only));
      return listen.apply(this, a);
    } as typeof S.prototype.listen;
  }
  // close(): the permission ends when it is called, not at the delayed 'close' event.
  for (const S of [net.Server, http.Server, https.Server]) {
    if (!Object.prototype.hasOwnProperty.call(S.prototype, 'close')) continue;
    const close = S.prototype.close as (...a: unknown[]) => unknown;
    S.prototype.close = function (this: object, ...a: unknown[]) { endListen(this); return close.apply(this, a); } as typeof S.prototype.close;
  }
  const dns = (await import('node:dns')).default as unknown as Record<string, unknown> & { promises: Record<string, unknown> };
  // No DNS. A lookup of an IP literal is no query (net's own listen/connect may ask one): passed through.
  for (const o of [dns, dns.promises]) for (const k of Object.keys(o)) if (DNS_METHOD.test(k) && typeof o[k] === 'function') {
    const orig = o[k] as (...a: unknown[]) => unknown;
    Object.defineProperty(o, k, { configurable: true, writable: true, value: function (this: unknown, host: unknown, ...rest: unknown[]) { if (k === 'lookup' && net.isIP(String(host))) return orig.call(this, host, ...rest); return deny('TERM_NET_DENIED', `dns.${k}`); } });
  }
  // Resolver instances (new dns.Resolver(), new dns.promises.Resolver()) carry their own methods on the prototype.
  for (const R of [dns.Resolver, (dns.promises as unknown as { Resolver?: unknown }).Resolver] as Array<{ prototype: Record<string, unknown> } | undefined>) {
    if (!R?.prototype) continue;
    for (let pr: Record<string, unknown> | null = R.prototype; pr && pr !== Object.prototype; pr = Object.getPrototypeOf(pr)) {
      for (const k of Object.getOwnPropertyNames(pr)) if (DNS_METHOD.test(k) && typeof pr[k] === 'function') Object.defineProperty(pr, k, { configurable: true, writable: true, value: () => deny('TERM_NET_DENIED', `dns.Resolver.${k}`) });
    }
  }
  const dgram = (await import('node:dgram')).default as unknown as Record<string, unknown>;
  fenceDgram(dgram, deny);

  const g = globalThis as unknown as Record<string, unknown>;
  const realFetch = g.fetch as typeof fetch;
  // Redirects are the fence's to follow: each hop is checked like the first, at most 5, then the caller's mode applies
  // ('error' rejects, 'manual' gets the 3xx back unfollowed, 'follow' gets the final answer).
  const guardedFetch = Object.assign(async (input: unknown, init?: unknown) => {
    const i = (init ?? {}) as RequestInit & { unix?: unknown; proxy?: unknown };
    if (i.unix !== undefined) deny('TERM_NET_DENIED', 'fetch', 'UNIX_SOCKET');
    if (i.proxy !== undefined) deny('TERM_NET_DENIED', 'fetch', 'PROXY');
    // A bad URL makes the native constructor's error repeat it: refused with the fixed code instead.
    let first: Request;
    try { first = new Request(input as Request, init as RequestInit); } catch { return deny('TERM_NET_DENIED', 'fetch', 'BAD_URL'); }
    const mode = first.redirect;
    // The body once, so a 307/308 hop can send it again.
    const body = first.body ? await first.arrayBuffer() : null;
    let url = first.url;
    let method = first.method;
    let sendBody = body;
    for (let hop = 0; ; hop++) {
      checkUrl(url, hop === 0 ? 'fetch' : 'fetch redirect');
      const res = await realFetch(new Request(url, { method, headers: first.headers, signal: first.signal, ...(sendBody ? { body: sendBody } : {}), redirect: 'manual' }));
      const loc = res.headers.get('location');
      if (res.status < 300 || res.status > 399 || !loc || mode === 'manual') return res;
      if (mode === 'error') throw new TypeError('fetch: redirect refused (redirect: error)');
      if (hop >= 5) deny('TERM_NET_DENIED', 'fetch', 'REDIRECTS');
      const next = new URL(loc, url);
      checkUrl(next, 'fetch redirect');
      if (res.status !== 307 && res.status !== 308) { method = method === 'HEAD' ? 'HEAD' : 'GET'; sendBody = null; }
      url = next.href;
    }
  }, {
    // Not copied from the native fetch (its preconnect opens a connection with no check): refused.
    preconnect: () => deny('TERM_NET_DENIED', 'fetch.preconnect', 'PRECONNECT'),
  });
  Object.defineProperty(g, 'fetch', { configurable: true, writable: true, value: guardedFetch });
  if (typeof g.WebSocket === 'function') {
    const WS = g.WebSocket as new (...a: unknown[]) => unknown;
    const Guarded = function (this: unknown, ...a: unknown[]) { checkUrl(a[0] as string, 'WebSocket'); return new WS(...a); } as unknown as typeof WebSocket;
    Object.setPrototypeOf(Guarded, WS);
    Object.defineProperty(g, 'WebSocket', { configurable: true, writable: true, value: Guarded });
  }
  // Every node socket (net.connect / createConnection under any import form, tls, http agents) ends in
  // Socket.prototype.connect, looked up on the prototype at call time: the one wrap that a named import cannot skip.
  wrap(net.Socket.prototype, 'connect', (a) => checkConnect(Array.isArray(a[0]) ? (a[0] as unknown[]) : a, 'socket.connect'));
  wrap(net, 'connect', (a) => checkConnect(a, 'net.connect'));
  wrap(net, 'createConnection', (a) => checkConnect(a, 'net.createConnection'));
  wrap(tls, 'connect', (a) => checkConnect(a, 'tls.connect'));
  for (const [m, name] of [[http, 'http'], [https, 'https']] as const) {
    for (const k of ['request', 'get'] as const) {
      wrap(m, k, (a) => {
        const x = a[0];
        if (typeof x === 'string' || x instanceof URL) checkUrl(x, `${name}.${k}`);
        else { const o = (x ?? {}) as { host?: string; hostname?: string; port?: number }; checkConnect([{ host: o.hostname ?? o.host ?? 'localhost', port: o.port ?? (name === 'https' ? 443 : 80) }], `${name}.${k}`); }
      });
    }
  }

  // A shell string cannot be judged: exec/execSync are refused in both modes. The others: test mode refuses; runner
  // mode judges argv (fork = this runtime) and gives the child the guard's environment.
  // ChildProcess.prototype.spawn (reachable as `new ChildProcess().spawn(...)`) runs only inside one of the
  // judged wrappers below: a call from anywhere else is refused.
  let judged = 0;
  const protoSpawn = (cp.ChildProcess.prototype as unknown as { spawn: (...a: unknown[]) => unknown }).spawn;
  Object.defineProperty(cp.ChildProcess.prototype, 'spawn', { configurable: true, writable: true, value: function (this: unknown, ...a: unknown[]) {
    if (judged === 0) return deny('TERM_SPAWN_DENIED', 'ChildProcess.spawn', 'UNJUDGED');
    return protoSpawn.apply(this, a);
  } });
  for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) {
    const orig = (cp as unknown as Record<string, (...a: unknown[]) => unknown>)[k]!;
    Object.defineProperty(cp, k, { configurable: true, writable: true, value: (cmd: unknown, ...rest: unknown[]) => {
      if (k === 'exec' || k === 'execSync') return deny('TERM_SPAWN_DENIED', `child_process.${k}`, 'SHELL_STRING');
      if (mode === 'test') return deny('TERM_SPAWN_DENIED', `child_process.${k}`, 'TEST_MODE');
      const args = Array.isArray(rest[0]) ? rest[0] as unknown[] : [];
      const oi = Array.isArray(rest[0]) ? 1 : 0;
      const opts = (rest[oi] && typeof rest[oi] === 'object' ? rest[oi] : {}) as Record<string, unknown>;
      // fork runs opts.execPath when given: that file is the child, judged as such.
      const argv = k === 'fork' ? [(opts.execPath as string | undefined) ?? process.execPath, cmd, ...args] : [cmd, ...args];
      const env = fencedChild(argv, opts, `child_process.${k}`);
      judged++;
      try { return orig(cmd, ...(Array.isArray(rest[0]) ? [args] : []), { ...opts, env }); } finally { judged--; }
    } });
  }
}

/** Refusals so far in this process (a swallowed one still shows here). */
export const netGuardRefusals = (): readonly string[] => refusals;
/** The isolated HOME of this test process. */
export const netGuardHome = (): string => home;

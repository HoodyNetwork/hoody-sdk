// net-guard-node.mjs: the Node side of the terminal fence, loaded with
// NODE_OPTIONS=--import <this file> (net-policy guardEnv; child-env.ts puts it in every gate child's environment), so
// vitest (scripts/term/vitest-narrow.sh), its forked workers and any node a runner starts run behind it.
// Same rules as the Bun fence (net-policy.mjs): connects only to a numeric loopback address of a listener this process
// opened and holds, of a family it answers; `localhost` refused; listens pinned; no DNS, no UDP; children only Bun or
// Node, each given the guard; worker threads import this file first (NODE_OPTIONS --import does not reach them).
// Refusals throw TERM_NET_DENIED / TERM_SPAWN_DENIED at the call, naming a FIXED operation and reason code only, never
// an argument, URL, host or path. Early diagnostics: the boundary is the OS's (netns.sh).
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import cp from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import wt from 'node:worker_threads';
import { syncBuiltinESMExports } from 'node:module';
import { connectVerdict, DNS_METHOD, fenceDgram, guardEnv, listenerOf, pinListenHost, spawnOptionsVerdict, spawnVerdict, V4 } from './net-policy.mjs';
import { exeContext, trustedExecutables } from './net-exec.mjs';

const SELF = fileURLToPath(import.meta.url);
const HUB = path.resolve(path.dirname(SELF), '../..');
const KEY = Symbol.for('hub.term.netGuardNode');
const BINDV6ONLY = (() => { try { return Number(fs.readFileSync('/proc/sys/net/ipv6/bindv6only', 'utf8').trim()) || 0; } catch { return 0; } })();

if (!globalThis[KEY]) {
  const listeners = new Set();
  const refusals = [];
  globalThis[KEY] = { listeners, refusals };
  // `op`: a fixed operation label; `reason`: a fixed code (net-policy verdict codes or the guard's own).
  const deny = (code, op, reason = 'DENIED') => { refusals.push(`${code} ${op} ${reason}`); throw new Error(`${code}: ${op} [${reason}] (the gate fence reaches only a listener this process opened)`); };
  const need = (host, port, via) => { const v = connectVerdict(listeners, host, port); if (!v.ok) deny('TERM_NET_DENIED', via, v.code); };
  const checkUrl = (u, via) => {
    let url;
    try { url = new URL(String(u)); } catch { return deny('TERM_NET_DENIED', via, 'BAD_URL'); }
    if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'file:') return;
    need(url.hostname, url.port ? Number(url.port) : url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80, via);
  };
  const target = (a) => {
    const [x, y] = Array.isArray(a[0]) ? a[0] : a;
    if (x && typeof x === 'object') return { host: x.host ?? x.hostname ?? 'localhost', port: x.port, path: x.path };
    if (typeof x === 'number' || (typeof x === 'string' && /^\d+$/.test(x))) return { port: Number(x), host: typeof y === 'string' ? y : 'localhost' };
    if (typeof x === 'string') return { path: x };
    return {};
  };
  const checkConnect = (a, via) => { const t = target(a); if (t.path) deny('TERM_NET_DENIED', via, 'UNIX_SOCKET'); need(t.host, t.port, via); };
  const wrap = (o, k, before) => { const orig = o[k]; Object.defineProperty(o, k, { configurable: true, writable: true, value: function (...a) { before(a); return orig.apply(this, a); } }); };

  const owned = new WeakMap();
  // Listens: pinned to a numeric address, recorded with the families they answer, dropped when close is called.
  for (const S of [net.Server, http.Server, https.Server]) {
    // http(s).Server inherit net.Server's listen: wrap each own listen once (a double wrap records a listener twice).
    if (!Object.prototype.hasOwnProperty.call(S.prototype, 'listen')) continue;
    const listen = S.prototype.listen;
    S.prototype.listen = function (...a) {
      let ipv6Only = false;
      if (a[0] && typeof a[0] === 'object' && !a[0].path) { ipv6Only = a[0].ipv6Only === true; a[0] = { ...a[0], host: pinListenHost(a[0].host) }; }
      else if (typeof a[0] === 'number' || (typeof a[0] === 'string' && /^\d+$/.test(a[0]))) { if (typeof a[1] === 'string') a[1] = pinListenHost(a[1]); else a.splice(1, 0, V4); }
      this.once('listening', () => {
        const ad = this.address();
        if (!ad || typeof ad !== 'object') return;
        const l = listenerOf(ad.address, ad.port, { ipv6Only, bindv6only: BINDV6ONLY });
        if (l) { listeners.add(l); owned.set(this, l); this.once('close', () => listeners.delete(l)); }
      });
      return listen.apply(this, a);
    };
  }
  // close(): the permission ends when it is CALLED; the 'close' event waits for open connections.
  for (const S of [net.Server, http.Server, https.Server]) {
    if (!Object.prototype.hasOwnProperty.call(S.prototype, 'close')) continue;
    const close = S.prototype.close;
    S.prototype.close = function (...a) { const l = owned.get(this); if (l) { listeners.delete(l); owned.delete(this); } return close.apply(this, a); };
  }
  wrap(net.Socket.prototype, 'connect', (a) => checkConnect(a, 'socket.connect'));
  wrap(net, 'connect', (a) => checkConnect(a, 'net.connect'));
  wrap(net, 'createConnection', (a) => checkConnect(a, 'net.createConnection'));
  wrap(tls, 'connect', (a) => checkConnect(a, 'tls.connect'));
  for (const [m, name] of [[http, 'http'], [https, 'https']]) for (const k of ['request', 'get']) {
    wrap(m, k, (a) => { const x = a[0]; if (typeof x === 'string' || x instanceof URL) checkUrl(x, `${name}.${k}`); else checkConnect([{ host: x?.hostname ?? x?.host ?? 'localhost', port: x?.port ?? (name === 'https' ? 443 : 80) }], `${name}.${k}`); });
  }
  // No DNS. A lookup of an IP literal is no query (net's own listen/connect asks one): passed through.
  for (const o of [dns, dns.promises]) for (const k of Object.keys(o)) if (DNS_METHOD.test(k) && typeof o[k] === 'function') {
    const orig = o[k];
    Object.defineProperty(o, k, { configurable: true, writable: true, value: function (host, ...rest) { if (k === 'lookup' && net.isIP(String(host))) return orig.call(this, host, ...rest); return deny('TERM_NET_DENIED', `dns.${k}`); } });
  }
  // Resolver instances carry the methods on their prototype chain (dns.Resolver, dns.promises.Resolver).
  for (const R of [dns.Resolver, dns.promises.Resolver]) {
    for (let pr = R?.prototype; pr && pr !== Object.prototype; pr = Object.getPrototypeOf(pr)) {
      for (const k of Object.getOwnPropertyNames(pr)) if (DNS_METHOD.test(k) && typeof pr[k] === 'function') Object.defineProperty(pr, k, { configurable: true, writable: true, value: () => deny('TERM_NET_DENIED', `dns.Resolver.${k}`) });
    }
  }
  fenceDgram(dgram, deny);

  // fetch (undici): every hop judged; redirects followed by the fence.
  const realFetch = globalThis.fetch;
  if (typeof realFetch === 'function') {
    globalThis.fetch = async (input, init) => {
      if (init?.dispatcher !== undefined) deny('TERM_NET_DENIED', 'fetch', 'DISPATCHER');
      let first;
      try { first = new Request(input, init); } catch { return deny('TERM_NET_DENIED', 'fetch', 'BAD_URL'); }
      const mode = first.redirect;
      const body = first.body ? await first.arrayBuffer() : null;
      let url = first.url, method = first.method, sendBody = body;
      for (let hop = 0; ; hop++) {
        checkUrl(url, hop ? 'fetch redirect' : 'fetch');
        const res = await realFetch(new Request(url, { method, headers: first.headers, signal: first.signal, ...(sendBody ? { body: sendBody } : {}), redirect: 'manual' }));
        const loc = res.headers.get('location');
        if (res.status < 300 || res.status > 399 || !loc || mode === 'manual') return res;
        if (mode === 'error') throw new TypeError('fetch: redirect refused (redirect: error)');
        if (hop >= 5) deny('TERM_NET_DENIED', 'fetch', 'REDIRECTS');
        if (res.status !== 307 && res.status !== 308) { method = method === 'HEAD' ? 'HEAD' : 'GET'; sendBody = null; }
        url = new URL(loc, url).href;
      }
    };
  }
  if (typeof globalThis.WebSocket === 'function') {
    const WS = globalThis.WebSocket;
    const G = function (...a) { checkUrl(a[0], 'WebSocket'); return new WS(...a); };
    Object.setPrototypeOf(G, WS);
    globalThis.WebSocket = G;
  }

  // Children: only Bun or Node (or a scripts/term shell script), each with the guard in its environment.
  // The ACTUAL executables (net-exec.mjs), trusted sets fixed now; no shell option.
  const TRUSTED = trustedExecutables();
  // vitest forks its workers with `--require <its node_modules>/vitest/suppress-warnings.cjs`: that one file, by real path.
  const REQUIRE_OK = (() => { try { return [fs.realpathSync(path.join(HUB, '..', 'node_modules', 'vitest', 'suppress-warnings.cjs'))]; } catch { return []; } })();
  const fenced = (argv, opts, via) => {
    const sv = spawnOptionsVerdict(opts, { fork: via === 'child_process.fork', requireOk: REQUIRE_OK });
    if (!sv.ok) deny('TERM_SPAWN_DENIED', via, sv.code);
    const v = spawnVerdict(argv.map(String), HUB, process.execPath, exeContext(TRUSTED, opts));
    if (!v.ok) deny('TERM_SPAWN_DENIED', via, v.code);
    return guardEnv(HUB, opts.env ?? process.env);
  };
  // ChildProcess.prototype.spawn (`new ChildProcess().spawn(...)`) runs only inside a judged wrapper below.
  let judged = 0;
  const protoSpawn = cp.ChildProcess.prototype.spawn;
  Object.defineProperty(cp.ChildProcess.prototype, 'spawn', { configurable: true, writable: true, value: function (...a) {
    if (judged === 0) return deny('TERM_SPAWN_DENIED', 'ChildProcess.spawn', 'UNJUDGED');
    return protoSpawn.apply(this, a);
  } });
  for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    const orig = cp[k];
    Object.defineProperty(cp, k, { configurable: true, writable: true, value: (cmd, ...rest) => {
      if (k === 'exec' || k === 'execSync') return deny('TERM_SPAWN_DENIED', `child_process.${k}`, 'SHELL_STRING');
      const hasArgs = Array.isArray(rest[0]);
      const args = hasArgs ? rest[0] : [];
      const opts = (rest[hasArgs ? 1 : 0] && typeof rest[hasArgs ? 1 : 0] === 'object') ? rest[hasArgs ? 1 : 0] : {};
      // fork runs opts.execPath when given: that file is the child, judged as such.
      const argv = k === 'fork' ? [opts.execPath ?? process.execPath, cmd, ...args] : [cmd, ...args];
      const env = fenced(argv, opts, `child_process.${k}`);
      const tail = rest.slice(hasArgs ? 2 : 1).filter((x) => typeof x === 'function');
      judged++;
      try { return orig(cmd, ...(hasArgs ? [args] : []), { ...opts, env }, ...tail); } finally { judged--; }
    } });
  }
  // Worker threads do not run NODE_OPTIONS --import: each starts by importing this file, then its own code.
  const W = wt.Worker;
  class GuardedWorker extends W {
    constructor(file, opts = {}) {
      // No runtime startup hook beside the guard: execArgv judged like a fork's.
      const ov = spawnOptionsVerdict({ execArgv: opts.execArgv });
      if (!ov.ok) deny('TERM_SPAWN_DENIED', 'Worker', ov.code);
      const guard = JSON.stringify(pathToFileURL(SELF).href);
      if (opts.eval) super(`import(${guard}).then(() => { ${String(file)} })`, opts);
      else {
        const href = file instanceof URL ? file.href : String(file).startsWith('file:') || String(file).startsWith('data:') ? String(file) : pathToFileURL(path.resolve(String(file))).href;
        super(`import(${guard}).then(() => import(${JSON.stringify(href)}))`, { ...opts, eval: true });
      }
    }
  }
  Object.defineProperty(wt, 'Worker', { configurable: true, writable: true, value: GuardedWorker });
  process.env.HUB_NET_FENCE ??= 'runner';
  // Named ESM imports of builtins (`import { connect } from 'node:net'`) are live bindings: push the wraps into them.
  syncBuiltinESMExports();
}

/** Refusals so far in this process (tests and the proof). */
export const nodeGuardRefusals = () => globalThis[KEY].refusals;
export const nodeGuardListeners = () => [...globalThis[KEY].listeners];

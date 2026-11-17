// net-guard-proof.ts: the live proof that the network fence follows a gate runner's process tree.
// A test cannot start children (the test fence refuses them), so this script does, with the exact environment
// gate runners give their children (child-env.ts childEnv), and checks inside each:
//   bun child      fetch / Bun.connect / node:net to a loopback port it does not own refused; `localhost` refused; an
//                  own 127.0.0.1 listener reachable; DNS refused; a non-Bun/Node child (`curl`) refused; a nested bun
//                  child and a Bun Worker fenced too; a runner turning into a test process tightens (no child at all)
//   node child     (vitest's path: NODE_OPTIONS=--import net-guard-node.mjs) the same refusals through fetch, http,
//                  a NAMED `connect` import and dns; exec of a shell string refused; a forked node child and a worker
//                  thread fenced too
//   Proven from outside it first, by
//                  net-guard-proof-outside.ts (this file's first import), which then re-runs this file inside
//   node test environment: credential sentinels (env and caller HOME) dropped, HOME isolated, children too
//   both children: gate-slot.sh forwarding curl refused; node: UDP named constructor/factory and prototype refused
//   both children: shell option refused, a fake `node` (by path, first on the child's PATH, or fork's execPath)
//                  refused, dns Resolver instances refused; node: a server's permission ends when close() is called;
//                  vitest-narrow.sh run directly from a clean environment installs the fence itself
// Every probe stays on this host: the "outside" target is 127.0.0.1:9 (nothing of ours listens there), so an
// unfenced child gets ECONNREFUSED, never a packet off the machine.
//   NODE_ENV=test bun scripts/term/net-guard-proof.ts        exit 0 = proven, 1 = a probe was not fenced
import './net-guard-proof-outside'; // starts OUTSIDE on purpose: the boundary probes, then this file re-run inside
import { childEnv } from './child-env';

const OUT = 'http://127.0.0.1:9/';
// A fake `node` (a shell script) for the actual-executable probes: under the hub's cache, removed at exit.
import fs from 'node:fs';
import path from 'node:path';
const FAKE = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `fence-proof-${process.pid}`);
fs.mkdirSync(FAKE, { recursive: true });
fs.writeFileSync(path.join(FAKE, 'node'), '#!/bin/sh\necho FAKE-NODE-RAN\n', { mode: 0o755 });
process.on('exit', () => fs.rmSync(FAKE, { recursive: true, force: true }));
const FAKE_NODE = path.join(FAKE, 'node');
const env = childEnv();
let failed = 0;
function run(name: string, cmd: string[], want: string[], withEnv: Record<string, string | undefined> = env): void {
  const p = Bun.spawnSync(cmd, { env: withEnv, stdout: 'pipe', stderr: 'pipe', timeout: 60_000 });
  const out = p.stdout.toString() + p.stderr.toString();
  const missing = want.filter((w) => !out.includes(w));
  process.stdout.write(`${missing.length ? 'FAIL' : 'ok  '} ${name}${missing.length ? `\n     missing: ${missing.join(' | ')}\n     output: ${out.trim().split('\n').slice(-6).join('\n             ')}` : ''}\n`);
  if (missing.length) failed++;
}
const t = (label: string, expr: string): string => `try { ${expr}; console.log(${JSON.stringify(label)} + ': ALLOWED'); } catch (e) { console.log(${JSON.stringify(label)} + ': ' + (String(e?.message ?? e).includes('TERM_') ? String(e.message).split(':')[0] : 'OTHER ' + String(e?.message ?? e).slice(0, 60))); }`;

const bunCode = [
  `console.log('fence: ' + process.env.HUB_NET_FENCE);`,
  t('fetch-out', `await fetch(${JSON.stringify(OUT)})`),
  `const s = Bun.serve({ port: 0, fetch: () => new Response('own') });`,
  t('fetch-own', `const r = await (await fetch('http://127.0.0.1:' + s.port + '/')).text(); if (r !== 'own') throw new Error('bad')`),
  t('fetch-localhost', `await fetch('http://localhost:' + s.port + '/')`),
  t('bun-connect-out', `Bun.connect({ hostname: '127.0.0.1', port: 9, socket: { data() {} } })`),
  t('dns', `(await import('node:dns')).default.lookup('localhost', () => {})`),
  t('spawn-curl', `Bun.spawnSync(['curl', '--version'])`),
  t('bun-fake-node-path', `Bun.spawnSync([${JSON.stringify(FAKE_NODE)}, '-v'])`),
  t('bun-fake-node-on-PATH', `Bun.spawnSync(['node', '-v'], { env: { ...process.env, PATH: ${JSON.stringify(FAKE)} + ':' + process.env.PATH } })`),
  // Both the module object and Bun's named export (which ends in the guarded Bun.spawnSync and reports as .error).
  t('bun-cp-shell', `(await import('node:child_process')).default.spawnSync('bun', ['--version'], { shell: true })`),
  t('bun-cp-shell-named', `const r = (await import('node:child_process')).spawnSync('bun', ['--version'], { shell: true }); if (r.error) throw r.error`),
  t('bun-fork-execPath', `(await import('node:child_process')).fork('x.mjs', [], { execPath: ${JSON.stringify(FAKE_NODE)} })`),
  t('bun-gate-slot-curl', `Bun.spawnSync(['/bin/bash', '-p', ${JSON.stringify(import.meta.dir + '/gate-slot.sh')}, 'curl', '--version'])`),
  t('bun-resolver', `new (await import('node:dns')).default.Resolver().resolve4('example.invalid', () => {})`),
  `const n = Bun.spawnSync(['bun', '-e', ${JSON.stringify(t('nested-fetch', `await fetch(${JSON.stringify(OUT)})`))}]); console.log(n.stdout.toString().trim());`,
  `{ const w = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(t('worker-fetch', `await fetch(${JSON.stringify(OUT)})`).replace(/console\.log/g, 'postMessage'))}]))); console.log(await new Promise((r) => { w.onmessage = (e) => r(e.data); setTimeout(() => r('worker-fetch: TIMEOUT'), 20000); })); w.terminate(); }`,
  `s.stop(true);`,
  `await (await import(${JSON.stringify(import.meta.dir + '/test-net-guard.ts')})).installNetGuard({ mode: 'test' });`,
  t('tightened-spawn', `Bun.spawnSync(['bun', '--version'])`),
  `process.exit(0);`,
].join('\n');
run('bun child (runner fence via BUN_OPTIONS)', ['bun', '-e', bunCode], [
  'fence: runner', 'fetch-out: TERM_NET_DENIED', 'fetch-own: ALLOWED', 'fetch-localhost: TERM_NET_DENIED', 'bun-connect-out: TERM_NET_DENIED',
  'dns: TERM_NET_DENIED', 'spawn-curl: TERM_SPAWN_DENIED', 'bun-fake-node-path: TERM_SPAWN_DENIED', 'bun-fake-node-on-PATH: TERM_SPAWN_DENIED',
  'bun-cp-shell: TERM_SPAWN_DENIED', 'bun-cp-shell-named: TERM_SPAWN_DENIED', 'bun-fork-execPath: TERM_SPAWN_DENIED', 'bun-resolver: TERM_NET_DENIED', 'bun-gate-slot-curl: TERM_SPAWN_DENIED', 'nested-fetch: TERM_NET_DENIED', 'worker-fetch: TERM_NET_DENIED', 'tightened-spawn: TERM_SPAWN_DENIED',
]);

const nodeCode = [
  `import { Socket as UdpSocket, createSocket as udpCreate } from 'node:dgram';`,
  `import http from 'node:http'; import { connect } from 'node:net'; import dns from 'node:dns'; import cp from 'node:child_process'; import { Worker } from 'node:worker_threads';`,
  `console.log('fence: ' + process.env.HUB_NET_FENCE);`,
  t('fetch-out', `await fetch(${JSON.stringify(OUT)})`),
  t('http-out', `http.get(${JSON.stringify(OUT)})`),
  t('named-connect-out', `connect(9, '127.0.0.1')`),
  t('dns', `dns.lookup('localhost', () => {})`),
  t('exec-shell', `cp.execSync('true')`),
  t('spawn-curl', `cp.spawnSync('curl', ['--version'])`),
  t('spawn-shell-true', `cp.spawnSync(process.execPath, ['-v'], { shell: true })`),
  t('spawn-shell-string', `cp.spawn('node -v', { shell: '/bin/sh' })`),
  t('execFile-shell', `cp.execFileSync(process.execPath, ['-v'], { shell: true })`),
  t('fork-execPath', `cp.fork('x.mjs', [], { execPath: ${JSON.stringify(FAKE_NODE)} })`),
  t('fake-node-on-PATH', `cp.spawnSync('node', ['-v'], { env: { ...process.env, PATH: ${JSON.stringify(FAKE)} + ':' + process.env.PATH } })`),
  t('resolver', `new dns.Resolver().resolve4('example.invalid', () => {})`),
  t('udp-new-named', `new UdpSocket('udp4')`),
  t('udp-create-named', `udpCreate('udp4')`),
  t('udp-proto-send', `UdpSocket.prototype.send.call(Object.create(UdpSocket.prototype), 'x', 9, '127.0.0.1')`),
  t('gate-slot-curl', `cp.spawnSync('/bin/bash', ['-p', ${JSON.stringify(import.meta.dir + '/gate-slot.sh')}, 'curl', '--version'])`),
  t('promises-resolver', `new dns.promises.Resolver().resolveAny('example.invalid')`),
  `const held = await new Promise((r) => { const s2 = http.createServer((q, r2) => r2.end('x')); s2.listen(0, () => { const c = connect(s2.address().port, '127.0.0.1', () => r({ s2, c, port: s2.address().port })); }); });`,
  `held.s2.close();`,
  t('after-close-call', `await fetch('http://127.0.0.1:' + held.port + '/')`),
  `held.c.destroy();`,
  `const srv = http.createServer((q, r) => r.end('own')); await new Promise((r) => srv.listen(0, r));`,
  t('fetch-own', `const r = await (await fetch('http://127.0.0.1:' + srv.address().port + '/')).text(); if (r !== 'own') throw new Error('bad')`),
  t('fetch-localhost', `await fetch('http://localhost:' + srv.address().port + '/')`),
  `srv.close();`,
  `const f = cp.spawnSync(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(t('forked-fetch', `await fetch(${JSON.stringify(OUT)})`))}]); console.log(String(f.stdout).trim(), String(f.stderr).trim().slice(0, 200));`,
  `{ const w = new Worker(${JSON.stringify(`const { parentPort } = process.getBuiltinModule('node:worker_threads'); (async () => { ${t('thread-fetch', `await fetch(${JSON.stringify(OUT)})`).replace(/console\.log/g, 'parentPort.postMessage')} })();`)}, { eval: true }); console.log(await new Promise((r) => { w.on('message', r); w.on('error', (e) => r('thread-fetch: ERROR ' + e.message)); setTimeout(() => r('thread-fetch: TIMEOUT'), 20000); })); await w.terminate(); }`,
  `process.exit(0);`,
].join('\n');
run('node child (vitest path: NODE_OPTIONS --import)', ['node', '--input-type=module', '-e', nodeCode], [
  'fence: runner', 'fetch-out: TERM_NET_DENIED', 'http-out: TERM_NET_DENIED', 'named-connect-out: TERM_NET_DENIED', 'dns: TERM_NET_DENIED',
  'exec-shell: TERM_SPAWN_DENIED', 'spawn-curl: TERM_SPAWN_DENIED', 'spawn-shell-true: TERM_SPAWN_DENIED', 'spawn-shell-string: TERM_SPAWN_DENIED',
  'execFile-shell: TERM_SPAWN_DENIED', 'fork-execPath: TERM_SPAWN_DENIED', 'fake-node-on-PATH: TERM_SPAWN_DENIED', 'resolver: TERM_NET_DENIED',
  'promises-resolver: TERM_NET_DENIED', 'udp-new-named: TERM_NET_DENIED', 'udp-create-named: TERM_NET_DENIED', 'udp-proto-send: TERM_NET_DENIED', 'gate-slot-curl: TERM_SPAWN_DENIED', 'after-close-call: TERM_NET_DENIED', 'fetch-own: ALLOWED', 'fetch-localhost: TERM_NET_DENIED',
  'forked-fetch: TERM_NET_DENIED', 'thread-fetch: TERM_NET_DENIED',
]);

// vitest-narrow.sh run DIRECTLY, from a clean environment (no inherited NODE_OPTIONS / BUN_OPTIONS / HUB_NET_FENCE):
// the script must install the fence itself. --fence-probe runs the code under the script's environment.
{
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && !/^(NODE_OPTIONS|BUN_OPTIONS|HUB_NET_FENCE)$/.test(k)) clean[k] = v;
  const probe = [
    `console.log('fence: ' + process.env.HUB_NET_FENCE);`,
    t('narrow-fetch-out', `await fetch(${JSON.stringify(OUT)})`),
    t('narrow-spawn-curl', `(await import('node:child_process')).spawnSync('curl', ['--version'])`),
    `process.exit(0);`,
  ].join('\n');
  run('vitest-narrow.sh direct, clean environment', ['/bin/bash', '-p', path.join(import.meta.dir, 'vitest-narrow.sh'), '--fence-probe', probe], [
    'fence: runner', 'narrow-fetch-out: TERM_NET_DENIED', 'narrow-spawn-curl: TERM_SPAWN_DENIED',
  ], clean);
}

// Node test-process isolation (separate from the fence): vitest-narrow.sh run with synthetic
// credential sentinels in the environment and in the caller's HOME. Neither the test process nor its child sees one;
// HOME and os.homedir() (named import too) are a fresh empty directory under .term-cache/test-homes.
{
  const SENT = 'SENTINEL-not-a-credential';
  const realHome = path.join(FAKE, 'caller-home');
  fs.mkdirSync(path.join(realHome, '.hoody'), { recursive: true });
  fs.writeFileSync(path.join(realHome, '.hoody', 'credentials'), SENT);
  const withSecrets: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: realHome, HOODY_TOKEN: `hdy_${SENT}`, HOODY_API_KEY: SENT, AWS_SECRET_ACCESS_KEY: SENT, GITHUB_TOKEN: SENT, OPENROUTER_API_KEY: SENT, XDG_CONFIG_HOME: realHome, HOODY_CONFIG_DIR: path.join(realHome, '.hoody') };
  const look = `const env = JSON.stringify(process.env); const { homedir } = await import('node:os'); const h = homedir();`
    + ` const fs = await import('node:fs');`
    + ` console.log('iso-env: ' + (env.includes(${JSON.stringify(SENT)}) ? 'LEAK' : 'clean'));`
    + ` console.log('iso-home: ' + (process.env.HOME === h && h.includes('/.term-cache/test-homes/home-') && fs.readdirSync(h).length === 0 ? 'isolated' : 'NOT ' + h));`
    + ` console.log('iso-xdg: ' + (process.env.XDG_CONFIG_HOME === h && process.env.HOODY_CONFIG_DIR === h ? 'isolated' : 'NOT'));`;
  const probe = [
    look,
    `const c = (await import('node:child_process')).spawnSync(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(look.replace(/iso-/g, 'child-iso-'))}]); console.log(String(c.stdout).trim(), String(c.stderr).trim().slice(0, 200));`,
    `process.exit(0);`,
  ].join('\n');
  run('vitest-narrow.sh test environment: sentinels dropped, HOME isolated', ['/bin/bash', '-p', path.join(import.meta.dir, 'vitest-narrow.sh'), '--fence-probe', probe], [
    'iso-env: clean', 'iso-home: isolated', 'iso-xdg: isolated', 'child-iso-env: clean', 'child-iso-home: isolated', 'child-iso-xdg: isolated',
  ], withSecrets);
}

// The OS boundary itself (netns.sh) is proven from OUTSIDE it, before this
// part runs: net-guard-proof-outside.ts (each entry enters it; refusals when it cannot be made; nothing the caller
// planted reaches inside). Everything below runs inside the boundary.

// A fenced spawn carries no caller shell startup (BASH_ENV) into an approved script, and a refusal's
// diagnostics never repeat an argument (a canary in argv / URL stays out of the child's stdout and stderr).
{
  const rc = path.join(FAKE, 'bash-env-rc');
  fs.writeFileSync(rc, 'echo BASHENV-RAN\n');
  const CANARY = 'CANARY-hdy_not-a-real-token';
  const code = [
    `const r = Bun.spawnSync(['/bin/bash', '-p', ${JSON.stringify(path.join(import.meta.dir, 'gate-slot.sh'))}, process.execPath, '-e', 'console.log("inner ran")'], { env: { ...process.env, BASH_ENV: ${JSON.stringify(rc)}, HUB_GATE_SLOT_HELD: '1' } });`,
    `console.log(r.stdout.toString() + r.stderr.toString());`,
    t('canary-spawn', `Bun.spawnSync(['curl', ${JSON.stringify(CANARY)}])`),
    t('canary-fetch', `await fetch(${JSON.stringify(`https://${CANARY}.invalid/`)})`),
    `process.exit(0);`,
  ].join('\n');
  const p = Bun.spawnSync([process.execPath, '-e', code], { env, stdout: 'pipe', stderr: 'pipe', timeout: 60_000 });
  const out = p.stdout.toString() + p.stderr.toString();
  const ok = out.includes('inner ran') && !out.includes('BASHENV-RAN') && !out.includes(CANARY) && out.includes('canary-spawn: TERM_SPAWN_DENIED') && out.includes('canary-fetch: TERM_NET_DENIED');
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} bash-env: no BASH_ENV through a fenced spawn; refusals carry no argument\n${ok ? '' : `     output: ${out.trim().split('\n').slice(-6).join(' | ')}\n`}`);
  if (!ok) failed++;
}

process.stdout.write(failed ? `FAIL: ${failed} child(ren) not fenced\n` : 'ok: the fence follows Bun and Node children, nested children, Bun Workers and worker threads\n');
process.exit(failed ? 1 : 0);

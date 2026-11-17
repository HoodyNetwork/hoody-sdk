// net-policy.mjs: the fences' shared rules.
import { expect, test } from 'bun:test';
import { connectVerdict, ownHookFile, startHooks, DNS_METHOD, guardEnv, listenerOf, pinListenHost, spawnOptionsVerdict, spawnVerdict, targetFamily } from './net-policy.mjs';

test('targets: numeric loopback only; names are ambiguous; everything else refused', () => {
  expect(['127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1', '0:0:0:0:0:0:0:1'].map(targetFamily)).toEqual([4, 6, 6, 4, 6]);
  expect(['localhost', 'LOCALHOST', 'localhost.', 'a.localhost', 'ip6-localhost'].map(targetFamily)).toEqual(['ambiguous', 'ambiguous', 'ambiguous', 'ambiguous', 'ambiguous']);
  expect(['127.0.0.2', '10.0.0.1', 'example.invalid', '', undefined, '0.0.0.0', '::'].map(targetFamily)).toEqual([null, null, null, null, null, null, null]);
});

test('listens are pinned to a numeric address', () => {
  expect([undefined, '', 'localhost', 'LOCALHOST', '::', '0.0.0.0', '::1', '127.0.0.1'].map(pinListenHost)).toEqual(['127.0.0.1', '127.0.0.1', '127.0.0.1', '127.0.0.1', '::', '0.0.0.0', '::1', '127.0.0.1']);
});

test('listener families: :: answers IPv4 only when dual-stack', () => {
  expect(listenerOf('127.0.0.1', 5)).toEqual({ address: '127.0.0.1', port: 5, v4: true, v6: false });
  expect(listenerOf('0.0.0.0', 5)).toEqual({ address: '0.0.0.0', port: 5, v4: true, v6: false });
  expect(listenerOf('::1', 5)).toEqual({ address: '::1', port: 5, v4: false, v6: true });
  expect(listenerOf('::', 5, { bindv6only: 0 })).toEqual({ address: '::', port: 5, v4: true, v6: true });
  expect(listenerOf('::', 5, { ipv6Only: true })).toEqual({ address: '::', port: 5, v4: false, v6: true });
  expect(listenerOf('::', 5, { bindv6only: 1 })).toEqual({ address: '::', port: 5, v4: false, v6: true });
  expect(listenerOf('10.0.0.5', 5)).toBeNull();
  expect(listenerOf('localhost', 5)).toBeNull();
  expect(listenerOf('127.0.0.1', 0)).toBeNull();
});

test('connect verdicts: owned port, answering family, never a name', () => {
  const ls = [listenerOf('127.0.0.1', 4000)!, listenerOf('::', 4001, { ipv6Only: true })!];
  expect(connectVerdict(ls, '127.0.0.1', 4000).ok).toBe(true);
  expect(connectVerdict(ls, '::1', 4000)).toEqual({ ok: false, code: 'NO_LISTENER', why: 'no open listener of this process answers [::1]:4000' });
  expect(connectVerdict(ls, 'localhost', 4000).ok).toBe(false);
  expect(connectVerdict(ls, '127.0.0.1', 4001).ok).toBe(false);
  expect(connectVerdict(ls, '[::1]', 4001).ok).toBe(true);
  expect(connectVerdict(ls, '127.0.0.1', 4002).ok).toBe(false);
  expect(connectVerdict(ls, 'example.invalid', 4000).ok).toBe(false);
});

test('runner children: Bun or Node only (also through nice / flock, or a scripts/term shell script)', () => {
  const hub = '/h/hub';
  const ok = (a: string[]) => spawnVerdict(a, hub, '/usr/local/bin/bun').ok;
  expect(ok(['bun', 'x.ts'])).toBe(true);
  expect(ok(['/usr/bin/node', 'x.mjs'])).toBe(true);
  expect(ok(['/usr/local/bin/bun', 'test'])).toBe(true);
  expect(ok(['nice', '-n', '10', 'bun', 'x.ts'])).toBe(true);
  expect(ok(['nice', '-n', '10', 'bun', 'x'])).toBe(false); // `bun x` is bunx
  expect(ok(['flock', '-w', '300', '/l.lock', 'bash', '/h/hub/scripts/term/vitest-narrow.sh', 'f'])).toBe(true);
  expect(ok(['curl', 'https://x'])).toBe(false);
  expect(ok(['nice', '-n', '10', 'curl'])).toBe(false);
  expect(ok(['bash', '-c', 'curl x'])).toBe(false);
  expect(ok(['bash', '/h/hub/scripts/term/../../../evil.sh'])).toBe(false);
  expect(ok(['flock', '/l.lock', 'sh', '/tmp/x.sh'])).toBe(false);
  expect(ok([])).toBe(false);
});

// A shell runs only a listed entry; a forwarding entry's command is judged recursively; wrappers and
// runtimes cannot be told to start another program (flock -c, bunx, bun x / run <script>, node --run).
test('shell entries: listed scripts only; gate-slot.sh forwards only a fenced command', () => {
  const files: Record<string, string> = { bun: '/opt/bun/bin/bun', node: '/usr/bin/node', nice: '/usr/bin/nice', flock: '/usr/bin/flock', bash: '/usr/bin/bash', curl: '/usr/bin/curl' };
  const exe = { runtimes: new Set(['/opt/bun/bin/bun', '/usr/bin/node']), tools: new Set(['/usr/bin/nice', '/usr/bin/flock', '/usr/bin/bash']), resolve: (p: string) => files[p] ?? (p.startsWith('/') ? p : null) };
  const v = (argv: string[]) => spawnVerdict(argv, '/h/hub', '/opt/bun/bin/bun', exe);
  const slot = '/h/hub/scripts/term/gate-slot.sh';
  expect(v(['bash', slot, 'curl', '--version'])).toEqual({ ok: false, code: 'NOT_RUNTIME', why: 'gate-slot.sh forwards a refused command: curl is not Bun or Node (a child outside the fence)' });
  expect(v(['bash', slot, 'bun', 'scripts/term/check.ts', '--page', 'keys']).ok).toBe(true);
  expect(v(['bash', slot, 'bash', slot, 'nice', '-n', '19', 'curl']).ok).toBe(false);
  expect(v(['bash', slot, 'bash', '/h/hub/scripts/term/vitest-narrow.sh', 'hub/src/x.test.ts']).ok).toBe(true);
  expect(v(['bash', slot]).ok).toBe(false);
  expect(v(['bash', '/h/hub/scripts/term/other.sh']).why).toContain('may run only');
  expect(v(['bash', '-x', slot, 'bun', 'x.ts']).ok).toBe(false);
  expect(v([...Array(6).fill(['bash', slot]).flat(), 'bun', 'x.ts']).why).toContain('gate-slot.sh forwards a refused command');
  // Wrapper options.
  expect(v(['flock', '/l.lock', '-c', 'curl x']).ok).toBe(false);
  expect(v(['flock', '-c', 'curl x', '/l.lock']).ok).toBe(false);
  expect(v(['flock', '--command=curl', '/l.lock', 'bun', 'x.ts']).ok).toBe(false);
  expect(v(['flock', '-x', '-w', '300', '/l.lock', 'bun', 'x.ts']).ok).toBe(true);
  expect(v(['flock', '--timeout=300', '/l.lock', 'bun', 'x.ts']).ok).toBe(true);
  expect(v(['nice', '--version']).ok).toBe(false);
  expect(v(['nice', '-19', 'bun', 'x.ts']).ok).toBe(true);
  // Runtimes that would start a package script or binary.
  for (const a of [['bunx', 'curl'], ['bun', 'x', 'curl'], ['bun', 'run', 'build'], ['bun', 'install'], ['bun', 'dev'], ['bun', '--bun', 'x', 'curl'], ['node', '--run', 'build'], ['node', '--run=build']]) expect(v(a).ok, a.join(' ')).toBe(false);
  for (const a of [['bun', 'test', '--preload', './scripts/term/test-preload.ts', 'f.term.test.ts'], ['bun', 'scripts/term/check.ts'], ['bun', 'run', 'scripts/term/check.ts'], ['bun', '-e', '1'], ['bun', '--preload', './scripts/term/test-preload.ts', 'y.ts'], ['node', '--input-type=module', '-e', '1'], ['node', '--wasm-max-mem-pages=4096', 'node_modules/vitest/vitest.mjs', 'run'], ['node', '--import', '/h/hub/scripts/term/net-guard-node.mjs', '/w/worker.js']]) expect(v(a).ok, a.join(' ')).toBe(true);
});

test('guardEnv: an allowlist (named keys only), exactly the fence options, no startup hook', () => {
  const e = guardEnv('/h/hub', { BUN_OPTIONS: '--smol --preload=/x/evil.ts', NODE_OPTIONS: '--require /x/evil.cjs', PATH: '/bin', KEEP: 'k',
    HOODY_TOKEN: 'abc', HOODY_API_URL: 'https://api.example', AWS_SECRET_ACCESS_KEY: 'x', HOME: '/home/u', VITEST_POOL_ID: '1',
    BASH_ENV: '/x/rc', ENV: '/x/rc', 'BASH_FUNC_ls%%': '() { curl x; }', LD_PRELOAD: '/x/evil.so', LD_LIBRARY_PATH: '/x', NODE_PATH: '/x',
    BUN_CONFIG_REGISTRY: 'https://x', BUN_INSPECT: 'ws://x', HTTPS_PROXY: 'http://x', PS4: '$(curl x)', PROMPT_COMMAND: 'curl x', SHELLOPTS: 'xtrace' });
  // Unnamed keys (HOODY_TOKEN, an API address, cloud keys, KEEP) never pass; HOME and vitest's own worker keys do.
  expect(e).toEqual({ PATH: '/bin', HOME: '/home/u', VITEST_POOL_ID: '1', BUN_OPTIONS: '--preload=/h/hub/scripts/term/net-guard-runner.ts', NODE_OPTIONS: '--import /h/hub/scripts/term/net-guard-node.mjs', HUB_NET_FENCE: 'runner' });
  // Idempotent; the Node test environment import is kept when the parent carried it; a test fence stays test.
  expect(guardEnv('/h/hub', e)).toEqual(e);
  const t = guardEnv('/h/hub', { NODE_OPTIONS: '--import /h/hub/scripts/term/net-guard-node.mjs --import /h/hub/scripts/term/node-test-env.mjs', HUB_NET_FENCE: 'test' });
  expect(t.NODE_OPTIONS).toBe('--import /h/hub/scripts/term/net-guard-node.mjs --import /h/hub/scripts/term/node-test-env.mjs');
  expect(t.HUB_NET_FENCE).toBe('test');
});

test('spawn options: stdio 0-2 only, no fd, stream or extra slot; no runtime startup hook in execArgv', () => {
  const ok = (o: object, f = {}) => spawnOptionsVerdict(o, f).ok;
  for (const o of [{ stdio: 'inherit' }, { stdio: ['ignore', 'pipe', 'inherit'] }, { stdio: [0, 1, 2] }, { stdin: 'pipe', stdout: 'inherit', stderr: null },
    { stdin: 'some input' }, { stdin: new Uint8Array(2) }, { execArgv: ['--wasm-max-mem-pages=4096'] },
    // vitest's forks: resolution conditions and vm modules (not startup hooks).
    { execArgv: ['--wasm-max-mem-pages=4096', '--conditions', 'development', '-C', 'browser', '--experimental-vm-modules'] }]) expect(ok(o), JSON.stringify(o)).toBe(true);
  expect(ok({ stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }, { fork: true })).toBe(true);
  // vitest's fork: --require of exactly the allowed file passes; any other file, or the same flag without the allowance, does not.
  const vx = ['--experimental-import-meta-resolve', '--require', '/n/vitest/suppress-warnings.cjs', '--conditions', 'node'];
  expect(ok({ execArgv: vx }, { requireOk: ['/n/vitest/suppress-warnings.cjs'] })).toBe(true);
  expect(ok({ execArgv: ['--require=/n/vitest/suppress-warnings.cjs'] }, { requireOk: ['/n/vitest/suppress-warnings.cjs'] })).toBe(true);
  expect(ok({ execArgv: vx })).toBe(false);
  expect(ok({ execArgv: ['--require', '/x/evil.cjs'] }, { requireOk: ['/n/vitest/suppress-warnings.cjs'] })).toBe(false);
  expect(ok({ execArgv: ['--import', '/n/vitest/suppress-warnings.cjs'] }, { requireOk: ['/n/vitest/suppress-warnings.cjs'] })).toBe(false);
  for (const o of [{ stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }, { stdio: ['pipe', 'pipe', 'pipe', 5] }, { stdio: [5, 1, 2] }, { stdio: [0, 0, 2] },
    { stdio: [{ fd: 7 }, 1, 2] }, { stdin: 7 }, { stdout: 9 }, { stderr: { fd: 3 } }, { stdin: '7' }, { stdio: 'overlapped-x' },
    { execArgv: ['--require', 'x'] }, { execArgv: ['--import=x'] }, { execArgv: ['--preload', 'x'] }, { execArgv: ['--inspect=0'] }, { execArgv: ['--env-file=.env'] }, { execArgv: '--require x' }]) {
    const v = spawnOptionsVerdict(o) as { ok: boolean; code?: string };
    expect(v.ok, JSON.stringify(o)).toBe(false);
    expect(['STDIO_FD', 'EXEC_ARGV']).toContain(v.code!);
  }
});

test('every refusal carries a fixed reason code (the guards print only the code, never argv or a host)', () => {
  const v = (a: string[]) => spawnVerdict(a, '/h/hub', '/usr/bin/bun') as { ok: boolean; code?: string };
  const codes = new Set(['WRAPPER_DEPTH', 'UNTRUSTED_EXE', 'WRAPPER_OPTION', 'SHELL_STRING', 'NO_COMMAND', 'NOT_RUNTIME', 'RUNTIME_ARGS', 'SHELL_SCRIPT']);
  for (const a of [['curl', 'x'], ['bunx', 'x'], ['bun', 'x', 'y'], ['flock', '-c', 'curl', 'l'], ['nice', '-z', 'bun'], [], ['bash', '/x.sh'], ['flock', 'l', 'curl']]) {
    const r = v(a);
    expect(r.ok, a.join(' ')).toBe(false);
    expect(codes.has(r.code!), `${a.join(' ')} -> ${r.code}`).toBe(true);
  }
  for (const h of ['localhost', '10.0.0.1', '127.0.0.1']) expect(['NAME', 'NOT_LOOPBACK', 'NO_LISTENER']).toContain((connectVerdict(new Set(), h, 1) as { code?: string }).code!);
});

test('actual executables: a runtime or wrapper is judged by the file it resolves to, not its name', () => {
  const files: Record<string, string> = { bun: '/opt/bun/bin/bun', node: '/usr/bin/node', nice: '/usr/bin/nice', flock: '/usr/bin/flock', bash: '/usr/bin/bash', '/tmp/evil/node': '/tmp/evil/node', '/tmp/evil/nice': '/tmp/evil/nice', '/self/bun': '/opt/bun/bin/bun' };
  const exe = { runtimes: new Set(['/opt/bun/bin/bun', '/usr/bin/node']), tools: new Set(['/usr/bin/nice', '/usr/bin/flock', '/usr/bin/bash']), resolve: (p: string) => files[p] ?? null };
  const v = (argv: string[]) => spawnVerdict(argv, '/h/hub', '/self/bun', exe);
  expect(v(['bun', 'x.ts']).ok).toBe(true);
  expect(v(['/self/bun', 'x.ts']).ok).toBe(true);
  expect(v(['nice', '-n', '19', 'node', 'x.mjs']).ok).toBe(true);
  expect(v(['/tmp/evil/node', 'x.mjs'])).toEqual({ ok: false, code: 'UNTRUSTED_EXE', why: '/tmp/evil/node is /tmp/evil/node, not a trusted Bun or Node' });
  expect(v(['/tmp/evil/nice', 'bun', 'x.ts']).ok).toBe(false);
  expect(v(['bunx', 'x']).why).toBe('bunx runs a package binary (any program)');
  expect(v(['bash', '/h/hub/scripts/term/vitest-narrow.sh', 'f']).ok).toBe(true);
  expect(v(['bash', '/h/hub/scripts/term/a.sh']).ok).toBe(false);
  // Without `exe` (no guard context) only the names are judged: the guards always pass it.
  expect(spawnVerdict(['/tmp/evil/node'], '/h/hub', '/self/bun').ok).toBe(true);
});

test('spawn options: any shell is refused', () => {
  expect(spawnOptionsVerdict({}).ok).toBe(true);
  expect(spawnOptionsVerdict({ shell: false }).ok).toBe(true);
  expect(spawnOptionsVerdict({ shell: true }).ok).toBe(false);
  expect(spawnOptionsVerdict({ shell: '/bin/sh' }).ok).toBe(false);
});

test('DNS methods: module, promises and Resolver names, reverse included', () => {
  for (const k of ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolveAny', 'reverse']) expect(DNS_METHOD.test(k)).toBe(true);
  for (const k of ['setServers', 'getServers', 'cancel', 'setLocalAddress']) expect(DNS_METHOD.test(k)).toBe(false);
});

// A startup module in a runtime's argv runs before the fence (Node runs --require before any --import), and
// the compact `-r/path` spelling slipped past the execArgv check. Every spelling is parsed the same way (startHooks);
// only the harness's own files (directly in <hub>/scripts/term/) may be preloaded.
test('startup modules: every spelling parsed alike; only the harness own files', () => {
  const files: Record<string, string> = { bun: '/opt/bun/bin/bun', node: '/usr/bin/node', bash: '/usr/bin/bash' };
  const exe = { runtimes: new Set(['/opt/bun/bin/bun', '/usr/bin/node']), tools: new Set(['/usr/bin/bash']), resolve: (p: string) => files[p] ?? (p.startsWith('/') ? p : null) };
  const v = (argv: string[]) => spawnVerdict(argv, '/h/hub', '/opt/bun/bin/bun', exe) as { ok: boolean; code?: string };
  for (const a of [['bun', '--preload', 'x', 'y.ts'], ['bun', '-r/x/evil.ts', 'y.ts'], ['bun', '-r=/x/evil.ts', 'y.ts'], ['bun', '-r', '/x/evil.ts', 'y.ts'],
    ['bun', '--preload=/x/evil.ts', 'y.ts'], ['bun', 'test', '--preload', '/x/evil.ts', 'f.term.test.ts'], ['bun', '--require', '../evil.ts', 'y.ts'],
    ['node', '--require', '/x/e.cjs', '--import', '/h/hub/scripts/term/net-guard-node.mjs', 'w.js'], ['node', '-r', '/x/e.cjs', 'w.js'],
    ['node', '-r/x/e.cjs', 'w.js'], ['node', '--require=/x/e.cjs', 'w.js'], ['node', '--import', '/x/e.mjs', 'w.js'], ['node', '--loader', '/x/l.mjs', 'w.js'],
    ['node', '--experimental-loader=/x/l.mjs', 'w.js'], ['bun', '--preload', '/h/hub/scripts/term/../../evil.ts', 'y.ts'], ['bun', '--preload', '/h/hub/scripts/term/sub/x.ts', 'y.ts']]) {
    const r = v(a);
    expect(r.ok, a.join(' ')).toBe(false);
    expect(r.code, a.join(' ')).toBe('RUNTIME_ARGS');
  }
  for (const a of [['bun', '--preload', './scripts/term/test-preload.ts', 'y.ts'], ['bun', '-r./scripts/term/test-preload.ts', 'y.ts'],
    ['bun', '--preload=/h/hub/scripts/term/net-guard-runner.ts', 'y.ts'], ['bun', 'test', '--preload', 'scripts/term/test-preload.ts', 'f.term.test.ts'],
    ['node', '--import', '/h/hub/scripts/term/net-guard-node.mjs', 'w.js'],
    // The program's own arguments after its file are not runtime options.
    ['bun', 'y.ts', '-r/x/evil.ts'], ['node', 'w.js', '--require', '/x/e.cjs']]) expect(v(a).ok, a.join(' ')).toBe(true);
  // execArgv (fork / Worker): compact and `=` spellings judged like the spaced one.
  const okArgv = (x: string[], requireOk: string[] = []) => spawnOptionsVerdict({ execArgv: x }, { requireOk }).ok;
  expect(okArgv(['-r/x/evil.cjs'])).toBe(false);
  expect(okArgv(['-r/x/evil.cjs'], ['/n/vitest/suppress-warnings.cjs'])).toBe(false);
  expect(okArgv(['-r=/x/evil.cjs'])).toBe(false);
  expect(okArgv(['-r/n/vitest/suppress-warnings.cjs'], ['/n/vitest/suppress-warnings.cjs'])).toBe(true);
  expect(okArgv(['-r', '/n/vitest/suppress-warnings.cjs', '--conditions', 'node'], ['/n/vitest/suppress-warnings.cjs'])).toBe(true);
  // The parser itself.
  expect(startHooks(['-r/a', '-r=b', '-r', 'c', '--require=d', '--import', 'e', 'f.js', '--preload', 'g'])).toEqual([
    { opt: '-r', value: '/a', at: 0, width: 1 }, { opt: '-r', value: 'b', at: 1, width: 1 }, { opt: '-r', value: 'c', at: 2, width: 2 },
    { opt: '--require', value: 'd', at: 4, width: 1 }, { opt: '--import', value: 'e', at: 5, width: 2 }, { opt: '--preload', value: 'g', at: 8, width: 2 }]);
  expect(ownHookFile('./scripts/term/test-preload.ts', '/h/hub')).toBe(true);
  expect(ownHookFile('/h/hub/scripts/term/x.mjs', '/h/hub')).toBe(true);
  for (const x of ['/x/scripts/term/x.ts', 'scripts/term/../x.ts', '/h/hub/scripts/term/a/b.ts', '', 'x.ts', '/h/hub/scripts/term/.x.ts']) expect(ownHookFile(x, '/h/hub'), x).toBe(false);
});

test('privileged-mode shells and the boundary script: `bash -p <entry>`, netns.sh --fresh forwards a judged command', () => {
  const files: Record<string, string> = { bun: '/opt/bun/bin/bun', bash: '/usr/bin/bash', curl: '/usr/bin/curl' };
  const exe = { runtimes: new Set(['/opt/bun/bin/bun']), tools: new Set(['/usr/bin/bash']), resolve: (p: string) => files[p] ?? (p.startsWith('/') ? p : null) };
  const v = (argv: string[]) => spawnVerdict(argv, '/h/hub', '/opt/bun/bin/bun', exe).ok;
  const ns = '/h/hub/scripts/term/netns.sh';
  expect(v(['bash', '-p', '/h/hub/scripts/term/vitest-narrow.sh', 'f'])).toBe(true);
  expect(v(['bash', '-p', ns, 'bun', 'x.ts'])).toBe(true);
  expect(v(['bash', '-p', ns, '--fresh', 'bun', 'x.ts'])).toBe(true);
  expect(v(['bash', '-p', ns, '--confined'])).toBe(true);
  expect(v(['bash', '-p', ns, '--fresh', 'curl', 'x'])).toBe(false);
  expect(v(['bash', '-p', ns, 'curl', 'x'])).toBe(false);
  expect(v(['bash', '-p', '-x', ns, 'bun', 'x.ts'])).toBe(false);
  expect(v(['bash', '-p', '/x/evil.sh'])).toBe(false);
});

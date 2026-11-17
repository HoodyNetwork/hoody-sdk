// The OS boundary (netns.sh / netns.ts): this test process runs in
// network, pid and mount namespaces (loopback only; its own /proc; a tmpfs root with only the harness's view), and a connect to a routable address fails IN THE KERNEL, below
// every JavaScript fence (a raw libc socket()/connect() through bun:ffi, which no JS guard sees). The spawn-level proofs
// (vitest-narrow.sh, gate-slot.sh, refusal when the namespace cannot be made) are in net-guard-proof.ts: a test process
// may not start children.
import { expect, test } from 'bun:test';
import { dlopen, FFIType, ptr, read as ffiRead } from 'bun:ffi';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hostFileState, parseReadRoots, READ_LIST_HOST_FILE, READ_ROOT_NAMES, readHostFile, readRoots } from '../lib';
import { confined, confinedBy, interfaces, rootIsBoundary, ROOT_TAG } from './netns';
import { ioLocked } from './child-env';
import { staticImports } from './static-imports';

/** This host's roots (the host file, read-only inside the boundary as part of /etc); empty on a machine without it. */
const READ_ROOTS = readRoots();

const ENETUNREACH = 101;
const EINPROGRESS = 115;

/** A non-blocking IPv4 TCP connect straight through libc; returns errno (0 = the kernel accepted it). */
function rawConnect(a: number, b: number, c: number, d: number, port: number): number {
  const libc = dlopen('libc.so.6', {
    socket: { args: [FFIType.i32, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    connect: { args: [FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
    close: { args: [FFIType.i32], returns: FFIType.i32 },
    __errno_location: { args: [], returns: FFIType.ptr },
  });
  try {
    const fd = libc.symbols.socket(2 /* AF_INET */, 1 | 0o4000 /* SOCK_STREAM | SOCK_NONBLOCK */, 0);
    if (fd < 0) return -1;
    const sa = new Uint8Array(16);
    sa[0] = 2; sa[2] = port >> 8; sa[3] = port & 0xff; sa[4] = a; sa[5] = b; sa[6] = c; sa[7] = d;
    const r = libc.symbols.connect(fd, ptr(sa), 16);
    const errno = r === 0 ? 0 : ffiRead.i32(libc.symbols.__errno_location()!, 0);
    libc.symbols.close(fd);
    return errno;
  } finally { libc.close(); }
}

test('only loopback exists; a connect to a routable address is refused by the kernel (ENETUNREACH)', () => {
  const names = interfaces();
  // Checked FIRST: outside the boundary this fails here, before any packet could be sent.
  expect(names).toEqual(['lo']);
  expect(confined()).toBe(true);
  // 192.0.2.1 (TEST-NET-1) and 1.1.1.1: no route in the namespace, so connect() fails synchronously; an unconfined
  // process would get EINPROGRESS instead.
  expect(rawConnect(192, 0, 2, 1, 9)).toBe(ENETUNREACH);
  expect(rawConnect(1, 1, 1, 1, 443)).toBe(ENETUNREACH);
  expect(rawConnect(1, 1, 1, 1, 443)).not.toBe(EINPROGRESS);
});

test('loopback still works inside the boundary (lo is up: loopback fakes serve)', async () => {
  const s = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('own') });
  try { expect(await (await fetch(`http://127.0.0.1:${s.port}/`)).text()).toBe('own'); } finally { s.stop(true); }
});

test('confinement is read from the kernel: any non-lo interface, or none, is not confined', () => {
  const dev = (...n: string[]): string => ['Inter-|', ' face |', ...n.map((x) => `  ${x}: 0 0 0`)].join('\n');
  expect(interfaces(dev('lo', 'eth0'))).toEqual(['lo', 'eth0']);
  expect(confinedBy(interfaces(dev('lo')))).toBe(true);
  expect(confinedBy(interfaces(dev('lo', 'eth0')))).toBe(false);
  expect(confinedBy(interfaces(dev('veth0')))).toBe(false);
  expect(confinedBy([])).toBe(false);
});

const read = (f: string): string => fs.readFileSync(path.join(import.meta.dir, f), 'utf8');

test('every entry goes through the boundary first', () => {
  // Every runnable script under scripts/term (a #! line, import.meta.main or process.argv) imports netns-first.ts as its
  // FIRST import (synchronous re-run inside the boundary), or netns-required.ts (refuses outside; no re-run) where it is
  // compiled into a binary. Exempt, with the reason: the CLI launcher (the shipped product, not a test entry), the
  // boundary itself and the live dev entry.
  const EXEMPT: Record<string, string> = {
    'build/launcher.ts': 'the shipped launcher of the compiled Hub (product, not a harness)',
    'build/hub-cache.ts': 'the `hoody hub` executable\'s own start (library cache, then hub-main): product, not a harness',
    'netns.ts': 'the boundary itself (a library; netns-first.ts runs it)',
    'live.ts': 'the live dev entry: the real Hub on the real API with the CLI\'s saved login, never a test',
  };
  const REQUIRED = new Set(['build/measure.ts', 'build/ship-run.ts']);
  const walk = (d: string): string[] => fs.readdirSync(path.join(import.meta.dir, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (d === '' && e.name !== 'build' ? [] : walk(path.join(d, e.name))) : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path.join(d, e.name)] : []);
  const entries = walk('').filter((f) => { const t = read(f); return t.startsWith('#!') || t.includes('import.meta.main') || t.includes('process.argv'); });
  expect(entries.length).toBeGreaterThan(25);
  const bad: string[] = [];
  for (const f of entries) {
    if (EXEMPT[f]) continue;
    const first = read(f).split('\n').find((l) => l.startsWith('import ')) ?? '';
    // The boundary's own proof starts outside on purpose: its first import runs only boundary entries there, then
    // re-runs the proof inside (net-guard-proof-outside.ts; nothing else of it runs outside).
    const want = f === 'net-guard-proof.ts' ? /^import '\.\/net-guard-proof-outside';/ : REQUIRED.has(f) ? /^import '(\.\.\/|\.\/)netns-required';/ : /^import '(\.\.\/|\.\/)netns-first';/;
    if (!want.test(first)) bad.push(`${f}: ${first.slice(0, 60)}`);
  }
  expect(bad).toEqual([]);
  // The Bun test preload too, and netns-first runs the check synchronously.
  const pre = read('test-preload.ts').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
  expect(pre[0]).toBe(`import './netns-first';`);
  expect(read('netns-first.ts')).toContain('\nensureConfined();\n');
  expect(read('net-guard-proof-outside.ts')).toContain('\nif (!confined()) process.exit(outsideThenInside());\n');
  expect(read('net-guard-proof-outside.ts')).toMatch(/const \[file, \.\.\.args\] = confine\(ownCommand\(\)\);\n  const r = spawnSync\(file!, args, [^\n]*\);\n  return failed \|\| r\.status !== 0 \? 1 : 0;\n\}\n$/);
  // The gate runner starts every child through netns.sh as well: no runGroup/spawn in check.ts without confine().
  const check = read('check.ts');
  expect(check.match(/runGroup\(/g)?.length).toBe(check.match(/runGroup\(confine\(/g)?.length);
  expect(check).not.toMatch(/Bun\.spawn|spawnGroup\(|child_process/);
});

test('shell entries start in a privileged-mode shell and re-run inside the boundary first', () => {
  for (const f of ['vitest-narrow.sh', 'gate-slot.sh', 'netns.sh']) {
    const text = read(f);
    // bash -p: no BASH_ENV / ENV / imported functions / SHELLOPTS, even for the shell that reads this file.
    expect(text.split('\n')[0]).toBe('#!/bin/bash -p');
    const code = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    // The first command refuses a shell started without -p (a plain `bash f` already ran the caller's startup).
    expect(code[0]).toMatch(/^case \$- in \*p\*\) ;; \*\) printf '[\w-]+: refused: TERM_NETNS_NOT_PRIVILEGED_SHELL .*exit 3 ;; esac$/);
    expect(code[1]).toBe('set -euo pipefail');
    if (f === 'netns.sh') continue;
    expect(code[2]).toBe('NETNS="$(/usr/bin/dirname "${BASH_SOURCE[0]}")/netns.sh"');
    expect(code[3]).toBe('/bin/bash -p "$NETNS" --confined || exec /bin/bash -p "$NETNS" /bin/bash -p "${BASH_SOURCE[0]}" "$@"');
  }
  // netns.sh: env -i with the keep list before the first interpreter of the boundary; descriptors closed; never a fallback.
  const sh = read('netns.sh');
  expect(sh).toContain('exec /usr/bin/env -i "${ENVV[@]}" /usr/bin/unshare -rnmpf --kill-child -- /bin/bash -p "$SELF" --inner');
  expect(sh).toMatch(/\nclose_fds\nif \[ "\$FRESH" = 0 \] && confined; then exec "\$@"; fi\n/);
  expect(sh).toContain('refuse TERM_NETNS_UNAVAILABLE');
  expect(sh).not.toMatch(/(^|[;&|]\s*|exec\s+)(unshare|ip|bash|id|env|mount|mkdir)\s/m);
  // The JS side runs netns.sh in a privileged-mode shell too.
  expect(read('netns.ts')).toContain(`['/bin/bash', '-p', NETNS_SH, ...cmd]`);
});

test('a node_modules above hub binds only a real node_modules outside the fresh and hidden places; any other target refuses', () => {
  // Spawned for real by net-guard-proof-outside.ts #7 (a test cannot start children): planted links to another
  // repository, /run, /proc, HOME and a node_modules under /dev exit 3; a link to a real node_modules still binds.
  const sh = read('netns.sh');
  expect(sh).toContain('[ "${t##*/}" = node_modules ] && [ -d "$t" ] && [ ! -L "$t" ] || return 1');
  expect(sh).toContain('case "$t/" in /proc/*|/sys/*|/dev/*|/run/*|/boot/*|/etc/*) return 1 ;; esac');
  expect(sh).toContain('[ -z "${HOME:-}" ] || [ "$t" != "${HOME%/}" ] || return 1');
  expect(sh).toContain('case "$TREE/" in "$t/"*) return 1 ;; esac');
  expect(sh).toMatch(/\n {10}nm_target_ok "\$real" \|\| refuse "TERM_NETNS_NODE_MODULES_REFUSED \$nm"\n {10}ro_bind "\$real" "\$R"\n/);
  expect(sh.match(/ro_bind "\$real"/g)).toHaveLength(1);
  expect(read('net-guard-proof-outside.ts')).toContain('#7 netns.sh: a node_modules link to another repository');
});

test('the boundary keep list is the fence keep list (net-policy ENV_KEEP) plus the runner extras', async () => {
  const { ENV_KEEP, RUNNER_EXTRA } = await import('./net-policy.mjs');
  const m = /\nKEEP=\(([^)]*)\)/.exec(read('netns.sh'));
  const keep = new Set(m![1]!.split(/\s+/).filter(Boolean));
  const want = new Set([...ENV_KEEP.filter((k: string) => k !== 'NODE_OPTIONS' && k !== 'BUN_OPTIONS'), ...Object.keys(RUNNER_EXTRA)]);
  expect([...keep].sort()).toEqual([...want].sort());
});

test('SECRETS_CASES (secrets.ts case filter) is kept: in the boundary keep list, a case regex passes, a path or credential does not', async () => {
  const { ENV_RULES, envKept } = await import('./net-policy.mjs');
  const m = /\nKEEP=\(([^)]*)\)/.exec(read('netns.sh'));
  expect(m![1]!.split(/\s+/)).toContain('SECRETS_CASES');
  for (const v of ['^many$', '^many\\+env-create$', '^(many|few)-[a-z]+$']) expect(ENV_RULES.SECRETS_CASES(v)).toBe(true);
  for (const v of ['', '/etc/passwd', 'a b', 'x'.repeat(257)]) expect(ENV_RULES.SECRETS_CASES(v)).toBe(false);
  expect(envKept('SECRETS_CASES', 'hdy_' + 'a'.repeat(40))).toBe(false);
});

test('files: the boundary root holds only its view (no other home content, the monorepo only node_modules and netns-read.list, fresh /tmp /run)', () => {
  expect(rootIsBoundary()).toBe(true);
  // The real home of this uid (password database): empty inside, except the runtime's own bin directory.
  const uid = process.getuid!();
  const home = fs.readFileSync('/etc/passwd', 'utf8').split('\n').map((l) => l.split(':')).find((p) => p[2] === String(uid))?.[5] ?? '';
  expect(home.startsWith('/')).toBe(true);
  // The repository root (hub/../..) is the working directory, never the directory it sits in. Beside it, and in a home
  // that holds it, only what netns.sh binds in may exist (boundOutside): walked down every directory that only leads
  // to such a path; what is bound in is not walked (its content is the bound tree). A HOME that IS the repository
  // shows the repository itself.
  const repo = fs.realpathSync(path.join(import.meta.dir, '../../../..'));
  expect(read('netns.sh')).toContain('TREE="$(/usr/bin/realpath -e -- "$HUB/../..")"');
  const bound = boundOutside(repo, home);
  for (const nm of bound.nodeModules) expect(() => fs.writeFileSync(path.join(nm, '.netns-probe'), 'x'), nm).toThrow();
  if (path.dirname(repo) !== '/') expect(strays(path.dirname(repo), bound)).toEqual([]);
  if (home !== repo && fs.existsSync(home)) expect(strays(home, bound)).toEqual([]);
  // (~/.bun: Bun makes ~/.bun/install itself at start; ~/.bun/bin may hold only the runtime file: both in strays().)
  // The monorepo holding the sibling trees (the parent of READ_ROOTS.api): only the node_modules tree(s) hub links to
  // and the lines of netns-read.list (glob, component by component), all read-only; no .env of any repository.
  const mono = READ_ROOTS.api ? path.dirname(READ_ROOTS.api) : '';
  if (mono && fs.existsSync(mono)) {
    // This check reads one monorepo: a root outside it would leave part of the view unchecked, so it fails here.
    for (const [name, root] of Object.entries(READ_ROOTS)) expect(root.startsWith(`${mono}/`), `${name} ${root} is outside ${mono}`).toBe(true);
    const lines = readListEntries().map(([name, rel]) => `${READ_ROOTS[name]}/${rel}`).filter((l) => l.startsWith(`${mono}/`));
    const comp = (g: string) => new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
    const onList = (p: string) => lines.some((l) => { const lc = l.split('/'), pc = p.split('/'); return pc.length <= lc.length && pc.every((c, i) => comp(lc[i]!).test(c)); });
    for (const d of fs.readdirSync(mono)) {
      // Only the roots' directories are bound at this level: a file here is outside the view (asserted, never read
      // as a directory).
      if (!fs.statSync(path.join(mono, d)).isDirectory()) { expect(onList(`${mono}/${d}`), `${mono}/${d}`).toBe(true); continue; }
      for (const e of fs.readdirSync(path.join(mono, d))) {
        const p = `${mono}/${d}/${e}`;
        expect(e === 'node_modules' || onList(p), p).toBe(true);
      }
    }
    expect(fs.existsSync(`${READ_ROOTS.api}/.env`)).toBe(false);
    const nm = fs.realpathSync(path.join(import.meta.dir, '../../../node_modules'));
    expect(() => fs.writeFileSync(path.join(nm, '.netns-probe'), 'x')).toThrow();
    if (fs.existsSync(`${READ_ROOTS.api}/openapi.json`)) expect(() => fs.appendFileSync(`${READ_ROOTS.api}/openapi.json`, '')).toThrow();
  }
  // /run is fresh (no host socket), /dev/shm is fresh.
  expect(fs.readdirSync('/run').filter((n) => n !== 'user')).toEqual([]);
  // /var/tmp holds only the working directory's path and the IO lock file (HUB_TERM_IO_LOCK) when one is set there.
  const tree = repo;
  const io = process.env.HUB_TERM_IO_LOCK;
  for (const e of fs.readdirSync('/var/tmp')) expect(e === tree.split('/')[3] || `/var/tmp/${e}` === io, e).toBe(true);
  // A fresh pid namespace: pid 1 is the boundary's own pid 1, no process from outside is visible.
  expect(fs.readFileSync('/proc/1/cmdline', 'utf8')).toContain('--inner');
  const pids = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n)).map(Number);
  expect(Math.max(...pids)).toBeLessThan(100000);
});

test('the boundary\'s own files and what runs before its chroot are read-only inside', () => {
  const hub = path.resolve(import.meta.dir, '..', '..');
  const m = /^GUARDED=\(([^)]*)\)/m.exec(read('netns.sh'));
  expect(m).not.toBeNull();
  const guarded = m![1]!.split(/\s+/).filter(Boolean);
  // GUARDED is netns.sh, its read list, and netns-roots.ts with every module it imports (run outside the chroot).
  const seen = new Set<string>();
  const walk = (f: string): void => { if (seen.has(f)) return; seen.add(f); for (const n of staticImports(f, { dynamic: true })) walk(n); };
  walk(path.join(import.meta.dir, 'netns-roots.ts'));
  const want = ['scripts/term/netns.sh', 'scripts/term/netns-read.list', ...[...seen].map((f) => path.relative(hub, f))].sort();
  expect([...guarded].sort()).toEqual(want);
  for (const f of guarded) {
    const p = path.join(hub, f);
    expect(fs.existsSync(p), f).toBe(true);
    let err = '';
    try { fs.appendFileSync(p, ''); } catch (e) { err = String((e as NodeJS.ErrnoException).code); }
    expect(err, f).toBe('EROFS');
    err = '';
    try { fs.renameSync(p, p + '.moved'); fs.renameSync(p + '.moved', p); } catch (e) { err = String((e as NodeJS.ErrnoException).code); }
    expect(err, f).toBe('EBUSY');
  }
  // Known limit (netns.sh header): each GUARDED file is its own read-only mount, but no directory above it is, so an
  // ancestor can be renamed from inside and a replacement written. Recorded here, not exercised (a rename would break
  // the tests running beside this one).
  const mountPoints = new Set(fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').map((l) => l.split(' ')[4]).filter(Boolean));
  for (const f of guarded) {
    const p = path.join(hub, f);
    expect(mountPoints.has(p), f).toBe(true);
    for (let a = path.dirname(p); a.startsWith(hub); a = path.dirname(a)) expect(mountPoints.has(a), a).toBe(false);
  }
  // A file beside them stays writable (the working directory is read-write inside): the guard is per file.
  const probe = path.join(import.meta.dir, `.netns-s6-${process.pid}`);
  fs.writeFileSync(probe, 'x'); fs.rmSync(probe);
});

test('/dev holds only the plain devices and a pty instance of its own, never the host /dev', () => {
  expect(fs.readdirSync('/dev').sort()).toEqual(['fd', 'full', 'null', 'ptmx', 'pts', 'random', 'shm', 'stderr', 'stdin', 'stdout', 'tty', 'urandom', 'zero']);
  const mounts = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').map((l) => { const [a, b] = l.split(' - '); return { mp: a?.split(' ')[4], fs: b?.split(' ')[0] }; });
  expect(mounts.find((m) => m.mp === '/dev/pts')?.fs).toBe('devpts');
  expect(mounts.find((m) => m.mp === '/dev')?.fs).toBe('tmpfs');
  fs.writeFileSync('/dev/null', 'x');
});

/** What netns.sh may show outside the repository: each node_modules tree it binds (real path, read-only), the runtime
 *  file (as run and as found on PATH), the read-list entries of the roots this host names (glob, component by
 *  component) and the slot lock files; plus Bun's own ~/.bun/install, made at start in the boundary's fresh root. */
interface Bound { repo: string; nodeModules: string[]; exact(p: string): boolean; leads(p: string): boolean }
function boundOutside(repo: string, home: string): Bound {
  const inRepo = (p: string): boolean => p === repo || p.startsWith(`${repo}/`);
  const nodeModules: string[] = [];
  for (let a = path.resolve(import.meta.dir, '..', '..'); ; a = path.dirname(a)) {
    const nm = path.join(a, 'node_modules');
    if (fs.existsSync(nm)) { const r = fs.realpathSync(nm); if (!inRepo(r) && !nodeModules.includes(r)) nodeModules.push(r); }
    if (a === '/') break;
  }
  const files = [...nodeModules, process.execPath, path.join(home, '.bun', 'install')];
  for (const d of (process.env.PATH ?? '').split(':')) if (d.startsWith('/')) files.push(path.join(d, 'bun'));
  const gs = process.env.HUB_GATE_SLOTS;
  if (gs) for (let i = 0; i < 6; i++) files.push(`${gs}.${i}.lock`);
  if (process.env.HUB_TERM_IO_LOCK?.startsWith('/')) files.push(process.env.HUB_TERM_IO_LOCK);
  const globs = readListEntries().filter(([n]) => READ_ROOTS[n]).map(([n, rel]) => `${READ_ROOTS[n]}/${rel}`.split('/'));
  const comp = (g: string) => new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
  const fits = (p: string, whole: boolean) => { const pc = p.split('/'); return globs.some((lc) => (whole ? pc.length === lc.length : pc.length < lc.length) && pc.every((c, i) => comp(lc[i]!).test(c))); };
  return {
    repo, nodeModules,
    exact: (p) => files.includes(p) || fits(p, true),
    leads: (p) => repo.startsWith(`${p}/`) || files.some((f) => f.startsWith(`${p}/`)) || fits(p, false),
  };
}
/** Every path under `dir` that is neither the repository, nor bound in, nor a directory leading only to those. */
function strays(dir: string, b: Bound): string[] {
  const out: string[] = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (p === b.repo || b.exact(p)) continue;
    if (b.leads(p) && fs.lstatSync(p).isDirectory()) out.push(...strays(p, b)); else out.push(p);
  }
  return out;
}

/** netns-read.list's entries plus the host list's, as [root name, relative path]. */
function readListEntries(): [string, string][] {
  // The host's own read-list (netns.sh HOST_LIST), under the same owner/mode rule as netns.sh (lib.ts hostFileState).
  const host = readHostFile(READ_LIST_HOST_FILE) ?? '';
  return `${read('netns-read.list')}\n${host}`.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1)]);
}

test('a host file is used only when its directory and itself are root-owned, not group/world-writable, not links', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hostfile-'));
  expect(hostFileState(path.join(base, 'none', 'read-list'))).toBe('absent');
  expect(hostFileState(path.join(base, 'read-list'))).toBe('refused'); // the directory is not root's
  const f = path.join(base, 'read-list');
  fs.writeFileSync(f, 'sdk:lib/bot-label.ts\n');
  expect(hostFileState(f)).toBe('refused'); // the file is not root's
  fs.symlinkSync('/usr/bin/env', path.join(base, 'link'));
  expect(hostFileState(path.join(base, 'link'))).toBe('refused');
  expect(readHostFile(f)).toBeUndefined();
  // A root-owned regular file in a root-owned directory passes (positive control).
  expect(hostFileState('/usr/bin/env')).toBe('ok');
});

test('netns-read.list names its entries by root (scripts/lib.ts READ_ROOT_NAMES), never by absolute path', () => {
  const text = read('netns-read.list');
  for (const root of Object.values(READ_ROOTS)) expect(text).not.toContain(root);
  expect(text.split('\n').filter((l) => l.startsWith('/'))).toEqual([]);
  const entries = readListEntries();
  expect(entries.length).toBeGreaterThan(0);
  for (const [name, rel] of entries) {
    expect(READ_ROOT_NAMES as readonly string[], `${name}:${rel}`).toContain(name);
    expect(rel.startsWith('/') || rel.includes('..') || rel.includes('//') || /\s/.test(rel), `${name}:${rel}`).toBe(false);
  }
  // netns.sh resolves the roots through netns-roots.ts, and the tree spells none of this host's roots (the host file
  // does): a shipped copy names no path of this machine.
  for (const root of Object.values(READ_ROOTS)) {
    expect(read('netns.sh')).not.toContain(`${root}/`);
    expect(read('../lib.ts')).not.toContain(root);
  }
  expect(read('netns.sh')).toContain('netns-roots.ts');
});

// mutant: parseReadRoots accepts a relative, `..`, `//`, trailing-slash or `/` path, an unknown or repeated name, or a
// line with more than a name and a path → netns.sh would bind a root it never checked. Mutant: `#` cut anywhere again
// (`kit /srv/hoody#x` read as /srv/hoody, another tree), or a glob character accepted (`/srv/hoody-*` binds every match).
test('the host file names the roots: comments and blank lines pass, anything else refuses', () => {
  expect(parseReadRoots(undefined)).toEqual({});
  expect(parseReadRoots('# where the trees are\n\nkit /srv/mono/hoody-kit\napi\t/srv/mono/hoody-api  # the API\n')).toEqual({ kit: '/srv/mono/hoody-kit', api: '/srv/mono/hoody-api' });
  expect(parseReadRoots('\uFEFF# a byte-order mark, then a comment\r\n  # indented\r\ndocs /srv/mono/hoody-docs\t# tab, then a comment\r\n')).toEqual({ docs: '/srv/mono/hoody-docs' });
  for (const bad of ['kit relative/path', 'kit /', 'kit /a/', 'kit /a/../b', 'kit //a', 'kit /a b', 'Kit /a', 'other /a', 'kit /a\nkit /b', 'kit',
    'kit /srv/hoody#archive', 'kit /srv/hoody-*', 'kit /srv/hoody-?', 'kit /srv/[ab]', 'kit /srv/a\\b', 'kit /srv/$HOME', 'kit /srv/a~'])
    expect(() => parseReadRoots(bad), bad).toThrow(/read roots: refused line/);
});

// mutant: the root unquoted in netns.sh's glob again (`matches=( ${ROOT[$name]}/$rel )`) → a root's own glob characters
// expand and bind trees the host file never named; or the root's character check dropped (netns.sh is the second
// reader of netns-roots.ts's output and refuses on its own).
test('netns.sh takes each root literally: one character set, and quoted in the glob so only the list entry expands', () => {
  const sh = read('netns.sh');
  expect(sh).toContain('matches=( "${ROOT[$name]}"/$rel )');
  expect(sh).not.toContain('matches=( ${ROOT[$name]}/$rel )');
  expect(sh).toContain('case "$root" in *[!A-Za-z0-9._/-]*) refuse TERM_NETNS_ROOTS_FAILED ;; esac');
});

test('confinement needs both: the network check and the boundary root (mountinfo)', () => {
  const info = (root: string) => `22 1 0:21 / ${root} rw,relatime - tmpfs ${ROOT_TAG} rw\n23 22 0:22 / /proc rw - proc proc rw\n`;
  expect(rootIsBoundary(info('/'))).toBe(true);
  expect(rootIsBoundary(info('/x'))).toBe(false);
  expect(rootIsBoundary(`22 1 0:21 / / rw - ext4 /dev/sda1 rw\n`)).toBe(false);
  expect(rootIsBoundary(`22 1 0:21 / / rw - tmpfs other rw\n`)).toBe(false);
});

test('the heavy-IO lock comes from HUB_TERM_IO_LOCK only: set = flock on that path, unset = no lock', () => {
  const cmd = ['rsync', '-a', 'from/', 'to/'];
  expect(ioLocked(cmd, { HUB_TERM_IO_LOCK: '/locks/io.0.lock' })).toEqual(['flock', '-w', '300', '/locks/io.0.lock', ...cmd]);
  expect(ioLocked(cmd, {})).toEqual(cmd);
  expect(ioLocked(cmd, { HUB_TERM_IO_LOCK: '' })).toEqual(cmd);
  expect(ioLocked(cmd, { HUB_TERM_IO_LOCK: 'relative.lock' })).toEqual(cmd);
  // The scripts name no lock path of their own: the copy in template-proof.ts and the boundary's bind both read the variable.
  const tp = read('template-proof.ts');
  expect(tp).toContain('ioLocked(');
  for (const f of ['template-proof.ts', 'netns.sh']) expect(read(f)).not.toMatch(/heavy-io|\/var\/tmp\//);
  expect(read('netns.sh')).toContain('HUB_TERM_IO_LOCK');
});

test('inside the boundary the heavy-IO lock file is there exactly when HUB_TERM_IO_LOCK names one', () => {
  if (!confined()) return;
  const io = process.env.HUB_TERM_IO_LOCK;
  if (io && path.isAbsolute(io) && fs.existsSync(path.dirname(io))) expect(fs.statSync(io).isFile()).toBe(true);
  if (!io) expect(fs.readdirSync('/var/tmp').filter((e) => /\.lock$/.test(e))).toEqual([]);
});

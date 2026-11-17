// Shared helpers of the hub:* command scripts (run with bun from the package root, the folder with package.json).
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReportPath, searchProofReport } from '../src/app/search-proofs-run';

export const HUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const API_ROOT = path.resolve(HUB, '..');
export const BIN = path.join(API_ROOT, 'node_modules', '.bin');
/** The sibling trees whose source the test boundary shows read-only: scripts/term/netns-read.list names its entries
 *  as `<root>:<path>` with one of these names. */
export const READ_ROOT_NAMES = ['kit', 'sdk', 'docs', 'api'] as const;
/** The host's own directory for the boundary's host files (read-roots, read-list). */
export const HOST_FILES_DIR = '/etc/hoody-hub-term';
/** Where each named tree is on this machine: the host's own file, never the tree. One `<name> <absolute path>` per
 *  line; `#` at the start of a line or after a blank starts a comment. It sits under /etc, which the boundary shows
 *  read-only, so the same file is read before the boundary is built (scripts/term/netns-roots.ts, empty environment)
 *  and inside it. No env override that widens: HUB_TERM_READ_ROOTS=off (set only by netns.sh) can only drop it. */
export const READ_ROOTS_FILE = `${HOST_FILES_DIR}/read-roots`;
/** The host's own read-list entries (netns.sh HOST_LIST), same format as scripts/term/netns-read.list. */
export const READ_LIST_HOST_FILE = `${HOST_FILES_DIR}/read-list`;

/** Whether a host file of HOST_FILES_DIR may be used; the same rule as netns.sh host_file_state(). Usable = the directory and
 *  the file are each not a link, root-owned and not group- or world-writable, the file is a regular file and readable.
 *  'absent' = no directory or no file (silent); 'refused' = present but failing the rule. Root is the owner of
 *  /usr/bin/env: 0 on the host. Known limit: inside a user namespace every unmapped id (real root and any other user)
 *  shows as the same overflow id, so there the check only rules out files of the mapped user; netns.sh therefore
 *  checks both files on the host before it enters the namespace and passes its verdict in. */
export function hostFileState(file: string): 'ok' | 'absent' | 'refused' {
  let root: number;
  try { root = fs.lstatSync('/usr/bin/env').uid; } catch { return 'refused'; }
  const fit = (st: fs.Stats) => !st.isSymbolicLink() && st.uid === root && (st.mode & 0o022) === 0;
  let d: fs.Stats; let f: fs.Stats;
  try { d = fs.lstatSync(path.dirname(file)); } catch (e) { return (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'refused'; }
  if (!d.isDirectory() || !fit(d)) return 'refused';
  try { f = fs.lstatSync(file); } catch (e) { return (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'refused'; }
  if (!f.isFile() || !fit(f)) return 'refused';
  try { fs.accessSync(file, fs.constants.R_OK); } catch { return 'refused'; }
  return 'ok';
}

/** A host file's text when hostFileState() says 'ok', else undefined; a refused file prints one stderr line. */
export function readHostFile(file: string): string | undefined {
  const state = hostFileState(file);
  if (state === 'refused') process.stderr.write(`hub: ${file} not used (owner, mode or type)\n`);
  if (state !== 'ok') return undefined;
  try { return fs.readFileSync(file, 'utf8'); } catch {
    process.stderr.write(`hub: ${file} not used (unreadable)\n`);
    return undefined;
  }
}

/** The roots `text` names. A bad line (unknown or repeated name; a path that is not absolute, is `/`, ends in `/`,
 *  holds `..` or `//`, or holds any character but letters, digits and `._/-`: no blank, glob character or `#`) throws:
 *  the boundary then refuses to start (TERM_NETNS_ROOTS_FAILED). A path is taken literally, never cut short. */
export function parseReadRoots(text: string | undefined): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim().replace(/(?:^|[ \t])#.*/, '').trim();
    if (!line) continue;
    const [, name = '', root = ''] = /^([a-z]+)[ \t]+(\/[A-Za-z0-9._/-]*)$/.exec(line) ?? [];
    if (!(READ_ROOT_NAMES as readonly string[]).includes(name) || name in out || root === '/' || root.endsWith('/') || root.includes('..') || root.includes('//')) {
      throw new Error(`read roots: refused line in ${READ_ROOTS_FILE}: ${line.slice(0, 120)}`);
    }
    out[name] = root;
  }
  return Object.freeze(out);
}

/** This machine's roots. No usable file = none (a Hub checkout with no sibling source trees, or a file failing
 *  hostFileState()): netns.sh shows no sibling source and the tests that compare against it say so. */
export function readRoots(): Readonly<Record<string, string>> {
  if (process.env.HUB_TERM_READ_ROOTS === 'off') return parseReadRoots(undefined);
  return parseReadRoots(readHostFile(READ_ROOTS_FILE));
}

/** `--name value` / `--flag` parsing; positional arguments in `_`. */
export function parseArgs(argv: string[]): { _: string[]; [k: string]: string | boolean | string[] } {
  const out: { _: string[]; [k: string]: string | boolean | string[] } = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2) as [string, string | undefined];
      if (inline !== undefined) out[k] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1]?.startsWith('--')) out[k] = argv[++i] ?? '';
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** The name that keys a work dir, so parallel runs keep apart: --agent, HUB_AGENT, or 'local'. */
export function agentName(args: Record<string, unknown>): string {
  const n = str(args.agent) ?? process.env.HUB_AGENT ?? 'local';
  if (!/^[\w.-]{1,64}$/.test(n)) throw new Error(`bad agent name "${n}"`);
  return n;
}

/**
 * True when node_modules resolves outside this repo (a working copy whose node_modules links to another tree's): then
 * nothing may be written under it (that would write into the other tree), so every cache default moves to
 * hub/.term-cache (cacheBase). A real node_modules inside the repo keeps the usual defaults.
 */
export function nodeModulesOutside(root: string = API_ROOT): boolean {
  let nm: string;
  try { nm = fs.realpathSync(path.join(root, 'node_modules')); } catch { return false; }
  const r = fs.realpathSync(root);
  return nm !== r && !nm.startsWith(r + path.sep);
}
/** Where cache defaults live: <api>/node_modules/<sub>, or hub/.term-cache/<sub> when node_modules is outside the repo. */
export function cacheBase(sub: string, root: string = API_ROOT): string {
  return nodeModulesOutside(root) ? path.join(root, 'hub', '.term-cache', sub.replace(/^\./, '')) : path.join(root, 'node_modules', sub);
}

/** Per-name scratch: Vite cache, tsbuildinfo, Playwright output. */
export function workDir(agent: string): string {
  const base = process.env.HUB_WORK_DIR ?? cacheBase('.cache/hub-work');
  const d = path.join(base, agent);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Where shots go: HUB_SHOTS_DIR, else the work dir. */
export function shotsDir(agent: string): string {
  return process.env.HUB_SHOTS_DIR ?? path.join(workDir(agent), 'shots');
}

export function pageDir(id: string): string {
  return path.join(HUB, 'src', 'pages', id);
}

/** Every Playwright spec of a page: the .spec.ts files directly in its folder (the pages glob of testMatch in playwright.config.ts). */
export function pageSpecs(id: string): string[] {
  const dir = pageDir(id);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.spec.ts'))
    .sort()
    .map((f) => path.join(dir, f));
}

export function assertPage(id: string | undefined): string {
  if (!id || !/^[a-z][a-z0-9-]{0,39}$/.test(id)) throw new Error('give a page id: --page <id>');
  if (!fs.existsSync(path.join(pageDir(id), 'page.ts'))) throw new Error(`no page "${id}" (hub/src/pages/${id}/page.ts)`);
  return id;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Node flags per tool. vitest: vite, @vitest/mocker and vitest each load their own es-module-lexer, and each copy's wasm
 * memory reserves 2 GiB of address space at start. That leaves vitest's main process ~80 MB under the gates' prlimit --as cap,
 * and a run with many transforms (app/conformance.test.ts) aborts with bad_alloc. 4096 pages caps every wasm
 * memory in vitest's main process at 256 MiB (forked test workers keep the default). The lexer takes about 4 bytes per UTF-16
 * unit of the module it reads, so a single module of ~64M units would no longer fit; the largest hub source is ~0.45 MB.
 * NODE_OPTIONS refuses this V8 flag, so it goes on the node command line, here and in package.json hub:vitest.
 */
const NODE_FLAGS: Record<string, string[]> = { vitest: ['--wasm-max-mem-pages=4096'], 'vitest-hub': ['--wasm-max-mem-pages=4096'] };

/** Node runs the JS tools (vite, vitest, playwright, eslint): they target Node. */
export function nodeTool(script: string, args: string[], env: Record<string, string> = {}, opts: { quiet?: boolean; node?: string[] } = {}): ChildProcess {
  return spawn('node', [...(opts.node ?? []), script, ...viteArgs(script, args)], {
    cwd: API_ROOT,
    env: { ...process.env, ...env },
    stdio: opts.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

/**
 * vite and vitest load their config with `--configLoader runner` (in process): the default bundles the config into
 * node_modules/.vite-temp, a write into whatever tree node_modules is. Added after the subcommand unless given.
 */
export function viteArgs(script: string, args: readonly string[]): string[] {
  const vite = /[\\/]vite[\\/]bin[\\/]vite\.js$|[\\/]vitest[\\/]vitest\.mjs$/.test(script) || (!!process.env.HUB_VITEST_RUNNER && script === process.env.HUB_VITEST_RUNNER);
  if (!vite || args.some((a) => a === '--configLoader' || a.startsWith('--configLoader='))) return [...args];
  const sub = args.length && !args[0]!.startsWith('-') ? 1 : 0;
  return [...args.slice(0, sub), '--configLoader', 'runner', ...args.slice(sub)];
}

export function tool(name: string): string {
  const map: Record<string, string> = {
    vite: path.join(API_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    vitest: path.join(API_ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
    // The Hub suite's vitest (hub:check's anatomy and vitest steps): HUB_VITEST_RUNNER names a Node script that takes vitest's
    // `run` command line to use instead (a caller may point it at a result cache); unset, it is vitest itself.
    'vitest-hub': process.env.HUB_VITEST_RUNNER || path.join(API_ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
    tsc: path.join(API_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
    eslint: path.join(API_ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js'),
    stylelint: path.join(API_ROOT, 'node_modules', 'stylelint', 'bin', 'stylelint.mjs'),
    playwright: path.join(API_ROOT, 'node_modules', '@playwright', 'test', 'cli.js'),
  };
  const p = map[name];
  if (!p || !fs.existsSync(p)) throw new Error(`tool ${name} not installed (${p ?? '?'})`);
  return p;
}

export function waitExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => child.on('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1))));
}

export async function runTool(name: string, args: string[], env: Record<string, string> = {}): Promise<number> {
  return waitExit(nodeTool(tool(name), args, env, { node: NODE_FLAGS[name] }));
}

/** The worker count runPlaywright gives Playwright unless the caller names one (host load: several runs may drive browsers on the same machine at once). */
export const PW_WORKERS = 2;
/**
 * The argv runPlaywright passes on: `--workers PW_WORKERS` right after the subcommand (`args[0]`, e.g. 'test'), then the caller's
 * args untouched. Playwright's option parser keeps the last value of a non-variadic option, so a worker option of the caller's in any
 * form (`-j1`, `-j 1`, `--workers=1`, `--workers 01`) overrides this one; placed first, it is never the value of a caller's option and
 * never after a `--`. Nothing is parsed. PW_WORKERS is a default, not a cap: a caller may ask for more, and the hub:* scripts never do.
 */
export function playwrightArgv(args: readonly string[]): string[] {
  const [cmd, ...rest] = args;
  return cmd === undefined ? ['--workers', String(PW_WORKERS)] : [cmd, '--workers', String(PW_WORKERS), ...rest];
}

/**
 * Playwright through one of six shared browser slots (host load: several runs may drive browsers on the
 * same machine at once); PW_WORKERS workers unless the caller names its own (playwrightArgv). This gate keeps
 * parallel runs from overloading the machine: it takes the first free slot,
 * and only when all six are held waits up to 10 min on one, then runs anyway.
 */
export const PW_SLOTS = 6;
export async function runPlaywright(args: string[], env: Record<string, string> = {}, opts: { signal?: AbortSignal } = {}): Promise<number> {
  const dir = process.env.HUB_WORK_DIR ?? cacheBase('.cache/hub-work');
  fs.mkdirSync(dir, { recursive: true });
  return runSlotted(path.join(dir, '.pw'), [tool('playwright'), ...playwrightArgv(args)], { ...process.env, ...env }, opts.signal);
}

/** How long an aborted slotted run gets to end after SIGTERM before what is left of it gets SIGKILL. */
export const SLOTTED_KILL_AFTER_MS = 10_000;
/** How long after that SIGKILL an aborted run is waited for before the caller is told what still runs. */
export const SLOTTED_GIVE_UP_MS = 5_000;
/** The environment mark of one aborted-capable slotted run: every process it starts inherits it, whatever its group. */
export const SLOT_RUN_ENV = 'HUB_SLOT_RUN';

/**
 * Whether live process `pid` has the variable `HUB_SLOT_RUN=<token>` in its environment: one whole NUL-separated entry,
 * so `OTHER=HUB_SLOT_RUN=<token>` is no match. False when it is gone, a zombie or unreadable.
 */
function holdsSlotRun(pid: number, token: string): boolean {
  try {
    return fs.readFileSync(`/proc/${pid}/environ`, 'latin1').split('\0').includes(`${SLOT_RUN_ENV}=${token}`);
  } catch {
    return false;
  }
}

/**
 * The live processes (never this one) whose environment holds `HUB_SLOT_RUN=<token>`: everything one slotted run
 * started, in any process group (Playwright puts its browsers in groups of their own). Zombies read as empty.
 */
export function slotRunPids(token: string): number[] {
  const out: number[] = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    if (holdsSlotRun(Number(d), token)) out.push(Number(d));
  }
  return out;
}

/**
 * The signaller (python3 -I): for each pid it opens a pidfd first, then reads that pid's environ, and signals the pidfd
 * only when the token is a whole entry there. A pidfd names one process for its whole life: if that process exited and
 * its pid now names another one, the signal fails with ESRCH and reaches nobody. So a reused pid is never signalled,
 * wherever the reuse falls. Node has no pidfd API. argv: token, signal number, pid to skip.
 * Exit 0 only when every pidfd call worked or failed for a process that had gone (ESRCH); before the scan it opens and
 * signals (signal 0) a pidfd of its own, so a kernel or policy that rejects pidfd exits 3, any other error 4: the caller
 * then signals by pid, never trusting a pass that did nothing.
 */
export const PIDFD_SIGNALLER = [
  'import os, signal, sys',
  "mark = b'" + SLOT_RUN_ENV + "=' + sys.argv[1].encode()",
  'sig, skip = int(sys.argv[2]), {os.getpid(), int(sys.argv[3])}',
  'try:',
  '    me = os.pidfd_open(os.getpid())',
  '    signal.pidfd_send_signal(me, 0)',
  '    os.close(me)',
  'except (OSError, AttributeError) as e:',
  '    print(f"pidfd unavailable: {e}", file=sys.stderr)',
  '    sys.exit(3)',
  'bad = 0',
  'for d in os.listdir("/proc"):',
  '    if not d.isdigit() or int(d) in skip: continue',
  '    try: fd = os.pidfd_open(int(d))',
  '    except ProcessLookupError: continue',
  '    except OSError as e:',
  '        bad += 1; print(f"pidfd_open {d}: {e}", file=sys.stderr); continue',
  '    try:',
  '        try:',
  '            with open(f"/proc/{d}/environ", "rb") as f: held = mark in f.read().split(b"\\0")',
  '        except OSError: held = False',
  '        if held: signal.pidfd_send_signal(fd, sig)',
  '    except ProcessLookupError: pass',
  '    except OSError as e:',
  '        bad += 1; print(f"pidfd_send_signal {d}: {e}", file=sys.stderr)',
  '    finally: os.close(fd)',
  'sys.exit(4 if bad else 0)',
].join('\n');

/** How long one signaller pass may take before it gets SIGKILL and the pass is signalled by pid instead. */
export const PIDFD_SIGNALLER_DEADLINE_MS = 3_000;

let pidfdBroken = false;

/** One signaller pass: its exit status, or why it did not finish. Never waits past the deadline plus 1 s. */
function runSignaller(token: string, sig: NodeJS.Signals): Promise<{ ok: boolean; why: string }> {
  return new Promise((resolve) => {
    let err = '';
    let done = false;
    // Every way out lets go of the helper: its stderr pipe (a descendant may still hold the other end), its listeners
    // and its handle (unref, always: an 'error' such as a failed kill can come while it still runs), so nothing of it
    // keeps this process alive.
    const finish = (ok: boolean, why: string) => {
      if (done) return;
      done = true;
      clearTimeout(kill);
      clearTimeout(give);
      py.stderr?.destroy();
      py.removeAllListeners();
      py.on('error', () => {});
      py.unref();
      resolve({ ok, why });
    };
    const py = spawn('python3', ['-I', '-c', PIDFD_SIGNALLER, token, String(os.constants.signals[sig]), String(process.pid)], { stdio: ['ignore', 'ignore', 'pipe'] });
    py.stderr?.on('data', (b: Buffer) => {
      if (err.length < 4096) err += b.toString();
    });
    py.on('error', (e) => finish(false, e.message));
    py.on('exit', (code, signal) => finish(code === 0, code === 0 ? '' : (err.trim().split('\n').pop() ?? '') || (signal ? `killed by ${signal}` : `exit ${code}`)));
    // A stuck helper gets SIGKILL at the deadline; one that still has not exited a second later is left behind.
    const kill = setTimeout(() => {
      try {
        py.kill('SIGKILL');
      } catch (e) {
        // kill() can throw (EINVAL, ENOSYS): the pass fails here, never the caller.
        finish(false, `SIGKILL failed: ${(e as Error).message}`);
      }
    }, PIDFD_SIGNALLER_DEADLINE_MS);
    const give = setTimeout(() => finish(false, `no exit ${PIDFD_SIGNALLER_DEADLINE_MS + 1000} ms after it started`), PIDFD_SIGNALLER_DEADLINE_MS + 1000);
  });
}

/**
 * Signals every holder of `token` through PIDFD_SIGNALLER. A pass that fails (python3 missing, pidfd rejected, an
 * error, or no exit by its deadline) says so once on stderr, and from then on this process signals by pid: a /proc read
 * then process.kill, where a pid freed and reused between the two calls could take the signal. Settles within
 * PIDFD_SIGNALLER_DEADLINE_MS + 1 s.
 */
async function signalSlotRun(token: string, sig: NodeJS.Signals): Promise<void> {
  if (!pidfdBroken) {
    const r = await runSignaller(token, sig);
    if (r.ok) return;
    pidfdBroken = true;
    console.error(`hub: the pidfd signaller did not work (${r.why}); signalling by pid`);
  }
  for (const p of slotRunPids(token)) {
    if (!holdsSlotRun(p, token)) continue;
    try {
      process.kill(p, sig);
    } catch {
      // Exited between the read and the signal.
    }
  }
}

/**
 * `node <argv>` through one of PW_SLOTS flock slots `<lock>.<i>.lock` (the first free one, else a 10 min wait on one,
 * then it runs anyway). fd 9 holds the flock and passes through exec into node, so the slot is held for the whole run.
 *
 * With `signal`, the run is owned by an
 * environment token, never by a process group:
 * - the child gets `HUB_SLOT_RUN=<token>`, which every process it starts inherits;
 * - an abort sends SIGTERM to each live process holding that token: the slot wait's flock, or node, its workers and
 *   the browsers it launched;
 * - from the abort on, whether or not the leader has exited (a leader that ignores SIGTERM included), the run is
 *   drained: past SLOTTED_KILL_AFTER_MS whatever still holds the token gets SIGKILL;
 * - the promise settles once the leader has exited and nothing holds the token, or, past SLOTTED_GIVE_UP_MS more,
 *   with the pids still running named on stderr (exit 130 when the leader never exited).
 *
 * Without `signal` the run is the plain one: same script, environment, group and settle.
 */
export async function runSlotted(lock: string, argv: readonly string[], env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<number> {
  if (signal?.aborted) return 130;
  const slots = Array.from({ length: PW_SLOTS }, (_, i) => i).join(' ');
  const script =
    `for i in ${slots}; do exec 9>"$0.$i.lock"; flock -n 9 && exec node "$@"; done; ` +
    `exec 9>"$0.$(($$ % ${PW_SLOTS})).lock"; flock -w 600 9 || echo "hub: browser slot wait (10 min) ran out; running anyway" >&2; exec node "$@"`;
  if (!signal) return waitExit(spawn('sh', ['-c', script, lock, ...argv], { cwd: API_ROOT, env, stdio: 'inherit' }));
  const token = globalThis.crypto.randomUUID();
  const child = spawn('sh', ['-c', script, lock, ...argv], { cwd: API_ROOT, env: { ...env, [SLOT_RUN_ENV]: token }, stdio: 'inherit' });
  let code: number | undefined;
  const exited = waitExit(child).then((c) => {
    code = c;
  });
  let abortedAt = 0;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<void>((resolve) => {
    onAbort = resolve;
  });
  const stop = () => {
    abortedAt = Date.now();
    void signalSlotRun(token, 'SIGTERM');
    onAbort?.();
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    await Promise.race([exited, aborted]);
    if (!abortedAt) return code as number;
    for (;;) {
      const left = slotRunPids(token);
      if (left.length === 0 && code !== undefined) return code;
      const waited = Date.now() - abortedAt;
      if (waited > SLOTTED_KILL_AFTER_MS + SLOTTED_GIVE_UP_MS) {
        console.error(`hub: an aborted Playwright run still has ${left.join(', ') || 'its leader unreaped'} after SIGKILL`);
        return code ?? 130;
      }
      // Bounded (PIDFD_SIGNALLER_DEADLINE_MS + 1 s), so the give-up check above always comes round again.
      if (waited > SLOTTED_KILL_AFTER_MS) await signalSlotRun(token, 'SIGKILL');
      await new Promise((r) => setTimeout(r, 200));
    }
  } finally {
    signal.removeEventListener('abort', stop);
  }
}

/** Where a Playwright run writes its JSON report (playwright.config.ts reads HUB_PW_REPORT): beside its output dir, a
 *  file of its own per call, so an overlapping run of the same agent never answers for this one. */
export const playwrightReport = (outDir: string) => runReportPath(outDir);

/**
 * The search-proof inventory against the report a Playwright run just wrote (app/search-proofs-run.ts):
 * every row in scope must have run, passed and completed its helpers. A missing or unreadable report is red, never
 * "nothing to check". `files`: the run's spec paths (absolute or hub-relative; null = every spec); `grep`: its --grep.
 * Prints the problems and returns 0 or 1.
 */
export function searchProofGate(report: string, files: readonly string[] | null, grep?: RegExp, fileMap?: Readonly<Record<string, string>>): number {
  const scope = { files: files && files.map((f) => (path.isAbsolute(f) ? path.relative(HUB, f) : f)), grep, fileMap };
  const { problems, checked, skipped } = searchProofReport(() => fs.readFileSync(report, 'utf8'), report, scope);
  for (const b of problems) console.error(`hub: search proofs: ${b}`);
  console.log(`hub: search proofs: ${checked} rows checked, ${skipped} out of this run's scope (not run here, not required), ${problems.length} problems`);
  return problems.length === 0 ? 0 : 1;
}

/** Like runTool, but returns stdout + stderr instead of printing them. */
export async function runToolCapture(name: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number; output: string }> {
  const child = nodeTool(tool(name), args, env, { quiet: true, node: NODE_FLAGS[name] });
  let output = '';
  child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  const code = await waitExit(child);
  return { code, output };
}

/**
 * The owning area of a hub/src path, for messages that say whom to ask: a page, a kit or app
 * area, else the maintainers.
 */
export function ownerOf(rel: string): string {
  const p = rel.replace(/\\/g, '/').replace(/^.*?hub\/src\//, '');
  const page = /^pages\/([^/]+)\//.exec(p)?.[1];
  if (page) return `the ${page} page (src/pages/${page})`;
  if (/^kit\/data\/(DataTable|FilterChips)|^kit\/layouts\/ListDetailPage/.test(p)) return 'kit tables';
  if (/^kit\/overlays\//.test(p)) return 'kit overlays';
  if (/^kit\/forms\/|^kit\/outcome\.ts/.test(p)) return 'kit forms';
  if (/^kit\/(controls|states|qr|widgets)\/|^kit\/data\/(Ids|Display)/.test(p)) return 'kit controls';
  if (/^app\/conformance\.test\.ts/.test(p)) return 'app conformance';
  if (/^(kit|app)\//.test(p)) return 'kit and app';
  if (/^shell\//.test(p)) return 'web shell';
  if (/^core\//.test(p)) return 'core';
  return 'the maintainers';
}

export interface DevServer {
  url: string;
  port: number;
  pid: number | undefined;
  stop: () => Promise<void>;
}

/** Start a fixtures-mode Vite dev server; resolves once it answers. */
export async function startDevServer(opts: { page?: string; agent: string; port?: number; quiet?: boolean }): Promise<DevServer> {
  const port = opts.port ?? (await freePort());
  const env: Record<string, string> = {
    HUB_PAGE: opts.page ?? '',
    HUB_CACHE_DIR: path.join(workDir(opts.agent), 'vite'),
  };
  const child = nodeTool(tool('vite'), ['--config', path.join(HUB, 'vite.config.mts'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], env, {
    quiet: opts.quiet ?? true,
  });
  let output = '';
  child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`vite exited early:\n${output}`);
    try {
      const r = await fetch(`${url}/`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      child.kill('SIGTERM');
      throw new Error(`vite did not start in 60 s:\n${output}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return {
    url,
    port,
    pid: child.pid,
    stop: async () => {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await Promise.race([waitExit(child), new Promise((r) => setTimeout(r, 5000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    },
  };
}

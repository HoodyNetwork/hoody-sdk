// net-policy.mjs: THE allow/deny rules of the terminal fences, one module for every guard:
//   - scripts/term/test-net-guard.ts       Bun: term tests (preload) and gate runners (net-guard-runner.ts, BUN_OPTIONS)
//   - scripts/term/net-guard-node.mjs      Node: vitest and any node a runner starts (NODE_OPTIONS=--import)
// Plain JavaScript so Node loads it without a transpiler; no I/O at import.
//
// Rules:
//   1. A connect is allowed only to a NUMERIC loopback address (127.0.0.1, ::1, ::ffff:127.0.0.1) and a port of a
//      listener THIS process opened and still holds, of a family that listener actually answers. Never a name: the
//      fence asks no DNS, and `localhost` is refused because it may mean either family (resolution order is the
//      resolver's, not ours); every other name is refused anyway.
//   2. A listener is bound to a numeric address: a listen with no host or with `localhost` is pinned to 127.0.0.1
//      (the fence chooses, so ownership is exact). Its families: 127.0.0.1 / 0.0.0.0 answer IPv4 only; ::1 answers
//      IPv6 only; :: answers IPv6, and IPv4 only when the socket is dual-stack (no ipv6Only flag and the host's
//      net.ipv6.bindv6only is 0).
//   3. Runner mode (gate runners, not tests) may start children, but only Bun or Node (directly, through `nice`, or
//      through `flock`/`bash` running a script of the hub's scripts/term), and every child gets the guard in its
//      environment (guardEnv), so the fence follows the process tree. Test mode starts no child at all.

export const V4 = '127.0.0.1';
export const V6 = '::1';

/** Lower-case, brackets and a trailing dot gone. */
export function normHost(h) {
  return String(h ?? '').trim().toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '');
}

/** 4 or 6 for a numeric loopback literal the fence allows; 'ambiguous' for a loopback NAME; null for anything else. */
export function targetFamily(host) {
  const h = normHost(host);
  if (h === V4 || h === '::ffff:127.0.0.1' || h === '::ffff:7f00:1') return 4;
  if (h === V6 || h === '0:0:0:0:0:0:0:1') return 6;
  if (h === 'localhost' || h.endsWith('.localhost') || h === 'ip6-localhost' || h === 'ip6-loopback') return 'ambiguous';
  return null;
}

/** The address a listen is bound to: no host or a loopback name becomes 127.0.0.1 (rule 2); a literal stays. */
export function pinListenHost(host) {
  const h = normHost(host);
  if (h === '' || targetFamily(h) === 'ambiguous') return V4;
  return h;
}

/** A listener record: its address, port and the families it answers. `bindv6only` is the host's sysctl (0 or 1). */
export function listenerOf(address, port, opts = {}) {
  const a = normHost(address);
  const p = Number(port);
  if (!Number.isInteger(p) || p <= 0) return null;
  let v4 = false;
  let v6 = false;
  if (a === V4 || a === '0.0.0.0' || a === '::ffff:127.0.0.1') v4 = true;
  else if (a === V6) v6 = true;
  else if (a === '::') { v6 = true; v4 = !opts.ipv6Only && Number(opts.bindv6only ?? 0) === 0; }
  else return null; // bound elsewhere (a non-loopback address): reachable by no allowed target
  return { address: a, port: p, v4, v6 };
}

/** { ok: true } or { ok: false, why } for a connect to host:port given the open listeners. */
export function connectVerdict(listeners, host, port) {
  const f = targetFamily(host);
  if (f === 'ambiguous') return { ok: false, code: 'NAME', why: `"${host}" is a name (either address family); connect to 127.0.0.1 or [::1]` };
  if (f === null) return { ok: false, code: 'NOT_LOOPBACK', why: `${host ?? '?'} is not a loopback address` };
  const p = Number(port);
  for (const l of listeners) if (l.port === p && (f === 4 ? l.v4 : l.v6)) return { ok: true };
  return { ok: false, code: 'NO_LISTENER', why: `no open listener of this process answers ${f === 4 ? V4 : `[${V6}]`}:${port ?? '?'}` };
}

const base = (s) => String(s ?? '').split('/').pop();
const RUNTIME = new Set(['bun', 'node']);

/**
 * The shell scripts a runner may start (a script's arguments can name any program, so no other script
 * is accepted). `fenced`: the script installs the fence itself and starts only Node (vitest-narrow.sh). `forward`: the
 * script runs its arguments as a command (gate-slot.sh: `exec "$@"` or `exec flock … "$@"`), so they are judged as a
 * spawn of their own, recursively. netns.sh (the OS network boundary) forwards too: `netns.sh <cmd>`.
 */
export const SHELL_ENTRIES = Object.freeze({ 'vitest-narrow.sh': 'fenced', 'gate-slot.sh': 'forward', 'netns.sh': 'forward' });

// Wrapper options: only these (a flock `-c`/`--command` runs a shell string; an unknown option is refused).
const FLOCK_VALUE = new Set(['-w', '--wait', '--timeout', '-E', '--conflict-exit-code']);
const FLOCK_FLAG = new Set(['-x', '-e', '--exclusive', '-s', '--shared', '-n', '--nb', '--nonblock', '-o', '--close', '-F', '--no-fork', '-u', '--unlock', '--verbose']);
// Bun options that take a value (so the value is not read as the command); a subcommand that runs a program or a
// package script (`bun x curl`, `bun run <script>`, `bun install` lifecycle scripts) is refused: only a file, `test`,
// `build`, `run <file>` or eval code is a fenced Bun.
const BUN_VALUE = new Set(['-r', '--preload', '--require', '--import', '--cwd', '-c', '--config', '--env-file', '--timeout', '--conditions', '--tsconfig-override', '-d', '--define', '-l', '--loader', '--main-fields', '--extension-order', '--rerun-each', '--test-name-pattern', '-t', '--coverage-reporter', '--coverage-dir', '--reporter', '--reporter-outfile', '--max-concurrency', '--path-ignore-patterns', '--seed']);
const BUN_EVAL = new Set(['-e', '--eval', '-p', '--print']);
const BUN_SUB_OK = new Set(['test', 'build']);
const looksFile = (x) => x.includes('/') || /\.(m|c)?[jt]sx?$/.test(x);

/**
 * The module-loading startup options of a runtime argv or execArgv, in every spelling Node and Bun accept:
 * `-r X`, `-r=X`, compact `-rX` (`-r/path`), `--require X|=X`, `--import`, `--preload`, `--loader`,
 * `--experimental-loader`. Each: { opt, value, at, width } (width 2 when the value is the next argument).
 */
const HOOK_LONG = /^(--require|--import|--preload|--loader|--experimental-loader)(?:=(.*))?$/;
export function startHooks(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const x = String(args[i]);
    if (x === '--') break;
    let m = HOOK_LONG.exec(x);
    if (m) { out.push({ opt: m[1], value: m[2] ?? String(args[i + 1] ?? ''), at: i, width: m[2] === undefined ? 2 : 1 }); if (m[2] === undefined) i++; continue; }
    m = /^-r(?:=(.*)|(.+))?$/.exec(x);
    if (m) { const v = m[1] ?? m[2]; out.push({ opt: '-r', value: v ?? String(args[i + 1] ?? ''), at: i, width: v === undefined ? 2 : 1 }); if (v === undefined) i++; }
  }
  return out;
}
/** A startup module the terminal test harness owns: a file directly in <hub>/scripts/term/ (absolute, or relative to hub). */
export function ownHookFile(value, hub) {
  const dir = `${String(hub).replace(/\/$/, '')}/scripts/term/`;
  const v = String(value);
  const rel = v.startsWith('./') ? v.slice(2) : v;
  const name = v.startsWith('/') ? (v.startsWith(dir) ? v.slice(dir.length) : '') : (rel.startsWith('scripts/term/') ? rel.slice(13) : '');
  return /^[\w.-]+\.(m|c)?[jt]sx?$/.test(name) && !name.startsWith('.');
}

/** Why a Bun or Node argv (after the program) would start something that is not fenced Bun/Node, or null. Both rule
 *  sets apply to either runtime (a binary's file name does not say which it is); each is harmless to the other's argv.
 *  A startup module (any spelling, startHooks) must be the harness's own (ownHookFile): Node runs --require before any
 *  --import, so a foreign one would run before the guard. */
function runtimeArgsWhy(prog, args, hub) {
  // Runtime options end at the program's own file (or eval code): what follows is the program's argv, not the runtime's.
  let end = args.length;
  for (let i = 0; i < args.length; i++) {
    const x = String(args[i]);
    if (BUN_EVAL.has(x)) { end = i + 1; break; }
    if (x === '--') { end = i; break; }
    if (x.startsWith('-')) { if (BUN_VALUE.has(x)) i++; continue; }
    if (BUN_SUB_OK.has(x) || x === 'run') continue;
    end = i; break;
  }
  for (const h of startHooks(args.slice(0, end))) if (!ownHookFile(h.value, hub)) return `${base(prog)} ${h.opt} names a startup module outside the harness (it would run before the fence)`;
  // Node: `--run` starts a package.json script through a shell.
  const r = args.find((x) => x === '--run' || x.startsWith('--run='));
  if (r) return `${base(prog)} ${r} runs a package script (a shell command line)`;
  for (let i = 0; i < args.length; i++) {
    const x = args[i];
    if (BUN_EVAL.has(x)) return null;
    if (x === '--') continue;
    if (x.startsWith('-')) { if (BUN_VALUE.has(x)) i++; continue; }
    if (BUN_SUB_OK.has(x) || looksFile(x)) return null;
    if (x === 'run') {
      for (let j = i + 1; j < args.length; j++) {
        const y = args[j];
        if (BUN_EVAL.has(y)) return null;
        if (y.startsWith('-')) { if (BUN_VALUE.has(y)) j++; continue; }
        return looksFile(y) ? null : `bun run ${y} runs a package script (a shell command line)`;
      }
      return 'bun run names no file';
    }
    return `bun ${x} is not a file, test, build or eval (it can start other programs)`;
  }
  return null;
}

/**
 * Runner mode: whether `argv` (program + args) may be started. `hub` is the hub dir; `self` the runtime's execPath.
 * `exe` (the guards always pass it; net-exec.mjs exeContext): the ACTUAL executables are judged, never their names.
 * Every program on the way (nice, flock, bash/sh, the runtime) is resolved as the OS would (`exe.resolve`: a path
 * against the child's cwd, a bare name on the child's PATH; symlinks followed) and must be a trusted file: a wrapper or
 * shell in `exe.tools`, the runtime in `exe.runtimes`. A `node` of someone else's directory is not Node. A shell runs
 * only a SHELL_ENTRIES script; a forwarding one has its command judged the same way (depth-bounded).
 */
export function spawnVerdict(argv, hub, self, exe, depth = 0) {
  if (depth > 4) return { ok: false, code: 'WRAPPER_DEPTH', why: 'too many nested wrappers' };
  const a = [...argv].map(String);
  const trusted = (prog, set, what) => {
    if (!exe) return null;
    const real = exe.resolve(prog);
    if (!real) return `${prog} not found`;
    return set.has(real) ? null : `${prog} is ${real}, not a trusted ${what}`;
  };
  // nice [-n N | -N] <cmd...>, flock [options] <lock> <cmd...>: judged by the command they run (and themselves).
  while (a.length) {
    const b = base(a[0]);
    if (b === 'nice' || b === 'flock') { const bad = trusted(a[0], exe?.tools, b); if (bad) return { ok: false, code: 'UNTRUSTED_EXE', why: bad }; }
    if (b === 'nice') {
      a.shift();
      if (a[0] === '-n' || a[0] === '--adjustment') a.splice(0, 2);
      else if (/^(-\d+|-n-?\d+|--adjustment=-?\d+)$/.test(a[0] ?? '')) a.shift();
      if (a[0]?.startsWith('-')) return { ok: false, code: 'WRAPPER_OPTION', why: `nice option ${a[0]} is not accepted` };
      continue;
    }
    if (b === 'flock') {
      a.shift();
      while (a[0]?.startsWith('-')) {
        const o = a.shift();
        if (FLOCK_VALUE.has(o)) a.shift();
        else if (!FLOCK_FLAG.has(o) && !/^--(timeout|wait|conflict-exit-code)=/.test(o)) return { ok: false, code: 'WRAPPER_OPTION', why: `flock option ${o} is not accepted (-c runs a shell string)` };
      }
      a.shift();
      if (a.some((x) => x === '-c' || x === '--command' || x.startsWith('--command='))) return { ok: false, code: 'SHELL_STRING', why: 'flock -c runs a shell string' };
      continue;
    }
    break;
  }
  if (!a.length) return { ok: false, code: 'NO_COMMAND', why: 'no command' };
  const prog = a[0];
  if (base(prog) === 'bunx') return { ok: false, code: 'NOT_RUNTIME', why: 'bunx runs a package binary (any program)' };
  if (RUNTIME.has(base(prog)) || (self && prog === self)) {
    const bad = trusted(prog, exe?.runtimes, 'Bun or Node');
    if (bad) return { ok: false, code: 'UNTRUSTED_EXE', why: bad };
    const why = runtimeArgsWhy(exe?.resolve(prog) ?? prog, a.slice(1), hub);
    return why ? { ok: false, code: 'RUNTIME_ARGS', why } : { ok: true };
  }
  if (base(prog) === 'bash' || base(prog) === 'sh') {
    const bad = trusted(prog, exe?.tools, 'shell');
    if (bad) return { ok: false, code: 'UNTRUSTED_EXE', why: bad };
    // `bash -p <script>`: privileged mode (no BASH_ENV / ENV / imported functions), the form every entry script requires.
    const at = a[1] === '-p' ? 2 : 1;
    const script = a[at] ?? '';
    const dir = `${String(hub).replace(/\/$/, '')}/scripts/term/`;
    const name = script.startsWith(dir) ? script.slice(dir.length) : '';
    const kind = Object.hasOwn(SHELL_ENTRIES, name) ? SHELL_ENTRIES[name] : null;
    if (!kind) return { ok: false, code: 'SHELL_SCRIPT', why: `${base(prog)} may run only ${Object.keys(SHELL_ENTRIES).map((n) => dir + n).join(' or ')}` };
    if (kind === 'fenced') return { ok: true };
    // netns.sh --fresh <cmd>: a new boundary, the command judged the same way; --confined runs nothing.
    let rest = a.slice(at + 1);
    if (name === 'netns.sh' && rest[0] === '--confined' && rest.length === 1) return { ok: true };
    if (name === 'netns.sh' && rest[0] === '--fresh') rest = rest.slice(1);
    const inner = spawnVerdict(rest, hub, self, exe, depth + 1);
    return inner.ok ? inner : { ok: false, code: inner.code, why: `${name} forwards a refused command: ${inner.why}` };
  }
  return { ok: false, code: 'NOT_RUNTIME', why: `${base(prog)} is not Bun or Node (a child outside the fence)` };
}

/**
 * Spawn options the fence refuses whatever the program:
 *   - a shell (its command line cannot be judged);
 *   - any descriptor beyond stdio: a child gets fds 0-2 only ('pipe' / 'inherit' / 'ignore' / null, or the number of
 *     its own slot), never a further slot, an fd number, a stream or socket object (an open socket would let it skip
 *     every connect check). Stdin may also be data (a string or bytes). Node `fork`'s 'ipc' channel is to the parent;
 *   - runtime startup hooks in execArgv (fork, Bun Worker): --require / --import / --preload / --loader / --inspect /
 *     --env-file and the like (--conditions / -C only steer module resolution: vitest passes them to its forks).
 */
const STD = new Set(['pipe', 'inherit', 'ignore', 'overlapped']);
const START_HOOK = /^(-r.*|--require|--import|--preload|--loader|--experimental-loader|--experimental-specifier-resolution|--inspect.*|--debug.*|--env-file.*|--eval|-e|--print|-p|--watch.*|--experimental-policy|--policy-integrity)(=.*)?$/;
const stdOk = (x, i, ipc) => x === undefined || x === null || STD.has(x) || x === i || (ipc && x === 'ipc')
  || (i === 0 && (typeof x === 'string' ? !STD.has(x) && x !== 'ipc' && !/^\d+$/.test(x) : ArrayBuffer.isView(x)));
export function spawnOptionsVerdict(opts, o = {}) {
  if (!opts || typeof opts !== 'object') return { ok: true };
  if (opts.shell !== undefined && opts.shell !== false) return { ok: false, code: 'SHELL_OPTION', why: `shell: ${JSON.stringify(opts.shell)} (a shell command line cannot be judged)` };
  const ipc = o.fork === true;
  if (opts.stdio !== undefined && opts.stdio !== null) {
    if (typeof opts.stdio === 'string') { if (!STD.has(opts.stdio)) return { ok: false, code: 'STDIO_FD', why: 'stdio: not pipe/inherit/ignore' }; }
    else if (!Array.isArray(opts.stdio)) return { ok: false, code: 'STDIO_FD', why: 'stdio: not an array' };
    else {
      const extra = opts.stdio.slice(3).filter((x) => !(ipc && x === 'ipc'));
      if (extra.length) return { ok: false, code: 'STDIO_FD', why: 'stdio: a descriptor beyond 0-2' };
      for (let i = 0; i < Math.min(3, opts.stdio.length); i++) if (!stdOk(opts.stdio[i], i, false)) return { ok: false, code: 'STDIO_FD', why: `stdio[${i}]: not a plain stdio slot` };
    }
  }
  for (const [k, i] of [['stdin', 0], ['stdout', 1], ['stderr', 2]]) if (k in opts && !stdOk(opts[k], i, false)) return { ok: false, code: 'STDIO_FD', why: `${k}: not a plain stdio slot` };
  const v = opts.execArgv;
  if (v !== undefined) {
    if (!Array.isArray(v)) return { ok: false, code: 'EXEC_ARGV', why: 'execArgv: not an array' };
    // `o.requireOk`: exact files a fork may --require (the guards pass vitest's own suppress-warnings.cjs, by real path).
    const okFiles = o.requireOk ?? [];
    for (let i = 0; i < v.length; i++) {
      const x = String(v[i]);
      if (!START_HOOK.test(x)) continue;
      // Only a --require of an exact allowed file, in any spelling (startHooks: -r X, -r=X, -rX, --require X|=X).
      const h = startHooks(v.slice(i))[0];
      if (h && h.at === 0 && (h.opt === '-r' || h.opt === '--require') && okFiles.includes(h.value)) { i += h.width - 1; continue; }
      return { ok: false, code: 'EXEC_ARGV', why: 'execArgv: a runtime startup hook' };
    }
  }
  return { ok: true };
}

/**
 * UDP off: the factory, the public constructor and every network method of the socket prototype refuse.
 * `deny(code, what)` throws. The refusing constructor keeps the real prototype (instanceof still holds); `close`,
 * `ref` and `unref` stay (they send nothing). The guards call syncBuiltinESMExports() after, so a named
 * `import { Socket } from 'node:dgram'` gets the refusing one too.
 */
export function fenceDgram(dgram, deny) {
  const Real = dgram.Socket;
  Object.defineProperty(dgram, 'createSocket', { configurable: true, writable: true, value: () => deny('TERM_NET_DENIED', 'dgram.createSocket') });
  if (typeof Real !== 'function') return;
  const KEEP = new Set(['constructor', 'close', 'ref', 'unref']);
  const proto = Real.prototype;
  for (const k of Object.getOwnPropertyNames(proto)) {
    if (KEEP.has(k)) continue;
    const d = Object.getOwnPropertyDescriptor(proto, k);
    if (d && typeof d.value === 'function') Object.defineProperty(proto, k, { configurable: true, writable: true, value: () => deny('TERM_NET_DENIED', `dgram.Socket.${k}`) });
  }
  function Socket() { return deny('TERM_NET_DENIED', 'new dgram.Socket'); }
  Socket.prototype = proto;
  Object.defineProperty(dgram, 'Socket', { configurable: true, writable: true, value: Socket });
}

// ── Test-process environment (isolation, separate from network containment) ──────────────────────────────────────
// A test process (Bun's test fence, test-net-guard.ts; Node/vitest's, node-test-env.mjs) keeps only NAMED variables,
// each with a value shape. A value that
// does not fit its shape, or that looks like a credential, is dropped too. HOME_KEYS point into one fresh empty
// directory per run.
const SELF_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/\/$/, '');
const FLAG = /^(|0|1|2|3|true|false|yes|no|on|off)$/i;
const INT = /^\d{1,9}$/;
const WORD = /^[\w.,:@+=-]{0,128}$/;
const absPath = (v) => /^\/[\w./@+,=~-]{0,1023}$/.test(v) && !v.split('/').includes('..');
/** A credential-looking value (an API key prefix, or a long unbroken token run) is never kept, whatever its key. */
export const SECRETISH = /(hdy_|hbk_|sk-|sk_|ghp_|gho_|ghs_|github_pat_|xox[abpr]-|AKIA|eyJ[A-Za-z0-9_-]{8,}\.)|[A-Za-z0-9+_-]{40,}/;
const fenceOpts = (v, allowed) => String(v).split(/\s+/).filter(Boolean).every((t, i, a) => allowed.includes(t) || (t === '--import' && allowed.includes(`--import ${a[i + 1]}`)) || (a[i - 1] === '--import' && allowed.includes(`--import ${t}`)));
/** key -> value check. */
export const ENV_RULES = Object.freeze({
  PATH: (v) => v.split(':').every((p) => p === '' || absPath(p)),
  NODE_ENV: (v) => v === 'test', TZ: (v) => WORD.test(v), LANG: (v) => WORD.test(v), LC_ALL: (v) => WORD.test(v), TERM: (v) => WORD.test(v),
  FORCE_COLOR: (v) => FLAG.test(v), NO_COLOR: (v) => FLAG.test(v), CI: (v) => FLAG.test(v), TMPDIR: absPath,
  // The test tooling's own knobs (settings, never credentials), the same as the gate children's (child-env.ts).
  UPDATE_GOLDEN: (v) => FLAG.test(v), SECRETS_PAGE_TIMEOUT_MS: (v) => INT.test(v),
  // secrets.ts case filter: a regex over case names (`^many\+env-create$`); characters a case name or a regex uses, bounded.
  SECRETS_CASES: (v) => /^[\w^$.*+?|()[\]{},:=\\-]{1,256}$/.test(v), GRAPH_FIXTURES_DIR: absPath,
  TERM_SETTLE_STILL: (v) => INT.test(v), TERM_HOLD_LONG: (v) => INT.test(v), TERM_CHILD_GRACE_MS: (v) => INT.test(v),
  TERM_IDLE_DEBUG: (v) => FLAG.test(v), TERM_IDLE_FILE: absPath, TERM_CACHE: absPath, TERM_COLOUR: (v) => WORD.test(v),
  HUB_CACHE_DIR: absPath, HUB_TERM_CACHE: absPath, HUB_TRANSFORM_CACHE: (v) => FLAG.test(v), HUB_WORK_DIR: absPath, HUB_GATE_SLOTS: absPath, HUB_GATE_SLOT_HELD: (v) => v === '1', HUB_TERM_IO_LOCK: absPath,
  HUB_NET_FENCE: (v) => v === 'runner' || v === 'test', HUB_SCENARIO: (v) => /^[\w.,/@+=-]{0,512}$/.test(v),
  HUB_PAGE: (v) => WORD.test(v), HUB_CHECK_PAGE: (v) => WORD.test(v), HUB_SDK_ROOT: absPath, HUB_SDK_DRIFT: (v) => FLAG.test(v),
  HUB_OPS_REGEN: (v) => FLAG.test(v), HUB_API_CATALOG_REGEN: (v) => FLAG.test(v), HUB_STORAGE_REGEN: (v) => FLAG.test(v),
  HUB_VOICE_CODES_REGEN: (v) => FLAG.test(v), HUB_API_SYNC: (v) => FLAG.test(v), HUB_BOARD_SYNC: (v) => FLAG.test(v),
  HUB_BENCH: (v) => FLAG.test(v), HUB_PERF: (v) => FLAG.test(v), HUB_PERF_RUNS: (v) => INT.test(v), HUB_PERF_CPU: (v) => INT.test(v),
  HUB_FX_OUT: absPath, HUB_SCENARIO_OUT: absPath, HUB_ANATOMY_DONE: (v) => FLAG.test(v),
  HUB_AGENT_SRC: absPath, HUB_AGENT_SPEC: absPath, HUB_API_DOCS: absPath, HUB_API_SDK: absPath, HUB_BOARD_KITS: absPath,
  HUB_BOARD_SDK: absPath, HUB_BOT_SDK: absPath, HUB_FILES_OPENAPI: absPath, HUB_FILES_REGISTRY: absPath,
  HUB_FILES_VALIDATION: absPath, HUB_LIMITS_KITS: absPath, HUB_RUNOPEN_SDK: absPath, HUB_RUNOPEN_RUN_MODEL: absPath,
  HUB_SHARE_API_SRC: absPath,
  // An overlay of changed copies for before/after proofs (scripts/term/overlay-preload.ts): checked paths, read by that preload only.
  OVERLAY_DIR: absPath, OVERLAY_SRC: absPath,
  // The fence's own options: exactly this directory's guard files, nothing else (so every child of a test process stays
  // fenced and no caller preload rides along).
  NODE_OPTIONS: (v) => fenceOpts(v, [`--import ${SELF_DIR}/net-guard-node.mjs`, `--import ${SELF_DIR}/node-test-env.mjs`]),
  BUN_OPTIONS: (v) => fenceOpts(v, [`--preload=${SELF_DIR}/net-guard-runner.ts`]),
});
/** The named keys a test process keeps (values checked by ENV_RULES). */
export const ENV_KEEP = Object.freeze(Object.keys(ENV_RULES));
/** Whether a test process keeps this variable with this value. */
export const envKept = (k, v) => Object.hasOwn(ENV_RULES, k) && typeof v === 'string' && v.length <= 4096
  && (k === 'PATH' || k === 'NODE_OPTIONS' || k === 'BUN_OPTIONS' || !SECRETISH.test(v)) && ENV_RULES[k](v);
const SHORT = /^[\w.,:/@+=-]{0,256}$/;
/** What a Node test process keeps beyond ENV_RULES (node-test-env.mjs): vitest's own worker keys and two test knobs. */
export const NODE_TEST_RULES = Object.freeze({
  APPROVER_SEED: (v) => /^\d{1,12}$/.test(v), APPROVER_SEEDS: (v) => /^[\d,]{0,256}$/.test(v), RECON_DEBUG: (v) => /^(|0|1|true|false)$/i.test(v),
  HOODY_PROVIDERS_JSON: (v) => v.length <= 8192 && !SECRETISH.test(v),
  VITEST: (v) => SHORT.test(v), VITEST_MODE: (v) => SHORT.test(v), VITEST_POOL_ID: (v) => SHORT.test(v), VITEST_WORKER_ID: (v) => SHORT.test(v),
  VITEST_VM_POOL: (v) => SHORT.test(v), VITEST_AFTER_ENV_TEARDOWN: (v) => SHORT.test(v),
});
/** Runner processes and gate children also keep these (named, value-checked): the home path (the boundary shows it
 *  empty; test processes replace it), the screenshot tool switch, the colour hint and the boundary's re-run marker. */
export const RUNNER_EXTRA = Object.freeze({
  HOME: absPath, TERMSHOT: (v) => /^[\w.,/@+=-]{0,256}$/.test(v), COLORTERM: (v) => WORD.test(v), HUB_NETNS_REEXEC: (v) => v === '1',
});
/** Whether a runner process or a gate child keeps this variable with this value. */
export const runnerKept = (k, v) => envKept(k, v) || (typeof v === 'string' && ((Object.hasOwn(RUNNER_EXTRA, k) && !SECRETISH.test(v) && RUNNER_EXTRA[k](v)) || (Object.hasOwn(NODE_TEST_RULES, k) && NODE_TEST_RULES[k](v))));
/** Drops every variable a runner process does not keep. */
export function scrubRunnerEnv(env) {
  for (const k of Object.keys(env)) if (!runnerKept(k, env[k])) delete env[k];
}
/** Drops every variable a test process does not keep. */
export function scrubEnv(env) {
  for (const k of Object.keys(env)) if (!envKept(k, env[k])) delete env[k];
}
/** The variables that point at the isolated home directory. */
export const HOME_KEYS = Object.freeze(['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'HOODY_CONFIG_DIR']);

/** The DNS methods the fence refuses, on the module, its promises API and every Resolver instance. */
export const DNS_METHOD = /^(lookup|lookupService|resolve|reverse)/;

/** Variables that run code at a child's startup (shell startup files and exported functions, dynamic-linker and runtime
 *  preloads, inspectors): never passed to a child. NODE_OPTIONS / BUN_OPTIONS are rebuilt by guardEnv. */
export const STARTUP_HOOK_ENV = /^(BASH_ENV|ENV|BASH_FUNC_.*|SHELLOPTS|BASHOPTS|PS4|PROMPT_COMMAND|IFS|CDPATH|GLOBIGNORE|LD_.*|DYLD_.*|GCONV_PATH|HOSTALIASES|RES_OPTIONS|LOCALDOMAIN|NODE_OPTIONS|NODE_PATH|NODE_REPL_EXTERNAL_MODULE|NODE_EXTRA_CA_CERTS|NODE_DEBUG.*|NODE_INSPECT.*|BUN_OPTIONS|BUN_CONFIG_.*|BUN_INSPECT.*|BUN_INSTALL.*|BUN_RUNTIME_TRANSPILER_CACHE_PATH|https?_proxy|HTTPS?_PROXY|ALL_PROXY|all_proxy|NO_PROXY|no_proxy)$/;

/** The environment a fenced child gets: the named, value-checked keys only (runnerKept: an allowlist, so an unnamed
 *  credential such as HOODY_TOKEN never passes), never a startup hook, plus exactly the fence's own options
 *  (the guard preload for Bun; the guard import for Node, and node-test-env.mjs when the parent carried it). */
/** @returns {Record<string, string>} */
export function guardEnv(hub, env = {}) {
  const dir = `${String(hub).replace(/\/$/, '')}/scripts/term`;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && !STARTUP_HOOK_ENV.test(k) && runnerKept(k, v)) out[k] = v;
  const testEnv = String(env.NODE_OPTIONS ?? '').includes(`--import ${dir}/node-test-env.mjs`);
  // `--preload=<file>`: the spaced form in BUN_OPTIONS breaks `bun test` (Bun reads the file as the command).
  out.BUN_OPTIONS = `--preload=${dir}/net-guard-runner.ts`;
  out.NODE_OPTIONS = `--import ${dir}/net-guard-node.mjs${testEnv ? ` --import ${dir}/node-test-env.mjs` : ''}`;
  out.HUB_NET_FENCE = env.HUB_NET_FENCE === 'test' ? 'test' : 'runner';
  return out;
}

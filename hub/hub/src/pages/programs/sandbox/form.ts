// The sandbox editor's form: block <-> form, presets and the checks the Hub mirrors from the daemon before a save.
// Only published daemon rules are mirrored (its normalizing and validation rules, openapi SandboxConfig);
// context the Hub cannot see (paths that exist, protected daemon trees, port owners, Kit ports) is the daemon's 400.
// No React, no I/O.
import { isObj, restricts, type NetMode, type PortSpec, type SandboxBlock } from './block';

export interface Form {
  readOnlyRoot: boolean;
  /** One absolute path per line. */
  writable: string;
  hidden: string;
  mode: NetMode;
  /** 'program': bind_ports omitted (the daemon uses the program's port_range / ready_port). 'list': sent as typed,
   *  even empty. */
  bindMode: 'program' | 'list';
  /** Ports separated by commas, spaces or lines: 8000 or 8000-8003. */
  bindPorts: string;
  connectPorts: string;
  ingressFrom: string;
  allowPlatform: boolean;
  rate: string;
  udpDeny: boolean;
  maxMemory: string;
  maxPids: string;
  maxOpenFiles: string;
  maxCpu: string;
  maxFileSize: string;
  tmpSize: string;
  privateTmp: boolean;
}

export const EMPTY_FORM: Form = {
  readOnlyRoot: false, writable: '', hidden: '', mode: 'full', bindMode: 'program', bindPorts: '', connectPorts: '',
  ingressFrom: '', allowPlatform: true, rate: '', udpDeny: false, maxMemory: '', maxPids: '', maxOpenFiles: '',
  maxCpu: '', maxFileSize: '', tmpSize: '', privateTmp: false,
};

const FS_KEYS = ['read_only_root', 'writable', 'hidden'];
const NET_KEYS = ['mode', 'bind_ports', 'connect_ports', 'ingress_allow_from', 'ingress_allow_platform', 'ingress_rate_limit', 'udp'];
const PROC_KEYS = ['max_memory', 'max_pids', 'max_open_files', 'max_cpu', 'max_file_size', 'tmp_size', 'private_tmp'];
const portText = (p: unknown) => String(p);

/** Fills the form from a stored block. `unsupported` names every stored field the form cannot carry exactly (a field
 *  a newer daemon added, or a value of an unexpected type): the editor then refuses to save over the block, because
 *  a whole-block replace would silently drop it and weaken the policy. */
export function fromBlock(b: SandboxBlock | null): { form: Form; unsupported: string[] } {
  const f: Form = { ...EMPTY_FORM };
  const bad: string[] = [];
  if (!b) return { form: f, unsupported: bad };
  const sub = (name: string, keys: string[], v: unknown): Record<string, unknown> => {
    if (v === undefined || v === null) return {};
    if (!isObj(v)) { bad.push(name); return {}; }
    for (const k of Object.keys(v)) if (!keys.includes(k) && v[k] !== null) bad.push(`${name}.${k}`);
    return v;
  };
  const fs = sub('filesystem', FS_KEYS, b.filesystem);
  const net = sub('network', NET_KEYS, b.network);
  const p = sub('process', PROC_KEYS, b.process);
  const bool = (name: string, v: unknown, dflt: boolean): boolean => {
    if (v === undefined || v === null) return dflt;
    if (typeof v !== 'boolean') { bad.push(name); return dflt; }
    return v;
  };
  const list = (name: string, v: unknown, sep: string, item: (x: unknown) => boolean): string => {
    if (v === undefined || v === null) return '';
    if (!Array.isArray(v) || !v.every(item)) { bad.push(name); return ''; }
    return v.map(portText).join(sep);
  };
  const str = (name: string, v: unknown): string => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') { bad.push(name); return ''; }
    return v;
  };
  const int = (name: string, v: unknown): string => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'number' || !Number.isInteger(v)) { bad.push(name); return ''; }
    return String(v);
  };
  const isStr = (x: unknown) => typeof x === 'string';
  // A stored path with outer spaces names another directory than its trimmed spelling: the form, which trims what
  // is typed, cannot carry it exactly, so it is unsupported rather than silently moved.
  const isPath = (x: unknown) => typeof x === 'string' && x === x.trim() && !x.includes('\n');
  const isPort = (x: unknown) => typeof x === 'string' || (typeof x === 'number' && Number.isInteger(x));
  f.readOnlyRoot = bool('filesystem.read_only_root', fs.read_only_root, false);
  f.writable = list('filesystem.writable', fs.writable, '\n', isPath);
  f.hidden = list('filesystem.hidden', fs.hidden, '\n', isPath);
  if (net.mode !== undefined && net.mode !== null) {
    if (net.mode === 'full' || net.mode === 'restricted' || net.mode === 'none') f.mode = net.mode;
    else bad.push('network.mode');
  }
  if (net.bind_ports !== undefined && net.bind_ports !== null) {
    f.bindMode = 'list';
    f.bindPorts = list('network.bind_ports', net.bind_ports, ', ', isPort);
  }
  f.connectPorts = list('network.connect_ports', net.connect_ports, ', ', isPort);
  f.ingressFrom = list('network.ingress_allow_from', net.ingress_allow_from, '\n', isStr);
  f.allowPlatform = bool('network.ingress_allow_platform', net.ingress_allow_platform, true);
  f.rate = str('network.ingress_rate_limit', net.ingress_rate_limit);
  if (net.udp !== undefined && net.udp !== null) {
    if (net.udp === 'deny') f.udpDeny = true;
    else if (net.udp !== 'allow') bad.push('network.udp');
  }
  f.maxMemory = str('process.max_memory', p.max_memory);
  f.maxPids = int('process.max_pids', p.max_pids);
  f.maxOpenFiles = int('process.max_open_files', p.max_open_files);
  f.maxCpu = str('process.max_cpu', p.max_cpu);
  f.maxFileSize = str('process.max_file_size', p.max_file_size);
  f.tmpSize = str('process.tmp_size', p.tmp_size);
  f.privateTmp = bool('process.private_tmp', p.private_tmp, false);
  return { form: f, unsupported: bad };
}

const splitList = (s: string): string[] => s.replace(/\s*-\s*/g, '-').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
const lines = (s: string): string[] => s.split('\n').map((x) => x.trim()).filter(Boolean);
/** A typed port item: a bare number is sent as a number, anything else (a range) as the typed string. */
const portItem = (s: string): PortSpec => (/^[0-9]+$/.test(s) ? Number(s) : s);

/** The block a save sends: the whole block (the daemon replaces it as a unit), with no nulls, no default values and
 *  no empty sub-objects. bind_ports is kept whenever the form says 'list', even empty (it means something). null
 *  when nothing is left: the caller offers Remove instead (a block that restricts nothing is never saved). */
export function toBlock(f: Form): SandboxBlock | null {
  const fs: SandboxBlock['filesystem'] = {};
  if (f.readOnlyRoot) fs.read_only_root = true;
  if (lines(f.writable).length) fs.writable = lines(f.writable);
  if (lines(f.hidden).length) fs.hidden = lines(f.hidden);
  const net: SandboxBlock['network'] = {};
  if (f.mode !== 'full') net.mode = f.mode;
  if (f.bindMode === 'list') net.bind_ports = splitList(f.bindPorts).map(portItem);
  if (splitList(f.connectPorts).length) net.connect_ports = splitList(f.connectPorts).map(portItem);
  if (splitList(f.ingressFrom).length) net.ingress_allow_from = splitList(f.ingressFrom);
  if (!f.allowPlatform) net.ingress_allow_platform = false;
  if (f.rate.trim()) net.ingress_rate_limit = f.rate.trim();
  if (f.udpDeny) net.udp = 'deny';
  const p: SandboxBlock['process'] = {};
  if (f.maxMemory.trim()) p.max_memory = f.maxMemory.trim();
  // Typed non-digits stay as typed (never sent: check() refuses them), so the form still counts as restricting
  // and dirty, and the error shows instead of the form reading as a removal.
  if (f.maxPids.trim()) p.max_pids = (/^[0-9]+$/.test(f.maxPids.trim()) ? Number(f.maxPids.trim()) : f.maxPids.trim()) as number;
  if (f.maxOpenFiles.trim()) p.max_open_files = (/^[0-9]+$/.test(f.maxOpenFiles.trim()) ? Number(f.maxOpenFiles.trim()) : f.maxOpenFiles.trim()) as number;
  if (f.maxCpu.trim()) p.max_cpu = f.maxCpu.trim();
  if (f.maxFileSize.trim()) p.max_file_size = f.maxFileSize.trim();
  if (f.tmpSize.trim()) p.tmp_size = f.tmpSize.trim();
  if (f.privateTmp) p.private_tmp = true;
  const b: SandboxBlock = {};
  if (Object.keys(fs).length) b.filesystem = fs;
  if (Object.keys(net).length) b.network = net;
  if (Object.keys(p).length) b.process = p;
  return Object.keys(b).length ? b : null;
}

// ── Program facts (from the scrubbed program read) ──────────────────────────────────────────

export type EnvReason = 'name' | 'loader' | 'reserved' | 'value';

/** What the editor needs to know about the program. Never an environment VALUE: only names with the reason the
 *  daemon refuses them for a sandboxed program. */
export interface ProgramFacts {
  enabled: boolean;
  boot: boolean;
  lazy: boolean;
  kit: boolean;
  /** user is root (the daemon refuses an effective block); null when the read did not say. */
  root: boolean | null;
  terminal: boolean;
  portRange: { start: number; end: number } | null;
  readyPort: number | null;
  directory: string | null;
  /** A display program is started by the daemon once its display is ready. */
  display: boolean;
  displayLiteral: boolean;
  env: { name: string; reason: EnvReason }[];
}

// The daemon's refused loader names and prefixes (glibc unsecvars plus GLIBC_TUNABLES).
const LOADER_EXACT = ['GCONV_PATH', 'GETCONF_DIR', 'GLIBC_TUNABLES', 'HOSTALIASES', 'LOCALDOMAIN', 'LOCPATH', 'NIS_PATH', 'NLSPATH', 'RESOLV_HOST_CONF', 'RES_OPTIONS', 'TMPDIR', 'TZDIR'];
const LOADER_PREFIX = ['LD_', 'MALLOC_'];

/** The daemon's literal-value rule: no %, no quote of either kind, no backslash, no control character
 *  (Rust char::is_control: C0, DEL and C1). */
export function literal(v: string): boolean {
  return !/[%"'\\\u0000-\u001f\u007f-\u009f]/.test(v);
}

/** Why the daemon refuses this explicit environment entry for a sandboxed program, or null.
 *  Order follows the daemon's: name grammar, loader names, reserved prefix, value. */
export function envReason(name: string, value: string): EnvReason | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'name';
  if (LOADER_EXACT.includes(name) || LOADER_PREFIX.some((p) => name.startsWith(p))) return 'loader';
  if (name.startsWith('HOODY_SANDBOX_')) return 'reserved';
  if (!literal(value)) return 'value';
  return null;
}

/** The scrub of GET /programs/{id}: reduces the program (whose environment values and webhook headers may hold
 *  secrets) to ProgramFacts. Values never leave this function. */
export function factsOf(w: unknown): ProgramFacts | null {
  const prog = isObj(w) && isObj(w.program) ? w.program : isObj(w) && 'id' in w ? w : null;
  if (!prog) return null;
  const env: ProgramFacts['env'] = [];
  if (isObj(prog.environment)) {
    for (const [k, v] of Object.entries(prog.environment)) {
      const why = envReason(k, typeof v === 'string' ? v : '');
      if (why) env.push({ name: k.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?').slice(0, 128), reason: why });
    }
  }
  const pr = isObj(prog.port_range) && Number.isInteger(prog.port_range.start) && Number.isInteger(prog.port_range.end)
    ? { start: prog.port_range.start as number, end: prog.port_range.end as number } : null;
  const display = typeof prog.display === 'string' && prog.display !== '';
  return {
    enabled: prog.enabled !== false,
    boot: prog.boot === true,
    lazy: prog.lazy_load === true,
    kit: prog.hoody_kit === true,
    root: typeof prog.user === 'string' ? prog.user === 'root' : null,
    terminal: prog.terminal_id !== undefined && prog.terminal_id !== null && prog.terminal_id !== '',
    portRange: pr,
    readyPort: Number.isInteger(prog.ready_port) ? (prog.ready_port as number) : null,
    directory: typeof prog.directory === 'string' ? prog.directory : null,
    display,
    displayLiteral: display ? literal(prog.display as string) : true,
    env,
  };
}

// ── Presets: they fill the form, they never send ────────────────────────────────────────────

export type Preset = 'noNetwork' | 'noOutgoingTcp' | 'readOnly' | 'limits';

/** Why a preset cannot apply to this program, or null. */
export function presetBlocked(p: Preset, facts: ProgramFacts | null): 'hasPorts' | null {
  if (p === 'noNetwork' && facts && (facts.portRange || facts.readyPort !== null)) return 'hasPorts';
  return null;
}

/** Applies a preset on top of the form. "No outgoing TCP connections" leaves bind_ports to the program's own ports
 *  when it declares any; otherwise it switches to an explicit list the person fills (the daemon refuses restricted
 *  with no listening ports). */
export function applyPreset(f: Form, p: Preset, facts: ProgramFacts | null): Form {
  if (p === 'noNetwork') return { ...f, mode: 'none', bindMode: 'program', bindPorts: '', connectPorts: '', ingressFrom: '', rate: '' };
  if (p === 'noOutgoingTcp') {
    const declared = !!facts && (!!facts.portRange || facts.readyPort !== null);
    return { ...f, mode: 'restricted', connectPorts: '', bindMode: declared ? 'program' : 'list' };
  }
  if (p === 'readOnly') return { ...f, readOnlyRoot: true };
  return { ...f, maxMemory: f.maxMemory || '512M', maxPids: f.maxPids || '256', privateTmp: true };
}

// ── Checks (mirrors only) ───────────────────────────────────────────────────────────────────

export type Field = keyof Form | 'program';
export interface Problem {
  field: Field;
  /** A strings key under 'sb.err.' */
  code: string;
  vars?: Record<string, string | number>;
}

const SIZE = /^[0-9]+[KMG]?$/;
const K = 1024;
function sizeBytes(s: string): number | null {
  if (!SIZE.test(s)) return null;
  const m = s.endsWith('K') ? K : s.endsWith('M') ? K * K : s.endsWith('G') ? K * K * K : 1;
  const n = Number(m === 1 ? s : s.slice(0, -1));
  return Number.isSafeInteger(n * m) ? n * m : Number.POSITIVE_INFINITY;
}
const CIDR = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\/(3[0-2]|[12]?[0-9])$/;

/** Parses typed ports into ranges; the bad item when one does not parse (the daemon's rule: 1-65535, a<=b). */
function ports(text: string): { ranges: [number, number][]; bad: string | null } {
  const out: [number, number][] = [];
  for (const it of splitList(text)) {
    const m = /^([0-9]{1,5})(?:-([0-9]{1,5}))?$/.exec(it);
    const a = m ? Number(m[1]) : NaN;
    const b = m ? Number(m[2] ?? m[1]) : NaN;
    if (!m || a < 1 || b < 1 || a > 65535 || b > 65535 || a > b) return { ranges: out, bad: it };
    out.push([a, b]);
  }
  return { ranges: out, bad: null };
}
const covers = (rs: [number, number][], a: number, b: number) => {
  // Does the union of rs cover every port a..b?
  let need = a;
  for (const [x, y] of [...rs].sort((p, q) => p[0] - q[0])) {
    if (x > need) break;
    if (y >= need) need = y + 1;
    if (need > b) return true;
  }
  return need > b;
};

// Compared as the daemon compares (by components, `.` dropped); the typed spelling is what is sent.
const norm = (p: string) => { const q = ('/' + p.split('/').filter((c) => c !== '' && c !== '.').join('/')); return p.startsWith('/') ? q : q.slice(1); };
/** a is b or under it (Path::starts_with, by components). */
const under = (a: string, b: string) => a === b || a.startsWith(b === '/' ? '/' : b + '/');
const overlaps = (a: string, b: string) => a === b || a.startsWith(b === '/' ? '/' : b + '/') || b.startsWith(a === '/' ? '/' : a + '/');
// The daemon's list of paths that may not be hidden and the fixed part of its protected roots (the daemon's own trees are its 400).
const HIDDEN_FORBIDDEN = ['/proc', '/sys', '/dev', '/run', '/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/lib32', '/libx32', '/hoody', '/hoody/storage'];
const WRITABLE_PROTECTED = ['/run', '/var/run', '/etc', '/hoody/plugins', '/proc', '/sys', '/dev', '/boot'];

function pathProblem(raw: string): string | null {
  if (!raw.startsWith('/')) return 'pathAbsolute';
  // The daemon drops `.` components and refuses `..`.
  if (raw.split('/').some((s) => s === '..')) return 'pathTraversal';
  if (/[\u0000-\u001f\u007f]/.test(raw)) return 'pathChars';
  return null;
}

/** Every problem the Hub can tell before a save. `facts` null: the program read failed, so only the block's own
 *  rules are checked (the daemon still judges the rest). */
export function check(f: Form, facts: ProgramFacts | null): Problem[] {
  const out: Problem[] = [];
  const add = (field: Field, code: string, vars?: Problem['vars']) => out.push(vars ? { field, code, vars } : { field, code });

  // Program-level refusals: the daemon checks them only for an effective block (a block that
  // restricts nothing is stored as absent).
  const effective = formRestricts(f);
  if (facts && effective) {
    if (facts.root) add('program', 'root');
    if (facts.terminal) add('program', 'terminal');
    if (facts.directory && under(norm(facts.directory), '/run/user')) add('program', 'runUser');
    for (const e of facts.env) add('program', `env.${e.reason}`, { name: e.name });
    if (!facts.displayLiteral) add('program', 'display');
  }

  // Filesystem.
  const writable = lines(f.writable);
  const hidden = lines(f.hidden);
  if (writable.length && !f.readOnlyRoot) add('writable', 'writableNeedsRo');
  for (const w of writable) {
    const pp = pathProblem(w);
    if (pp) { add('writable', pp, { path: w }); continue; }
    const n = norm(w);
    if (n === '/') { add('writable', 'pathRoot', { path: w }); continue; }
    const hit = WRITABLE_PROTECTED.find((r) => overlaps(n, r)) ?? (n === '/hoody' || n === '/hoody/storage' ? n : undefined);
    if (hit) add('writable', 'protected', { path: w, root: hit });
    if (f.privateTmp && (overlaps(n, '/tmp') || overlaps(n, '/var/tmp'))) add('writable', 'privateTmpWritable', { path: w });
  }
  for (const h of hidden) {
    const pp = pathProblem(h);
    if (pp) { add('hidden', pp, { path: h }); continue; }
    const n = norm(h);
    if (n === '/') { add('hidden', 'pathRoot', { path: h }); continue; }
    const hit = HIDDEN_FORBIDDEN.find((r) => overlaps(n, r)) ?? WRITABLE_PROTECTED.find((r) => overlaps(n, r));
    if (hit) { add('hidden', 'hiddenForbidden', { path: h, root: hit }); continue; }
    if (facts?.directory && overlaps(n, norm(facts.directory))) add('hidden', 'hiddenDirectory', { path: h });
    const w = writable.find((x) => !pathProblem(x) && overlaps(n, norm(x)));
    if (w) add('hidden', 'hiddenWritable', { path: h, other: w });
  }
  if (effective && f.privateTmp && facts?.directory) {
    const d = norm(facts.directory);
    if ((d.startsWith('/tmp/') || d.startsWith('/var/tmp/'))) add('program', 'privateTmpDirectory');
  }

  // Network.
  const declared = !!facts && (!!facts.portRange || facts.readyPort !== null);
  const bind = f.bindMode === 'list' ? ports(f.bindPorts) : { ranges: [] as [number, number][], bad: null };
  if (bind.bad) add('bindPorts', 'port', { item: bind.bad });
  const conn = ports(f.connectPorts);
  if (conn.bad) add('connectPorts', 'port', { item: conn.bad });
  const allow = splitList(f.ingressFrom);
  const badCidr = allow.find((a) => !CIDR.test(a));
  if (badCidr) add('ingressFrom', 'cidr', { item: badCidr });
  if (allow.length > 64) add('ingressFrom', 'cidrMany', { n: allow.length });
  const rate = f.rate.trim();
  if (rate) {
    const m = /^([0-9]+)\/([sm])$/.exec(rate);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 100000) add('rate', 'rate');
  }
  if (f.mode !== 'restricted' && splitList(f.connectPorts).length) add('connectPorts', 'connectNeedsRestricted');
  if (f.mode === 'none') {
    if (facts && (facts.portRange || facts.readyPort !== null)) add('mode', 'noneHasPorts');
    if (f.bindMode === 'list') add('bindPorts', 'noneBind');
    if (allow.length) add('ingressFrom', 'noneInbound');
    if (rate) add('rate', 'noneInbound');
  }
  if (f.mode === 'restricted' && f.bindMode === 'program' && facts && !declared) add('bindPorts', 'restrictedNeedsPorts');
  if (f.mode === 'restricted' && f.bindMode === 'list' && !bind.bad && bind.ranges.length === 0) add('bindPorts', 'restrictedNeedsPorts');
  if (f.bindMode === 'list' && !bind.bad && facts) {
    const pr = facts.portRange;
    if ((pr && !covers(bind.ranges, pr.start, pr.end)) || (facts.readyPort !== null && !covers(bind.ranges, facts.readyPort, facts.readyPort))) {
      add('bindPorts', 'bindCovers');
    }
  }
  if (f.mode !== 'none' && (allow.length || rate)) {
    const listening = f.bindMode === 'list' ? bind.ranges.length > 0 : declared;
    if (!listening && (f.bindMode === 'list' || facts)) add('ingressFrom', 'inboundNeedsPorts');
  }

  // Process.
  const range = (field: keyof Form, code: string, ok: (s: string) => boolean) => {
    const s = (f[field] as string).trim();
    if (s && !ok(s)) add(field, code);
  };
  range('maxMemory', 'memory', (s) => { const n = sizeBytes(s); return n !== null && n >= 16 * K * K && n <= 64 * K * K * K; });
  range('maxPids', 'pids', (s) => /^[0-9]+$/.test(s) && Number(s) >= 4 && Number(s) <= 65536);
  range('maxOpenFiles', 'files', (s) => /^[0-9]+$/.test(s) && Number(s) >= 8 && Number(s) <= 1048576);
  range('maxCpu', 'cpu', (s) => /^[0-9]{1,6}%$/.test(s) && Number(s.slice(0, -1)) >= 1 && Number(s.slice(0, -1)) <= 102400);
  range('maxFileSize', 'fileSize', (s) => { const n = sizeBytes(s); return n !== null && n >= K && n <= 1024 * K * K * K; });
  range('tmpSize', 'tmpSize', (s) => { const n = sizeBytes(s); return n !== null && n >= K * K && n <= 64 * K * K * K; });
  if (f.tmpSize.trim() && !f.privateTmp) add('tmpSize', 'tmpNeedsPrivate');
  return out;
}

/** The form restricts something (the daemon would store it); otherwise a save would store nothing. */
export function formRestricts(f: Form): boolean {
  return restricts(toBlock(f));
}

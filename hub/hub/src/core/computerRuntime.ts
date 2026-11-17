// computerRuntime.ts: a computer's listeners, read from GET /computers/:id?runtime=true. The
// Computers page and a chat's local address both read listeners here, so they read the same rows the same way.
//
//   classifyRuntime(info)  the computer's listeners: yours (one row per port; a reachable web listener wins over a loopback or
//                          other one on the same port), Hoody's own as a count of ports, and the program counts. Pure.
//   computerRuntime        the read, in the shown realm, keyed by the computer id. Never polled: a page asks for it when it shows
//                          the ports, a chat when the person opens a local address.
//   kitProgram(row)        whether a listener's program is one of Hoody kit's (installed under /hoody/plugins/), and its plugin name.
//   portListening(info, n) what port n is on the computer: 'web' (it has a web address), 'local' (it listens only inside the
//                          computer: 127.0.0.1 or ::1), 'other' (not a web port), 'system' (Hoody's own) or 'none'.
import { defineQuery } from './query';
import { defineRoute } from './routes';

export interface Listener {
  port: number;
  program: string | null;
  kind: 'web' | 'other' | 'local';
  /** A Hoody kit program listens here (kitProgram): such a port gets no alias. Absent: not one, as far as the row says. */
  kit?: Kit;
}
/** A Hoody kit program: `name` is its plugin's folder under /hoody/plugins/ (e.g. hoody-exec), null when the row does not name it. */
export interface Kit { name: string | null }

export interface RuntimeInfo {
  yours: Listener[];
  system: number[];
  terminals: number;
  displays: number;
}

const SYSTEM = new Set(['ttyd', 'agent', 'hoody-agent', 'hoody', 'Xvnc', 'x11vnc', 'xpra', 'Xtigervnc', 'sshd', 'code-server', 'hoody-egress', 'd-tcp', 'avahi-daemon']);
/** Where Hoody and the system install programs; the person's own programs live elsewhere (/home, /root, /opt, /srv...). */
const SYSTEM_DIRS = ['/hoody/', '/usr/bin/', '/usr/sbin/', '/usr/lib/', '/usr/libexec/', '/bin/', '/sbin/', '/lib/'];
/** An absolute path, with no . or .. segment, under one of SYSTEM_DIRS. */
function systemPath(p: string): boolean {
  if (!p.startsWith('/') || p.split('/').some((x) => x === '.' || x === '..')) return false;
  return SYSTEM_DIRS.some((d) => p.startsWith(d));
}
/** Hoody's own listener. A Hoody or system name (SYSTEM, hoody-*) counts only with evidence: the exe path (or argv0) lies under
 *  a Hoody or system folder. A name alone is the person's own program (their `agent` on :3000 stays theirs), and so is a row
 *  with no path. avahi-daemon (the system's network discovery: UDP 5353 and its random UDP ports) rewrites its command line,
 *  so only its exe path tells it. The systemd and xpra rules read the program as a path already. NOT a security signal: argv0 is set by the
 *  process itself, so a person's program can still hide its own port here; never gate access on it. */
function isSystem(p: string, row: { path?: unknown; args?: unknown }): boolean {
  if (!p) return false;
  if (/(^|\/)systemd(-|$)/.test(p) || p.startsWith('/usr/bin/xpra')) return true;
  if (!SYSTEM.has(p) && !p.startsWith('hoody-')) return false;
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 4096) : '');
  const argv0 = str(row.args).split(/\s+/).find(Boolean) ?? '';
  return systemPath(str(row.path)) || systemPath(argv0);
}
const NOT_WEB = new Set([21, 22, 25, 53, 110, 143, 465, 587, 993, 995, 1433, 1521, 2181, 3306, 5432, 5672, 6379, 9042, 9092, 11211, 27017]);
function loopback(ip: unknown): boolean {
  const s = String(ip ?? '');
  return /^127\./.test(s) || s === '::1' || s === 'localhost';
}
const validPort = (p: unknown): p is number => typeof p === 'number' && Number.isInteger(p) && p > 0 && p < 65536;

const KIT_ROOT = '/hoody/plugins/';
const KIT_NAME = /^[A-Za-z0-9._-]{1,40}$/;
const INTERPRETER = /^(node|nodejs|bun|deno|python[0-9.]*|java|sh|bash|dash|ruby|perl|php)$/;
/** The kit name of an absolute path strictly under /hoody/plugins/ ({name: null} when the path ends at the folder, as a 15-character
 *  comm "/hoody/plugins/" does); null for anything else: a relative path, /hoody/pluginsX, /hoody/plugins itself, or a . or .. segment. */
function kitOfPath(p: string): Kit | null {
  if (!p.startsWith(KIT_ROOT)) return null;
  const segs = p.slice(KIT_ROOT.length).split('/');
  if (segs.some((x, i) => x === '.' || x === '..' || (x === '' && i < segs.length - 1))) return null;
  const first = segs[0] ?? '';
  return { name: KIT_NAME.test(first) ? first : null };
}
/** Whether a listener's program is one of Hoody kit's: its exe path, its program (comm, cut at 15 characters), its argv0, or an
 *  interpreter's argument (node --require a.js /hoody/plugins/x/main.js: any argument, options and all) lies under /hoody/plugins/,
 *  which the person cannot write. The name comes from that argument, else argv0, else the path (the kit's own node runs kit scripts:
 *  the script is the program). `args` arrives flattened (the collector joins argv with spaces), so an argument holding a space is read
 *  as two; kit folders have none, and a split elsewhere can only miss a name or hide one alias.
 *  NOT a security signal: argv0, the script argument and comm are set by the process itself, so a person's own program can look like
 *  a kit one; the only effect is that its port offers no alias (Ports, AliasDrawer). Never gate access on it. */
export function kitProgram(row: { program?: unknown; path?: unknown; args?: unknown }): Kit | null {
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 4096) : '');
  const argv = str(row.args).split(/\s+/).filter(Boolean);
  const argv0 = argv[0] ?? '';
  const base = argv0.slice(argv0.lastIndexOf('/') + 1);
  // An interpreter's kit script may follow options with values (--require x.js): any kit-path argument counts, the first one names it.
  const script = INTERPRETER.test(base) ? argv.slice(1).find((a) => kitOfPath(a) !== null) ?? '' : '';
  // comm is cut at 15 characters ("/hoody/plugins/hoody-exec" reads "/hoody/plugins/"), so it tells kit or not but never the name.
  const comm = kitOfPath(str(row.program));
  const found = [kitOfPath(script), kitOfPath(argv0), kitOfPath(str(row.path)), comm && { name: null }].filter((k): k is Kit => !!k);
  if (!found.length) return null;
  return found.find((k) => k.name !== null) ?? { name: null };
}

export interface RawRuntime {
  network_services?: Array<{ port?: unknown; program?: unknown; protocol?: unknown; ip?: unknown; path?: unknown; args?: unknown }>;
  terminals?: unknown[];
  displays?: unknown[];
}

/** The computer's listeners: yours (one row per port; a reachable web listener wins), Hoody's own as a count, and program counts. */
export function classifyRuntime(info: RawRuntime | null | undefined): RuntimeInfo {
  const ns = Array.isArray(info?.network_services) ? info.network_services : [];
  const yours = new Map<number, Listener>();
  const system = new Set<number>();
  for (const s of ns) {
    const port = s?.port;
    if (!validPort(port)) continue;
    const prog = typeof s.program === 'string' ? s.program.slice(0, 80) : '';
    if (isSystem(prog, s)) {
      system.add(port);
      continue;
    }
    const tcp = String(s.protocol ?? '').toLowerCase().startsWith('tcp');
    const kind: Listener['kind'] = !tcp || NOT_WEB.has(port) ? 'other' : loopback(s.ip) ? 'local' : 'web';
    const had = yours.get(port);
    // Any listener of the port marks it kit; a named mark wins over an unnamed one, whichever row comes first.
    const own = kitProgram(s);
    const kit = [own, had?.kit].find((k) => k?.name) ?? own ?? had?.kit;
    const mark = kit ? { kit } : {};
    if (!had) yours.set(port, { port, program: prog || null, kind, ...mark });
    else if (had.kind !== 'web' && kind === 'web') yours.set(port, { port, program: prog || had.program, kind, ...mark });
    else if (kit) yours.set(port, { ...had, kit });
  }
  return {
    yours: [...yours.values()].sort((a, b) => a.port - b.port),
    system: [...system].sort((a, b) => a - b),
    terminals: Array.isArray(info?.terminals) ? info.terminals.length : 0,
    displays: Array.isArray(info?.displays) ? info.displays.length : 0,
  };
}

export type PortListening = 'web' | 'local' | 'other' | 'system' | 'none';

/** What port n is on a computer, by its listeners. A system port is Hoody's own (never the person's site). */
export function portListening(info: RuntimeInfo, port: number): PortListening {
  const l = info.yours.find((x) => x.port === port);
  if (l) return l.kind;
  return info.system.includes(port) ? 'system' : 'none';
}

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** GET /computers/:id?runtime=true in the shown realm: the Computers page's runtime read uses this route too. */
export const computerRuntimeRoute = defineRoute({ method: 'GET', path: '/computers/:id', scope: 'realm', query: ['runtime'] });

/** A computer's listeners (the raw answer's runtime_info, classified). */
export const computerRuntime = defineQuery<unknown, RuntimeInfo, string>(computerRuntimeRoute, {
  input: (id) => ({ params: { id }, query: { runtime: true } }),
  select: (raw) => classifyRuntime(obj(obj(obj(raw)?.data)?.runtime_info) as RawRuntime | undefined),
});

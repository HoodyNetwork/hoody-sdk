// The Setup panel's pure part: the person's choices, checked, turned into the CLI and SDK text
// they copy, plus the warnings that go with them. The commands are the hoody-sdk CLI's own
// (`hoody --computer <id> tunnel expose <target> [--port N]`, `tunnel pull …`) and the
// SDK's `box.tunnel.expose/pull({ computerPort, to })` (lib/tunnel-service-extensions.ts). Every value that reaches
// shell text is shell-quoted; a kit password never reaches any text: the CLI asks for it on the terminal or reads
// HOODY_KIT_PASSWORD, and the SDK reads it from the environment.

export type SetupMode = 'expose' | 'pull';

/** What the person typed, as typed. */
export interface SetupInput {
  mode: SetupMode;
  /** The laptop-side host; empty means this laptop (localhost). */
  host: string;
  /** The laptop-side port. */
  port: string;
  /** The computer-side port; empty means the program picks a free one when it connects. */
  computerPort: string;
  /** The computer's settings ask for a kit login on the tunnel program. */
  kitLogin: boolean;
  kitUser: string;
}

export interface SetupValue {
  mode: SetupMode;
  /** '' for this laptop. */
  host: string;
  port: number;
  computerPort: number | null;
  kitUser: string | null;
}

export type SetupProblem = 'range' | 'low' | 'host' | 'v4only' | 'required' | 'user';
export type SetupProblems = Partial<Record<'port' | 'computerPort' | 'host' | 'kitUser', SetupProblem>>;
/** The words of a user name problem: an empty box asks for the name; a name typed but refused gives the rule. */
export function kitUserErrorKey(problem: string): 'setup.err.user' | 'setup.err.userRule' {
  return problem === 'required' ? 'setup.err.user' : 'setup.err.userRule';
}

export type SetupCheck = { ok: true; value: SetupValue } | { ok: false; problems: SetupProblems };

export type SetupWarning = 'risky' | 'otherHost' | 'privileged';

export interface SetupBuild {
  /** The one command that opens the tunnel (after install and sign-in). */
  cli: string;
  /** A Node/Bun program doing the same with the SDK. */
  sdk: string;
  warnings: SetupWarning[];
  /** EXPOSE with a fixed computer port: that port, for the address preview; else null (known when it connects). */
  previewPort: number | null;
  /** PULL with a fixed computer port: where programs on the computer connect; else null. */
  inside: string | null;
}

/**
 * Ports that often belong to a database or an admin screen. `both` warns in either mode; `expose` adds web admin
 * screens that matter only once they get a public address. A port not listed is never called safe: the page just
 * says nothing about it.
 */
export const RISKY_PORTS = {
  both: [5432, 3306, 6379, 27017, 9200, 2375, 2376, 5984, 11211, 22, 3389, 5900],
  expose: [5432, 3306, 6379, 27017, 9200, 2375, 2376, 5984, 11211, 22, 3389, 5900, 8080, 9000, 15672, 8500],
} as const;

const SAFE_WORD = /^[A-Za-z0-9_.:/@%+=,-]+$/;
/** One shell word: plain words as they are, anything else single-quoted (a quote inside closes, escapes, reopens). */
export function shq(s: string): string {
  if (s !== '' && SAFE_WORD.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** A JavaScript string literal in single quotes. */
const jsq = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;

const portNum = (raw: string): number | null => {
  const t = raw.trim();
  if (!/^\d{1,5}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 65535 ? n : null;
};

/** A host name or an IPv4 address: letters, digits, dots, dashes. */
const HOST = /^[A-Za-z0-9.-]{1,253}$/;
/** Looks like an IPv6 address (a colon, maybe in brackets): Hoody networks use IPv4 only, so it gets its own reason. */
const IPV6_LIKE = /^\[?[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*\]?$/;
// A kit user name: printable, no control characters; quoted wherever it goes.
const USER = /^[^\p{Cc}]{1,64}$/u;

export function checkSetup(i: SetupInput): SetupCheck {
  const problems: SetupProblems = {};
  const port = portNum(i.port);
  if (port === null) problems.port = 'range';
  let computerPort: number | null = null;
  if (i.computerPort.trim() !== '') {
    computerPort = portNum(i.computerPort);
    if (computerPort === null) problems.computerPort = 'range';
    // The program refuses ports below 80 in both modes (BIND_ERR PRIVILEGED_PORT).
    else if (computerPort < 80) problems.computerPort = 'low';
  }
  const host = i.host.trim();
  if (host !== '' && IPV6_LIKE.test(host)) problems.host = 'v4only';
  else if (host !== '' && !HOST.test(host)) problems.host = 'host';
  let kitUser: string | null = null;
  if (i.kitLogin) {
    const u = i.kitUser.trim();
    if (u === '') problems.kitUser = 'required';
    else if (!USER.test(u)) problems.kitUser = 'user';
    else kitUser = u;
  }
  if (Object.keys(problems).length > 0 || port === null) return { ok: false, problems };
  return { ok: true, value: { mode: i.mode, host, port, computerPort, kitUser } };
}

/**
 * A shared place's key that survives its session reconnecting (the row id changes then): session + bind id. A
 * listener the kit names no session for keeps its own row id (two of them can share a bind id).
 */
export const placeKey = (row: { id: string; sessionId: string; bindId: number | null }): string =>
  row.sessionId ? `${row.sessionId}~${row.bindId ?? 'idle'}` : row.id;

const isThisLaptop = (host: string): boolean => {
  const h = host.toLowerCase();
  return h === '' || h === 'localhost' || /^127(\.\d{1,3}){3}$/.test(h);
};

/** Which of the two ports is a risky one, so the warning sits under the field that holds it (both when both are). */
export function riskyPorts(v: SetupValue): { laptop: boolean; computer: boolean } {
  const risky: readonly number[] = v.mode === 'expose' ? RISKY_PORTS.expose : RISKY_PORTS.both;
  return { laptop: risky.includes(v.port), computer: v.computerPort !== null && risky.includes(v.computerPort) };
}

/** The CLI's local target: a bare port for this laptop, else host:port. */
const target = (v: SetupValue): string => (v.host === '' || v.host.toLowerCase() === 'localhost' ? String(v.port) : `${v.host}:${v.port}`);

/** `api`: the platform's API host (kit currentPlatformHosts().api), the SDK example's baseURL; only that changes per platform,
 *  never the host or user the person typed. */
export function buildSetup(v: SetupValue, computerId: string, api = 'api.hoody.com'): SetupBuild {
  const flags = ['hoody', '--computer', shq(computerId)];
  if (v.kitUser !== null) flags.push('--kit-auth', 'password', '--kit-user', shq(v.kitUser));
  const cli = [...flags, 'tunnel', v.mode, shq(target(v)), ...(v.computerPort !== null ? ['--port', String(v.computerPort)] : [])].join(' ');

  const sdkHost = v.host === '' ? 'localhost' : v.host;
  const kitAuth = v.kitUser !== null ? `, kitAuth: { type: 'password', username: ${jsq(v.kitUser)}, password: kitPassword }` : '';
  // The password comes from the environment, checked (the SDK takes a string, never undefined).
  const readPassword =
    v.kitUser !== null ? ['const kitPassword = process.env.HOODY_KIT_PASSWORD;', "if (!kitPassword) throw new Error('Set HOODY_KIT_PASSWORD first.');"] : [];
  const sdk = [
    "import { HoodyClient } from 'hoody-sdk';",
    `const hoody = new HoodyClient({ baseURL: ${jsq(`https://${api}`)}, token: process.env.HOODY_TOKEN });`,
    ...readPassword,
    `const box = await hoody.withComputer(${jsq(computerId)});`,
    `const tunnel = await box.tunnel.${v.mode}({ computerPort: ${v.computerPort ?? 0}, to: { host: ${jsq(sdkHost)}, port: ${v.port} }${kitAuth} });`,
    'console.log(tunnel.bind.computerPort); // tunnel.close() ends it',
  ].join('\n');

  const warnings: SetupWarning[] = [];
  const risky = riskyPorts(v);
  if (risky.laptop || risky.computer) warnings.push('risky');
  if (!isThisLaptop(v.host)) warnings.push('otherHost');
  if (v.computerPort !== null && v.computerPort < 1024) warnings.push('privileged');

  return {
    cli,
    sdk,
    warnings,
    previewPort: v.mode === 'expose' ? v.computerPort : null,
    inside: v.mode === 'pull' && v.computerPort !== null ? `127.0.0.1:${v.computerPort}` : null,
  };
}

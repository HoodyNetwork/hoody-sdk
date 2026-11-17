// The exit IP section's pure part (split out of ExitIp.tsx so the terminal build shares it; the design notes are at
// the top of ExitIp.tsx): the state and form rules, the proved checks, the source table (one coreSource, never
// re-created) and the hooks that read them. ExitIp.tsx re-exports the public names; DOCS_EXIT, DOCS_VPN, isScheme,
// viaKey, serverKey, placed, useUpstream, useSet, useClear, ownHold and EMPTY are for ExitIp.tsx.
import { coreSource, portAddress, type HeldChange, type SourceTable } from '@core';
import { useStrings } from '@kit';
import { egressRoutes, subjectOf, targetOf, useComputers, type Subject } from '../data';
import { bucket } from '../logic';
import type { Computer } from '../types';
import strings from './ExitIp.strings.en.json';

export const EXIT_LOCK = 'computer.egress_upstream';
export const DOCS_EXIT = 'https://docs.hoody.com/kit/egress/#upstream-proxies';
export const DOCS_VPN = 'https://docs.hoody.com/foundation/networking/vpn/';

export const SCHEMES = ['socks5h', 'socks5', 'http', 'https'] as const;
export type Scheme = (typeof SCHEMES)[number];
export const isScheme = (v: unknown): v is Scheme => typeof v === 'string' && (SCHEMES as readonly string[]).includes(v);

/** What the egress program reports. `state` is newer than the rest: an older program sends none (`set`). */
export type ExitState =
  | { kind: 'direct'; computer?: string }
  | { kind: 'active' | 'unavailable' | 'set'; scheme: string; host: string; port: number | null; login: boolean; computer?: string }
  | { kind: 'unknown'; computer?: string };

const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** GET /api/v1/egress/upstream → the page's state. Anything it cannot read is `unknown`, never "direct". */
export function exitStateOf(raw: unknown): ExitState {
  const r = obj(raw);
  if (!r || typeof r.enabled !== 'boolean') return { kind: 'unknown' };
  const state = r.state;
  if (state === 'direct' || (state === undefined && r.enabled === false)) return r.enabled ? { kind: 'unknown' } : { kind: 'direct' };
  if (!r.enabled) return { kind: 'unknown' };
  const kind = state === 'active' || state === 'unavailable' ? state : state === undefined ? 'set' : null;
  // The program leaves out all four fields when its own setting does not parse (traffic is refused then): an exit
  // nobody can name. Any other reply missing or garbling one of them is unreadable.
  if (kind && kind !== 'active' && r.scheme === undefined && r.host === undefined && r.port === undefined && r.auth === undefined)
    return { kind, scheme: '', host: '', port: null, login: false };
  const port = r.port;
  if (!kind || typeof r.scheme !== 'string' || !r.scheme || typeof r.host !== 'string' || !r.host || typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535 || typeof r.auth !== 'boolean') return { kind: 'unknown' };
  return { kind, scheme: r.scheme, host: r.host, port, login: r.auth };
}

/** The proxy as shown: never a login (the program never returns one). Unparsed text shows as "an exit". */
export const proxyLabel = (x: { scheme: string; host: string; port: number | null }): string =>
  x.host ? `${x.scheme ? `${x.scheme}://` : ''}${x.host}${x.port !== null ? `:${x.port}` : ''}` : '';
/** The proxy domain computers' addresses are under (core portAddress's own, so fixtures agree), or ''. */
function egressDomain(): string {
  const probe = portAddress({ id: 'p' }, { id: 'c', server_name: 's' }, 1, 'egress');
  return probe.startsWith('https://p-c-egress-1.s.') ? probe.slice('https://p-c-egress-1.s.'.length).toLowerCase() : '';
}
/** The computer a proxy host belongs to (`<project>-<computer>`, ids unique across servers), when the host is a Hoody
 *  computer's proxy address under this page's proxy domain (`<project>-<computer>-egress[-<n>].<server>.<domain>`, both
 *  documented forms), else
 *  null. Any choice that sends such a host (the computer list, or one typed as your own proxy) is named by this, never by
 *  the host; the server is left out on purpose, so a kept hold never holds every part of the address. */
export function viaOf(host: string): string | null {
  const d = egressDomain();
  const m = /^([0-9a-f]{24})-([0-9a-f]{24})-egress(?:-\d+)?\.[a-z0-9-]+\.(.+)$/i.exec(host);
  return d && m && m[3]!.toLowerCase() === d ? `${m[1]}-${m[2]}`.toLowerCase() : null;
}
export const viaKey = (x: Computer): string => `${x.project_id}-${x.id}`.toLowerCase();
export const serverKey = (x: Computer): string => x.server_id || x.server?.name || x.server_name || '';

/** An exit on IPv4 loopback is the shape `hoody egress local start` installs (others may use it too). */
export const looksLocal = (host: string): boolean => /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);

export interface ExitForm { scheme: Scheme; host: string; port: string; user: string; password: string }
export type FormProblem = 'host' | 'port' | 'needsUser';

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
/** A host is a name or an IPv4 address: no scheme, login, port, path or IPv6 (the program is IPv4 only). */
export const validHost = (h: string): boolean => IPV4.test(h) || (HOSTNAME.test(h) && !/^[\d.]+$/.test(h));
export const validPort = (p: string): boolean => /^\d{1,5}$/.test(p) && Number(p) >= 1 && Number(p) <= 65535;

/** The first thing wrong with the form, or null. Empty host and port are "not yet", not a problem to show. */
export function formProblem(f: ExitForm): FormProblem | null {
  const host = f.host.trim();
  if (host && !validHost(host)) return 'host';
  if (f.port.trim() && !validPort(f.port.trim())) return 'port';
  if (f.password && !f.user) return 'needsUser';
  return null;
}
export const formReady = (f: ExitForm): boolean => !!f.host.trim() && !!f.port.trim() && formProblem(f) === null;
/** Which required box of "Your own proxy" is still empty: the footer names it while "Use this exit" is off, so nobody
 *  has to guess between the port and the optional login. Null once both hold text (a bad value shows at its field). */
export function formMissing(f: ExitForm): 'host' | 'port' | 'both' | null {
  const host = !f.host.trim();
  const port = !f.port.trim();
  return host && port ? 'both' : host ? 'host' : port ? 'port' : null;
}

/** The PUT body: one URL line, the login percent-encoded so no character of it can end the user or host part. */
export function upstreamLine(f: ExitForm): string {
  const login = f.user ? `${encodeURIComponent(f.user)}${f.password ? `:${encodeURIComponent(f.password)}` : ''}@` : '';
  return `${f.scheme}://${login}${f.host.trim().toLowerCase()}:${Number(f.port.trim())}`;
}

type Answers = readonly (readonly unknown[])[];
const reads = (answers: Answers, computer: unknown): ExitState[] =>
  typeof computer === 'string' && computer ? (answers[0] ?? []).filter((a): a is ExitState => !!obj(a) && (a as ExitState).computer === computer) : [];
/** A set is proved by a read of that computer naming the sent type, host, port and login presence. A read naming
 *  something else proves nothing (another sender may have changed it since), so only a match frees the hold. A set
 *  with a login is never proved: the program never reads a login back, so the old one looks the same as the new. */
export function setProved(identity: unknown, answers: Answers): 'applied' | undefined {
  const i = (identity ?? {}) as { computer?: string; scheme?: string; host?: string; port?: number; login?: boolean; via?: string };
  if (i.login !== false) return undefined;
  // Another computer: named by its ids, so a read proves it when its host is that computer's proxy.
  if (typeof i.via === 'string')
    return reads(answers, i.computer).some((x) => x.kind !== 'direct' && x.kind !== 'unknown' && x.scheme === i.scheme && x.port === i.port && x.login === false && viaOf(x.host) === i.via) ? 'applied' : undefined;
  return reads(answers, i.computer).some((x) => x.kind !== 'direct' && x.kind !== 'unknown' && x.scheme === i.scheme && x.host === i.host && x.port === i.port && x.login === i.login)
    ? 'applied'
    : undefined;
}
/** A clear is proved by a read of that computer on its own address. */
export const clearProved = (identity: unknown, answers: Answers): 'applied' | undefined =>
  reads(answers, ((identity ?? {}) as { computer?: string }).computer).some((x) => x.kind === 'direct') ? 'applied' : undefined;

export interface SetVars extends Subject { scheme: Scheme; host: string; port: number; login: boolean; line: string; /** Another computer as the exit (its ids); then `host` is empty. */ via?: string }
export type ClearVars = Subject;
const at = (p: Subject) => (p.id && p.project && p.server ? { target: targetOf(p) } : {});

export const exitTable: SourceTable = {
  reads: {
    upstream: { route: egressRoutes.upstream, input: (p: Subject) => at(p), select: (raw, p: Subject): ExitState => ({ ...exitStateOf(raw), computer: p.id }), staleTime: 0 },
  },
  changes: {
    set: {
      route: egressRoutes.set,
      input: (v: SetVars) => ({ target: targetOf(v), body: v.line }),
      reads: ['upstream'],
      lock: EXIT_LOCK,
      // One change of a computer's exit at a time; nothing derived from the login is kept.
      lockKey: (v: SetVars) => ({ computer: v.id }),
      identity: (v: SetVars) => (v.via ? { computer: v.id, act: 'set', scheme: v.scheme, port: v.port, login: v.login, via: v.via } : { computer: v.id, act: 'set', scheme: v.scheme, host: v.host, port: v.port, login: v.login }),
      select: () => undefined,
      acrossRealms: true,
      proves: setProved,
    },
    clear: {
      route: egressRoutes.clear,
      input: (v: ClearVars) => ({ target: targetOf(v) }),
      reads: ['upstream'],
      lock: EXIT_LOCK,
      lockKey: (v: ClearVars) => ({ computer: v.id }),
      identity: (v: ClearVars) => ({ computer: v.id, act: 'clear' }),
      select: () => undefined,
      acrossRealms: true,
      proves: clearProved,
    },
  },
};

const source = coreSource('computers', exitTable);
export const placed = (x: Subject) => !!(x.id && x.project && x.server);
export const useUpstream = (x: Subject, enabled: boolean) => source.useQuery<ExitState, Subject>('upstream', x, { enabled: enabled && placed(x) });

/** Where this computer's traffic leaves from, for the Network tab's glance. The same read as
 *  the section below (one query key, so no second fetch); another computer as the exit by its listed name, never its
 *  address. `stopped` and `noAddress` are read nowhere: the section says why. */
export type ExitGlance =
  | { kind: 'reading' | 'stopped' | 'noAddress' | 'unknown' | 'direct' }
  | { kind: 'via'; label: string; down: boolean; unsure: boolean };
export function useExitGlance(c: Computer): ExitGlance {
  const t = useStrings(strings);
  const subject = subjectOf(c);
  const running = bucket(c.status) === 'running';
  const up = useUpstream(subject, running);
  const list = useComputers().data;
  if (!running) return { kind: 'stopped' };
  if (!placed(subject)) return { kind: 'noAddress' };
  if (up.isPending) return { kind: 'reading' };
  const st = up.data;
  if (up.isError || !st || st.kind === 'unknown') return { kind: 'unknown' };
  if (st.kind === 'direct') return { kind: 'direct' };
  const v = st.host ? viaOf(st.host) : null;
  const other = v ? (list ?? []).find((x) => viaKey(x) === v)?.name : undefined;
  const label = v ? (other ? t('net.exit.via', { other }) : t('net.exit.viaUnknown')) : proxyLabel(st);
  // `set`: an older egress program that does not report whether its exit works (the section says so too).
  return { kind: 'via', label, down: st.kind === 'unavailable' || !st.host, unsure: st.kind === 'set' };
}
export const useSet = () => source.useMutation<unknown, SetVars>('set');
export const useClear = () => source.useMutation<unknown, ClearVars>('clear');
export const ownHold = (key: string, h: HeldChange | null): boolean => !h || source.heldBy(key, h) !== 'other';

export const EMPTY: ExitForm = { scheme: 'socks5h', host: '', port: '', user: '', password: '' };

// Pure rules of the programs page (no React, no I/O): the State filter, the system-program ask, port parsing and
// the words. The overview's model (one meaning of "running" for the whole Hub), the proof of a change and the
// restart receipt verdict are core's (core/program-model.ts); the page keeps its own names for the types it draws.
import { aliasAtPort, type ProgramAction as Action, type ProgramRow as Row, type ProgramStateKey as StateKey } from '@core';
import { LOCALE } from '@kit';

export type {
  ProgramRawOverview as RawOverview, ProgramRawProgram as RawProgram, ProgramRawTemporary as RawTemporary,
  ProgramRawInstance as RawInstance, ProgramRawResult as RawResult, ProgramStateKey as StateKey, ProgramScope as Scope,
  ProgramAction as Action, ProgramCan as Can, ProgramPart as Part, ProgramStopInfo as StopInfo, ProgramRow as Row,
  ProgramCounts as Counts, ProgramModel as Model,
} from '@core';

/** Hub parts that stop working while a system program is down, by the kit name. */
const DEPENDS: Readonly<Record<string, string>> = {
  agent: 'agent', terminal: 'terminal', exec: 'scripts', cron: 'schedules', run: 'apps',
  notes: 'notes', display: 'screen', files: 'files', daemon: 'daemon',
};

export const STATE_FILTERS = ['running', 'stopped', 'problems'] as const;
export type StateFilter = (typeof STATE_FILTERS)[number];

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;

/**
 * A program's proxy aliases by port, joined on the program's configured ports (the daemon's own, not the sockets it
 * listens on): only aliases that point at a port (core aliasAtPort), on its single port or on a port of its range (a
 * part, or a port of the range with no part yet, as Addresses lists every port). A system program gets none: its
 * address still tells which computer it is on, so no alias is offered there either.
 */
export function programAliases<A extends { port: number; program?: string }>(row: Row, aliases: readonly A[]): ReadonlyMap<number, A[]> {
  const out = new Map<number, A[]>();
  if (row.scope === 'system') return out;
  const mine = (p: number): boolean => p === row.port || row.parts.some((x) => x.port === p) || (row.range !== null && p >= row.range.start && p <= row.range.end);
  for (const a of aliases) if (aliasAtPort(a) && a.port > 0 && mine(a.port)) out.set(a.port, [...(out.get(a.port) ?? []), a]);
  return out;
}

/** The state chip: running | stopped | problems. */
export function stateTest(r: Row, f: StateFilter | undefined): boolean {
  if (!f) return true;
  const up = r.state === 'running' || r.state === 'starting' || r.partsUp > 0;
  if (f === 'problems') return r.attention;
  if (f === 'running') return up;
  return !up && !r.attention;
}

/** A stop or restart of a system program asks first. `dep` names the Hub part that relies on it, when known. */
export function ask(r: Row, act: Action): { dep: string | null } | null {
  if (r.scope !== 'system' || (act !== 'stop' && act !== 'restart')) return null;
  return { dep: r.kit && r.kit in DEPENDS ? (DEPENDS[r.kit] ?? null) : null };
}

/** May Start name this port on this freshly read row? */
export function portStartOk(r: Row, port: number): boolean {
  if (!r.range || !r.can.portStart || !isInt(port) || port < r.range.start || port > r.range.end || port < 1 || port > 65535) return false;
  const p = r.parts.find((x) => x.port === port);
  return p ? p.can.start : true;
}

/** Parses the number typed in the "Start a port" field; null when it is not a whole port inside the range. */
export function parsePort(text: string, r: Row): number | null {
  const v = text.trim();
  if (!/^[0-9]{1,5}$/.test(v)) return null;
  const n = Number(v);
  return portStartOk(r, n) ? n : null;
}

// ── Words ────────────────────────────────────────────────────────────────────────────

export function tone(k: StateKey): 'ok' | 'danger' | 'warn' | 'neutral' {
  if (k === 'running') return 'ok';
  if (k === 'fatal' || k === 'restarting' || k === 'failed' || k === 'ended') return 'danger';
  if (k === 'unknown') return 'warn';
  return 'neutral';
}

/** "45 seconds", "12 minutes", "3 hours", "2 days". */
export function duration(sec: number): string {
  const unit = (n: number, u: string) => new Intl.NumberFormat(LOCALE, { style: 'unit', unit: u, unitDisplay: 'short' }).format(n);
  if (sec < 90) return unit(Math.max(1, sec), 'second');
  if (sec < 5400) return unit(Math.round(sec / 60), 'minute');
  if (sec < 172800) return unit(Math.round(sec / 3600), 'hour');
  return unit(Math.round(sec / 86400), 'day');
}

/** A port is an identifier, not a quantity: digits only, never grouped. */
export function portText(n: number): string {
  return new Intl.NumberFormat(LOCALE, { useGrouping: false }).format(n);
}

/** How many ports a range holds (8000-8003: 4): what a range's parts count against. */
export function rangeSize(r: { start: number; end: number }): number {
  return Math.max(0, r.end - r.start + 1);
}

/** A range as the person reads it: 8000-8003, and a range of one port as that port (8080, never 8080-8080). */
export function rangeText(r: { start: number; end: number }): string {
  return r.start === r.end ? portText(r.start) : `${portText(r.start)}-${portText(r.end)}`;
}

export function searchText(r: Row): string {
  return [r.name, r.scope === 'system' ? 'system' : r.scope === 'temporary' ? 'temporary' : ''].join(' ');
}

/** The host a person's own domain points its CNAME record at: an https alias address's host name; null for anything
 *  else (no address, not https, no dot), so no domain row is offered for it. */
export function aliasHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.hostname : null;
  } catch {
    return null;
  }
}

/** The names of the aliases that point at one port (http/https aliases only: a program alias's number is an instance). */
export function aliasNamesAt(aliases: readonly { name: string; port: number; program?: string }[], port: number): string[] {
  return aliases.filter((a) => aliasAtPort(a) && a.port === port).map((a) => a.name);
}

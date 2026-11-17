// What else a computer can show in a tile besides the tile programs (catalog.ts TILE_PROGRAMS): its own programs' HTTP ports (the daemon's
// overview, core's program model) and its Exec scripts (the Exec kit's list). Read only, for the picker's program
// step, and only while that step shows a running computer.
//
// Contract, in plain words:
//   - portsOf(overview) → the person's own programs (scope 'yours') with a port, one entry per port (a port-range
//     program gives each part), sorted by port, at most PORTS_MAX. Hoody's own kits (scope 'system') are left out on
//     purpose: the tile programs already open the ones a tile shows. A body that is not the overview gives [].
//   - scriptsOf(list) → the address each script file answers (`default/1/orders/index.ts` → `/orders`), sorted, at
//     most SCRIPTS_MAX. Paths come under the Exec root `default/1/` or relative to it; another `default/<n>/` root,
//     a [dynamic] segment, a folder Exec never serves, a `pre`/`post` middleware file and a route links.ts routeOk
//     refuses (too long) are left out, so every offered route also survives storage and has a view link.
//   - useComputerExtras(computer) → {ports, scripts}: each null while reading or when it failed, so the picker shows
//     nothing rather than a guess; both null for no computer or one that is not running (nothing is read then). Its
//     `read` says whether both answered in full: a list longer than its MAX is 'partial' (an entry past it is not shown).
import { computerState, defineQuery, defineRoute, programModel, programRoutes } from '@core';
import type { BoardComputer } from './computers';
import { routeOk } from './links';

export const PORTS_MAX = 50;
export const SCRIPTS_MAX = 100;

export interface PortEntry { readonly name: string; readonly port: number }

export function portsOf(overview: unknown): PortEntry[] {
  return allPorts(overview).slice(0, PORTS_MAX);
}

function allPorts(overview: unknown): PortEntry[] {
  const m = programModel(overview);
  if (!m) return [];
  const seen = new Set<number>();
  const out: PortEntry[] = [];
  for (const r of m.rows) {
    if (r.scope !== 'yours') continue;
    const ports = r.parts.length ? r.parts.map((p) => p.port) : r.port !== null ? [r.port] : [];
    for (const port of ports) {
      if (!Number.isInteger(port) || port < 1 || port > 65535 || seen.has(port)) continue;
      seen.add(port);
      out.push({ name: r.name, port });
    }
  }
  return out.sort((a, b) => a.port - b.port);
}

const ROOT = 'default/1/';
const NEVER_SERVED = ['_hoody', '_sdk', 'node_modules', '.git', '.hoody-cache'];
const SEGMENT = /^[A-Za-z0-9_.-]+$/;
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The address one listed file answers, or null (see the contract: what is left out). */
export function scriptRoute(path: string): string | null {
  if (!path.startsWith(ROOT) && /^\/*default\//.test(path)) return null;
  const rel = path.startsWith(ROOT) ? path.slice(ROOT.length) : path.replace(/^\/+/, '');
  if (!/\.(?:ts|js)$/.test(rel)) return null;
  const parts = rel.replace(/\.(?:ts|js)$/, '').split('/');
  if (parts.some((p) => !SEGMENT.test(p) || p === '.' || p === '..' || NEVER_SERVED.includes(p))) return null;
  const base = parts[parts.length - 1];
  // Exec runs pre/post files as middleware around a route, never as a route of their own.
  if (base === 'pre' || base === 'post') return null;
  if (base === 'index') parts.pop();
  const route = '/' + parts.join('/');
  return routeOk(route) ? route : null;
}

export function scriptsOf(list: unknown): string[] {
  return allScripts(list).slice(0, SCRIPTS_MAX);
}

function allScripts(list: unknown): string[] {
  const o = rec(list);
  const items = Array.isArray(list) ? list : (['scripts', 'entries', 'files', 'items'].map((k) => o[k]).find(Array.isArray) as unknown[] | undefined) ?? [];
  const routes = new Set<string>();
  for (const it of items) {
    const r = rec(it);
    if (typeof r.path !== 'string' || r.isDirectory === true || (typeof r.type === 'string' && r.type !== 'file')) continue;
    const route = scriptRoute(r.path);
    if (route) routes.add(route);
  }
  return [...routes].sort();
}

interface Subject { project: string; computer: string; server: string }
const targetOf = (p: Subject) => ({ project: { id: p.project }, container: { id: p.computer, ...(p.server ? { server_name: p.server } : {}) } });

/** The Exec kit's script list (fixtures answer it by this route). */
export const scriptList = defineRoute({ method: 'GET', path: '/api/v1/exec/scripts/list', scope: 'kit', kit: 'exec', index: 1, query: ['recursive'], maxBytes: 4 * 1024 * 1024 });
// Each read keeps its first MAX entries and whether there were more (`capped`: what is shown is part of the list).
const capped = <T>(all: T[], max: number) => ({ list: all.slice(0, max), capped: all.length > max });
const overviewRead = defineQuery(programRoutes.overview, { input: (p: Subject) => ({ target: targetOf(p) }), select: (o: unknown) => capped(allPorts(o), PORTS_MAX), staleTime: 15_000 });
const scriptsRead = defineQuery(scriptList, { input: (p: Subject) => ({ target: targetOf(p), query: { recursive: true } }), select: (o: unknown) => capped(allScripts(o), SCRIPTS_MAX), staleTime: 15_000 });

/** `read`: both lists answered in full ('done'), one is still out ('loading'), one could not be read ('failed'), or
 *  both answered and one held more than its MAX, so what is shown is part of it ('partial'); a computer that is not
 *  asked (not running, or none) reads 'done'. */
export interface ComputerExtras { readonly ports: readonly PortEntry[] | null; readonly scripts: readonly string[] | null; readonly read: 'loading' | 'done' | 'failed' | 'partial' }

export function useComputerExtras(computer: BoardComputer | null): ComputerExtras {
  const on = !!computer && computerState(computer.status) === 'running';
  const p: Subject = { project: computer?.project_id ?? '', computer: computer?.id ?? '', server: computer?.server_name ?? '' };
  const ports = overviewRead.use(p, { enabled: on });
  const scripts = scriptsRead.use(p, { enabled: on });
  const read = !on ? 'done' : ports.isSuccess && scripts.isSuccess ? (ports.data.capped || scripts.data.capped ? 'partial' : 'done') : ports.isError || scripts.isError ? 'failed' : 'loading';
  return { ports: on && ports.isSuccess ? ports.data.list : null, scripts: on && scripts.isSuccess ? scripts.data.list : null, read };
}

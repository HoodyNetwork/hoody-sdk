// The routes (project, server) of the computers something is moving on, kept so Transfers can still address them after
// a realm switch or a reload into another realm (transfers stay listed under their computer). Core's computer list
// only covers the shown realm. A route is kept only for a computer something moved on (the same addressing core's own
// held records store), the newest MAX_ROUTES. None is dropped for being idle: right after a reload the holds may not be
// loaded yet, and a route dropped then could not be learnt again in another realm. Stored as an account preference
// (core prefs: per account, encrypted, removed at sign-out by its registry rule hub_files_routes_v1). Written through
// core's usePrefUpdate only while the stored value reads 'ok' in this page; while it opens, failed or is locked, a route
// is kept in this page's memory and stored by a later keep once readable (useKeepRoutes). Read through useAccountPref
// plus that memory, so Transfers shows a route as soon as this page has it.
import { accountForgets, capture, heldAttempts, heldChanges, keepsChanges, onBump, sendingChanges, useAccountForgets, useAccountPref, useAttemptsVersion, useChangesVersion, useCore, usePrefUpdate } from '@core';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { FILES_LOCK, UPLOAD_BY, type FilesComputer } from '../data';
import { LINK_BY, useLinkEntries, type LinkEntry } from '../link/data';

interface Route { readonly id: string; readonly name: string; readonly project_id: string; readonly server_name: string }
const MAX_ROUTES = 50;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
/** Oldest first; anything that does not read as a route is left out. */
const parse = (raw: unknown): readonly Route[] =>
  (Array.isArray(raw) ? raw : []).map(obj).filter((x) => text(x.id) && text(x.project_id) && text(x.server_name))
    .map((x) => ({ id: text(x.id), name: text(x.name), project_id: text(x.project_id), server_name: text(x.server_name) })).slice(-MAX_ROUTES);
const KEY = 'hub_files_routes_v1';
const OPTS = { keepAtSignOut: false } as const;

// Routes core could not store (its stored value does not open here, or the browser refused): kept for this page only,
// so Check again still reaches the computer here; never written, gone at reload. Bound to one scope (account, Forget
// count, and an epoch that core's account change, sign-out or logout moves, the rule core's own changes follow; a realm
// switch keeps it): a write or an onUnsaved from an ended scope is dropped, and no later scope reads it.
let epoch = 0;
let page: { scope: string; routes: readonly Route[] } = { scope: '', routes: [] };
const pageSubs = new Set<() => void>();
const pageSub = (f: () => void) => { pageSubs.add(f); return () => { pageSubs.delete(f); }; };
const pageNow = () => page;
const scopeNow = (): string => {
  try { const a = capture().account; return a ? `${a}\n${accountForgets()}\n${epoch}` : ''; } catch { return ''; }
};
onBump((reason) => {
  if (keepsChanges(reason)) return;
  epoch += 1;
  page = { scope: '', routes: [] };
  for (const f of pageSubs) f();
});
function keepForPage(scope: string, rows: readonly FilesComputer[]): void {
  if (!scope || scope !== scopeNow()) return;
  const base = page.scope === scope ? page.routes : [];
  const next = withRoutes(base, rows);
  if (next === base && page.scope === scope) return;
  page = { scope, routes: next };
  for (const f of pageSubs) f();
}
const asRows = (rs: readonly Route[]): FilesComputer[] => rs.map((r) => ({ ...r, status: '', rules: 'unknown' as const }));

/** Each computer something is on its way, held or followed on, with the name its transfer recorded. */
export function busyComputers(entries: readonly LinkEntry[]): Map<string, string> {
  const busy = new Map<string, string>();
  const note = (id: string, name: string) => { if (id && !busy.get(id)) busy.set(id, name); };
  for (const h of [...heldChanges(FILES_LOCK), ...sendingChanges(FILES_LOCK)]) note(text(obj(h.identity).computer), text(obj(h.identity).name));
  for (const h of heldAttempts().filter((x) => x.by === UPLOAD_BY || x.by === LINK_BY)) {
    const m = obj(h.meta);
    note(text(m.computer) || text(obj(h.identity).computer), text(m.computerName) || text(m.name));
  }
  for (const e of entries) note(e.computer, e.computerName);
  return busy;
}

/** These computers' routes kept as the newest, the newest MAX_ROUTES (one with no project or server is not a route).
 *  The same list when nothing changes and they already are the newest, so nothing is written. */
export function withRoutes(v: readonly Route[], rows: readonly FilesComputer[]): readonly Route[] {
  const keep = rows.filter((x) => x.project_id && x.server_name);
  if (keep.length === 0) return v;
  const m = new Map(v.map((r) => [r.id, r]));
  const ids = new Set(keep.map((x) => x.id));
  let changed = [...m.keys()].slice(-ids.size).some((id) => !ids.has(id));
  for (const x of keep) {
    const was = m.get(x.id);
    if (!was || was.project_id !== x.project_id || was.server_name !== x.server_name || was.name !== x.name) changed = true;
  }
  if (!changed) return v;
  for (const x of keep) {
    m.delete(x.id);
    m.set(x.id, { id: x.id, name: x.name, project_id: x.project_id, server_name: x.server_name });
  }
  return [...m.values()].slice(-MAX_ROUTES);
}

/** Keep computers' routes. The store is written ONLY while it reads 'ok' in this page: while it opens,
 *  failed, or does not open here ('locked'), the routes are kept for this page and nothing is written, so an unreadable
 *  stored value is never written over. The page calls this again when the store becomes readable (its value and status
 *  are this callback's dependencies), so a busy computer's route is stored then. One core gives up (onUnsaved) is kept
 *  for this page too. */
export function useKeepRoutes(): (rows: readonly FilesComputer[]) => void {
  useCore();
  useAccountForgets();
  const scope = scopeNow();
  const { value, update, status } = usePrefUpdate(KEY, parse, { ...OPTS, onUnsaved: (wanted) => { if (wanted) keepForPage(scope, asRows(wanted)); } });
  return useCallback((rows: readonly FilesComputer[]) => {
    if (status !== 'ok') { keepForPage(scope, rows); return; }
    if (withRoutes(value, rows) === value) return;
    update((v) => withRoutes(v, rows));
  }, [value, update, status, scope]);
}

/** Keep the routes of the shown realm's busy computers. Called by the page (every tab of it), so a transfer started
 *  in Browse has its route before any realm switch. */
export function useRememberRoutes(rows: readonly FilesComputer[] | null): void {
  const a = useAttemptsVersion();
  const c = useChangesVersion();
  const entries = useLinkEntries();
  const keep = useKeepRoutes();
  useEffect(() => {
    const busy = busyComputers(entries);
    keep((rows ?? []).filter((x) => busy.has(x.id)));
  }, [rows, a, c, entries, keep]);
}

/** A busy computer outside the shown realm's list, addressed by its kept route (null: none kept or not read yet). */
export function useRoutes(): (id: string) => FilesComputer | null {
  const [v] = useAccountPref(KEY, parse, OPTS);
  useCore();
  useAccountForgets();
  const scope = scopeNow();
  const kept = useSyncExternalStore(pageSub, pageNow, pageNow);
  return useCallback((id: string) => {
    const r = v.find((x) => x.id === id) ?? (scope && kept.scope === scope ? kept.routes.find((x) => x.id === id) : undefined);
    return r ? { id, name: r.name, project_id: r.project_id, server_name: r.server_name, status: '', rules: 'unknown' } : null;
  }, [v, kept, scope]);
}

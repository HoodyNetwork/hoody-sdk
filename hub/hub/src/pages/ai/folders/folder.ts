// The folder a /ai/f link names: its path (key.ts), its realm and its computer, all from the link, never from the
// top bar. The computer is named by its handle (name.last4) and found in the account's whole computer
// list: a folder's realm is the scope its agent reads in, not the computer's realm, so no realm filter applies.
import { useEffect, useState } from 'react';
import { accountContainersRoute, computerHandle, coreSource, routingNode, stringOrEmpty as str, type SourceTable, type Target } from '@core';
import type { FolderAt } from './data';
import { folderOfKey } from './key';

const RE24 = /^[0-9a-f]{24}$/;
/** One page of the account's computers. Pages are read in turn until one comes back not full. */
export const ACCOUNT_PAGE = 100;
/** The most pages a link reads (2,000 computers). Past them the link reads as "couldn't check every computer", never as
 *  "no such computer". */
export const ACCOUNT_PAGES = 20;

/** What a folder link carries, before its computer is found; null when the link is not complete (a bad key, no
 *  computer, a realm that is not one realm or global: All realms is refused too). */
export interface FolderLink { readonly path: string; readonly handle: string; readonly realm: string }

export function folderLinkOf(segment: string | null | undefined, handle: string | null | undefined, realm: string | null | undefined): FolderLink | null {
  const path = folderOfKey(segment);
  if (!path || !handle || !realm || !(realm === 'global' || RE24.test(realm))) return null;
  return { path, handle, realm };
}

/** The key of an /ai/f path (one segment, as written: base64url carries nothing the router rewrites); null for any
 *  other path. A trailing slash is kept off: the router may add or trim one. */
export function keyOfPath(pathname: string): string | null {
  const m = /^\/ai\/f\/([^/]+)\/?$/.exec(pathname);
  return m ? m[1]! : null;
}

export interface AccountComputer { readonly id: string; readonly name: string; readonly target: Target }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** One page of the account list: its rows and whether it was full (a later page may hold more). */
export interface AccountPage { readonly rows: AccountComputer[]; readonly full: boolean }

/** The account list's rows (deduplicated by id) and whether the page was full. */
export function accountComputersOf(raw: unknown): AccountPage {
  const list = obj(obj(raw).data).computers;
  const items = Array.isArray(list) ? list : [];
  const seen = new Set<string>();
  const rows: AccountComputer[] = [];
  for (const x of items) {
    const c = obj(x);
    const id = str(c.id);
    const name = str(c.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const server = routingNode(c);
    rows.push({ id, name, target: { project: { id: str(c.project_id) }, container: server ? { id, server_name: server } : { id } } });
  }
  return { rows, full: items.length >= ACCOUNT_PAGE };
}

export type FolderComputer =
  | { readonly kind: 'pending' }
  | { readonly kind: 'error'; readonly error: unknown }
  /** No computer of the account has this handle. */
  | { readonly kind: 'missing' }
  /** Two or more computers have this handle (handles are unique only within a project): the link names none of them. */
  | { readonly kind: 'twin' }
  /** The last page read was full: more computers than were read, not all checked (a match proves nothing either). */
  | { readonly kind: 'unchecked' }
  | { readonly kind: 'found'; readonly computer: AccountComputer };

/** The one computer named `handle` across every page read, in order. A full last page proves neither a match (a
 *  computer on a later page may have the same handle: names are unique only within a project) nor its absence. */
export function computerOf(pages: readonly AccountPage[], handle: string): FolderComputer {
  if (pages.length === 0 || pages[pages.length - 1]!.full) return { kind: 'unchecked' };
  // By id: the list can move between page reads and show one computer on two pages.
  const hits = new Map<string, AccountComputer>();
  for (const p of pages) for (const c of p.rows) if (computerHandle(c) === handle) hits.set(c.id, c);
  if (hits.size === 1) return { kind: 'found', computer: [...hits.values()][0]! };
  return hits.size === 0 ? { kind: 'missing' } : { kind: 'twin' };
}

export const folderTable = {
  reads: {
    computers: {
      route: accountContainersRoute,
      input: (page: number) => ({ query: { page, limit: ACCOUNT_PAGE } }),
      select: (raw) => accountComputersOf(raw),
      staleTime: 60_000,
    },
  },
} satisfies SourceTable;

const source = coreSource('ai-folder', folderTable);

/** A page the lookup may decide on: its latest fetch succeeded and no fetch is running or paused (TanStack fetchStatus
 *  'paused' is a fetch waiting to go online). A page that is loading, refetching, paused or failed, cached data from an
 *  older answer included, is null: it may come back full where it was short, or the other way. */
function settledPage(q: { status: string; fetchStatus: string; data?: AccountPage }): AccountPage | null {
  return q.status === 'success' && q.fetchStatus === 'idle' && q.data ? q.data : null;
}

/** How many pages the lookup needs, from the pages read so far in order (null for a page not settled): through the
 *  first page that is not full, else one more, at most ACCOUNT_PAGES; null while a page it needs has not settled. */
export function pagesWanted(pages: readonly (AccountPage | null)[]): number | null {
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (!p) return null;
    if (!p.full) return i + 1;
  }
  return Math.min(pages.length + 1, ACCOUNT_PAGES);
}

/** The link's computer: read only when the link is complete, page after page while each comes back full (at most
 *  ACCOUNT_PAGES). Nothing is decided, and no page is added, on a page that has not settled (settledPage). A failed
 *  page is the error, never "missing"; Try again reads the failed pages again, and waits only while one of them is
 *  being read again. */
export function useFolderComputer(link: FolderLink | null): { state: FolderComputer; retry: () => void; retrying: boolean } {
  const [count, setCount] = useState(1);
  const qs = source.useQueries<AccountPage, number>('computers', Array.from({ length: count }, (_, i) => i + 1), { enabled: link !== null });
  const pages = qs.map(settledPage);
  const want = qs.length === count ? pagesWanted(pages) : null;
  useEffect(() => {
    if (want !== null && want !== count) setCount(want);
  }, [want, count]);
  const retry = () => {
    for (const q of qs) if (q.error) void q.refetch();
  };
  if (!link) return { state: { kind: 'missing' }, retry, retrying: false };
  const failed = qs.find((q) => q.error);
  if (failed) return { state: { kind: 'error', error: failed.error }, retry, retrying: qs.some((q) => q.error && q.fetchStatus !== 'idle') };
  if (want === null || want !== count) return { state: { kind: 'pending' }, retry, retrying: false };
  return { state: computerOf(pages as AccountPage[], link.handle), retry, retrying: false };
}

/** Where the folder's reads go, once its computer is found. */
export const folderAtOf = (link: FolderLink, c: AccountComputer): FolderAt => ({ target: c.target, realm: link.realm, cwd: link.path });

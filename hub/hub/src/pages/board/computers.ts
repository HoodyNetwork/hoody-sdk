// The computers a Board can show: the selected realm's list (core's computer list route, realm scoped), each with
// the fields a tile needs. Read only: core's shared computersPage (the shell's and the lifecycle change's read, so
// a held change's Check again has a read to prove on, and no second GET), refetched every 30 s while the Board shows.
//
// Contract, in plain words:
//   - useBoardComputers() → {rows, failed, complete, retry}: rows is null until the first answer, then the realm's computers
//     ({id, name, project_id, server_name, status, realm_ids, color}: color is the API's value as given; every style
//     that draws it normalises it through core's computerColor). failed is true when the last read failed (a tile
//     then shows "Couldn't check", never a broken frame). complete is true only when the rows are known to be the whole
//     list (one page): a computer missing from incomplete rows, or from rows a later read failed over, is unknown, never
//     "gone" or "not found". retry() reads again.
//   - handleOf(c) is the computer's short handle in links (name.last4, the one Computers uses), never the full id.
//   - computersDomain() is the page's computer proxy domain ('' when unknown: no tile URL is built then).
//   - useExpiredComputers(missing) → {rows, complete, failed, retry}: the realm's list WITH the computers whose server's
//     rental ended (the list above leaves them out: the API hides them unless include_expired is asked). `missing` names
//     the computers the Board's tiles ask about that the whole list lacks (their ids, sorted, comma-joined; '' = none:
//     nothing is read). Read once per `missing`: whenever it changes (a rental ended while the Board is open, a tile was
//     added) the read is made again, and until that read answers there is no answer (rows null, not failed): an answer
//     from before the question never judges it. Never on a timer; realm scoped like the list above. Its rows are only the ended ones, each with status 'expired' when the API says stopped (the word the tile's
//     subscription card reads; the API has no such status, it sets server_expired); any other status is kept as given.
//     rows null: no answer yet. complete: one page, so a computer missing from it is in no list. Later pages are not
//     read: a list of several pages never proves absence (core useComputersAll's rule: offset pages read at different
//     moments can skip a row), so past 100 rows a computer on no page stays "couldn't check" either way.
import { commerce, computersPage, computersPageOf, containersRoute, defineQuery, proxyDomain, routingNode, stringOrEmpty as str } from '@core';
import type { PageLink } from '@kit';
import { useEffect, useMemo, useState } from 'react';
import type { ComputerRow } from '@core';

export interface BoardComputer extends ComputerRow {
  readonly id: string;
  readonly name: string;
  readonly project_id: string;
  readonly server_name: string;
  readonly status: string;
  /** The computer's own colour as the API gives it (raw: only core's computerColor turns it into a style). */
  readonly color?: string;
  /** Whether its server can run full virtual machines (vmSupportOf); left out: not read. */
  readonly vm?: VmSupport;
}

/** Whether a computer's server can run full virtual machines (/dev/kvm), from the row's server snapshot:
 *  'shared' a free or paid slice of a shared host (core's plan kind, the top bar's: never KVM); on a rented bare-metal
 *  server its last KVM check: 'ready' supported, 'none' not supported, 'unchecked' not checked in the last hour
 *  (the API's null); 'unknown' when the row carries no server. */
export type VmSupport = 'shared' | 'ready' | 'none' | 'unchecked' | 'unknown';

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function vmSupportOf(raw: unknown): VmSupport {
  const kind = commerce.planChip(raw, null, {} as never).kind;
  if (kind === null) return 'unknown';
  if (kind !== 'bare_metal') return 'shared';
  const kvm = obj(obj(raw).server).kvm_supported;
  return kvm === true ? 'ready' : kvm === false ? 'none' : 'unchecked';
}

export function computerOf(raw: unknown): BoardComputer | null {
  const c = obj(raw);
  const id = str(c.id);
  if (!id) return null;
  const realms = Array.isArray(c.realm_ids) ? c.realm_ids.filter((x): x is string => typeof x === 'string') : undefined;
  return { id, name: str(c.name) || id.slice(-4), project_id: str(c.project_id), server_name: routingNode(c), status: str(c.status), vm: vmSupportOf(raw), ...(realms ? { realm_ids: realms } : {}), ...(typeof c.color === 'string' ? { color: c.color } : {}) };
}

const REFETCH_MS = 30_000;
const toRows = (list: readonly unknown[]): BoardComputer[] => list.map(computerOf).filter((c): c is BoardComputer => c !== null);

export interface BoardComputers {
  readonly rows: readonly BoardComputer[] | null;
  readonly failed: boolean;
  /** The rows are known to be the whole list. False: more pages, or no answer yet. */
  readonly complete: boolean;
  readonly loading: boolean;
  /** The last read's rejection while `failed` (for an error's Details); undefined otherwise. */
  readonly error: unknown;
  retry(): void;
}

export function useBoardComputers(): BoardComputers {
  const q = computersPage.use(undefined, { refetchInterval: REFETCH_MS });
  return useMemo(
    () => ({ rows: q.data ? toRows(q.data.rows) : null, failed: q.isError, complete: q.data?.complete === true, loading: q.isLoading || q.isFetching, error: q.isError ? q.error : undefined, retry: () => void q.refetch() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, q.isError, q.isLoading, q.isFetching, q.error],
  );
}

/** A row of the list read with include_expired whose server's rental ended (server_expired true), as a Board computer;
 *  null for any other row. A stopped one gets the status 'expired'; any other status (host_reinstalled, failed) stays. */
export function expiredComputerOf(raw: unknown): BoardComputer | null {
  if (obj(raw).server_expired !== true) return null;
  const c = computerOf(raw);
  if (!c) return null;
  return c.status.toLowerCase() === 'stopped' ? { ...c, status: 'expired' } : c;
}

/** What the Board knows about computers the list leaves out because their server's rental ended (useExpiredComputers). */
export interface ExpiredComputers {
  /** The ended computers of the answer; null until one answer came. */
  readonly rows: readonly BoardComputer[] | null;
  /** The answer is the whole list (one page): a computer in neither list is known to be absent. */
  readonly complete: boolean;
  /** The last read failed (rows, when kept, may be old). */
  readonly failed: boolean;
  retry(): void;
}

// The same route and realm scope as the list above, with the ended computers: one page, read only while asked.
const withExpired = defineQuery(containersRoute, { input: () => ({ query: { page: 1, limit: 100, include_expired: true } }), select: computersPageOf, staleTime: REFETCH_MS });

export function useExpiredComputers(missing: string): ExpiredComputers {
  const on = missing !== '';
  const q = withExpired.use(undefined, { enabled: on });
  // The question now, and what the read had (its last answer's and last failure's times) when it was first asked:
  // only an answer or a failure newer than that speaks to it.
  const [asked, setAsked] = useState({ missing: '', data: 0, error: 0 });
  if (asked.missing !== missing) setAsked({ missing, data: q.dataUpdatedAt, error: q.errorUpdatedAt });
  const since = asked.missing === missing ? asked : null;
  useEffect(() => {
    // The read already answered or failed for an earlier question: read again. A first read is the query's own.
    if (missing !== '' && (q.dataUpdatedAt > 0 || q.errorUpdatedAt > 0)) void q.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);
  const data = on && since !== null && q.data !== undefined && q.dataUpdatedAt > since.data ? q.data : undefined;
  const failed = on && since !== null && q.isError && q.errorUpdatedAt > since.error;
  return useMemo(
    () => ({
      rows: data ? data.rows.map(expiredComputerOf).filter((c): c is BoardComputer => c !== null) : null,
      complete: data?.complete === true,
      failed,
      retry: () => { if (on) void q.refetch(); },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [on, data, failed],
  );
}

/** `name.abcd`: the name and the last four characters of the id. */
export const handleOf = (c: Pick<BoardComputer, 'id' | 'name'>): string => `${c.name}.${c.id.slice(-4)}`;

export function findByHandle(list: readonly BoardComputer[], handle: string): BoardComputer | undefined {
  const dot = handle.lastIndexOf('.');
  if (dot < 1) return undefined;
  const name = handle.slice(0, dot), tail = handle.slice(dot + 1);
  return tail.length === 4 ? list.find((c) => c.name === name && c.id.endsWith(tail)) : undefined;
}

/** The Computers page link with the computer selected (`?sel=` its handle), so it opens on that computer. */
export const computersAt = (link: PageLink, c: BoardComputer | null): PageLink => (link.kind === 'hub' ? { kind: 'hub', href: link.href + (c ? `?sel=${encodeURIComponent(handleOf(c))}` : '') } : link);

/** The computer proxy domain (core's; fixture mode sets a clearly fake one, so every state is drawable). */
export const computersDomain = (): string => proxyDomain();

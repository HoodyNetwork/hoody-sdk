// LinkHost: what a reply's links are read against. A chat host (the AI page, the
// dock, the Board's chat tile: ChatLinkHost) provides the realm, the chat's computers and the realm's computer list, which it reads
// only once a reply shows a link on some computer (`want`); without a host a reply draws its links as plain links (no marks). The kit never imports a page: a host that can put a link on its Board passes
// `boardAdd` (the Board's Add link for a target), and Hub pages, that link included, open through the host's `openHub`.
//
//   markOf(read, host)  the mark one link gets, or null (no mark: outside links, aliases, blocked text, program API paths, a link
//                       with credentials, a family not marked here). Pure, so the own check and the label are tested
//                       without a page.
//
// A local address is read on the computer the chat
// runs on: `atlas · port 3000`, its tooltip naming what was written. Open checks that computer's listeners first (one read, when
// pressed: LocalPort.tsx) and offers the real port's address, keeping the path and query, only for a web listener; a program
// listening only inside the computer gets the card that says so, with Ask the agent to fix it where the host has a draft. Without
// a computer the chat runs on, or when that computer is not proven yours, the address stays as written, Copy only.
//
// "Own?": the link's project and computer are a row of the host's list for this realm. Not listed, someone else's and a
// list that failed all read "Another computer" (the masked host shown), never opened in a frame or put on a Board; a failed list
// adds Try again. One of the chat's own computers missing from a whole list is "no longer in this realm". Listed but not running:
// the label says its state.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildPortUrl, computerState, maskAddress, useComputersAll, useCore, type ComputerState, type LinkRead } from '@core';

/** One of the chat's computers: where it lives (its record) and where it runs (its work). On the AI page, the dock and a Board chat
 *  tile both are the chat's binding. */
export interface HostComputer {
  readonly id: string;
  readonly project: string;
  readonly name: string;
  readonly server?: string;
}

/** A row of the realm's computer list as the host holds it (core's ComputerWire fields). */
export interface HostRow {
  readonly id: string;
  readonly project_id?: string;
  readonly name?: string;
  readonly status?: unknown;
  /** The row's routing node (core routingNode): a local address's real port is built on it. */
  readonly server_name?: string;
}

export interface HostComputers {
  /** null until the list answers. */
  readonly rows: readonly HostRow[] | null;
  /** The list is whole: a computer missing from rows is not in this realm. */
  readonly complete: boolean;
  /** The last read failed (rows already shown are kept). */
  readonly failed: boolean;
  readonly retry?: () => void;
}

/** What a host's Board button is given. */
export interface LinkTarget {
  readonly href: string;
  readonly label: string;
  readonly family: 'program' | 'port';
  readonly project: string;
  readonly computer: string;
  readonly name: string;
  readonly n: string;
  /** A web port's page below `/` (the Board keeps a plain route only: LinkMark leaves anything else at `/`). */
  readonly path?: string;
}

export interface LinkHostValue {
  readonly realm: string;
  readonly lives: HostComputer | null;
  readonly runs: HostComputer | null;
  /** The realm's computer list, or null when the host holds none (every link then reads "Another computer"). */
  readonly computers: HostComputers | null;
  /** A reply shows a link on some computer: read the list if not read yet. */
  readonly want?: () => void;
  /** The Board's Add link for a target the host's Board can hold (Put on Board in the mark's ⋯ opens it), or ''. */
  readonly boardAdd?: (target: LinkTarget) => string;
  /** Opens a Hub page (`/schedules`, `/scripts`, a Hub link's page) in this Hub. */
  readonly openHub: (path: string) => void;
  /** Puts words in the chat's draft (never sends them): Ask the agent to fix it, on a port that listens only inside. */
  readonly ask?: (text: string) => void;
}

const Host = createContext<LinkHostValue | null>(null);
/** Provides the host to every reply under it. A function, not `Host.Provider` read at load: a kit module does nothing at
 *  load (kitpure). */
export function LinkHost({ value, children }: { value: LinkHostValue | null; children?: ReactNode }) {
  return <Host.Provider value={value}>{children}</Host.Provider>;
}
/** The host, or null outside one. */
export const useLinkHost = (): LinkHostValue | null => useContext(Host);

const READING: HostComputers = { rows: null, complete: false, failed: false };

/** Reads the realm's computer list (core's useComputersAll, the list the Hub already reads) and hands it up. Mounted only once a
 *  reply wants it, so a chat without such links reads nothing. */
function ListReader({ onList }: { onList: (list: HostComputers) => void }) {
  const { rows: wire, complete, failed, retry } = useComputersAll();
  const rows = useMemo(
    () =>
      wire?.flatMap((r): HostRow[] =>
        typeof r.id === 'string' ? [{ id: r.id, ...(typeof r.project_id === 'string' ? { project_id: r.project_id } : {}), ...(typeof r.name === 'string' ? { name: r.name } : {}), ...(typeof r.server_name === 'string' ? { server_name: r.server_name } : {}), status: r.status }] : [],
      ) ?? null,
    [wire],
  );
  useEffect(() => onList({ rows, complete, failed, retry }), [onList, rows, complete, failed, retry]);
  return null;
}

/** What a chat host is given. `chat`, `openHub` and `boardAdd` should be stable (memoised) so replies keep their marks between
 *  draws; the object itself may be new each draw. */
export interface ChatHost {
  readonly chat: HostComputer | null;
  readonly realm: string;
  readonly openHub: (path: string) => void;
  readonly boardAdd?: LinkHostValue['boardAdd'] | undefined;
  readonly ask?: LinkHostValue['ask'] | undefined;
}

/** A chat host: the chat's one computer both lives and runs there (the AI page, the dock and a Board chat tile hold one computer
 *  per chat). The realm's list is read only when core reads that realm and a reply wants it; otherwise every link reads "Another
 *  computer". */
export function ChatLinkHost({ value: { chat, realm, openHub, boardAdd, ask }, children }: { value: ChatHost; children: ReactNode }) {
  const same = useCore().realm === realm;
  const [wanted, setWanted] = useState(false);
  // The list as read, tagged with its realm so a switch never shows the last realm's rows.
  const [got, setGot] = useState<{ realm: string; list: HostComputers } | null>(null);
  const onList = useCallback((list: HostComputers) => setGot({ realm, list }), [realm]);
  const want = useCallback(() => setWanted(true), []);
  const reading = same && wanted;
  // A list read before is dropped once reading stops (a realm switch away), so coming back shows "checking" until the new
  // reader reports, never the old rows.
  useEffect(() => {
    if (!reading) setGot(null);
  }, [reading]);
  const computers = reading ? (got?.realm === realm ? got.list : READING) : null;
  const value = useMemo<LinkHostValue>(
    () => ({ realm, lives: chat, runs: chat, computers, want, openHub, ...(boardAdd ? { boardAdd } : {}), ...(ask ? { ask } : {}) }),
    [realm, chat, computers, want, openHub, boardAdd, ask],
  );
  return (
    <Host.Provider value={value}>
      {reading && <ListReader key={realm} onList={onList} />}
      {children}
    </Host.Provider>
  );
}

export type LinkOwner =
  | { readonly k: 'own'; readonly name: string; readonly state: ComputerState }
  | { readonly k: 'gone'; readonly name: string }
  | { readonly k: 'other' }
  | { readonly k: 'failed' }
  | { readonly k: 'reading' };

/** Whose computer a link's host names, by the host's list for its realm. */
export function ownerOf(read: Pick<LinkRead, 'project' | 'computer'>, host: Pick<LinkHostValue, 'computers' | 'lives' | 'runs'>): LinkOwner {
  const { project, computer } = read;
  const list = host.computers;
  if (!project || !computer || !list) return { k: 'other' };
  // A failed read proves nothing, even with rows kept from an earlier one.
  if (list.failed) return { k: 'failed' };
  // The row must name the same project: a row without one proves nothing about the link's project.
  const row = list.rows?.find((r) => r.id === computer && r.project_id === project);
  if (row) return { k: 'own', name: row.name || maskAddress(computer), state: computerState(row.status) };
  if (list.rows === null) return { k: 'reading' };
  const mine = [host.lives, host.runs].find((c) => c && c.id === computer && c.project === project);
  // Gone only when no row has that computer at all: a row that names no project is there, just not proven (another computer).
  if (mine && list.complete && !list.rows?.some((r) => r.id === computer)) return { k: 'gone', name: mine.name };
  return { k: 'other' };
}

/** The Hub page each kit host opens, by its name; a kit host with none is marked for Copy only. */
export const KIT_PAGES: Readonly<Record<string, string>> = { cron: '/schedules', logs: '/logs', tunnel: '/tunnels', notifications: '/notifications' };

export type MarkKind = 'program' | 'place' | 'port' | 'local' | 'script' | 'kit' | 'hub' | 'other';

/** A local address read on the computer the chat runs on: what Open checks (LocalPort.tsx). */
export interface LocalOpen {
  readonly k: 'local';
  readonly computer: string;
  readonly project: string;
  readonly port: number;
  /** The real port's address with the written path, query and fragment: offered only once the check finds a web listener. */
  readonly href: string;
  /** The Board can hold it: an http port (https ports are Copy only on the Board). */
  readonly board: LinkTarget | null;
}

/** What one marked link shows and does. `what` is the thing on the computer (`Terminal 3`, `port 3000`, `/orders/list`); the
 *  component words it. */
export interface Mark {
  readonly kind: MarkKind;
  readonly key: string;
  readonly owner: LinkOwner | null;
  /** The computer's name, for own and gone. */
  readonly name: string;
  readonly what: { readonly k: 'program'; readonly program: string; readonly n: string } | { readonly k: 'place'; readonly place: string } | { readonly k: 'port'; readonly n: string } | { readonly k: 'path'; readonly path: string } | { readonly k: 'kit'; readonly kit: string } | { readonly k: 'hub' } | { readonly k: 'masked'; readonly host: string } | { readonly k: 'written' };
  /** A local address: what was written (`localhost:3000`), shown in the tooltip, or as the label when it is not read. */
  readonly written?: string;
  /** What Open does: a new tab on the address, a Hub page, a local address's check, or nothing (Copy only). */
  readonly open: { readonly k: 'tab'; readonly href: string } | { readonly k: 'hub'; readonly path: string } | LocalOpen | null;
  /** A script's own address, run in a new tab from ⋯ only. */
  readonly runTab: string | null;
  readonly copy: string;
  readonly board: LinkTarget | null;
  readonly retry: boolean;
}

const PLACE_PROGRAMS = ['files', 'notes'];

/** The last segment of a program page's path, or '' (the program's start page). */
function placeOf(href: string): string {
  try {
    const parts = new URL(href).pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    return last ? decodeURIComponent(last) : '';
  } catch {
    return '';
  }
}

const pathOf = (href: string): string => {
  try { return new URL(href).pathname || '/'; } catch { return '/'; }
};

/** The Hub page path of a Hub link (`/auth/home#/vault?sel=x` → `/vault?sel=x`). */
function hubPath(href: string): string {
  const i = href.indexOf('#');
  return i >= 0 ? href.slice(i + 1) || '/' : '/';
}

/** The port a local address names (its scheme's own when it names none), or 0 when it is not one a computer can listen on. */
function localPort(u: URL): number {
  const n = u.port === '' ? (u.protocol === 'https:' ? 443 : 80) : Number(u.port);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 0;
}

/** A local address as written, for the tooltip and the unread label: `localhost:3000`, `127.0.0.1:8080/api`. */
function writtenOf(u: URL): string {
  const path = u.pathname === '/' && !u.search && !u.hash ? '' : u.pathname + u.search + u.hash;
  return u.host + path;
}

/** The mark of a local address: read on the computer the chat runs on, never on the person's own machine. */
function localMark(read: LinkRead, host: Pick<LinkHostValue, 'computers' | 'lives' | 'runs'>): Mark | null {
  let u: URL;
  try { u = new URL(read.href); } catch { return null; }
  const port = localPort(u);
  if (!port) return null;
  const written = writtenOf(u);
  const runs = host.runs;
  const key = `local|${runs?.project ?? ''}|${runs?.id ?? ''}|${port}|${u.pathname}`;
  const plain = (owner: LinkOwner | null, retry: boolean): Mark => ({ kind: 'local', key, owner, name: '', what: { k: 'written' }, written, open: null, runTab: null, copy: read.href, board: null, retry });
  if (!runs) return plain(null, false);
  const owner = ownerOf({ project: runs.project, computer: runs.id }, host);
  if (owner.k === 'reading') return plain(owner, false);
  if (owner.k !== 'own' && owner.k !== 'gone') return plain(null, owner.k === 'failed');
  // Only a whole list proves the computer is current and yours: a partial walk may keep an old row.
  if (owner.k === 'own' && !host.computers?.complete) return plain(null, false);
  const what = { k: 'port', n: String(port) } as const;
  const base = { kind: 'local', key, owner, name: owner.name, what, written, runTab: null, copy: read.href, retry: false } as const;
  if (owner.k === 'gone' || owner.state !== 'running') return { ...base, open: null, board: null };
  const row = host.computers?.rows?.find((r) => r.id === runs.id && r.project_id === runs.project);
  const scheme = u.protocol === 'https:' ? 'https' : 'http';
  // The address is built from the list row only: the chat's own binding may name an old node.
  const origin = row?.server_name ? buildPortUrl({ id: runs.project }, { id: runs.id, server_name: row.server_name }, scheme, port) : null;
  if (!origin) return { ...base, open: null, board: null };
  const href = origin + u.pathname + u.search + u.hash;
  const board: LinkTarget | null = scheme === 'http' ? { href, label: '', family: 'port', project: runs.project, computer: runs.id, name: 'http', n: String(port), path: u.pathname } : null;
  return { ...base, open: { k: 'local', computer: runs.id, project: runs.project, port, href, board }, board: null };
}

/** The mark of one link read against a host, or null for a link that gets none. */
export function markOf(read: LinkRead, host: Pick<LinkHostValue, 'computers' | 'lives' | 'runs'>): Mark | null {
  if (read.text || read.credentials || read.api) return null;
  if (read.family === 'local') return localMark(read, host);
  const href = read.href;
  if (read.family === 'hub') return { kind: 'hub', key: href, owner: null, name: '', what: { k: 'hub' }, open: { k: 'hub', path: hubPath(href) }, runTab: null, copy: href, board: null, retry: false };
  if (read.family !== 'program' && read.family !== 'port' && read.family !== 'script' && read.family !== 'kit' && read.family !== 'shaped') return null;
  const owner = ownerOf(read, host);
  const key = `${read.project ?? ''}|${read.computer ?? ''}|${read.name ?? ''}|${read.n ?? ''}|${read.family === 'program' || read.family === 'port' ? pathOf(href) : ''}`;
  if (owner.k !== 'own' && owner.k !== 'gone') {
    return { kind: 'other', key, owner, name: '', what: { k: 'masked', host: maskAddress(read.host) }, open: { k: 'tab', href }, runTab: null, copy: href, board: null, retry: owner.k === 'failed' };
  }
  const live = owner.k === 'own' && owner.state === 'running';
  const base = { key, owner, name: owner.name, copy: href, retry: false, runTab: null };
  const target = (family: 'program' | 'port'): LinkTarget | null =>
    live && read.project && read.computer && read.name && read.n ? { href, label: '', family, project: read.project, computer: read.computer, name: read.name, n: read.n } : null;
  // A web port keeps its page on the Board: the path only, which the Board's port tile holds.
  const portTarget = (): LinkTarget | null => {
    const t = target('port');
    return t ? { ...t, path: pathOf(href) } : null;
  };
  switch (read.family) {
    case 'program': {
      const place = PLACE_PROGRAMS.includes(read.name ?? '') ? placeOf(href) : '';
      return place
        ? { ...base, kind: 'place', what: { k: 'place', place }, open: { k: 'tab', href }, board: target('program') }
        : { ...base, kind: 'program', what: { k: 'program', program: read.name ?? '', n: read.n ?? '' }, open: { k: 'tab', href }, board: target('program') };
    }
    case 'port':
      // https ports: Copy only until a port tile can hold https.
      return read.name === 'https'
        ? { ...base, kind: 'port', what: { k: 'port', n: read.n ?? '' }, open: null, board: null }
        : { ...base, kind: 'port', what: { k: 'port', n: read.n ?? '' }, open: { k: 'tab', href }, board: portTarget() };
    case 'script':
      return { ...base, kind: 'script', what: { k: 'path', path: pathOf(href) }, open: { k: 'hub', path: '/scripts' }, runTab: href, board: null };
    case 'kit': {
      const page = KIT_PAGES[read.name ?? ''];
      return { ...base, kind: 'kit', what: { k: 'kit', kit: read.name ?? '' }, open: page ? { k: 'hub', path: page } : null, board: null };
    }
    default:
      return null;
  }
}

/** At most this many marks per reply (keeping noise down). */
export const MARKS_MAX = 8;

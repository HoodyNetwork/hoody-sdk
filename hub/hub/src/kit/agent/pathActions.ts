// pathActions.ts: what a path's menu (PathMark) offers beside Copy path, decided on the
// conversation's computer. Once the menu opens, the path is stat'ed there (core fileStat, read-only); a `~/` path is first
// written against that computer's agent home folder (core agentHome, read once per computer), never the browser's.
//
//   folder → Open (Files at the folder), Show in Files (its parent, the folder selected), Open a terminal here (the folder)
//   file   → Open (Files' Preview of it), Show in Files (its folder, the file selected), Open a terminal here (its folder)
//
// Each opens Files through the host (`/files?computer=&path=&select=&open=`, startHref); the terminal is Files' own Open
// terminal here, which the person still confirms. Without the chat's computer, in another realm than the Hub shows, or when
// the check or the home folder can't answer, only Copy path is offered, with one line saying why.
import { agentHome, computerHandle, expandHome, fileStat, statParts, statProblem, useCore, type PathKind, type StatProblem, type Target } from '@core';
import type { MenuAction } from '../overlays/Overlays';
import { useStrings } from '../strings';
import { useLinkHost, type HostComputer } from './linkHost';
import strings from './LinkMark.strings.en.json';

export type PathCheck =
  | { readonly k: 'checking' }
  | { readonly k: 'none'; readonly why: 'noComputer' | 'otherRealm' | 'home' | StatProblem | 'other' }
  | { readonly k: 'ok'; readonly kind: Exclude<PathKind, 'other'>; readonly path: string };

const FILES = '/files';
const targetOf = (c: HostComputer): Target | null => (c.server ? { project: { id: c.project }, container: { id: c.id, server_name: c.server } } : null);
const parentOf = (p: string): string => (p.lastIndexOf('/') <= 0 ? '/' : p.slice(0, p.lastIndexOf('/')));
const nameOf = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/** The Files address a choice opens: pane A on the computer at `path`, optionally a row and a one-time ask. `cid`, the
 *  computer's exact id, makes Files open that computer only (never another with the same handle). */
export function filesHref(base: string, handle: string, path: string, more: { cid?: string; select?: string; open?: 'preview' | 'here' } = {}): string {
  const q = new URLSearchParams({ computer: handle });
  if (more.cid) q.set('cid', more.cid);
  if (path !== '/') q.set('path', path);
  if (more.select) q.set('select', more.select);
  if (more.open) q.set('open', more.open);
  return `${base}?${q.toString()}`;
}

/** Where `path` would be checked, read with no request: the conversation's computer and Files' path, and `pre`, the answer
 *  when there is nothing to check there (no computer, another realm), so no probe is mounted. */
export interface PathPlace { readonly computer: HostComputer | null; readonly target: Target | null; readonly realm: string; readonly files: string; readonly pre: PathCheck | null }

export function usePathPlace(): PathPlace {
  const host = useLinkHost();
  const shown = useCore().realm;
  const c = host?.runs ?? null;
  const target = c ? targetOf(c) : null;
  const none = (why: Extract<PathCheck, { k: 'none' }>['why']): PathCheck => ({ k: 'none', why });
  // Files opens the computer the link names by its exact id (cid), and drops the ask with "can't tell which computer" when
  // that id is not a computer of this realm (pages/files). The chat's list of computers is a hint only: nothing in it
  // refuses the menu, a twin with the same handle included, as the exact id tells them apart.
  const pre = !c || !target ? none('noComputer') : host!.realm !== shown ? none('otherRealm') : null;
  // Files' Hub path, named as the kit's other chat links name theirs (kit/agent reads no shell page table).
  return { computer: c, target, realm: host?.realm ?? '', files: FILES, pre };
}

/** The check of `path` on the place's computer (a place with no `pre`): its home folder first for a `~/` path, then a stat.
 *  Called only by PathMark's probe, mounted while the menu is open, so nothing is read before a person opens it. */
export function usePathProbe(path: string, target: Target, realm: string): PathCheck {
  const tilde = path === '~' || path.startsWith('~/');
  const home = agentHome.use({ target, realm }, { enabled: tilde });
  const homePath = tilde ? (home.data ?? null) : null;
  const parts = tilde ? null : statParts(path);
  const abs = tilde ? (homePath ? expandHome(path, homePath) : null) : parts ? '/' + parts.join('/') : null;
  const stat = fileStat.use({ target, path: abs ?? '/' }, { enabled: abs !== null });
  const none = (why: Extract<PathCheck, { k: 'none' }>['why']): PathCheck => ({ k: 'none', why });
  if (tilde && home.isError) return none('home');
  if (tilde && home.isPending) return { k: 'checking' };
  if (abs === null) return none(tilde ? 'home' : 'failed');
  if (stat.isError) return none(statProblem(stat.error));
  if (stat.data === undefined) return { k: 'checking' };
  return stat.data === 'other' ? none('other') : { k: 'ok', kind: stat.data, path: abs };
}

/** What one probe's answer is for: this opening of the menu, on this computer and realm, for this path. An answer for any
 *  other (an earlier opening, another path or computer) is never shown: the menu says it is checking until its own lands. */
export const probeKey = (opening: number, place: PathPlace, path: string): string =>
  JSON.stringify([opening, place.target?.container.id ?? null, place.target?.container.server_name ?? null, place.realm, path]);

/** A probe's answer, bound to the probe it came from (probeKey). */
export interface Probed { readonly key: string; readonly check: PathCheck }

/** Two answers say the same of the same probe (a probe's state is set only when that changes). */
export const sameProbed = (a: Probed | null, b: Probed): boolean => !!a && a.key === b.key && JSON.stringify(a.check) === JSON.stringify(b.check);

/** The menu's items besides Copy path, and the line under Copy path that says why there are none (or that they are coming). */
export function usePathActions(place: PathPlace, check: PathCheck): { items: MenuAction[]; why: string | undefined } {
  const t = useStrings(strings);
  const host = useLinkHost();
  const { computer, files } = place;
  const name = computer?.name ?? '';
  if (check.k === 'checking') return { items: [], why: t('path.checking', { name }) };
  if (check.k === 'none') return { items: [], why: t(`path.why.${check.why}`, { name }) };
  if (!host || !computer) return { items: [], why: undefined };
  const handle = computerHandle(computer);
  const go = (href: string) => () => host.openHub(href);
  const p = check.path;
  const dir = check.kind === 'folder' ? p : parentOf(p);
  // The chat knows its computer's id: every link names it, so Files resolves that computer alone.
  const at = (where: string, more: { select?: string; open?: 'preview' | 'here' } = {}) => filesHref(files, handle, where, { cid: computer.id, ...more });
  const atParent = p === '/' ? at('/') : at(parentOf(p), { select: nameOf(p) });
  const open = check.kind === 'folder' ? at(p) : at(parentOf(p), { select: nameOf(p), open: 'preview' });
  return {
    items: [
      { id: 'open', label: t('path.open'), icon: check.kind === 'folder' ? 'files' : 'eye', onAction: go(open) },
      { id: 'show', label: t('path.show'), icon: 'files', onAction: go(atParent) },
      { id: 'here', label: t('path.terminal'), icon: 'terminal', opens: true, onAction: go(at(dir, { open: 'here' })) },
    ],
    why: undefined,
  };
}

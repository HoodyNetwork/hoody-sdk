// Public hrefs of the scripts page: the only file other pages may import from this folder.
import { EXEC_DEFAULT } from '@core';
import { aliasesFor, excluded, execOf, friendlyName, fromHandoff, inFolder, isScript, itemId, routeWords } from './logic';
import { describeFile } from './routePattern';

export const links = {
  list: '/scripts',
  new: '/scripts/new',
  item: (id: string) => `/scripts?sel=${encodeURIComponent(id)}`,
  /** One script selected on the page: `handle` is its computer's (core computerHandle), `rootRel` its root-relative path;
   *  a folder other than 1 adds ?exec=. null when it could not select a script: no handle, or a path the page does not list as a
   *  script (outside a folder, not .ts/.js, or under a reserved folder: the same filter as scriptRows). */
  script: (handle: string, rootRel: string): string | null => {
    const n = execOf(rootRel);
    if (!handle || n === null || inFolder(rootRel) === null || !isScript(rootRel) || excluded(rootRel)) return null;
    return `/scripts?sel=${encodeURIComponent(itemId(handle, rootRel))}${n !== EXEC_DEFAULT ? `&exec=${n}` : ''}`;
  },
} as const;

// The script path and the Schedules hand-off code, one implementation for every page that links here.
export { itemId, normRel, toHandoff, fromHandoff } from './logic';

/** A dynamic or catch-all script (`users/[id].ts`) in the words the Scripts page lists it by ("Users by id"), from its root-relative path;
 *  null for a static address (its file name says it), a file exec does not serve, or a path outside a folder. */
export function routeName(rootRel: string): string | null {
  const info = describeFile(inFolder(rootRel));
  return info ? routeWords(info) : null;
}

/** A hand-off script path (folder 1, scope-relative, as Logs and Schedules carry it) in the Scripts page's words: a dynamic or
 *  catch-all one by routeName, anything else as given. */
export function handoffName(script: string): string {
  const rootRel = fromHandoff(script);
  return (rootRel !== null ? routeName(rootRel) : null) ?? script;
}

/** How Exec picks among the scripts a path matches: a plain address first, then a parameter, then a catch-all. */
const ROUTE_ORDER = ['static', 'param', 'catchAll', 'optionalCatchAll'] as const;

/**
 * The script a public link opens (an exec alias: its folder and its path), from that folder's script list (the list read's
 * rows, root-relative paths, labels from their magic comments), in the Scripts page's words: its path and the name the
 * page lists it by. The same match as the script's own Public link list (aliasesFor); when several scripts match the
 * path, the one Exec routes to (a plain address before a parameter before a catch-all), and none when that is a tie.
 * null for a link whose caller picks the path, or when no listed script answers the path (deleted or moved).
 */
export function scriptOfLink(
  rows: readonly { path?: string; magicComments?: { label?: string } }[],
  link: { index: number; target: string; anyPath?: boolean },
): { rootRel: string; name: string } | null {
  if (link.anyPath) return null;
  const alias = { id: 'link', url: '', program: 'exec', index: link.index, target_path: link.target, allow_path_override: false, enabled: true };
  const hits = rows.filter((r) => {
    const p = r.path ?? '';
    return isScript(p) && !excluded(p) && inFolder(p) !== null && aliasesFor([alias], p).length > 0;
  });
  for (const kind of ROUTE_ORDER) {
    const at = hits.filter((r) => describeFile(inFolder(r.path ?? ''))?.kind === kind);
    if (at.length === 1) return { rootRel: at[0]!.path!, name: friendlyName(at[0]) };
    if (at.length > 1) return null;
  }
  return null;
}

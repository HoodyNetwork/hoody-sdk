// The apps launcher's public hrefs and constants (split out of links.ts so the terminal build shares them). links.ts
// stays the file other pages import: it re-exports every name here and keeps useOpenWithEntry (it reads the page's
// address).


/** The launcher in the Apps tab's URL: `launch=1` is the find drawer open, `launchq` the words typed in, `gh`
 *  From GitHub's Ready step (GH_PARAM below). AppsSection
 *  reads these keys and every link here writes them; nothing else spells them. */
export const LAUNCH_PARAM = 'launch';
export const LAUNCH_Q = `${LAUNCH_PARAM}q`;
/** The launcher's keys as search params: for a place on Programs that opens it in its own Apps tab ("Run an app"),
 *  and for links.find. Words only when there are some. */
export const launchSearch = (q?: string): Record<string, string> => ({ [LAUNCH_PARAM]: '1', ...(q ? { [LAUNCH_Q]: q } : {}) });
/** From GitHub's Ready step in the launcher: `gh=` names a library program by its
 *  id or any repository by its address after github.com (github/ready.ts reads it back strictly). A program, never words
 *  typed in the box. */
export const GH_PARAM = 'gh';
const query = (p: Record<string, string>): string => Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

export const links = {
  list: '/programs?tab=apps',
  /** Launch an app: the Apps tab with the launcher open, nothing typed in. */
  launch: `/programs?tab=apps&${query(launchSearch())}`,
  /** The open apps, one selected (its short key). */
  app: (key: string) => `/programs?tab=apps&appsel=${encodeURIComponent(key)}`,
  /** Launch an app, with a query typed in. */
  find: (q: string) => `/programs?tab=apps&${query(launchSearch(q))}`,
  /** Launch an app on From GitHub's Ready step for a library program's id or an address after github.com. */
  github: (key: string) => `/programs?tab=apps&${query({ ...launchSearch(), [GH_PARAM]: key })}`,
} as const;

/** The launcher for other pages, loaded on demand (pages import only links.ts): Programs' Apps tab (AppsSection),
 *  the Board's Add a program step (AppLauncher) and its tiles' hold (LaunchHold). See launch/index.ts. */
export const loadLauncher = () => import('./launch');

/** The longest program word a launch's row name starts with ("ImageMagick Display", "Command"…): pinned by a test. */
export const OW_PROGRAM_MAX = 24;
/** A file label's budget in UTF-16 units, so "‹program› · ‹label›" fits the stored row name (80 units, recent.ts). */
export const OW_LABEL_UNITS = 80 - OW_PROGRAM_MAX - 3;

/** What the row menu's Open in ‹Last used› names: the remembered template, or the person's own command. */
export type OwLast = { kind: 'tpl'; name: string } | { kind: 'cmd' };

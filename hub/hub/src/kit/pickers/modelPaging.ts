// The model chooser's render budget: fixed page sizes per section, replacement pages (a page replaces
// a section's rows, never appends), and each view's maximum row count with every section at a full page and every
// control shown. A row is one option, one provider card or row, or one action button in a list; static chrome
// (search, headings, Back, consent bar) is not counted. No virtualization: every view stays under VIEW_ROWS.

export const VIEW_ROWS = 250;

export const PAGE = {
  /** Ready view: provider groups per page, options per group. */
  readyGroups: 8,
  groupOptions: 5,
  ensembles: 5,
  claude: 5,
  /** Directory sections. */
  attention: 24,
  connected: 24,
  suggested: 5,
  all: 24,
  otherWays: 2,
  /** A provider's (or the ensembles', or Claude Code's) drill-in. */
  drillIn: 100,
  /** Search results. */
  searchProviders: 5,
  searchReady: 10,
  searchUnknown: 10,
  searchSetupProviders: 4,
  searchPerProvider: 5,
} as const;

/** Each view's row count at full pages: every option, "All N" row, pager and card it can show. */
export const VIEW_MAX = {
  // Agent's default + In use + 8 groups x 5 + ensembles + Claude Code + one "All N" per shown group, ensembles and
  // Claude Code + the group pager + the More models card (Suggested shortcuts + Set up a provider).
  ready: 1 + 1 + PAGE.readyGroups * PAGE.groupOptions + PAGE.ensembles + PAGE.claude + (PAGE.readyGroups + 2) + 1 + (PAGE.suggested + 1),
  // Needs attention + Connected + Suggested + All providers + Other ways + a pager for each section larger than its
  // page (Suggested holds at most its five constants, Other ways at most two: neither pages).
  directory: PAGE.attention + PAGE.connected + PAGE.suggested + PAGE.all + PAGE.otherWays + 3,
  drillIn: PAGE.drillIn + 1,
  // Providers + Ready + Can't tell + Needs setup (providers x their best) + one "more in" per shown provider + four pagers.
  search: PAGE.searchProviders + PAGE.searchReady + PAGE.searchUnknown + PAGE.searchSetupProviders * PAGE.searchPerProvider + PAGE.searchSetupProviders + 4,
} as const;

export interface Pager {
  /** The page shown, 0-based, clamped into range. */
  page: number;
  pages: number;
  size: number;
  total: number;
  /** 1-based positions of the first and last row shown ("25–48 of 200"); 0 and 0 when empty. */
  from: number;
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** The pager of `total` rows in pages of `size`, at `page` (out of range is clamped: a list that shrank keeps a page). */
export function pager(total: number, size: number, page: number): Pager {
  const n = Math.max(0, Math.floor(total));
  const s = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(n / s));
  const p = Math.min(pages - 1, Math.max(0, Math.floor(Number.isFinite(page) ? page : 0)));
  const from = n === 0 ? 0 : p * s + 1;
  const to = n === 0 ? 0 : Math.min(n, (p + 1) * s);
  return { page: p, pages, size: s, total: n, from, to, hasPrev: p > 0, hasNext: p < pages - 1 };
}

/** The rows of one page (the pager's clamp applies). */
export function pageOf<T>(rows: readonly T[], size: number, page: number): T[] {
  const pg = pager(rows.length, size, page);
  return rows.slice(pg.from === 0 ? 0 : pg.from - 1, pg.to);
}

/** True when a section needs a pager (more rows than one page shows). */
export const paged = (total: number, size: number): boolean => total > size;

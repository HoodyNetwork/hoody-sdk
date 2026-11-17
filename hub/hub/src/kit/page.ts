// The page manifest. Each hub/src/pages/<id>/page.ts default-exports
// definePage({...}); the app discovers the manifests by glob, so no central list is ever edited.
// Router, sidebar, command palette, Home widgets, Guide topics, the dev page filter and the shots
// runner all read these fields.
import type { ComponentType } from 'react';
import type { IconName } from './icons';
import type { StringKey, StringTable } from './strings';

/** canvas: the page fills the content area edge to edge with no header row (Board; the shell drops
 * main's inner scroll and padding for it). */
export type PageLayout = 'list-detail' | 'table' | 'detail' | 'settings' | 'dashboard' | 'wizard' | 'custom' | 'canvas';

/** ready: shown. preview: only with ?preview=1. hidden: lands dark (only hub:dev --page shows it). */
export type PageStatus = 'ready' | 'preview' | 'hidden';

export type NavGroup = 'main' | 'build' | 'account' | 'help';

export type Need = 'required' | 'optional';

type Key<S extends StringTable> = keyof S & string;

export interface PageCommand<S extends StringTable> {
  id: string;
  /** String key of the palette entry. */
  label: Key<S>;
  /** Hash path the command opens, e.g. '/computers?new=1'. Defaults to the page path. */
  to?: string;
  /** Extra search words (string keys are not needed: these never show). */
  keywords?: readonly string[];
  icon?: IconName;
}

export interface PageWidget<S extends StringTable> {
  id: string;
  title: Key<S>;
  size?: 's' | 'm' | 'l';
  order?: number;
  load: () => Promise<{ default: ComponentType }>;
}

export interface PageGuideTopic<S extends StringTable> {
  id: string;
  title: Key<S>;
  body: Key<S>;
}

/** A small part of the top bar a page contributes (billing's Free badge). The shell draws it before the
 * account menu on every page, and never imports the page. */
export interface PageTopBar {
  /** As a page id: lowercase letters, digits and hyphens, a letter first. Checked by definePage. */
  id: string;
  /** Lazy. Its default export renders nothing when it has nothing to show; the bar keeps no space for it then. */
  load: () => Promise<{ default: ComponentType }>;
}

/** A view of one of the page's things another page can show in a tile (a Bot on the Board). The
 * host page holds only the target string it was given (the contributing page's own key for the thing) and renders the
 * view by it; it never imports the page. */
export interface PageTileView<S extends StringTable> {
  /** As a page id: lowercase letters, digits and hyphens, a letter first. Checked by definePage. */
  id: string;
  /** What the view shows, e.g. "Bot". */
  title: Key<S>;
  /** Lazy. Its default export renders the thing named by `target`, and says so itself when that thing is gone. */
  load: () => Promise<{ default: ComponentType<{ target: string }> }>;
}

/** A count a page reads for its left-menu item (the Board's programs). */
export interface NavCount {
  /** Shown when above 0 (99+ past 99). A page's reader may return more fields for its own use; the shell reads only this and `items`. */
  readonly total: number;
  /** The page's own named things a person may type the name of in Jump to (the Board's named Boards): the name as the
   *  person gave it and the Hub route that opens it (the page's path, or below it). The reader holds them already:
   *  listing them reads nothing. Left out or empty: none. */
  readonly items?: readonly { readonly id: string; readonly label: string; readonly to: string }[];
}

/** Where a page's left-menu count comes from. The shell loads it on its own (never the page) and draws the item without
 *  a count while it loads, if it fails or throws, and while it answers null (not known yet) or 0. */
export interface PageNavCount<S extends StringTable> {
  /** Lazy. Its default export is a hook: the count now, following the page's own context, or null while unknown. */
  load: () => Promise<{ default: () => NavCount | null }>;
  /** The item's accessible name with its count, plural by {{count}}, e.g. "{{name}}, {{count}} programs". */
  label: StringKey<S>;
  /** Shown on hover and focus, plural by {{count}}, e.g. "{{count}} programs on this Board". */
  tip: StringKey<S>;
}

/** Which of a page's Jump to places (the shell's deep search index: settings sections and rows, tabs, FAQ questions) its
 *  view does not draw right now. Each string is the start of an entry's tail, the part after the page's path
 *  ('?section=passcode', '#faq-', '?tab=transfers'): `hide` leaves out the entries whose tail starts with one, `only`
 *  keeps just those. `commands`: the ids of the page's own manifest commands that open nothing now (a sheet the view
 *  refuses), left out of Jump to's typed results too. */
export type SearchHide = ({ readonly hide: readonly string[] } | { readonly only: readonly string[] }) & { readonly commands?: readonly string[] };

/** Where a page's SearchHide comes from. The shell loads it on its own (never the page) while Jump to is open, and hides
 *  nothing while it loads, if it fails or throws, and while it answers null (nothing hidden, or not known yet). */
export interface PageSearchHide {
  /** Lazy. Its default export is a hook: what the view leaves out now, following the page's own context, or null. */
  load: () => Promise<{ default: () => SearchHide | null }>;
}

/** The page's view does not draw the deep entry with this tail now (`hide` absent or null: it draws them all). */
export function hidesTail(hide: SearchHide | null | undefined, tail: string): boolean {
  if (!hide) return false;
  return 'only' in hide ? !hide.only.some((p) => tail.startsWith(p)) : hide.hide.some((p) => tail.startsWith(p));
}

/** One screen of a page: a sub-path pattern below the page's own path. '' is the page's path itself; ':name' is one
 *  whole segment, read into the match's params under that name; any other segment matches literally. */
export interface PageScreen {
  /** As a page id: lowercase letters, digits and hyphens, a letter first. */
  id: string;
  /** Segments joined by '/', no leading or trailing slash: '', 'new', ':id', ':id/ports'. */
  path: string;
}

/** A sub-path read against a page's screens: the screen's id and its parameters. */
export interface ScreenMatch {
  id: string;
  params: Readonly<Record<string, string>>;
}

export interface PageManifest<S extends StringTable = StringTable> {
  /** Folder name; lowercase letters, digits and dashes. */
  id: string;
  /** Route path, e.g. '/computers'. Sub-paths below it reach the same view (useSubPath). */
  path: `/${string}`;
  /** String key of the page title. */
  title: Key<S>;
  /** Internal: what this page is for, for maintainers. Never shown. */
  description?: string;
  nav?: { group: NavGroup; order: number; icon: IconName; label: Key<S> };
  /** A count on the page's left-menu item (needs `nav`). */
  navCount?: PageNavCount<S>;
  /** The places of the deep search index its view leaves out in some states (a suspended account, no computer). */
  searchHide?: PageSearchHide;
  layout: PageLayout;
  /** The page's screens (the page path and the sub-paths below it), read with matchScreen. The anatomy rule
   *  (layout.screens) asks every manifest for them; a view parses no sub-path by hand. */
  screens?: readonly PageScreen[];
  /** The layout of a screen other than the page's own, by screen id (a list-detail page whose item screen is a detail). */
  subLayouts?: Readonly<Partial<Record<string, Exclude<PageLayout, 'custom'>>>>;
  load: () => Promise<{ default: ComponentType }>;
  status: PageStatus;
  /** true: the framed lock refuses the page (it shows secrets, payments, keys or 2FA). */
  sensitive: boolean;
  /** Context the shell must provide; a page never reads globals. */
  needs?: { realm?: Need; computer?: Need };
  /** The page's strings.en.json, so the shell can show its nav label, title, commands, widgets and Guide topics. In the
   *  Hub it holds only the keys this page.ts names (vite.config.mts pageBootStrings); a view imports the table itself. */
  strings: S;
  commands?: readonly PageCommand<S>[];
  widgets?: readonly PageWidget<S>[];
  guide?: readonly PageGuideTopic<S>[];
  topBar?: PageTopBar;
  tileViews?: readonly PageTileView<S>[];
  /** The whole page cannot be drawn in the terminal Hub: there the shell draws the kit Handoff block (the page's title,
   *  this reason, Open/Copy/QR for the same route on the web) instead of loading the view. The web ignores it. `reason`
   *  is a string key of this page (one plain sentence, never empty); `what` names the thing ("Board"). The terminal's
   *  hand-off gate (scripts/term/graph/handoff-list.term.test.ts) lists the page in handoff.json `pages`. */
  handoff?: { reason: Key<S>; what?: Key<S> };
}

const ID_RE = /^[a-z][a-z0-9-]{0,39}$/;

/** Checks a manifest and returns it with its string types erased (the app reads manifests generically). */
export function definePage<const S extends StringTable>(manifest: PageManifest<S>): PageManifest {
  if (!ID_RE.test(manifest.id)) throw new Error(`definePage: bad page id "${manifest.id}"`);
  if (!/^\/[a-z0-9/_-]*$/.test(manifest.path)) throw new Error(`definePage: bad path "${manifest.path}"`);
  if (!(manifest.title in manifest.strings)) throw new Error(`definePage(${manifest.id}): title key "${manifest.title}" missing`);
  // Every key the shell reads from manifest.strings is checked here, so a key the boot projection lacks fails at load.
  // The shell translates these without a count, so each needs its exact key; only navCount (read with one) may name a
  // plural base.
  const has = (k: string) => k in manifest.strings;
  const hasCounted = (k: string) => has(k) || `${k}_other` in manifest.strings;
  const named = [
    manifest.nav?.label,
    ...(manifest.commands ?? []).map((c) => c.label),
    ...(manifest.widgets ?? []).map((w) => w.title),
    ...(manifest.guide ?? []).flatMap((g) => [g.title, g.body]),
  ];
  for (const k of named) if (k !== undefined && !has(k)) throw new Error(`definePage(${manifest.id}): string key "${k}" missing`);
  if (manifest.topBar && (!ID_RE.test(manifest.topBar.id) || typeof manifest.topBar.load !== 'function'))
    throw new Error(`definePage(${manifest.id}): bad topBar "${manifest.topBar.id}"`);
  for (const v of manifest.tileViews ?? [])
    if (!ID_RE.test(v.id) || typeof v.load !== 'function' || !(v.title in manifest.strings)) throw new Error(`definePage(${manifest.id}): bad tile view "${v.id}"`);
  checkScreens(manifest.id, manifest.screens, manifest.subLayouts);
  if (manifest.navCount) {
    const { load, label, tip } = manifest.navCount;
    if (!manifest.nav || typeof load !== 'function' || !hasCounted(label) || !hasCounted(tip)) throw new Error(`definePage(${manifest.id}): bad navCount`);
  }
  if (manifest.handoff) {
    const { reason, what } = manifest.handoff;
    const text = (k: unknown) => (typeof k === 'string' && has(k) ? String((manifest.strings as Record<string, unknown>)[k] ?? '').trim() : '');
    if (text(reason) === '' || (what !== undefined && text(what) === '')) throw new Error(`definePage(${manifest.id}): bad handoff (a reason key with text is required)`);
  }
  if (manifest.searchHide && typeof manifest.searchHide.load !== 'function') throw new Error(`definePage(${manifest.id}): bad searchHide`);
  return Object.freeze(manifest) as unknown as PageManifest;
}

// every PageLayout but the retired 'custom': `satisfies` fails the build when a layout is added and not named here. A plain
// object read with Object.hasOwn, so the module still does nothing at load (kitpure.conformance).
const SUB_LAYOUTS = {
  'list-detail': true,
  table: true,
  detail: true,
  settings: true,
  dashboard: true,
  wizard: true,
  canvas: true,
} as const satisfies Record<Exclude<PageLayout, 'custom'>, true>;
const PARAM_RE = /^:[a-z][a-zA-Z0-9]*$/;
const LITERAL_RE = /^[a-z0-9][a-z0-9._-]*$/;

function segmentsOf(path: string): string[] {
  return path === '' ? [] : path.split('/');
}

function checkScreens(page: string, screens: readonly PageScreen[] | undefined, subLayouts: PageManifest['subLayouts']): void {
  const bad = (what: string) => new Error(`definePage(${page}): ${what}`);
  const ids = new Set<string>();
  const shapes = new Set<string>();
  // an empty list would satisfy the anatomy rule while no sub-path could match: a page with no sub-paths declares one '' screen
  if (screens?.length === 0) throw bad('screens is empty (a page with no sub-paths declares one \'\' screen)');
  for (const sc of screens ?? []) {
    if (!ID_RE.test(sc.id) || ids.has(sc.id)) throw bad(`bad or repeated screen id "${sc.id}"`);
    ids.add(sc.id);
    const segs = segmentsOf(sc.path);
    const names = new Set<string>();
    for (const g of segs) {
      if (PARAM_RE.test(g)) {
        if (names.has(g)) throw bad(`screen "${sc.id}" repeats the parameter ${g}`);
        names.add(g);
      } else if (!LITERAL_RE.test(g)) throw bad(`screen "${sc.id}" has a bad path "${sc.path}"`);
    }
    // two screens of one shape (same literals, parameters in the same places) could never both be reached
    const shape = segs.map((g) => (g.startsWith(':') ? ':' : g)).join('/');
    if (shapes.has(shape)) throw bad(`screen "${sc.id}" has the shape of another screen ("${sc.path}")`);
    shapes.add(shape);
  }
  if (subLayouts === undefined) return;
  if (!screens) throw bad('subLayouts without screens');
  // a plain object only: an inherited key would be a layout neither this check nor the anatomy rule reads
  if (Object.getPrototypeOf(subLayouts) !== Object.prototype && Object.getPrototypeOf(subLayouts) !== null) throw bad('subLayouts is not a plain object');
  for (const key of Reflect.ownKeys(subLayouts)) {
    const layout = typeof key === 'string' ? subLayouts[key] : undefined;
    if (typeof key !== 'string' || !ids.has(key) || typeof layout !== 'string' || !Object.hasOwn(SUB_LAYOUTS, layout)) throw bad(`bad subLayout "${String(key)}"`);
  }
}

/** Reads a sub-path (useSubPath's segments, already decoded) against a page's screens. A screen matches a path of its own
 *  length whose literal segments are equal; of several matches the one with a literal where another has a parameter wins
 *  (earliest segment first), so 'new' beats ':id' whatever the order of the list. No match is null, never the nearest. */
export function matchScreen(subPath: readonly string[], screens: readonly PageScreen[]): ScreenMatch | null {
  let best: { sc: PageScreen; segs: string[] } | null = null;
  for (const sc of screens) {
    const segs = segmentsOf(sc.path);
    if (segs.length !== subPath.length || !segs.every((g, i) => g.startsWith(':') || g === subPath[i])) continue;
    if (!best || moreLiteral(segs, best.segs)) best = { sc, segs };
  }
  if (!best) return null;
  const params: Record<string, string> = {};
  best.segs.forEach((g, i) => {
    if (g.startsWith(':')) Object.defineProperty(params, g.slice(1), { value: subPath[i], enumerable: true, writable: false, configurable: false });
  });
  return { id: best.sc.id, params: Object.freeze(params) };
}

function moreLiteral(a: readonly string[], b: readonly string[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const la = !a[i]!.startsWith(':');
    const lb = !b[i]!.startsWith(':');
    if (la !== lb) return la;
  }
  return false;
}

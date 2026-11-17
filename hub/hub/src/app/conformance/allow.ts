// Conformance allow-lists: the rows that excuse today's offenders of a conformance rule.
// A page's rows live in pages/<page>/conformance.allow.ts, owned by that page; rows outside
// pages/ (kit, ask, shell, core) live in allow.shared.ts. The tests read the merged lists from here and
// keep their own scans and their "only shrinks" checks; allow.test.ts checks the row files themselves.
// Test-only: nothing in the app imports this module or a conformance.allow.ts.
import { shared } from './allow.shared';

type Counts = Readonly<Record<string, number>>;
type Files = Readonly<Record<string, true>>;

/** Rules whose rows name files that may break the rule at all (any number of times). */
export const FILE_RULES = ['std.pageKeys', 'std.viewport', 'std.deepImport'] as const;
/** Rules whose rows name files that may keep at most that many hits. */
export const COUNT_RULES = [
  'std.pageLink',
  'std.flag',
  'std.locator',
  'std.copy',
  'std.states',
  'std.meter',
  'std.tag',
  'std.classicLink',
  'std.logsLink',
  'std.breakpoint',
  'std.textarea',
  'std.chatName',
  'literal.debt',
  'std.codeLang',
] as const;
/**
 * Page-anatomy debt. The detector is hub/scripts/lint/anatomy.cjs; a row is a count
 * per file and scope: `<file>` counts the hits of the page's main content, `<file> overlay:<overlayId>` those inside the
 * named overlay. The ratchet (app/conformance.anatomy.test.ts) keeps every row equal to the detector's count: a new
 * offender fails, a fixed site lowers its row in the same change. Keep this list equal to the detector's RULES (the
 * ratchet test checks it).
 */
export const LAYOUT_RULES = [
  'layout.heading',
  'layout.landmark',
  'layout.text',
  'layout.state',
  'layout.stateMissing',
  'layout.legacy',
  'layout.localChrome',
  'layout.marker',
  'layout.actionRow',
  'layout.manifest',
  'layout.cssMargin',
  'layout.cssType',
  'layout.cssReach',
  'layout.cssGap',
  'layout.inlineSpacing',
  'layout.prose',
  'layout.slot',
  'layout.visual',
  'layout.screens',
  'layout.overlayId',
  'layout.explain',
  'layout.explainGap',
  // loose FaqLinks, more than one Band per section, a hand-made <ol> in an overlay body
  'layout.looseFaqLink',
  'layout.bandsPerSection',
  'layout.drawerOl',
] as const;
/**
 * UI-standard debt: the `ui.*` family of the same detector (hub/scripts/lint/anatomy-ui.cjs),
 * with the same rows, keys and ratchet as LAYOUT_RULES. The rows sit between `// ui:begin` and `// ui:end`.
 * LAYOUT_RULES and UI_RULES together are the detector's RULES (the ratchet test checks it).
 */
export const UI_RULES = [
  'ui.kitClass',
  'ui.pageLook',
  'ui.rawControl',
  // more ui rules
  'ui.rawUrl',
  'ui.computerList',
  'ui.nativeTitle',
  'ui.inlineLabel',
  'ui.actionTwice',
  'ui.bareNumber',
  'ui.badgeUnit',
  'ui.folderField',
] as const;
/** Every rule of the page-anatomy detector: its rows share one shape (rule → '<file>[ overlay:<id>]' → count). */
export const ANATOMY_RULES = [...LAYOUT_RULES, ...UI_RULES] as const;
/** DOM debt: case id -> signature -> count. `layout.dom.browser` is the same for the browser matrix. */
export const DOM_RULES = ['layout.dom', 'layout.dom.browser'] as const;
/** Rules that excuse a whole page (`true`). */
export const PAGE_RULES = ['std.dataTableDeprecated', 'dataTable.noCountLabel'] as const;
export type FileRule = (typeof FILE_RULES)[number];
export type CountRule = (typeof COUNT_RULES)[number];
export type PageRule = (typeof PAGE_RULES)[number];
export type LayoutRule = (typeof LAYOUT_RULES)[number];
export type UiRule = (typeof UI_RULES)[number];
export type DomRule = (typeof DOM_RULES)[number];
type DomRows = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** Rows of one page. Keys are paths relative to the page folder, so a row can only name that page's files. */
export type PageAllow = { readonly [R in FileRule]?: Files } & { readonly [R in CountRule]?: Counts } & { readonly [R in LayoutRule | UiRule]?: Counts } & { readonly [R in DomRule]?: DomRows } & { readonly [R in PageRule]?: true } & {
  /** Labels the owners checked hold only Hub text: [count, why]. Not debt; the why is required. */
  readonly 'literal.hubText'?: Readonly<Record<string, readonly [number, string]>>;
  /** file → the hand-rolled filter functions it may still import. */
  readonly dataView?: Readonly<Record<string, readonly string[]>>;
  /** `file:line` of a main list that may go without a Reload → why. */
  readonly 'dataTable.noRefresh'?: Readonly<Record<string, string>>;
  /** file → receiver expressions whose no-argument settle()/dismiss() is not a core source/query hook's → why. */
  readonly 'noarg.allowed'?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** file → core source/query hook calls still to migrate, and who owns them. */
  readonly 'noarg.pending'?: Readonly<Record<string, { readonly owner: string; readonly calls: readonly string[] }>>;
};
/** Rows outside pages/: the path-keyed rules only, keys relative to hub/src. */
export type SharedAllow = Pick<PageAllow, FileRule | CountRule | LayoutRule | UiRule | 'literal.hubText'>;

export const RULE_IDS: ReadonlySet<string> = new Set([
  ...FILE_RULES,
  ...COUNT_RULES,
  ...PAGE_RULES,
  ...LAYOUT_RULES,
  ...UI_RULES,
  ...DOM_RULES,
  'literal.hubText',
  'dataView',
  'dataTable.noRefresh',
  'noarg.allowed',
  'noarg.pending',
]);

const found = import.meta.glob<PageAllow>('../../pages/*/conformance.allow.ts', { eager: true, import: 'allow' });
/** Every page row file: its page id, its hub/src path and its rows. */
export const pageAllows: ReadonlyArray<{ page: string; file: string; allow: PageAllow }> = Object.entries(found).map(([path, allow]) => {
  const page = path.split('/')[3] ?? '';
  return { page, file: `pages/${page}/conformance.allow.ts`, allow: allow ?? {} };
});
export { shared as sharedAllow };

/** Where a row for this hub/src path is written. */
export const allowFileOf = (srcPath: string): string => {
  const page = /^pages\/([^/]+)\//.exec(srcPath)?.[1];
  return page ? `hub/src/pages/${page}/conformance.allow.ts` : 'hub/src/app/conformance/allow.shared.ts';
};

/** Rows of a path-keyed rule from every source, keyed by hub/src path (`pages/<page>/…` for page rows). */
function merged<T>(id: FileRule | CountRule | 'literal.hubText'): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries((shared[id] ?? {}) as Record<string, T>)) out[k] = v;
  for (const { page, allow } of pageAllows) for (const [k, v] of Object.entries((allow[id] ?? {}) as Record<string, T>)) out[`pages/${page}/${k}`] = v;
  return out;
}
/** A layout row key: `<file>` (scope main) or `<file> overlay:<overlayId>`. */
export const splitLayoutKey = (key: string): { file: string; scope: string } => {
  const i = key.indexOf(' ');
  return i < 0 ? { file: key, scope: 'main' } : { file: key.slice(0, i), scope: key.slice(i + 1) };
};
/** Every page-anatomy row (layout and ui) as the detector keys it: `<rule>|hub/src path|<scope>` -> count. */
export function allowLayout(): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (rule: string, rows: Counts | undefined, prefix: string) => {
    for (const [k, n] of Object.entries(rows ?? {})) {
      const { file, scope } = splitLayoutKey(k);
      out[`${rule}|${prefix}${file}|${scope}`] = n;
    }
  };
  for (const rule of ANATOMY_RULES) {
    add(rule, shared[rule], '');
    for (const { page, allow } of pageAllows) add(rule, allow[rule], `pages/${page}/`);
  }
  return out;
}
/** Rows of a page-scanner rule, keyed `<page>/<file>` as the pages/ scanners name files. */
function byPage<T>(id: 'dataView' | 'dataTable.noRefresh' | 'noarg.allowed' | 'noarg.pending'): Record<string, T> {
  const out: Record<string, T> = {};
  for (const { page, allow } of pageAllows) for (const [k, v] of Object.entries((allow[id] ?? {}) as Record<string, T>)) out[`${page}/${k}`] = v;
  return out;
}

export const allowFiles = (id: FileRule): Set<string> => new Set(Object.keys(merged<true>(id)));
export const allowCounts = (id: CountRule): Record<string, number> => merged<number>(id);
/** literal.hubText as counts (the why stays in the row file). */
export const allowHubText = (): Record<string, number> => Object.fromEntries(Object.entries(merged<readonly [number, string]>('literal.hubText')).map(([f, [n]]) => [f, n]));
export const allowPages = (id: PageRule): Set<string> => new Set(pageAllows.filter(({ allow }) => allow[id] === true).map(({ page }) => page));
/** `<page>/<file>: <function>` entries. */
export const allowDataView = (): Set<string> =>
  new Set(Object.entries(byPage<readonly string[]>('dataView')).flatMap(([f, fns]) => fns.map((fn) => `${f}: ${fn}`)));
/** `<page>/<file>:<line>` entries. */
export const allowNoRefresh = (): Set<string> => new Set(Object.keys(byPage<string>('dataTable.noRefresh')));
export const allowNoargAllowed = (): Record<string, Readonly<Record<string, string>>> => byPage('noarg.allowed');
export const allowNoargPending = (): Record<string, { readonly owner: string; readonly calls: readonly string[] }> => byPage('noarg.pending');

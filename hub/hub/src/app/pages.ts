// Page discovery: every hub/src/pages/<id>/page.ts is found by glob. No
// central list exists, so adding a page never edits a shared file.
import type { PageManifest } from '@kit/page';

// The demo page (a template sample with a card that throws on purpose) and the kit gallery are dev-only fixture
// modules: this live module never imports them (the terminal ship build refuses a fixture module as an input,
// TERM_FIXTURE_INPUT). app/fixtures.ts installs them when it loads (installDevPages); with fixtures compiled out
// nothing installs and neither page exists.
const found = import.meta.glob<{ default: PageManifest }>(['../pages/*/page.ts', '!../pages/demo/page.ts'], { eager: true });
let devPages: { readonly demo: PageManifest; readonly gallery: PageManifest } | null = null;

/** The fixture side's dev pages (app/fixtures.ts). A no-op when fixtures are compiled out. */
export function installDevPages(p: { readonly demo: PageManifest; readonly gallery: PageManifest }): void {
  if (__HUB_FIXTURES__) devPages = p;
}

const modules = (): Record<string, { default: PageManifest }> => (__HUB_FIXTURES__ && devPages
  ? { ...found, '../pages/demo/page.ts': { default: devPages.demo } }
  : found);

export interface DiscoveryProblem {
  file: string;
  problem: string;
}

/** Every page manifest found on disk, plus the problems that kept some out (shown in dev). */
export function discoverPages(): { pages: PageManifest[]; problems: DiscoveryProblem[] } {
  const pages: PageManifest[] = [];
  const problems: DiscoveryProblem[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const [file, mod] of Object.entries(modules())) {
    const folder = /\/pages\/([^/]+)\/page\.ts$/.exec(file)?.[1];
    const m = mod.default;
    if (!m || typeof m !== 'object') {
      problems.push({ file, problem: 'page.ts has no default definePage() export' });
      continue;
    }
    if (m.id !== folder) {
      problems.push({ file, problem: `id "${m.id}" does not match its folder "${folder}"` });
      continue;
    }
    if (ids.has(m.id) || paths.has(m.path)) {
      problems.push({ file, problem: `duplicate id or path (${m.id}, ${m.path})` });
      continue;
    }
    ids.add(m.id);
    paths.add(m.path);
    pages.push(m);
  }
  pages.sort((a, b) => (a.nav?.order ?? 999) - (b.nav?.order ?? 999) || a.id.localeCompare(b.id));
  return { pages, problems };
}

export interface VisibilityOptions {
  /** ?preview=1: preview pages show. */
  preview: boolean;
  /** hub:dev --page <id>: only that page (any status) plus the gallery. '*' (whole-hub hub:check e2e): every page, any status. */
  only: string;
  /** Fixtures mode (dev, shots, specs): the kit gallery shows. */
  fixtures: boolean;
}

/** The pages the router serves for this load. */
export function visiblePages(all: readonly PageManifest[], opts: VisibilityOptions): PageManifest[] {
  const gallery = __HUB_FIXTURES__ && opts.fixtures && devPages ? [devPages.gallery] : [];
  if (opts.only === '*') return [...all, ...gallery];
  if (opts.only) return [...all.filter((p) => p.id === opts.only), ...gallery];
  return [...all.filter((p) => p.status === 'ready' || (p.status === 'preview' && opts.preview)), ...gallery];
}

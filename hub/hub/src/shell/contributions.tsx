// What pages contribute to other pages through their manifests: Home's
// widgets, the Guide's topics and the Board's tile views, and to the shell: top-bar parts. The shell holds the discovered manifests and provides them;
// pages read useContributions() from '@kit' and never import another page. Outside the shell
// (page unit tests) the lists are empty.
import { type ComponentType, createContext, type LazyExoticComponent, lazy, type ReactNode, useContext, useMemo } from 'react';
import type { PageManifest } from '@kit/page';
import { makeT } from '@kit/strings';

export interface WidgetContribution {
  pageId: string;
  id: string;
  /** Already translated. */
  title: string;
  size: 's' | 'm' | 'l';
  order: number;
  /** Lazy: wrap in <Suspense>. The same component object on every render. */
  Component: LazyExoticComponent<ComponentType>;
  /** The contributing page's path ("View all ›"). */
  href: string;
}

export interface GuideTopicContribution {
  pageId: string;
  /** The contributing page's title, already translated. */
  pageTitle: string;
  id: string;
  title: string;
  body: string;
}

export interface TileViewContribution {
  pageId: string;
  id: string;
  /** Already translated. */
  title: string;
  /** Lazy: wrap in <Suspense>. The same component object on every render. Renders the thing `target` names. */
  Component: LazyExoticComponent<ComponentType<{ target: string }>>;
  /** The contributing page's path. */
  href: string;
}

export interface TopBarContribution {
  pageId: string;
  id: string;
  /** Lazy: wrap in <Suspense>. The same component object on every render. */
  Component: LazyExoticComponent<ComponentType>;
}

export interface Contributions {
  widgets: readonly WidgetContribution[];
  guideTopics: readonly GuideTopicContribution[];
  /** Only served pages contribute: a hidden page's view is absent, so a host shows that it is not available. */
  tileViews: readonly TileViewContribution[];
}

const EMPTY: Contributions = { widgets: [], guideTopics: [], tileViews: [] };
const Ctx = createContext<readonly PageManifest[] | null>(null);

// React.lazy must be created once per contribution, or every render would remount it. One cache per kind: page and
// part ids may hold any character a key prefix could use, so a shared cache could mix a widget and a top-bar part.
type LazyCache<P = object> = Map<string, { load: unknown; Component: LazyExoticComponent<ComponentType<P>> }>;
const widgetCache: LazyCache = new Map();
const topBarCache: LazyCache = new Map();
const tileViewCache: LazyCache<{ target: string }> = new Map();
function lazyIn<P>(cache: LazyCache<P>, key: string, load: () => Promise<{ default: ComponentType<P> }>): LazyExoticComponent<ComponentType<P>> {
  const hit = cache.get(key);
  if (hit && hit.load === load) return hit.Component;
  const Component = lazy(load);
  cache.set(key, { load, Component });
  return Component;
}

/** Widgets sorted by order then page id; topics and tile views in page order. */
export function contributionsOf(pages: readonly PageManifest[]): Contributions {
  const widgets: WidgetContribution[] = [];
  const guideTopics: GuideTopicContribution[] = [];
  const tileViews: TileViewContribution[] = [];
  for (const p of pages) {
    const t = makeT(p.strings);
    for (const w of p.widgets ?? []) {
      widgets.push({
        pageId: p.id,
        id: w.id,
        title: t(w.title),
        size: w.size ?? 's',
        order: w.order ?? 100,
        Component: lazyIn(widgetCache, `${p.id}:${w.id}`, w.load),
        href: p.path,
      });
    }
    for (const g of p.guide ?? []) guideTopics.push({ pageId: p.id, pageTitle: t(p.title), id: g.id, title: t(g.title), body: t(g.body) });
    for (const v of p.tileViews ?? [])
      tileViews.push({ pageId: p.id, id: v.id, title: t(v.title), Component: lazyIn(tileViewCache, `${p.id}:${v.id}`, v.load), href: p.path });
  }
  widgets.sort((a, b) => a.order - b.order || a.pageId.localeCompare(b.pageId) || a.id.localeCompare(b.id));
  return { widgets, guideTopics, tileViews };
}

/** The top-bar parts, in page order. */
export function topBarOf(pages: readonly PageManifest[]): TopBarContribution[] {
  return pages.flatMap((p) => (p.topBar ? [{ pageId: p.id, id: p.topBar.id, Component: lazyIn(topBarCache, `${p.id}:${p.topBar.id}`, p.topBar.load) }] : []));
}

export function ContributionsProvider({ pages, children }: { pages: readonly PageManifest[]; children: ReactNode }) {
  return <Ctx.Provider value={pages}>{children}</Ctx.Provider>;
}

export function useContributions(): Contributions {
  const pages = useContext(Ctx);
  return useMemo(() => (pages ? contributionsOf(pages) : EMPTY), [pages]);
}

/** The shell's own: the top-bar parts pages contribute (none outside the shell). */
export function useTopBarParts(): readonly TopBarContribution[] {
  const pages = useContext(Ctx);
  return useMemo(() => (pages ? topBarOf(pages) : []), [pages]);
}

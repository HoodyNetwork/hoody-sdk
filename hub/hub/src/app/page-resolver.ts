// How core's error details name a page (core errors.ts setPageResolver): core keeps only the page id; the app,
// which holds the discovered manifests, registers this once at boot (main.tsx). A page's title in its own words,
// its link as the router renders it.
import { setPageResolver } from '@core';
import type { PageManifest } from '@kit/page';
import { makeT } from '@kit/strings';
import { hubHref } from './hrefs';

export function registerPageResolver(pages: readonly PageManifest[]): void {
  const byId = new Map(pages.map((p) => [p.id, p]));
  setPageResolver({
    title: (id) => {
      const p = byId.get(id);
      return p ? makeT(p.strings)(p.title) : null;
    },
    href: (id) => {
      const p = byId.get(id);
      return p ? hubHref(p.path) : null;
    },
  });
}

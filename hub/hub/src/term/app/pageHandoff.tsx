// A whole-page hand-off: a page whose manifest sets `handoff` is never loaded in the terminal;
// the shell draws its title and the kit Handoff block (the reason from the page's strings, Open/Copy/QR for the current
// route on the web) in its place. One place for every such page, so none draws its own stand-in.
import { createElement, type ComponentType, type ReactElement } from 'react';
import type { PageManifest } from '@kit/page';
import { useStrings } from '@kit/strings';
import { Handoff } from '@kit/states/Handoff';
import { PageBody } from '@kit/layouts/termScroll';
import { Box, Text } from '../prim';

/** The view the shell mounts for a hand-off page (the manifest's `load` replaced; the real view is never imported). */
export function handoffView(page: PageManifest): ComponentType {
  const h = page.handoff;
  if (!h) throw new Error(`handoffView(${page.id}): the page sets no handoff`);
  function PageHandoff(): ReactElement {
    const s = useStrings(page.strings) as (k: string) => string;
    return createElement(PageBody, null,
      createElement(Box, { dir: 'column', shrink: 0, gap: 1, padX: 1 },
        createElement(Text, { bold: true }, s(page.title)),
        createElement(Handoff, { size: 'block', reason: s(h!.reason), ...(h!.what !== undefined ? { what: s(h!.what) } : {}) })));
  }
  PageHandoff.displayName = `PageHandoff(${page.id})`;
  return PageHandoff;
}

/** The manifest the terminal router mounts: a hand-off page loads `handoffView`, any other page is returned as is. */
export function withPageHandoff(page: PageManifest): PageManifest {
  if (!page.handoff) return page;
  const view = handoffView(page);
  return { ...page, load: () => Promise.resolve({ default: view }) };
}

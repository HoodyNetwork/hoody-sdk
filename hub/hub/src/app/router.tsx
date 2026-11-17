// Router assembly: the page router (app/pageRouter.tsx) with the app shell and Ask's dock around the pages. Page unit
// tests build from app/pageRouter.tsx without the shell, so the shell and Ask stay out of their module graph.
// The dock's Put on Board for a marked link (linkBoardAddPath) is passed in here: Ask is in the kit's own module graph
// (through the shell), so it must not import the Board's links.ts (app/kitGraph.test.ts).
import type { PageManifest } from '@kit/page';
import { AppShell } from '@shell/AppShell';
import { AskPanel } from '../ask';
import { linkBoardAddPath } from '../pages/board/links';
import { buildPageRouter, type PageRouterOptions, type ShellFrame } from './pageRouter';

export { createHubHashHistory, parseSearch, stringifySearch, type RouterContext } from './pageRouter';

export interface BuildRouterOptions extends PageRouterOptions {
  /** Draw the app shell around pages (false in page unit tests). */
  shell?: boolean;
}

const shellFrame: ShellFrame = (pages, routed) => (
  <AppShell pages={pages} dock={<AskPanel boardAdd={linkBoardAddPath} />}>
    {routed}
  </AppShell>
);

export function buildRouter(pages: readonly PageManifest[], opts: BuildRouterOptions) {
  const { shell = true, ...rest } = opts;
  return buildPageRouter(pages, rest, shell ? shellFrame : undefined);
}

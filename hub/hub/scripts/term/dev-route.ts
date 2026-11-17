// dev-route.ts: the route dev.ts opens. No --path = the page's own path (page.ts `path`), as render.ts and goldens draw:
// '/' + id is not always a page's address (realms lives at /realms/new; /realms drew "No page at this address").
export interface DevPage { id: string; path: string }

/** The page a bare `dev.ts` opens: Home, the page a person lands on. */
export const DEV_DEFAULT_PAGE = 'home';

export function devRoute(idArg: string | undefined, pathArg: string | undefined, pages: readonly DevPage[]): { page: string; path: string } {
  const id = idArg ?? DEV_DEFAULT_PAGE;
  const page = pages.find((p) => p.id === id);
  if (!page) throw new Error(`TERM_NO_PAGE: ${id} (have: ${pages.map((p) => p.id).join(', ')})`);
  return { page: id, path: pathArg ?? page.path };
}

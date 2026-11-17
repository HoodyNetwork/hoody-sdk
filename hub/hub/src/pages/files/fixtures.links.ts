// Fixture-only entry of the Files page: its Storage tab's fake files-program answers, for the computers page's
// fixtures and tests (hub/page-boundaries allows this file only from a page's fixtures.ts and test/spec files).
// Reaches the storage fixtures and their routes, the Shared folders answers (the computer page's Storage tab shows that
// section too), the top-folder route (`GET /?json`) and the folder route (one `*parts` route at every depth below it),
// never the tab or the page.
export { storageRules } from './storage/fixtures';
export { shareRules } from './shares/fixtures';
export { folderRoute, rootRoute } from './routes';

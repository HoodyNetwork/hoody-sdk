// The standalone Hub's entry (hub:build-single). The page is one HTML file: the memory-only guard for file:// pages
// (fileMemory.ts), shared.js and the other auth scripts run inline before this module, and <html data-hub-standalone>
// turns on shared.js's standalone rules (origin.ts).
// boot.ts decides once, before anything renders: the Hub itself (app/main.tsx, exactly as served) or the sign-in
// card. The Hub is loaded only with a Hoody named and a session stored, so its live boot never meets a page without
// a session; a session that ends later reloads this page (core/lifecycle.ts), which then shows the first-run screen.
// A Hub opened from a saved session first reads the Hoody's file floor (appStart.ts); a file below it never loads the Hub.
// After a sign-in the page reloads into the Hub; a page that keeps everything in memory (opened as a file) opens it in
// place instead, since a reload would drop the sign-in it just made.
import '@kit/tokens.css';
import '@kit/base.css';
import { readHubConfig } from '@core/origin';
import { startApp } from './appStart';
import { decideStart, type Start } from './boot';
import { fileMemoryState } from './fileMemory';

async function show(start: Start): Promise<void> {
  if (start.kind === 'app') {
    // The Hoody's file floor first (appStart.ts): below it the old-file screen shows and the Hub never loads, with
    // the session kept.
    await startApp(start.api, {
      read: readHubConfig,
      loadHub: () => import('../app/main'),
      showOld: (floor) => { void import('./OldFile').then((m) => { m.mountOldFile(floor, start.api.origin); }); },
    });
    return;
  }
  const { mountFirstRun } = await import('./FirstRun');
  const root = mountFirstRun(start, () => {
    if (fileMemoryState() !== 'on') {
      window.location.reload();
      return;
    }
    root?.unmount();
    void show(decideStart());
  });
}

await show(decideStart());

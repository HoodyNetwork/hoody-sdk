// A test that needs a page view of its own (one that traps, one that warns) draws it as the demo page for the length
// of one call. mock.module on the view file cannot do that in a shared process: the shell keeps each page's loaded
// view for the whole process (shell/preload.ts, keyed by the manifest's load function), so the first view loaded,
// real or mocked, is what every later file draws. Here the demo manifest is installed again with a load of its own
// (a new key), and the real one comes back after.
import type { ComponentType } from 'react';
import { installTermLoader } from './loader';

export async function withDemoView<T>(view: ComponentType, run: () => Promise<T>): Promise<T> {
  // Hub modules, loaded as renderPage loads them.
  installTermLoader({ flavour: 'fixture', fixtures: true });
  // app/fixtures.ts installs the dev pages when it loads: loaded first, so it does not install over ours.
  await import('../../src/app/fixtures');
  const { installDevPages } = await import('../../src/app/pages');
  const demo = (await import('../../src/pages/demo/page')).default;
  const gallery = (await import('../../src/kit/gallery/page')).default;
  installDevPages({ demo: { ...demo, load: async () => ({ default: view }) }, gallery });
  try { return await run(); } finally { installDevPages({ demo, gallery }); }
}

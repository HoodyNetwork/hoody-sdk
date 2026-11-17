// The source overlay (overlay-preload.ts) survives the test fence's environment scrub, and overlays a read of src.
// The scrub once dropped OVERLAY_DIR/OVERLAY_SRC, so every overlay "proof" silently ran the live files.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import type * as OverlayPreload from './overlay-preload';
import { scrubEnv } from './test-net-guard';

test('OVERLAY_DIR and OVERLAY_SRC are kept by the scrub (absolute paths only)', () => {
  // HUB_TERM_CACHE (style-table.ts cacheDir) too: if the scrub dropped it, a run's style tables would go to hub/.term-cache.
  const env: Record<string, string | undefined> = { OVERLAY_DIR: '/var/tmp/x/ovl', OVERLAY_SRC: '/var/tmp/x/hub/src', HUB_TERM_CACHE: '/var/tmp/x/cache', FOO: 'bar' };
  scrubEnv(env);
  expect(env).toEqual({ OVERLAY_DIR: '/var/tmp/x/ovl', OVERLAY_SRC: '/var/tmp/x/hub/src', HUB_TERM_CACHE: '/var/tmp/x/cache' });
  const bad: Record<string, string | undefined> = { OVERLAY_DIR: 'relative/ovl', OVERLAY_SRC: '/a/../b' };
  scrubEnv(bad);
  expect(bad).toEqual({});
});

test('the preload overlays a src read with the overlay copy, in both layouts', async () => {
  const tmpBase = process.env.TMPDIR ?? path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp');
  fs.mkdirSync(tmpBase, { recursive: true });
  const root = fs.mkdtempSync(path.join(tmpBase, 'ovl-'));
  const src = path.join(root, 'src');
  const dir = path.join(root, 'ovl');
  fs.mkdirSync(path.join(src, 'a'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'a'), { recursive: true });
  fs.writeFileSync(path.join(src, 'a', 'one.ts'), 'live-one');
  fs.writeFileSync(path.join(src, 'a', 'two.ts'), 'live-two');
  fs.writeFileSync(path.join(src, 'a', 'three.ts'), 'live-three');
  fs.writeFileSync(path.join(dir, 'a', 'one.ts'), 'stage-one');
  fs.writeFileSync(path.join(dir, 'a_two.ts'), 'stage-two');
  const before = { dir: process.env.OVERLAY_DIR, src: process.env.OVERLAY_SRC, read: fs.readFileSync };
  process.env.OVERLAY_DIR = dir;
  process.env.OVERLAY_SRC = src;
  try {
    const ovl = await import(`./overlay-preload.ts?case=${Date.now()}`) as typeof OverlayPreload;
    expect(fs.readFileSync(path.join(src, 'a', 'one.ts'), 'utf8')).toBe('stage-one');
    expect(fs.readFileSync(path.join(src, 'a', 'two.ts'), 'utf8')).toBe('stage-two');
    expect(fs.readFileSync(path.join(src, 'a', 'three.ts'), 'utf8')).toBe('live-three');
    // A covered module loaded BEFORE the preload keeps its live bytes: the preload must see it (TERM_OVERLAY_LATE).
    // Test-preload.ts given first loaded prim/focus.ts live.
    fs.writeFileSync(path.join(src, 'a', 'four.ts'), 'export const four = 1;');
    fs.writeFileSync(path.join(dir, 'a', 'four.ts'), 'export const four = 2;');
    await import(path.join(src, 'a', 'four.ts'));
    expect(ovl.loadedTooLate(Object.keys(require.cache), src, dir)).toEqual([path.join(src, 'a', 'four.ts')]);
    // Every overlay file must be read: one skipped file fails the run even when another was read (TERM_OVERLAY_UNUSED).
    expect(ovl.unreadOverlayFiles(['a/one.ts', 'a_two.ts'], new Set([path.join(dir, 'a', 'one.ts')]), dir)).toEqual(['a_two.ts']);
    expect(ovl.unreadOverlayFiles(['a/one.ts', 'a_two.ts'], new Set([path.join(dir, 'a', 'one.ts'), path.join(dir, 'a_two.ts')]), dir)).toEqual([]);
    // An overlay file that stands for no live file (an extra 'src/' level, a typo) is named up front (TERM_OVERLAY_NO_TARGET).
    expect(ovl.overlayWithoutTarget(['a/one.ts', 'a_two.ts', 'src/a/one.ts', 'a/nope.ts', 'a_nope.ts'], src)).toEqual(['src/a/one.ts', 'a/nope.ts', 'a_nope.ts']);
  } finally {
    (fs as unknown as { readFileSync: unknown }).readFileSync = before.read;
    if (before.dir === undefined) delete process.env.OVERLAY_DIR; else process.env.OVERLAY_DIR = before.dir;
    if (before.src === undefined) delete process.env.OVERLAY_SRC; else process.env.OVERLAY_SRC = before.src;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

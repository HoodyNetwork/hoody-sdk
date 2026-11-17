// The path the router takes: @tanstack/react-router -> use-sync-external-store/shim/with-selector, a
// CommonJS file that require()s the shim the loader rewrites (strict-probes.ts, cjs: true). Loaded through the term
// loader (the preload installs it), the selector hook must exist and draw, and redraw on a store change.
import { expect, test } from 'bun:test';
// Typed by scripts/term/types/use-sync-external-store.d.ts (a typecheck root).
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector';
import { drawTest } from '../../src/term/prim/testing';
import { Text } from '../../src/term/prim';

test('with-selector over the rewritten shim: the hook exists, draws the selection and follows the store', async () => {
  expect(typeof useSyncExternalStoreWithSelector).toBe('function');
  let state = { n: 1, other: 'x' };
  const subs = new Set<() => void>();
  const subscribe = (cb: () => void): (() => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
  function Shows() {
    const n = useSyncExternalStoreWithSelector(subscribe, () => state, () => state, (s) => s.n, Object.is);
    return <Text>{'n=' + n}</Text>;
  }
  const t = await drawTest(<Shows />, { width: 20, height: 1 });
  try {
    expect(await t.settle()).toContain('n=1');
    state = { n: 2, other: 'x' };
    for (const cb of subs) cb();
    expect(await t.settle()).toContain('n=2');
  } finally {
    t.renderer.destroy();
  }
});

// strict-probes through the REAL loader (the term preload's), not the pure function: a rewritten library must still
// export what it did. The use-sync-external-store shim is CommonJS; before cjsAsEsm the loader's rewrite left it with
// no exports and every mount crashed in the router ("useSyncExternalStore is not a function").
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The shim loaded through the loader exports a working useSyncExternalStore: a component subscribed to a store draws its value and redraws on change | 'shim hook works' |
import { expect, test } from 'bun:test';
// @ts-expect-error untyped CommonJS package (no @types/use-sync-external-store installed); typed below as React's hook.
import * as shim from 'use-sync-external-store/shim';
import { drawTest } from '../prim/testing';
import { Text } from '../prim';

const useSyncExternalStore = (shim as { useSyncExternalStore: typeof import('react').useSyncExternalStore }).useSyncExternalStore;

test('shim hook works', async () => {
  expect(typeof useSyncExternalStore).toBe('function');
  let value = 'first';
  const subs = new Set<() => void>();
  const store = {
    subscribe: (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; },
    get: () => value,
  };
  function Shows() {
    const v = useSyncExternalStore(store.subscribe, store.get);
    return <Text>{'value=' + v}</Text>;
  }
  const t = await drawTest(<Shows />, { width: 20, height: 1 });
  expect(await t.settle()).toContain('value=first');
  value = 'second';
  for (const cb of subs) cb();
  expect(await t.settle()).toContain('value=second');
  t.renderer.destroy();
});

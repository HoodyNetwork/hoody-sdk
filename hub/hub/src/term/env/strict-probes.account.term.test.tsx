// query-core's focusManager under the strict globals: isFocused() before any setFocused reads
// `globalThis.document?.visibilityState` (without it, Account crashes in strict dev.ts on a refetch-on-focus
// path). strict-probes answers it at load (rule query-core-focus-visible), so the Account page mounts with no trap.
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | focusManager.isFocused() with no focus state set reads no global and answers "focused" | 'isFocused reads no global' |
// | 2 | Account mounts under the strict globals: no trap recorded, no failure, the page drawn | 'account mounts strict' |
import { afterEach, expect, test } from 'bun:test';
import { focusManager } from '@tanstack/query-core';
import { renderPage } from '../../../scripts/term/render';
import { activeStrictGlobals } from './strict-globals';

let close: (() => void) | null = null;
afterEach(() => { close?.(); close = null; });

test('isFocused reads no global', () => {
  const sg = activeStrictGlobals();
  expect(sg).not.toBeNull();
  sg!.clear();
  // A fresh focus state: what a QueryObserver asks before the terminal listener ever set one.
  (focusManager as unknown as { setFocused(f?: boolean): void }).setFocused(undefined);
  expect(focusManager.isFocused()).toBe(true);
  expect(sg!.ledger()).toEqual([]);
});

test('account mounts strict', async () => {
  activeStrictGlobals()!.clear();
  const s = await renderPage({ page: 'account', cols: 120, rows: 40 });
  close = () => s.close();
  expect(activeStrictGlobals()!.ledger().map((r) => r.name)).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(s.frame.trim().length).toBeGreaterThan(0);
}, 90_000);

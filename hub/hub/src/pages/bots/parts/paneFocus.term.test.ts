import { expect, test } from 'bun:test';
import { activeStrictGlobals } from '../../../term/env/strict-globals';
import { detailsPanel, detailsToggle, focusLost, holdsFocus, keyboardHeld, moreTrigger, onDocumentFocus, openerNow, overlayOpen } from './paneFocus';

test('in the terminal the pane never takes the keyboard and touches no document', () => {
  // Strict globals (test-preload) trap any read of document or window: running these calls clean is the proof.
  const seen = activeStrictGlobals()?.ledger().length ?? 0;
  const el = {} as HTMLElement;
  expect(keyboardHeld(el)).toBe(true);
  expect(focusLost()).toBe(false);
  expect(overlayOpen()).toBe(false);
  expect(openerNow()).toBeNull();
  expect(holdsFocus(el)).toBe(false);
  expect(moreTrigger(el)).toBeNull();
  expect(detailsPanel(el)).toBeNull();
  expect(detailsToggle(el)).toBeNull();
  const stop = onDocumentFocus(() => {}, () => {});
  expect(() => stop()).not.toThrow();
  // and nothing here read a browser global (the ledger is process-wide: only this test's reads count)
  expect((activeStrictGlobals()?.ledger() ?? []).slice(seen).map((r) => r.name)).toEqual([]);
});

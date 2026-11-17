// Gate escapes (crash allowance by case only): warnings are collected, only React's exact act() text is
// dropped, and a crash is allowed by case AND message, so a new throw in an allowed case is a new crash.
import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { withDemoView } from './demo-view';

// Drawn in place of the demo view for the first test only (withDemoView), so later files draw the real page.
function Noisy() {
  console.warn('probe warned while drawing');
  console.error('probe saving failed; see act( for details');
  return createElement('text', {}, 'noisy');
}

test('a page that warns, or logs an error mentioning act(, is reported; React\'s act() note is not', async () => {
  const { renderPage, ACT_WARNING } = await import('./render');
  await withDemoView(Noisy, async () => {
    const s = await renderPage({ page: 'demo' });
    try {
      expect(s.errors).toContain('warning: probe warned while drawing');
      expect(s.errors.filter((e) => !ACT_WARNING.test(e))).toContain('probe saving failed; see act( for details');
    } finally { s.close(); }
  });
  expect(ACT_WARNING.test('An update to Thing inside a test was not wrapped in act(...).')).toBe(true);
  expect(ACT_WARNING.test('The current testing environment is not configured to support act(...)')).toBe(true);
  expect(ACT_WARNING.test('probe: act( failed')).toBe(false);
}, 60_000);

test('crash allowances: by case and message; a bare case name (before the rule) still matches until --update re-keys it', async () => {
  const { crashKey, crashAllowed } = await import('./goldens');
  const k = crashKey('catalog', 'threw: boom');
  expect(crashAllowed([k], k)).toBe(true);
  expect(crashAllowed([k], crashKey('catalog', 'threw: another thing'))).toBe(false);
  expect(crashAllowed([crashKey('other', 'threw: boom')], k)).toBe(false);
  expect(crashAllowed(['catalog'], k)).toBe(true);
  expect(crashAllowed(['catalog'], crashKey('catalog-two', 'threw: boom'))).toBe(false);
});

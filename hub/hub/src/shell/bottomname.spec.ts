// Playwright (WCAG 2.5.3 Label in Name): on a phone, with a Bot waiting, the bottom bar's Bots tab draws the
// count badge and then its label ("1 Bots"); its name starts with those words in that order, and axe's
// label-content-name-mismatch finds nothing on the bar. Unit cases (lower bound, 99+, none): shell/BottomNav.test.tsx.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test('phone, a Bot waiting: the Bots tab is named by the words it draws first, and axe finds no mismatch (954)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The home 'attention' state: a running computer has a Bot waiting at a gate.
  await gotoHub(page, '/home', { state: 'attention' });
  const bar = page.getByRole('navigation', { name: strings['bottom.label'] });
  const bots = bar.locator('a[href$="#/bots"]');
  await expect(bots).toBeVisible();
  // The drawn words: the badge (aria-hidden, yet drawn) and the label, spaced as read; icons removed.
  const shown = () =>
    bots.evaluate((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('svg, [hidden], [class*="srOnly"], .hxSrOnly').forEach((n) => n.remove());
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    });
  await expect.poll(shown, { message: 'the Bots tab shows a waiting count', timeout: 15_000 }).toMatch(/^\d+\+?\s*\S/);
  const words = await shown();
  await expect(bots).toHaveAccessibleName(new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `));
  const axe = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).include('nav[aria-label="' + strings['bottom.label'] + '"]').analyze();
  expect(axe.violations.flatMap((v) => v.nodes.map((n) => n.html))).toEqual([]);
});

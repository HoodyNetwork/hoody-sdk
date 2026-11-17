// Playwright + axe: Home's Your realms rows are named starting with the words they show (axe
// label-content-name-mismatch). Scoped to the rows: other label-in-name sites on the page belong to the shell.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

for (const width of [1440, 390]) {
  test(`Your realms rows: name starts with the shown text (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/home');
    const rows = page.locator('#hub-main button[data-realm]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(3); // All realms plus two or more realms
    await expect(rows.first()).toHaveAccessibleName(new RegExp(`^${strings['realms.all']}`)); // "Showing" may follow
    for (const row of await rows.all()) {
      const shown = ((await row.innerText()) ?? '').replace(/\s+/g, ' ').trim();
      expect(shown).not.toBe('');
      await expect(row).toHaveAccessibleName(shown); // its name is exactly the words it shows
    }
    const r = await new AxeBuilder({ page }).include('#hub-main button[data-realm]').withRules(['label-content-name-mismatch']).analyze();
    expect(r.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([]);
  });
}

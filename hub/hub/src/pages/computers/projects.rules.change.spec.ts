// Playwright: changing a project's own access rules, wide and at phone width, light and dark. The owner picks
// Private, the confirm opens with the mode line and the counts of the computers shown, Save writes it and the tab says
// it now reads as chosen; the choices, the confirm and the drawer never scroll sideways.
import { expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

// The first visit compiles the page on a loaded host.
test.setTimeout(120_000);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

for (const width of [1350, 390]) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`at ${width}px, ${scheme}`, () => {
      test.use({ viewport: { width, height: 900 }, colorScheme: scheme });

      test('Private through the confirm; the tab then reads as chosen; no sideways scroll', async ({ page }) => {
        await gotoHub(page, '/computers/projects', { theme: scheme, state: 'rulesChange' });
        const name = 'Home base';
        const row = page.locator('[data-row-id]').filter({ has: page.getByText(name, { exact: true }) });
        await expect(row).toBeVisible({ timeout: 60_000 });
        await row.getByRole('button', { name: 'Row actions' }).click();
        await page.getByRole('menu').getByRole('menuitem', { name: new RegExp(strings['pp.open']) }).click();
        const d = page.getByRole('dialog', { name: fill(strings['pp.title'], { name }) });
        await d.getByRole('tab', { name: strings['pp.tab.rules'] }).click();
        const choices = d.getByRole('radiogroup', { name: strings['pp.rules.choice'] });
        await expect(choices).toBeVisible();
        await choices.getByText(strings['pp.rules.c.private'], { exact: true }).click();
        expect(await d.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`rules-choice-${width}-${scheme}.png`) });

        await d.getByRole('button', { name: strings['pp.rules.save'] }).click();
        const c = page.getByRole('alertdialog');
        await expect(c).toContainText(strings['pp.rules.confirm.mode.private']);
        await expect(c).toContainText(strings['pp.rules.confirm.others']);
        expect(await c.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`rules-confirm-${width}-${scheme}.png`) });
        await c.getByRole('button', { name: strings['pp.rules.go'] }).click();
        await expect(c).toBeHidden();

        await expect(d.getByText(strings['pp.rules.saved'])).toBeVisible();
        expect(await d.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
        await noSideScroll(page);
        await page.screenshot({ path: test.info().outputPath(`rules-saved-${width}-${scheme}.png`) });
      });
    });
  }
}

// Playwright: the Permissions drawer's People tab, wide and at phone width. The owner adds a person through the
// confirm that says what the level allows, the done line shows, the new row of the People table reads with its level
// and Remove in its menu, and nothing in the drawer or the page scrolls sideways.
import { expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

// The first visit compiles the page on a loaded host.
test.setTimeout(120_000);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');

for (const width of [1440, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('add a person through the confirm; the row shows with its level and Remove in its menu; no sideways scroll', async ({ page }) => {
      await gotoHub(page, '/computers/projects', { state: 'projectPeople' });
      // The fixture roster belongs to the first fixture project (the list sorts it elsewhere).
      const name = 'Home base';
      const row = page.locator('[data-row-id]').filter({ has: page.getByText(name, { exact: true }) });
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.getByRole('button', { name: 'Row actions' }).click();
      await page.getByRole('menu').getByRole('menuitem', { name: new RegExp(strings['pp.open']) }).click();
      const d = page.getByRole('dialog', { name: fill(strings['pp.title'], { name }) });
      await d.getByRole('tab', { name: strings['pp.tab.people'] }).click();
      const table = d.getByRole('table', { name: strings['pp.tab.people'] });
      const rows = table.locator('[data-row-id]');
      await expect(rows).toHaveCount(2);

      await d.getByRole('button', { name: strings['pp.add'] }).click();
      const form = d.getByRole('form', { name: strings['pp.add'] });
      await form.getByRole('textbox', { name: strings['pp.add.who'] }).fill('carol');
      await form.getByText(strings['pp.lvl.edit'], { exact: true }).click(); // the radio's own label
      await form.getByRole('button', { name: strings['pp.add.continue'] }).click();
      const c = page.getByRole('alertdialog');
      await expect(c).toContainText(fill(strings['pp.add.confirm.title'], { person: 'carol', name, level: strings['pp.lvl.edit'] }));
      await expect(c).toContainText(strings['pp.can.power']);
      await page.screenshot({ path: test.info().outputPath(`people-confirm-${width}.png`) });
      await c.getByRole('button', { name: strings['pp.add.confirm.go'] }).click();
      await expect(c).toBeHidden();

      await expect(d.getByText(fill(strings['pp.add.done'], { person: 'carol', level: strings['pp.lvl.edit'] }), { exact: true })).toBeVisible();
      const carol = rows.filter({ hasText: 'carol' });
      await expect(carol).toBeVisible();
      await expect(carol).toContainText(strings['pp.lvl.edit']);
      await carol.getByRole('button', { name: 'Row actions' }).click();
      const menu = page.getByRole('menu');
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${fill(strings['pp.lvl.change.to'], { person: 'carol', level: strings['pp.lvl.read'] })}`) })).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${fill(strings['pp.remove.label'], { person: 'carol' })}`) })).toBeVisible();
      await page.keyboard.press('Escape');
      // Every row keeps its controls inside it, and neither the drawer nor the page scrolls sideways.
      for (const r of await rows.all()) expect(await r.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
      expect(await d.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`people-added-${width}.png`) });
    });
  });
}

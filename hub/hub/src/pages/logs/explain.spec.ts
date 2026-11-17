// Playwright: the Explain drawer's model choice on fixtures. The chooser reads the computer's agent
// (core provider routes: Hoody AI ready, OpenAI's key not set); Change opens the kit chooser inside the drawer, and a
// ready model chosen there is what Ask sends. With HUB_PERF=1, the time from Change to the chooser's first rows on the
// real chat catalogue (fixture state explain7k: 206 providers, 7,078 models) is recorded as evidence, never asserted.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

async function openExplain(page: Page, state?: string): Promise<void> {
  await gotoHub(page, '/logs?src=everything', state ? { state } : {});
  await page.getByRole('button', { name: 'More actions', exact: true }).first().click(); // reason: the page header's menu comes first; each row's menu has the same name
  await page.getByRole('menuitem', { name: strings['act.explain'] }).click();
  await expect(page.getByRole('dialog', { name: strings['explain.title'] })).toBeVisible();
}

test('Change opens the kit model chooser in the drawer, with no ensembles and no endpoint link', async ({ page }) => {
  await openExplain(page);
  const drawer = page.getByRole('dialog', { name: strings['explain.title'] });
  await drawer.getByRole('button', { name: strings['explain.model.change'] }).click();
  await expect(drawer.getByRole('listbox')).toBeVisible();
  await expect(drawer.getByRole('combobox')).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Set up a provider' }).click();
  await expect(drawer.getByRole('button', { name: /Your own endpoint/ })).toHaveCount(0);
});

test('a ready model chosen in the chooser is the pick; Ask answers once', async ({ page }) => {
  await openExplain(page);
  const drawer = page.getByRole('dialog', { name: strings['explain.title'] });
  await drawer.getByRole('button', { name: strings['explain.model.change'] }).click();
  await drawer.getByRole('option', { name: /Hoody Free/ }).click();
  await expect(drawer.getByRole('listbox')).toHaveCount(0);
  await expect(drawer.getByText(strings['explain.cost.free'])).toBeVisible();
  await drawer.getByRole('button', { name: strings['explain.ask'] }).click();
  await expect(drawer.getByText(/The same download failed/)).toBeVisible();
  await expect(drawer.getByRole('button', { name: strings['explain.again'] })).toBeVisible();
});

test('@perf Change on the 7k catalogue: time to the chooser\'s first rows (evidence)', async ({ page }, info) => {
  test.skip(process.env.HUB_PERF !== '1', 'HUB_PERF=1 only');
  test.setTimeout(180_000);
  const runs: number[] = [];
  await openExplain(page, 'explain7k');
  const drawer = page.getByRole('dialog', { name: strings['explain.title'] });
  for (let i = 0; i < 5; i++) {
    if (i > 0) {
      // The same hash URL does not reload the page, so each later run closes the drawer and opens Explain again.
      await expect(async () => {
        await page.keyboard.press('Escape');
        await expect(drawer).toHaveCount(0, { timeout: 1_000 });
      }).toPass({ timeout: 30_000 });
      await page.getByRole('button', { name: 'More actions', exact: true }).first().click(); // reason: the page header's menu comes first; each row's menu has the same name
      await page.getByRole('menuitem', { name: strings['act.explain'] }).click();
      await expect(drawer).toBeVisible();
    }
    await expect(drawer.getByText(strings['explain.model.loading'])).toHaveCount(0, { timeout: 60_000 });
    const t0 = await page.evaluate(() => performance.now());
    await drawer.getByRole('button', { name: strings['explain.model.change'] }).click();
    await drawer.getByRole('listbox').getByRole('option').first().waitFor({ timeout: 60_000 }); // reason: any first row ends the measure
    runs.push((await page.evaluate(() => performance.now())) - t0);
  }
  const sorted = [...runs].sort((a, b) => a - b);
  info.annotations.push({ type: 'perf', description: `explain7k Change→first rows ms: ${runs.map((x) => x.toFixed(0)).join(', ')} (median ${sorted[2]!.toFixed(0)})` });
  expect(runs).toHaveLength(5);
});

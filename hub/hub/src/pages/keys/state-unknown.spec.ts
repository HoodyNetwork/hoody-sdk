// Playwright: a key whose change is not confirmed puts more than one word in its State cell (140px, fixed for the
// terminal's sake). This page's delete: "Not confirmed", Check again and Stop tracking; after a Check that proved
// nothing, its outcome pill instead of the words. Another page's: "Held on another page" and that page's link. At
// 1350 and at 390 each part sits inside the cell's visible box and shows its words whole: they wrap there instead of
// running past the cell, which clipped them (focusable but not seen).
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

// The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright): a keys-only
// server serves no Account page, so a change held there shows no link to it (its words still show, and still wrap).
const KEYS_ONLY = process.env.HUB_PAGE === 'keys';

async function deleteUnconfirmed(page: Page, width: number) {
  await page.goto('about:blank');
  await page.setViewportSize({ width, height: 900 });
  await gotoHub(page, '/keys', { state: 'deleteUnknown', theme: 'light', latency: 'instant' });
  const name = page.getByRole('row').filter({ hasText: 'ci-deploy' }).getByText('ci-deploy', { exact: true });
  await name.waitFor({ timeout: 30_000 });
  await name.click();
  await page.getByRole('button', { name: strings['act.delete'], exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: strings['del.go'] }).click();
  // An answer that does not confirm may keep the Delete dialog up: close it (the outcome's own toast stays).
  const confirm = page.getByRole('alertdialog').filter({ has: page.getByRole('button', { name: strings['del.go'] }) });
  await page.waitForTimeout(1500); // reason: the pending answer lands within the fixture's instant latency
  if (await confirm.count()) await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  // On a phone the detail covers the list: back to it.
  if (width < 600) await page.goBack();
}

const rowOf = (page: Page, words: string) =>
  page.locator('tr, [role=row]').filter({ hasText: 'ci-deploy' }).filter({ hasText: words }).first();

/** Every part of the cell's state group sits inside the cell and shows its words whole. */
async function partsFit(part: Locator, what: string) {
  await expect(part).toBeVisible();
  const fit = await part.evaluate((el) => {
    const cell = el.closest('td, [role=cell], [role=gridcell]') as HTMLElement;
    const c = cell.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const inside = r.width > 0 && r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5;
    // Whole across and down: a part whose words wrap grows to hold them (a fixed-height pill clipped its second line by
    // 3px or more). Down, up to 2px is the font's own ascent and descent past its line boxes (a kit Button's two-line
    // label measures 28 in 26), not a lost line.
    const whole = [el, ...el.querySelectorAll('*')].every((n) => {
      const e = n as HTMLElement;
      return e.clientWidth === 0 || (e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 2);
    });
    return { inside, whole };
  });
  expect(fit, what).toEqual({ inside: true, whole: true });
}

for (const width of [1350, 390]) {
  test(`${width}: Check again and Stop tracking sit inside the State cell`, async ({ page }) => {
    await deleteUnconfirmed(page, width);
    const row = rowOf(page, strings['state.unknown']);
    await expect(row).toBeVisible({ timeout: 15_000 });
    for (const label of [strings['state.checkAgain'], strings['dismiss.act']])
      await partsFit(row.getByRole('button', { name: label }), `${label} at ${width}`);
  });

  test(`${width}: after a Check that proved nothing, its pill and both buttons sit inside the State cell`, async ({ page }) => {
    await deleteUnconfirmed(page, width);
    const row = rowOf(page, strings['state.unknown']);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: strings['state.checkAgain'] }).click();
    // The fixture's delete stays pending: the Check proves nothing and the row says so in a pill.
    const said = page.locator('tr, [role=row]').filter({ hasText: 'ci-deploy' }).filter({ has: page.getByRole('button', { name: strings['dismiss.act'] }) });
    await expect(said).not.toContainText(strings['state.unknown'], { timeout: 15_000 });
    const pill = said.getByRole('button', { name: strings['state.checkAgain'] }).locator('xpath=..').locator('> :first-child');
    await partsFit(pill, `the Check's pill at ${width}`);
    for (const label of [strings['state.checkAgain'], strings['dismiss.act']])
      await partsFit(said.getByRole('button', { name: label }), `${label} after a Check at ${width}`);
  });

  test(`${width}: a change held by another page shows its words and link inside the State cell`, async ({ page }) => {
    await deleteUnconfirmed(page, width);
    // The delete was sent here; mark it as sent from Account (core's own record), then open the page again.
    await page.evaluate(() => {
      const k = 'hub.v3.changes';
      // eslint-disable-next-line no-restricted-globals -- the test marks core's stored change as another page's, in the browser
      const rows = JSON.parse(localStorage.getItem(k) ?? '[]') as { meta?: { page?: string; by?: string } }[];
      for (const r of rows)
        if (r.meta) {
          r.meta.page = 'account';
          if (r.meta.by) r.meta.by = r.meta.by.replace(/@\/keys$/, '@/account');
        }
      // eslint-disable-next-line no-restricted-globals -- the test marks core's stored change as another page's, in the browser
      localStorage.setItem(k, JSON.stringify(rows));
    });
    // reason: the same URL again is a same-document navigation; a reload reads the record afresh
    await page.reload();
    await page.locator('#hub-main').waitFor();
    const row = rowOf(page, strings['state.heldElsewhere']);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await partsFit(row.getByText(strings['state.heldElsewhere'], { exact: true }), `the words at ${width}`);
    const link = row.getByRole('link', { name: strings['op.openSender'] });
    if (KEYS_ONLY) await expect(link).toHaveCount(0);
    else await partsFit(link, `the link at ${width}`);
  });
}

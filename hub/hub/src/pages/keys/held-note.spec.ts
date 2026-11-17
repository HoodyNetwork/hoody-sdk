// Playwright: the note of a change held by another page ("Another page…" banner, then that page's link) in the key's
// inspector. The banner takes the note's whole width, so its title wraps across that width instead of one word per line
// (shrunk to its content in the note's column), at 1350 and at 390.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

/** A delete left unconfirmed, then marked as sent from Account (core's own record), the page opened again with the key's
 *  inspector showing. */
async function heldByAccount(page: Page, width: number) {
  await page.goto('about:blank');
  await page.setViewportSize({ width, height: 900 });
  await gotoHub(page, '/keys', { state: 'deleteUnknown', theme: 'light', latency: 'instant' });
  const name = page.getByRole('row').filter({ hasText: 'ci-deploy' }).getByText('ci-deploy', { exact: true });
  await name.waitFor({ timeout: 30_000 });
  await name.click();
  await page.getByRole('button', { name: strings['act.delete'], exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: strings['del.go'] }).click();
  const confirm = page.getByRole('alertdialog').filter({ has: page.getByRole('button', { name: strings['del.go'] }) });
  await page.waitForTimeout(1500); // reason: the pending answer lands within the fixture's instant latency
  if (await confirm.count()) await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
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
}

for (const width of [1350, 390]) {
  test(`${width}: the held note's banner spans the note and its title uses that width`, async ({ page }) => {
    await heldByAccount(page, width);
    const insp = page.getByRole('region', { name: 'Details' });
    const note = insp.locator('[class*="elsewhere"]').first();
    await expect(note).toBeVisible({ timeout: 30_000 });
    await expect(note).toContainText(strings['op.heldElsewhere']);
    const m = await note.evaluate((n) => {
      const banner = n.firstElementChild as HTMLElement;
      const w = n.getBoundingClientRect().width;
      // The banner's widest line of words: its text's own box, measured through a Range over the banner's text.
      const r = document.createRange();
      r.selectNodeContents(banner);
      const text = [...r.getClientRects()].reduce((x, b) => Math.max(x, b.width), 0);
      return { span: banner.getBoundingClientRect().width / w, title: text / w };
    });
    expect(m.span, `banner width / note width at ${width}`).toBeGreaterThan(0.98);
    // Squeezed, the title column was one word wide (about a fifth of the note).
    expect(m.title, `title width / note width at ${width}`).toBeGreaterThan(0.5);
  });
}

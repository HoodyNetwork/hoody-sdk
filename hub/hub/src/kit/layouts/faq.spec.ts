// The page FAQ in a real browser (gallery `/_kit?layout=faq`): a location that names a question lands on it (opens,
// scrolls, focuses it, marks it for a moment); a FaqLink on the page jumps to its question, again from the place it already
// names; a FaqLink inside a dialog peeks at the answer without closing the dialog and without a way off the page. Light and
// dark, at 1350 and 390.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const ROUTE = '/_kit?layout=faq';
const HOLD = 'A payout is held for 60 days after the purchase';

async function open(page: Page, hash: string, theme: 'light' | 'dark', width: number) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await gotoHub(page, `${ROUTE}${hash}`, { theme });
}

/** The question button inside the `#faq-<id>` item. */
const question = (page: Page, id: string) => page.locator(`#faq-${id} button[aria-expanded]`);

/** The item shows inside the scroller (#hub-main), with its top clear of the scroller's top edge. */
async function inView(page: Page, id: string): Promise<boolean> {
  return page.evaluate((sid) => {
    const main = document.getElementById('hub-main');
    const el = document.getElementById(`faq-${sid}`);
    if (!main || !el) return false;
    const m = main.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.top >= m.top - 1 && r.top < m.bottom - 40;
  }, id);
}

// Each case opens a page, a dialog or a peek and waits on animations: a loaded host needs more than the 30 s default.
test.describe.configure({ timeout: 90_000 });

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1350, 390]) {
    const where = `${theme} ${width}`;

    test(`${where}: a location naming a question lands on it, once`, async ({ page }, info) => {
      await open(page, '#faq-count', theme, width);
      const q = question(page, 'count');
      await expect(q).toHaveAttribute('aria-expanded', 'true');
      await expect(q).toBeFocused();
      await expect.poll(() => inView(page, 'count'), { message: 'the question is scrolled into view', timeout: 10000 }).toBe(true);
      await page.screenshot({ animations: 'disabled', path: info.outputPath('landed.png') });
      // The mark is for a moment; closing the question afterwards is the person's own and nothing opens it again.
      await expect(page.locator('#faq-count[data-hub-here]')).toHaveCount(0, { timeout: 4000 });
      await q.click();
      await expect(q).toHaveAttribute('aria-expanded', 'false');
      await page.waitForTimeout(600);
      await expect(q).toHaveAttribute('aria-expanded', 'false');
    });

    test(`${where}: a FaqLink on the page jumps to its question, and again from the place it names`, async ({ page }, info) => {
      await open(page, '', theme, width);
      await expect(question(page, 'rate')).toHaveAttribute('aria-expanded', 'false');
      const link = page.getByRole('link', { name: 'What is the rate?', exact: true });
      await link.click();
      await expect(page).toHaveURL(/#faq-rate$/);
      await expect(question(page, 'rate')).toHaveAttribute('aria-expanded', 'true');
      await expect(question(page, 'rate')).toBeFocused();
      await expect.poll(() => inView(page, 'rate')).toBe(true);
      await page.screenshot({ animations: 'disabled', path: info.outputPath('jumped.png') });
      // Close it, scroll away, press the same link again: it lands again (a new history entry).
      const before = await page.evaluate(() => history.length);
      await question(page, 'rate').click();
      await expect(question(page, 'rate')).toHaveAttribute('aria-expanded', 'false');
      await page.evaluate(() => document.getElementById('hub-main')?.scrollTo({ top: 0 }));
      await link.click();
      await expect(question(page, 'rate')).toHaveAttribute('aria-expanded', 'true');
      await expect(question(page, 'rate')).toBeFocused();
      expect(await page.evaluate(() => history.length), 'the second press pushed an entry').toBe(before + 1);
    });

    test(`${where}: inside a dialog a FaqLink peeks, the dialog stays and the peek has no way off the page`, async ({ page }, info) => {
      await open(page, '', theme, width);
      await page.getByRole('button', { name: 'Join', exact: true }).click();
      const dialog = page.locator('[data-hub-overlay="join"]');
      await expect(dialog).toBeVisible();
      const hashBefore = await page.evaluate(() => location.hash);
      const link = dialog.getByRole('link', { name: 'Why are payouts held?' });
      await link.click();
      const peek = page.getByText(HOLD).locator('visible=true');
      await expect(peek).toBeVisible();
      await expect(dialog, 'the dialog stays open under its peek').toBeVisible();
      expect(await page.evaluate(() => location.hash), 'a peek writes no location').toBe(hashBefore);
      await expect(page.getByRole('link', { name: 'Program rules' }).locator('visible=true'), 'no action inside an overlay').toHaveCount(0);
      await page.screenshot({ animations: 'disabled', path: info.outputPath('peek.png') });
      // Escape closes the peek only; focus returns to the link and the dialog is still there.
      await page.keyboard.press('Escape');
      await expect(peek).toBeHidden();
      await expect(dialog).toBeVisible();
      await expect(link).toBeFocused();
      // Escape again closes the dialog.
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    });
  }
}

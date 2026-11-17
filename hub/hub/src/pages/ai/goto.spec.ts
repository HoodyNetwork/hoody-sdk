// Playwright: Connect -> Anthropic -> "Use your Claude plan" draws Claude Code's rows in the drawer, which stays open.
// The palette's section commands (Set up Claude Code, See what AI cost) move between two sections of the page the reader is
// already on, with no reload: each must scroll there, not only the first deep link of the page's life.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import kit from '@kit/pickers/ModelChooser.strings.en.json';

async function shown(page: Page, id: string): Promise<boolean> {
  return page.evaluate((sid) => {
    const main = document.getElementById('hub-main');
    const h = document.querySelector<HTMLElement>(`[data-section="${CSS.escape(sid)}"] h2`);
    if (!main || !h) return false;
    // The phone strip is sticky over the top of the scroller: the heading must clear it, not just be inside the scroller.
    const nav = document.querySelector<HTMLElement>('nav[aria-label] [data-nav]')?.closest('nav');
    const strip = nav && getComputedStyle(nav).flexDirection === 'row' ? nav.offsetHeight : 0;
    const m = main.getBoundingClientRect();
    const r = h.getBoundingClientRect();
    return r.top >= m.top + strip - 1 && r.bottom <= m.bottom + 1;
  }, id);
}

for (const size of [{ width: 1440, height: 520 }, { width: 390, height: 600 }]) {
  test(`Anthropic in Connect offers the Claude plan and shows Claude Code's rows in the drawer at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await gotoHub(page, '/ai/models');
    await page.locator('nav[aria-label] button[data-nav="default"]').waitFor();
    await page.getByRole('button', { name: strings['connect.open'] }).click();
    const dialog = page.getByRole('dialog');
    // Claude Code is Anthropic's second way: no Other way of its own, and the drawer stays open on it.
    await expect(dialog.getByRole('button', { name: kit['dir.endpoint'], exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: kit['dir.claude'], exact: true })).toHaveCount(0);
    // The provider's row may hold more than one button (its name, its links): the first is the row itself.
    await dialog.locator('[data-provider="anthropic"] button').first().click();
    await expect(dialog.getByRole('radio', { name: new RegExp(`^${strings['connect.plan']}`) })).toBeChecked();
    await expect(dialog.getByRole('heading', { name: /^Claude Code on / })).toBeVisible();
    await expect(dialog.getByRole('link', { name: strings['connect.planTerms'] })).toBeVisible();
    await expect(page).not.toHaveURL(/section=claude/);
  });
}

for (const size of [{ width: 1440, height: 520 }, { width: 390, height: 600 }]) {
  test(`the palette moves from one section of the AI page to another, and back, at ${size.width}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(size);
    await gotoHub(page, '/ai/models?section=claude');
    await expect.poll(() => shown(page, 'claude'), { message: 'the deep link lands on Claude Code', timeout: 15000 }).toBe(true);
    const command = async (label: string) => {
      await page.keyboard.press('ControlOrMeta+k');
      const palette = page.getByRole('dialog', { name: 'Command palette' }); // the shell's palette label (pages may not import shell strings)
      await expect(palette).toBeVisible();
      await palette.getByRole('searchbox').fill(label);
      await palette.getByRole('menuitem', { name: label }).click();
    };
    for (const [id, label] of [['spending', strings['cmd.spending']], ['claude', strings['cmd.claude']]] as const) {
      await command(label);
      await expect(page).toHaveURL(new RegExp(`section=${id}`));
      await expect.poll(() => shown(page, id), { message: `${id} section in view after its palette command`, timeout: 10000 }).toBe(true);
      await page.waitForTimeout(500);
      expect(await shown(page, id), `${id} still in view half a second later`).toBe(true);
      await expect(page.locator(`nav[aria-label] button[data-nav="${id}"]`)).toHaveAttribute('aria-current', 'true');
    }
  });
}

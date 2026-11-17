// Playwright: the composer's "/" menu on New chat, in the whole Hub (fixtures). A "/" into the empty draft lists the
// computer's skills in use (the fixture's off and broken ones never); the menu sits above the draft box, inside the viewport, the
// box's width, never over the box; arrows and Enter pick into the draft and nothing is sent; the "/" button does the same. At 360,
// 390 and 1440, left-to-right and right-to-left.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import conv from '@kit/agent/Conversation.strings.en.json';
import { links } from './links';

const box = (page: Page) => page.getByRole('textbox', { name: conv['agent.composer'] });
const list = (page: Page) => page.getByRole('listbox', { name: conv['agent.slashList'] });
const name = (n: string) => conv['agent.slashName'].replace('{{name}}', n);

for (const c of [
  { width: 1440, rtl: false }, { width: 390, rtl: false }, { width: 360, rtl: false }, { width: 390, rtl: true },
]) {
  test(`New chat at ${c.width}${c.rtl ? ' rtl' : ''}: "/" lists the skills above the box, inside the screen; Enter picks into the draft`, async ({ page }) => {
    await page.setViewportSize({ width: c.width, height: c.width < 600 ? 844 : 900 });
    await gotoHub(page, links.newChat);
    if (c.rtl) await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
    await box(page).click();
    await box(page).pressSequentially('/');
    await expect(list(page)).toBeVisible({ timeout: 20000 });
    const opts = list(page).getByRole('option');
    await expect(opts.filter({ hasText: name('deploy-check') })).toHaveCount(1);
    await expect(opts.filter({ hasText: name('sql-review') })).toHaveCount(1);
    await expect(opts.filter({ hasText: name('pdf-tools') }), 'an off skill is not offered').toHaveCount(0);
    await expect(opts.filter({ hasText: name('broken') }), 'a broken skill is not offered').toHaveCount(0);
    await noSideScroll(page);
    const vp = page.viewportSize()!;
    const m = (await list(page).locator('xpath=..').boundingBox())!;
    const b = (await box(page).boundingBox())!;
    expect(m.x >= -0.5 && m.y >= -0.5 && m.x + m.width <= vp.width + 0.5 && m.y + m.height <= vp.height + 0.5, 'the menu is inside the viewport').toBe(true);
    expect(m.y + m.height, 'the menu ends above the draft box').toBeLessThanOrEqual(b.y + 0.5);
    // The row the box names is topmost at its centre (nothing covers the menu).
    const first = opts.first();
    const hit = await first.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!at && (at === el || el.contains(at));
    });
    expect(hit, 'the first command is not covered').toBe(true);
    await box(page).pressSequentially('sql');
    await expect(opts).toHaveCount(1);
    await box(page).press('Enter');
    await expect(box(page)).toHaveValue(`${name('sql-review')} `);
    await expect(list(page)).toHaveCount(0);
    await expect(box(page)).toBeFocused();
  });
}

test('New chat: the "/" button opens the same menu on an empty draft, and waits while there is text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, links.newChat);
  const btn = page.getByRole('button', { name: conv['agent.slash'], exact: true });
  await btn.click();
  await expect(list(page)).toBeVisible({ timeout: 20000 });
  await expect(box(page)).toHaveValue('/');
  await expect(box(page)).toBeFocused();
  await box(page).press('Escape');
  await expect(list(page)).toHaveCount(0);
  await box(page).fill('hello');
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
});

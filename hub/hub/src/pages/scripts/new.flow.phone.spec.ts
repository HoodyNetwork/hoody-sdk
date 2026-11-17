// Playwright (New script, flow layout at phone width): the wizard's footer stays at the bottom of the screen, so the step
// under it must always be able to come out from under it. Scrolled to the end, the step's last control sits wholly above
// the footer; a control reached with Tab is brought into view above the footer, never left behind it; and the footer
// rests on the phone's bottom bar, with no strip of the step showing between them. Run by hub:check
// --page scripts.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';
import { EXAMPLES } from './new/examples';

const LONG = 'Count last week\'s sign-ups and send me the number';

async function toWhat(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/scripts/new');
  await expect(page.getByRole('textbox', { name: strings['flow.what.describe'] })).toBeVisible();
}

async function footerTop(page: Page): Promise<number> {
  const box = await page.getByRole('button', { name: strings['flow.continue'] }).locator('xpath=ancestor::*[contains(@class,"wizardFooter")][1]').boundingBox();
  expect(box, 'the footer is shown').toBeTruthy();
  return box!.y;
}

test('at 390, scrolled to the end, the step\'s last control is wholly above the footer', async ({ page }) => {
  await toWhat(page);
  await page.getByRole('textbox', { name: strings['flow.what.describe'] }).fill(LONG);
  const last = page.getByRole('button', { name: strings[`new.ex.${EXAMPLES[EXAMPLES.length - 1]!}`] });
  // Scroll every scroller to its end, as a person swiping all the way down.
  await page.mouse.move(195, 400);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 600);
  await page.waitForTimeout(150);
  const box = await last.boundingBox();
  expect(box, 'the last example is drawn').toBeTruthy();
  expect(box!.y + box!.height, 'above the footer').toBeLessThanOrEqual(await footerTop(page));
});

test('at 390, a long step\'s footer sits right on the bottom bar: no step content shows between them', async ({ page }) => {
  await toWhat(page);
  await page.getByRole('textbox', { name: strings['flow.what.describe'] }).fill(LONG);
  // The phone's bottom bar: whatever is drawn at the bottom edge of the screen (the shell's, not this page's to name).
  const nav = await page.evaluate(() => {
    const r = document.elementFromPoint(innerWidth / 2, innerHeight - 2)?.closest('nav')?.getBoundingClientRect();
    return r ? { y: r.y, height: r.height } : null;
  });
  const foot = await page.getByRole('button', { name: strings['flow.continue'] }).locator('xpath=ancestor::*[contains(@class,"wizardFooter")][1]').boundingBox();
  expect(nav && foot, 'the bottom bar and the footer are drawn').toBeTruthy();
  expect(Math.abs(foot!.y + foot!.height - nav!.y), 'the footer ends where the bottom bar starts').toBeLessThanOrEqual(1);
});

test('at 390, every control reached with Tab is brought into view above the footer (never hidden behind it)', async ({ page }) => {
  await toWhat(page);
  const box = page.getByRole('textbox', { name: strings['flow.what.describe'] });
  await box.fill(LONG);
  await box.focus();
  const footer = page.getByRole('button', { name: strings['flow.continue'] }).locator('xpath=ancestor::*[contains(@class,"wizardFooter")][1]');
  // Tab on from the description through the examples: each stop is checked where it lands, before the next key.
  for (const id of EXAMPLES) {
    await page.keyboard.press('Tab');
    const chip = page.getByRole('button', { name: strings[`new.ex.${id}`] });
    await expect(chip).toBeFocused();
    await page.waitForTimeout(100);
    const b = await chip.boundingBox();
    const f = await footer.boundingBox();
    expect(b!.y + b!.height, `${id}: above the footer`).toBeLessThanOrEqual(f!.y);
  }
});

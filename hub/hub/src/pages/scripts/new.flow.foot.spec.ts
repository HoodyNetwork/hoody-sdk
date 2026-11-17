// Playwright (New script): in a real browser at phone width the wizard
// footer is one row (Back and the step's action side by side, nothing wrapping under the bottom bar), and typing in Check's
// editor keeps the caret there while the check re-runs. Run by hub:check --page scripts.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import kit from '@kit/strings.en.json';
import strings from './strings.en.json';

const CODE = 'export default () => new Response("foot");';

async function toWrite(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  // /scripts/new mints the draft in this tab (an id it never made would be "can't be opened here").
  await gotoHub(page, '/scripts/new');
  await page.getByRole('button', { name: new RegExp(strings['flow.what.writeCard']) }).click();
  const address = page.getByRole('textbox', { name: strings['new.address'] });
  await address.fill('/foot');
  await page.getByRole('button', { name: strings['flow.continue'] }).click();
  await expect(page.getByRole('heading', { name: strings['flow.write.title'] })).toBeVisible();
}

test('at 390 the wizard footer is one row: Back and Continue side by side', async ({ page }) => {
  await toWrite(page);
  const back = await page.getByRole('button', { name: kit['wizard.back'], exact: true }).boundingBox();
  const next = await page.getByRole('button', { name: strings['flow.continue'] }).boundingBox();
  expect(back && next, 'both footer buttons shown').toBeTruthy();
  // One row: their vertical centres agree, and Continue sits to the right of Back.
  expect(Math.abs((back!.y + back!.height / 2) - (next!.y + next!.height / 2)), 'same row').toBeLessThanOrEqual(2);
  expect(next!.x, 'Continue after Back').toBeGreaterThan(back!.x + back!.width - 1);
  // Nothing hangs off the right edge of a phone.
  expect(next!.x + next!.width, 'inside the screen').toBeLessThanOrEqual(390);
});

test('at 390 Cancel is in that row too, between Back and Continue, and the header holds the title alone', async ({ page }) => {
  await toWrite(page);
  const back = await page.getByRole('button', { name: kit['wizard.back'], exact: true }).boundingBox();
  const cancel = await page.getByRole('button', { name: strings['new.cancel'] }).boundingBox();
  const next = await page.getByRole('button', { name: strings['flow.continue'] }).boundingBox();
  expect(back && cancel && next, 'the three footer buttons shown').toBeTruthy();
  expect(Math.abs((cancel!.y + cancel!.height / 2) - (next!.y + next!.height / 2)), 'Cancel in the row of Continue').toBeLessThanOrEqual(2);
  expect(cancel!.x, 'Cancel after Back').toBeGreaterThan(back!.x + back!.width - 1);
  expect(next!.x, 'Continue after Cancel').toBeGreaterThan(cancel!.x + cancel!.width - 1);
  expect(next!.x + next!.width, 'inside the screen').toBeLessThanOrEqual(390);
  await expect(page.locator('header:has(h1) button')).toHaveCount(0);
});

test('typing in Check\'s editor keeps the caret there while the check runs again', async ({ page }) => {
  await toWrite(page);
  const code = page.getByRole('textbox', { name: strings['new.code'] });
  await code.fill(CODE);
  await page.getByRole('button', { name: strings['flow.continue'] }).click();
  await expect(page.getByRole('heading', { name: strings['flow.check.title'] })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(strings['flow.built.seeCode']) }).click();
  await page.getByRole('button', { name: strings['flow.check.edit'] }).click();
  const editor = page.getByRole('textbox', { name: strings['new.code'] });
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' // more', { delay: 30 });
  // The edit drops the verdict at once; the check then runs on the new bytes, and the caret never leaves the editor.
  await expect(page.getByText(strings['flow.check.ready'])).toBeHidden();
  await expect(page.getByText(strings['flow.check.ready'])).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue(new RegExp(`${CODE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.* // more`));
});

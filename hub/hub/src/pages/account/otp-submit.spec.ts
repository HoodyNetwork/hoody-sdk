// Playwright: a typed 6-digit code reaches the page when its form submits in a real browser.
// The kit OtpField wipes the code after its form submits; a microtask wipe ran before React's onSubmit on a
// browser-dispatched submit, so Turn on and Make new codes always read an empty code. jsdom cannot show
// this (a script-dispatched submit runs no microtask between listeners), so it is proven here.
import { type Locator, type Page, expect } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import strings from './strings.en.json';

/** Type the code the way a person does: into the field, digit by digit. */
async function typeCode(page: Page, drawer: Locator): Promise<void> {
  await drawer.getByLabel(strings['2fa.code']).click();
  await page.keyboard.type('123456');
  await expect(drawer.getByLabel(strings['2fa.code'])).toHaveValue('123456');
}

async function setupStep2(page: Page): Promise<Locator> {
  await gotoHub(page, '/account', { state: 'twofa-off' });
  await page.getByRole('button', { name: strings['2fa.turnOn'] }).last().click();
  const drawer = page.getByRole('dialog', { name: strings['2fa.setupTitle'] });
  await drawer.getByLabel(strings['pw.current']).fill('password');
  await drawer.getByRole('button', { name: strings['2fa.next'] }).click();
  await expect(drawer.getByRole('img', { name: strings['2fa.qrAlt'] })).toBeVisible();
  return drawer;
}

for (const order of ['tick, then code, then Turn on', 'code, then tick, then Turn on', 'tick, then code, then Enter'] as const) {
  test(`two-step setup turns on with a typed code (${order})`, async ({ hubPage: page }) => {
    const drawer = await setupStep2(page);
    if (order.startsWith('code')) {
      await typeCode(page, drawer);
      await drawer.getByText(strings['2fa.iSaved']).click();
    } else {
      await drawer.getByText(strings['2fa.iSaved']).click();
      await typeCode(page, drawer);
    }
    if (order.endsWith('Enter')) await page.keyboard.press('Enter');
    else await drawer.getByRole('button', { name: strings['2fa.confirm'] }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByText(strings['2fa.eFormat'])).toHaveCount(0);
    await expect(page.getByText(strings['2fa.nowOn'])).toBeVisible();
  });
}

for (const how of ['the button', 'Enter'] as const) {
  test(`Make new codes takes a typed code (${how})`, async ({ hubPage: page }) => {
    await gotoHub(page, '/account?section=two-step');
    await page.getByRole('button', { name: strings['2fa.newCodes'] }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel(strings['pw.current']).fill('password');
    await typeCode(page, drawer);
    if (how === 'Enter') await page.keyboard.press('Enter');
    else await drawer.getByRole('button', { name: strings['2fa.makeCodes'] }).click();
    await expect(drawer.getByRole('button', { name: strings['2fa.done'] })).toBeVisible();
    await expect(drawer.getByText(strings['2fa.eFormat'])).toHaveCount(0);
  });
}

test('a refused code is never left in the field after it was sent', async ({ hubPage: page }) => {
  await gotoHub(page, '/account?sheet=setup', { state: 'code-wrong' });
  const drawer = page.getByRole('dialog', { name: strings['2fa.setupTitle'] });
  await drawer.getByLabel(strings['pw.current']).fill('password');
  await drawer.getByRole('button', { name: strings['2fa.next'] }).click();
  await drawer.getByText(strings['2fa.iSaved']).click();
  await typeCode(page, drawer);
  await drawer.getByRole('button', { name: strings['2fa.confirm'] }).click();
  await expect(drawer.getByText(strings['err.code'])).toBeVisible();
  await expect(drawer.getByLabel(strings['2fa.code'])).toHaveValue('');
});

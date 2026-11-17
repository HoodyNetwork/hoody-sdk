// Playwright: on a Computers card the realm "+N" after the chip names the other realms: the kit
// tooltip on hover and on keyboard focus, a popover on a tap, and an accessible name with the same words.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { choosePresentation } from '@app/e2e-toolbar';

const WORDS = '2 more realms: Acme client, Lab';
const NAME = `+${WORDS}`;
// The first visit compiles the page on a loaded host.
test.setTimeout(120_000);

test('Computers card: "+2" names the other realms on hover and keyboard focus', async ({ page }) => {
  await gotoHub(page, '/computers', { state: 'realms3' });
  const list = page.getByRole('table', { name: 'Computers' });
  await expect(list.locator('tbody tr[data-row-id]').first()).toBeVisible({ timeout: 60_000 });
  await choosePresentation(page.locator('#hub-main'), 'cards');
  const more = list.getByRole('button', { name: NAME });
  await expect(more).toHaveText('+2');
  await more.hover();
  await expect(page.getByRole('tooltip')).toHaveText(WORDS);
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toBeHidden();
  await more.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(more).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText(WORDS);
  await page.screenshot({ path: test.info().outputPath('realm-more-1440.png') });
  // Opening it and pressing its text never presses the card (the card's own click opens the computer: ?sel=).
  await page.keyboard.press('Enter');
  const pop = page.getByRole('dialog', { name: WORDS });
  await expect(pop).toBeVisible();
  await pop.getByText(WORDS).click();
  // Checked before Escape (which could close an opened computer again): the press opened nothing.
  await page.waitForTimeout(300);
  expect(page.url()).not.toContain('sel=');
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  expect(page.url()).not.toContain('sel=');
});

test('Computers list (table): pressing "+2" and its text never opens the computer', async ({ page }) => {
  await gotoHub(page, '/computers', { state: 'realms3' });
  const list = page.getByRole('table', { name: 'Computers' });
  await expect(list.locator('tbody tr[data-row-id]').first()).toBeVisible({ timeout: 60_000 });
  await choosePresentation(page.locator('#hub-main'), 'list');
  await list.getByRole('button', { name: NAME }).click();
  const pop = page.getByRole('dialog', { name: WORDS });
  expect(page.url()).not.toContain('sel=');
  await pop.getByText(WORDS).click();
  // Checked before Escape (which could close an opened computer again): the press opened nothing.
  await page.waitForTimeout(300);
  expect(page.url()).not.toContain('sel=');
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  // A row's own click opens the computer (?sel=); "+2" and its popover never do.
  expect(page.url()).not.toContain('sel=');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Computers card: a tap on "+2" opens the same words', async ({ page }) => {
    await gotoHub(page, '/computers', { state: 'realms3' });
    const list = page.getByRole('table', { name: 'Computers' });
    await expect(list.locator('tbody tr[data-row-id]').first()).toBeVisible({ timeout: 60_000 });
    const more = list.getByRole('button', { name: NAME });
    await more.tap();
    const pop = page.getByRole('dialog', { name: WORDS });
    await expect(pop).toBeVisible();
    await expect(pop).toContainText(WORDS);
    await page.screenshot({ path: test.info().outputPath('realm-more-390.png') });
  });
});

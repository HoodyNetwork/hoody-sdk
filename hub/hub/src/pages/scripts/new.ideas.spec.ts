// Playwright (New script): in a real browser, Pick an idea's "+N more, built by the assistant" opens the menu of
// ideas the assistant builds, simple ones first; choosing one, by pointer or by keys, lands in Describe it with the idea's
// words in the box and the caret at their end: the closing menu never takes the focus back. On a phone the button fits the
// screen, the menu is a tray, and a row chosen by keys deep in the list is in view. Run by hub:check --page scripts.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

// The more ideas' labels in the order the strings table holds them: the menu's order, simple ones first.
const LABELS = Object.entries(strings).filter(([k]) => /^more\.[a-z]+$/.test(k)).map(([, v]) => v);
const more = strings['flow.what.more'].replace('{{count}}', String(LABELS.length));
const item = (page: Page, id: string) => page.getByRole('menuitem', { name: strings[`more.${id}` as keyof typeof strings], exact: true });

async function toIdeas(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  // /scripts/new mints the draft in this tab.
  await gotoHub(page, '/scripts/new');
  await page.getByRole('button', { name: new RegExp(strings['flow.what.ideaCard']) }).click();
  await expect(page.getByRole('radiogroup', { name: strings['new.pickIdea'] })).toBeVisible();
}

/** The description box holds exactly `words`, has the focus, and its caret is at the end. */
async function landed(page: Page, words: string): Promise<void> {
  const box = page.getByRole('textbox', { name: strings['flow.what.describe'] });
  await expect(box).toHaveValue(words);
  await expect(box).toBeFocused();
  // Past the menu's own focus return (React Aria waits a frame; the kit checks again at 300 and 800 ms).
  await page.waitForTimeout(900);
  await expect(box).toBeFocused();
  expect(await box.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.value.length])).toEqual([words.length, words.length, words.length]);
  await expect(page.getByRole('radiogroup', { name: strings['new.pickIdea'] })).toHaveCount(0);
  await expect(page.getByRole('menu')).toHaveCount(0);
}

test('desktop: the menu lists the ideas, simple ones first, and a click lands in the box', async ({ page }) => {
  await toIdeas(page, 1280);
  await page.getByRole('button', { name: more }).click();
  // On a desktop the menu is named by its trigger's words (React Aria labels it by the trigger); a phone's tray by its title.
  const menu = page.getByRole('menu', { name: more });
  await expect(menu).toBeVisible();
  expect(await menu.locator('[slot="label"]').allTextContents(), 'every idea, in order').toEqual(LABELS);
  await expect(menu.getByText(strings['flow.what.moreHoody'])).toBeVisible();
  await item(page, 'screenshot').click();
  await landed(page, strings['more.screenshot.fill']);
});

test('desktop, by keys: Enter opens the menu on the first idea, ArrowDown and Enter land in the box', async ({ page }) => {
  await toIdeas(page, 1280);
  await page.getByRole('button', { name: more }).focus();
  await page.keyboard.press('Enter');
  await expect(item(page, 'hello')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(item(page, 'myip')).toBeFocused();
  await page.keyboard.press('Enter');
  await landed(page, strings['more.myip.fill']);
});

test('phone: the button fits the screen, the menu is a tray named by its title, and a tap lands in the box', async ({ page }) => {
  await toIdeas(page, 390);
  const button = page.getByRole('button', { name: more });
  const box = await button.boundingBox();
  expect(box, 'the more button shows').toBeTruthy();
  expect(box!.x + box!.width, 'inside the screen').toBeLessThanOrEqual(390 - 16);
  await button.click();
  await expect(page.getByRole('dialog', { name: strings['flow.what.moreTitle'] })).toBeVisible();
  await expect(page.getByRole('menu')).toBeVisible();
  await item(page, 'weather').click();
  await landed(page, strings['more.weather.fill']);
});

test('phone, by keys: deep in the list the focused idea is in view, and Enter lands in the box', async ({ page }) => {
  await toIdeas(page, 390);
  await page.getByRole('button', { name: more }).focus();
  await page.keyboard.press('Enter');
  await expect(item(page, 'hello')).toBeFocused();
  await page.keyboard.press('End');
  await expect(item(page, 'photos')).toBeFocused();
  await expect(item(page, 'photos')).toBeInViewport();
  await page.keyboard.press('ArrowUp');
  await expect(item(page, 'cloud')).toBeFocused();
  await expect(item(page, 'cloud')).toBeInViewport();
  await page.keyboard.press('Enter');
  await landed(page, strings['more.cloud.fill']);
});

// Playwright: the onboarding page on fixtures (run by hub:check --page onboarding). The whole first run as the page's
// own reads move it (no computer, a computer being made, running), the cards by keyboard, reduced motion drawing every
// card at once with nothing running, and nothing scrolling sideways on a phone.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import kit from '@kit/states/LoadScreen.strings.en.json';
import strings from './strings.en.json';

const bar = (page: Page) => page.getByRole('progressbar');

// The buttons that leave (Skip, Open my computer) are links to other pages: hub:check --page serves this page alone, so
// they are proved in page.test.tsx, where every page counts as served.
test('@firstrun the steps follow the reads: no computer, being made, running', async ({ page }) => {
  await gotoHub(page, '/onboarding', { state: 'firstRun' });
  await expect(bar(page)).toHaveAttribute('aria-valuemax', '4');
  // The page's own reads (every 5 s) move the bar; nothing else does.
  await expect(bar(page)).toHaveAttribute('aria-valuenow', '3', { timeout: 20000 });
  await expect(page.getByText(strings['now.making'].replace('{{name}}', 'atlas'))).toBeVisible();
  await expect(bar(page)).toHaveAttribute('aria-valuenow', '4', { timeout: 20000 });
  await expect(page.getByText(strings['now.ready'].replace('{{name}}', 'atlas'))).toBeVisible();
  await expect(page.locator('[data-load-screen]')).toHaveAttribute('data-load-screen', 'done');
});

test('@cards Next, Previous and Pause work from the keyboard and stop the rotation', async ({ page }) => {
  await gotoHub(page, '/onboarding');
  const cards = page.getByRole('group', { name: strings['cards.label'] });
  await expect(cards).toHaveAttribute('data-load-cards', 'rotating');
  await expect(cards.getByRole('heading', { name: strings['card.computers'] })).toBeVisible();
  await cards.getByRole('button', { name: kit['cards.next'] }).focus();
  await expect(cards).toHaveAttribute('data-load-cards', 'held');
  await page.keyboard.press('Enter');
  await expect(cards.getByRole('heading', { name: strings['card.programs'] })).toBeVisible();
  await cards.getByRole('button', { name: kit['cards.prev'] }).focus();
  await page.keyboard.press('Enter');
  await expect(cards.getByRole('heading', { name: strings['card.computers'] })).toBeVisible();
  await expect(cards.getByRole('button', { name: kit['cards.play'] })).toBeVisible();
});

test('@still reduced motion: every card at once, and no animation runs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoHub(page, '/onboarding', { state: 'making' });
  const list = page.getByRole('list', { name: strings['cards.label'] });
  await expect(list.getByRole('listitem')).toHaveCount(8);
  await expect(page.getByRole('button', { name: kit['cards.next'] })).toHaveCount(0);
  const running = await page.evaluate(() => {
    const root = document.querySelector('[data-load-screen]');
    return document.getAnimations().filter((a) => a.playState === 'running' && root?.contains((a.effect as KeyframeEffect | null)?.target ?? null)).length;
  });
  expect(running).toBe(0);
});

test('@phone nothing scrolls sideways at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/onboarding');
  await expect(bar(page)).toBeVisible();
  await noSideScroll(page);
});

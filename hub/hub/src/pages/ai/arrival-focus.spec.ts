// Playwright: arriving at New chat puts focus in its composer on a desktop (after the shell's route-change
// title focus, the page's name said in a polite live region), never on a phone (its keyboard would open uninvited); the
// pane foot offers Pause in its gear menu, not as a button of its own. Fixtures: the ai page's states.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { links } from './links';
import newChat from './new/NewChat.strings.en.json';
import pane from './parts/Pane.strings.en.json';

// The kit's own words (kit/agent/Pause.strings.en.json): pages never import kit internals.
const PAUSE = 'Pause agents';

test.describe('a desktop', () => {
  test.use({ viewport: { width: 1350, height: 900 } });

  test('New chat: the composer has focus and the page name is said', async ({ page }) => {
    await gotoHub(page, links.tab);
    const box = page.getByPlaceholder(newChat.placeholder);
    await expect(box).toBeFocused();
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: newChat.title })).toHaveCount(1);
  });

  test('the foot has no Pause button; the gear offers Pause agents', async ({ page }) => {
    await gotoHub(page, links.tab);
    const gear = page.getByRole('button', { name: pane['gear.label'] });
    await expect(gear).toBeVisible();
    await expect(page.getByRole('button', { name: PAUSE })).toHaveCount(0);
    await gear.click();
    await expect(page.getByRole('menuitem', { name: new RegExp(PAUSE) })).toBeVisible();
  });
});

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('New chat: the composer does not take focus (no keyboard opens uninvited)', async ({ page }) => {
    await gotoHub(page, links.newChat);
    const box = page.getByPlaceholder(newChat.placeholder);
    await expect(box).toBeVisible();
    // Past the frames the composer's try waits for (two), so a focus it took would show.
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))));
    await expect(box).not.toBeFocused();
  });
});

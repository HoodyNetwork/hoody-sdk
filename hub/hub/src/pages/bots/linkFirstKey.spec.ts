// Playwright: a first link made from Give it a link opens the Link and keys tab in
// place of the drawer, the keys part is tinted "here" for a moment (the kit's hub-here pulse; under reduced motion a
// still tint with no animation) and New key has the keyboard. The fixtures cannot add a link after a create, so the drawer
// opens by its URL on a link that has no keys yet (noKeys), which is what the page reads right after a first create.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

// The mark lasts 1.2 s: on a loaded host the steps after the click can outlast it, so the page records the mark's first
// frame itself (a MutationObserver set up before the click) and the test reads that record.
interface MarkSeen {
  seen: boolean;
  animation: string;
  background: string;
}
async function watchMark(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __keysMark: MarkSeen };
    w.__keysMark = { seen: false, animation: '', background: '' };
    const take = () => {
      const el = document.querySelector('[data-keys-block][data-hub-here]');
      if (!el || w.__keysMark.seen) return;
      const cs = getComputedStyle(el);
      w.__keysMark = { seen: true, animation: cs.animationName, background: cs.backgroundColor };
    };
    new MutationObserver(take).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-hub-here'] });
  });
}
const markSeen = (page: Page) => page.evaluate(() => (window as unknown as { __keysMark: MarkSeen }).__keysMark);

async function makeFirstLink(page: Page): Promise<void> {
  await gotoHub(page, `/bots?sel=${encodeURIComponent(CHIEF)}&drawer=link`, { state: 'noKeys' });
  const drawer = page.getByRole('dialog', { name: strings['giveLink.title'] });
  const create = drawer.getByRole('button', { name: strings['giveLink.create'] });
  await create.waitFor();
  await watchMark(page);
  await create.click();
  await expect(page).toHaveURL(/[?&]tab=link/);
  await expect(page).not.toHaveURL(/drawer=/);
  await expect(drawer).toBeHidden();
}

test('a first link: the keys part pulses once, New key has the keyboard, and the empty keys table says a key is needed', async ({ page }) => {
  await makeFirstLink(page);
  await expect.poll(async () => (await markSeen(page)).seen).toBe(true);
  // A CSS-module keyframe: the name carries a hash.
  expect((await markSeen(page)).animation).toMatch(/hub-here/);
  const newKey = page.getByRole('button', { name: strings['keys.new'] });
  await expect(newKey).toBeFocused();
  // New key is a section head action, which carries no description: the empty table says it.
  await expect(page.getByText(strings['keys.emptyBody'])).toBeVisible();
  await expect(page.locator('[data-keys-block][data-hub-here]')).toHaveCount(0, { timeout: 5000 });
  await expect(newKey).toBeFocused();
});

test('reduced motion: the keys part is tinted still, with no animation, and New key still has the keyboard', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await makeFirstLink(page);
  await expect.poll(async () => (await markSeen(page)).seen).toBe(true);
  const seen = await markSeen(page);
  expect(seen.animation).toBe('none');
  expect(seen.background).not.toBe('rgba(0, 0, 0, 0)');
  await expect(page.getByRole('button', { name: strings['keys.new'] })).toBeFocused();
});

test('Back from the tab goes to where the drawer was opened from, not to the drawer', async ({ page }) => {
  await gotoHub(page, `/bots?sel=${encodeURIComponent(CHIEF)}`, { state: 'noKeys' });
  // The drawer as its own history entry, as the header button or the Activity card opens it.
  await gotoHub(page, `/bots?sel=${encodeURIComponent(CHIEF)}&drawer=link`, { state: 'noKeys' });
  const drawer = page.getByRole('dialog', { name: strings['giveLink.title'] });
  await drawer.getByRole('button', { name: strings['giveLink.create'] }).click();
  await expect(page).toHaveURL(/[?&]tab=link/);
  await page.goBack();
  await expect(page).not.toHaveURL(/drawer=link|tab=link/);
  await expect(drawer).toBeHidden();
});

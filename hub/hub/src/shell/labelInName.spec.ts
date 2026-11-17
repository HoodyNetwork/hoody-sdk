// Playwright: WCAG 2.5.3 Label in Name for the shell. The realm, computer and phone context triggers
// are named by the words they show, then what they are for; the search button by its words and key hint; a badged
// sidebar link by its label and count, then the count's words. Each name is checked whole, and axe's
// label-content-name-mismatch judges the top bar and the sidebar in a real browser, at desktop, with the sidebar as a
// rail, and at phone width (unit cases for switching and 99+: shell/labelInName.test.tsx).
import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

/** The words a control shows: its text, never visually hidden words, nor (with `marks: false`) its aria-hidden marks
 *  (dots, flags, carets). A sidebar badge is aria-hidden yet drawn, so its count counts (`marks: true`). */
const shown = (el: Locator, marks = false) =>
  el.evaluate((node, keep) => {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(keep ? '[hidden], [class*="srOnly"], .hxSrOnly, svg' : '[aria-hidden="true"], [hidden], [class*="srOnly"], .hxSrOnly').forEach((n) => n.remove());
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
  }, marks);

async function ready(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await gotoHub(page, path);
  await expect(page.locator('header').first()).toBeVisible();
  await expect(page.locator('[data-skeleton]')).toHaveCount(0);
}

async function noMismatch(page: Page, within: string[]) {
  let axe = new AxeBuilder({ page }).withRules(['label-content-name-mismatch']);
  for (const w of within) axe = axe.include(w);
  const result = await axe.analyze();
  expect(result.violations.flatMap((v) => v.nodes.map((n) => n.html))).toEqual([]);
}

async function nameStartsWithShown(el: Locator, purpose: string) {
  const words = await shown(el);
  expect(words, 'the control shows words').not.toBe('');
  await expect(el).toHaveAccessibleName(`${words} ${purpose}`);
}

for (const path of ['/home', '/notifications', '/computers']) {
  test(`desktop ${path}: triggers, search and sidebar say what they show first`, async ({ page }) => {
    test.setTimeout(90_000);
    await ready(page, path, 1440);
    await nameStartsWithShown(page.locator('header [data-hub-switch="realm"]'), strings['top.realm']);
    const computer = page.locator('header [data-hub-switch="computer"]');
    if (await computer.isVisible()) await nameStartsWithShown(computer, strings['top.computer']);
    const search = page.locator('header button[class*="TopBar-module__search"]');
    await expect(search).toHaveAccessibleName(await shown(search));
    // A badged sidebar link (the fixtures' unread count): its label and count start the name.
    const inbox = page.locator('nav a[href$="#/notifications"]').filter({ visible: true }).first();
    await expect.poll(() => shown(inbox, true), { message: 'the fixtures show an unread count' }).toMatch(/\d/);
    const words = await shown(inbox, true);
    await expect(inbox).toHaveAccessibleName(new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `));
    await noMismatch(page, ['header', 'nav']);
  });
}

test('desktop, sidebar as a rail: icon links keep their whole names, and no mismatch', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page, '/home', 1440);
  await page.locator('body').press('[');
  const rail = page.locator('nav[class*="rail"]').first();
  await expect(rail).toBeVisible();
  // An icon-only link is named by its page; a badged one by its page, its count, then the count's words.
  await expect(rail.locator('a[href$="#/computers"]')).toHaveAccessibleName('Computers');
  await expect(rail.locator('a[href$="#/notifications"]')).toHaveAccessibleName(/^Notifications \d+\+? unread$/);
  await noMismatch(page, ['header', 'nav']);
});

test('below 1024 the search shows its icon only and keeps its words as its name', async ({ page }) => {
  test.setTimeout(90_000);
  await ready(page, '/home', 900);
  const search = page.locator('header button[class*="TopBar-module__search"]');
  // Icon only: the button shows, its words and key hint do not.
  await expect(search).toBeVisible();
  await expect(search.locator('[class*="searchText"]')).toBeHidden();
  await expect(search.locator('kbd')).toBeHidden();
  await expect(search).toHaveAccessibleName(/^Search or jump to… (Ctrl K|⌘K)$/);
  await noMismatch(page, ['header']);
});

for (const path of ['/home', '/computers']) {
  test(`phone ${path}: the context chip says what it shows first`, async ({ page }) => {
    test.setTimeout(90_000);
    await ready(page, path, 390);
    await nameStartsWithShown(page.locator('header [data-hub-switch="context"]'), strings['top.context']);
    await noMismatch(page, ['header']);
  });
}

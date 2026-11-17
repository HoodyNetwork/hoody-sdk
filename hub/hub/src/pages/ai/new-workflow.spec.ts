// Playwright: New workflow's first side on the fixtures. The drawer opens on the question with focus in it; the keyboard reaches
// everything in order; both sides fit a phone with no sideways scroll and one footer row; closing hands focus back; axe finds nothing,
// light and dark. The press itself runs against a real agent: hub/e2e-live.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { links } from './links';
import strings from './auto/workflows/New.strings.en.json';

const newButton = (page: Page) => page.getByRole('button', { name: strings['new.button'], exact: true });
const drawer = (page: Page) => page.getByRole('dialog', { name: strings['new.title'] });
const question = (page: Page) => drawer(page).getByRole('textbox', { name: strings['new.ai.ask'] });

async function open(page: Page, theme?: 'light' | 'dark') {
  await gotoHub(page, links.workflows, theme ? { theme } : {});
  await newButton(page).click();
  await expect(question(page)).toBeFocused();
}
async function fits(page: Page, where: string) {
  await test.step(`${where}: no sideways scroll`, () => noSideScroll(page));
  const inner = await drawer(page).evaluate((d) => d.scrollWidth - d.clientWidth);
  expect(inner, `${where}: nothing runs wider than the drawer`).toBeLessThanOrEqual(0);
}
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}
async function oneFooterRow(page: Page, primary: string) {
  const a = await drawer(page).getByRole('button', { name: 'Cancel', exact: true }).boundingBox();
  const b = await drawer(page).getByRole('button', { name: primary, exact: true }).boundingBox();
  expect(a && b && Math.abs(a.y - b.y), 'Cancel and the primary share a row').toBeLessThanOrEqual(2);
  const label = drawer(page).getByRole('button', { name: primary, exact: true }).locator('[data-btn-label]');
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth && el.clientWidth > 0), `${primary}: its whole label shows`).toBe(true);
}

test('@keyboard the question first, then the link and the footer; the switch to the form sits above the question', async ({ page }) => {
  await open(page);
  await page.keyboard.type('Run the shop tests');
  await expect(question(page)).toHaveValue('Run the shop tests');
  await page.keyboard.press('Tab');
  await expect(drawer(page).getByRole('link', { name: strings['new.ai.agentEdit'] })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(drawer(page).getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(drawer(page).getByRole('button', { name: strings['new.ai.write'], exact: true })).toBeFocused();
  // The form by keyboard (the drawer's one switch, above the question), and back: the words are kept and focus is in the
  // question again.
  await question(page).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer(page).getByRole('radio', { name: strings['new.mode.ask'] })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(drawer(page).getByRole('radio', { name: strings['new.mode.write'] })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(drawer(page).getByRole('textbox', { name: strings['new.name'] })).toBeVisible();
  await drawer(page).getByRole('radio', { name: strings['new.mode.ask'] }).click();
  await expect(question(page)).toBeFocused();
  await expect(question(page)).toHaveValue('Run the shop tests');
});

test('closing hands focus back to New workflow', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(newButton(page)).toBeFocused();
});

for (const theme of ['light', 'dark'] as const) {
  test(`@a11y both sides, wide (${theme}): one footer row, axe finds nothing`, async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 900 });
    await open(page, theme);
    await page.keyboard.type('Run the shop tests');
    await fits(page, 'question');
    await oneFooterRow(page, strings['new.ai.write']);
    await axe(page);
    await drawer(page).getByRole('radio', { name: strings['new.mode.write'] }).click();
    await fits(page, 'form');
    await oneFooterRow(page, strings['new.create']);
    await axe(page);
  });
  test(`@a11y both sides, phone (${theme}): no sideways scroll, one footer row, axe finds nothing`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, theme);
    await page.keyboard.type('Run the shop tests');
    await fits(page, 'question');
    await oneFooterRow(page, strings['new.ai.write']);
    await axe(page);
    await drawer(page).getByRole('radio', { name: strings['new.mode.write'] }).click();
    await fits(page, 'form');
    await oneFooterRow(page, strings['new.create']);
    await axe(page);
  });
}

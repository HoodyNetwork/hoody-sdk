// Playwright: a loop's changes in the whole Hub, desktop and phone width. Pause confirms with the chat warning
// and reads Paused; a timing change opens the Replace drawer with the loop's own prompt and reports the old loop gone
// and the new one running; a new loop is made in a picked chat. Nothing spills sideways at 390.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './auto/loops/Edit.strings.en.json';
import listStrings from './auto/loops/List.strings.en.json';
import { links } from './links';

const rows = (page: Page) => page.getByRole('table', { name: listStrings.title }).locator('tbody tr');
/** A change's outcome line: the kit Outcome is its own live region (role status; a state cell can carry the same word). */
const outcome = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text }).getByText(text, { exact: true });
/** The detail header's actions: the primary and Run now as buttons, the rest under ⋯ (the kit's "More actions"). */
const bar = (page: Page) => page.getByRole('group', { name: strings['a.label'] });
async function openMore(page: Page) {
  await bar(page).getByRole('button', { name: 'More actions', exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

async function openLoop(page: Page, prompt: string) {
  await gotoHub(page, links.loops);
  // The screen loads lazily: a first visit on a busy dev server compiles its chunk first.
  await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
  // The prompt cell opens the detail (the chat cell is a link to the conversation).
  await rows(page).getByText(prompt).first().click(); // reason: a prompt may also show in a row's tooltip text; the first is its cell
  await expect(page).toHaveURL(/[?&]sel=/);
}

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`${size.width}px`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize(size));

    test('pause asks first, warns about the chat, and reads Paused', async ({ page }) => {
      await openLoop(page, 'Check CI on main');
      await page.getByRole('button', { name: strings['a.pause'], exact: true }).click();
      const ask = page.getByRole('alertdialog');
      await expect(ask).toContainText(strings['pause.note']);
      await ask.getByRole('button', { name: strings['a.pause'], exact: true }).click();
      await expect(outcome(page, strings['o.done.pause'])).toBeVisible();
      await noSideScroll(page);
    });

    test('a timing change replaces the loop: the drawer starts from its prompt', async ({ page }) => {
      await openLoop(page, 'Check CI on main');
      await openMore(page);
      await page.getByRole('menuitem', { name: strings['a.replace'] }).click();
      const drawer = page.getByRole('dialog', { name: strings['replace.title'] });
      await expect(drawer.getByRole('textbox', { name: strings['f.prompt'] })).toHaveValue('Check CI on main and fix a red build');
      await expect(drawer).toContainText(strings['replace.body']);
      await noSideScroll(page);
      const every = drawer.getByRole('textbox', { name: strings['f.every'] });
      await every.fill('10');
      await drawer.getByRole('button', { name: strings['replace.confirm'] }).click();
      await expect(outcome(page, strings['o.done.replace'])).toBeVisible();
    });

    test('a finished loop offers only replace and delete', async ({ page }) => {
      await openLoop(page, 'Proofread the docs');
      // Nothing is the primary: no button but ⋯, whose menu holds exactly the two.
      await expect(bar(page).getByRole('button', { name: 'More actions', exact: true })).toBeVisible();
      for (const a of ['a.pause', 'a.resume', 'a.restart', 'a.runNow', 'a.extend'] as const) await expect(bar(page).getByRole('button', { name: strings[a], exact: true })).toHaveCount(0);
      await openMore(page);
      const items = page.getByRole('menu').getByRole('menuitem');
      await expect(items).toHaveCount(2);
      await expect(items.filter({ hasText: strings['a.replace'] })).toBeVisible();
      await expect(items.filter({ hasText: strings['a.delete'] })).toBeVisible();
    });

    test('a new loop is made in a picked chat', async ({ page }) => {
      await gotoHub(page, links.loops);
      await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: strings.new }).click();
      const drawer = page.getByRole('dialog', { name: strings['new.title'] });
      await drawer.getByRole('button', { name: new RegExp(strings['new.chat']) }).click();
      await page.getByRole('option').first().click(); // reason: any open chat of the fixture world takes the loop
      await drawer.getByRole('textbox', { name: strings['f.prompt'] }).fill('Ping the build');
      await noSideScroll(page);
      await drawer.getByRole('button', { name: strings['new.confirm'] }).click();
      await expect(drawer.getByText(strings['o.done.create'], { exact: true })).toBeVisible();
    });
  });
}

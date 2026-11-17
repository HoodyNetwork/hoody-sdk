// Playwright: the passcode lock's Account rows in a real browser (Web Locks, WebCrypto): set, the section on, and a
// refused change that asks for its new passcode again; axe finds no WCAG A/AA violation in the section or the sheets.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const PASS = '482913';
const NEWPASS = '730215';

async function noViolations(page: Page, scope: string): Promise<void> {
  const r = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('@a11y set, then a refused change: the replacement is asked for again, and axe finds nothing', async ({ page }) => {
  await gotoHub(page, '/account?section=passcode');
  const section = page.locator('[data-section="passcode"]');
  await expect(section.getByRole('button', { name: strings['lock.set'] })).toBeVisible();
  await noViolations(page, '[data-section="passcode"]');

  await section.getByRole('button', { name: strings['lock.set'] }).click();
  const set = page.getByRole('dialog', { name: strings['lock.setTitle'] });
  await set.getByLabel(strings['lock.field'], { exact: true }).fill(PASS);
  await set.getByLabel(strings['lock.again']).fill(PASS);
  await noViolations(page, '[role="dialog"]');
  await set.getByRole('button', { name: strings['lock.setSave'] }).click();
  await expect(page.getByText(strings['lock.done.set'])).toBeVisible();
  await expect(section.getByRole('button', { name: strings['lock.change'] })).toBeVisible();
  await noViolations(page, '[data-section="passcode"]');

  await section.getByRole('button', { name: strings['lock.change'] }).click();
  const change = page.getByRole('dialog', { name: strings['lock.changeTitle'] });
  await change.getByLabel(strings['lock.current']).fill('999999x');
  await change.getByLabel(strings['lock.newField']).fill(NEWPASS);
  await change.getByLabel(strings['lock.again']).fill(NEWPASS);
  await change.getByRole('button', { name: strings['lock.changeSave'] }).click();
  await expect(change.getByText(strings['lock.newAgainHelp'])).toBeVisible();
  await expect(change.getByRole('button', { name: strings['lock.keepCurrent'] })).toBeVisible();
  await noViolations(page, '[role="dialog"]');
  // The corrected current passcode alone is refused in the sheet; nothing reports a change.
  await change.getByLabel(strings['lock.current']).fill(PASS);
  await change.getByRole('button', { name: strings['lock.changeSave'] }).click();
  await expect(change.getByText(strings['lock.err.newAgain'])).toBeVisible();
  await expect(page.getByText(strings['lock.done.changed'])).toHaveCount(0);
});

// Playwright: New realm on fixtures (run by hub:check --page realms, and by the whole-Hub run).
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './strings.en.json';

// The pages the dev server serves (scripts/check.ts passes the same HUB_PAGE to Vite and to Playwright). A realm made
// in full goes straight on to its Computers, the shell switching to it, but only when Computers is served: a
// realms-only server keeps the results. Unset means the whole Hub.
const REALMS_ONLY = process.env.HUB_PAGE === 'realms';

/** A create made in full: on a realms-only server the results say so; on the whole Hub the page goes on to the new
 *  realm's Computers, the shell takes ?open_realm= out of the address only once that realm is the one shown, and the
 *  realm switcher names it. */
async function madeInFull(page: Page, ready: string) {
  if (REALMS_ONLY) {
    await expect(page.getByText(ready)).toBeVisible();
    return;
  }
  await expect(page).toHaveURL(/#\/computers(\?|$)/);
  await expect(page).not.toHaveURL(/open_realm=/);
  // The top bar's realm switcher shows the new realm (its name is the one the create saved).
  await expect(page.locator('header [data-hub-switch="realm"]')).toContainText('Studio');
  await expect(page.getByText(ready)).toHaveCount(0);
}

/** The name field. By label alone 'Name' would also match the step's section ("Name your realm") and a question about the
 *  name: the field is the one textbox of that exact name. */
const nameField = (page: Page) => page.getByRole('textbox', { name: strings['name.label'], exact: true });

async function toComputers(page: Page, name = 'Studio') {
  await nameField(page).fill(name);
  await page.getByRole('button', { name: strings.next }).click();
  await expect(page).toHaveURL(/[?&]step=computers/);
}

test('a taken name keeps step 1 and says why', async ({ page }) => {
  await gotoHub(page, '/realms/new');
  await nameField(page).fill('lab');
  await page.getByRole('button', { name: strings.next }).click();
  await expect(page.getByText(strings['name.taken'])).toBeVisible();
  await expect(page).not.toHaveURL(/step=computers/);
});

test('one picked computer: the realm is made and the computer added, with no way back to the steps', async ({ page }) => {
  await gotoHub(page, '/realms/new');
  await toComputers(page);
  // The kit checkbox's label covers the input, so the press goes through it.
  await page.getByRole('row', { name: /atlas/ }).getByRole('checkbox').click({ force: true });
  await page.getByRole('button', { name: strings.next }).click();
  await page.getByRole('button', { name: strings.create }).click();
  await madeInFull(page, 'Studio is ready.');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
  // The results (and their saved row) stay only where the page cannot go on; the go-on itself is the vitest's too.
  if (REALMS_ONLY) await expect(page.getByText(strings['item.saved'], { exact: true })).toBeVisible();
});

test('a lost name answer: Check again reads, then Try again sends it once more and it lands', async ({ page }) => {
  await gotoHub(page, '/realms/new', { state: 'nameLost' });
  await toComputers(page);
  await page.getByRole('button', { name: strings.next }).click();
  await page.getByRole('button', { name: strings.create }).click();
  await expect(page.locator('[data-outcome="pending"]')).toBeVisible();
  await page.getByRole('button', { name: /check again/i }).click();
  await expect(page.getByText(strings['name.notSeen'])).toBeVisible();
  await page.getByRole('button', { name: /try again/i }).click();
  await madeInFull(page, 'Studio is ready. It has no computers yet.');
  await expect(page.getByRole('button', { name: /try again/i })).toHaveCount(0);
});

// Every picked computer by name in the rail, at 390 too (there the rail is the folded "Your choices"); a long list
// scrolls inside the rail (a keyboard stop) and the page never scrolls sideways. Checked on the last step (review),
// the list reached with Tab, End bringing the last name into view.
test('at 390 wide the rail names all 24 picked computers and scrolls inside itself', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await gotoHub(page, '/realms/new', { state: 'many' });
  await toComputers(page);
  // Below the table's width the rows become a list without a select-all; the picks stay when the width changes.
  // Pressed where a person presses it, on the box drawn in its label: the native input is drawn under that box and a
  // forced click on the input lands wherever its own scroll-into-view leaves it (on the toolbar above).
  const selectAll = page.getByRole('checkbox', { name: 'Select all rows' });
  await page.locator('label', { has: selectAll }).click();
  await expect(selectAll).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: strings.next }).click();
  await expect(page).toHaveURL(/[?&]step=review/);
  await expect(page.getByRole('button', { name: strings.create })).toBeVisible();
  // Below 840 the summary rail folds into a disclosure above the step, closed until opened.
  const fold = page.getByRole('button', { name: strings['summary.title'], exact: true });
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  const list = page.getByRole('list', { name: strings['summary.picked'] });
  await list.scrollIntoViewIfNeeded();
  await expect(list).toBeVisible();
  await expect(list.getByRole('listitem')).toHaveCount(24);
  await expect(list).toHaveAttribute('tabindex', '0');
  const box = await list.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(box.scroll).toBeGreaterThan(box.client);
  // Reached with Tab from the top of the page (a bounded walk), never by a script focus.
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await list.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);
  await expect(list).toBeFocused();
  await page.keyboard.press('End');
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  // The last name is inside the list's visible box after End.
  await expect.poll(() => list.evaluate((el) => {
    const last = el.querySelector('li:last-of-type');
    if (!last) return false;
    const a = el.getBoundingClientRect(), b = last.getBoundingClientRect();
    return b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
  })).toBe(true);
  await noSideScroll(page);
});

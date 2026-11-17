// Playwright: a TODO's actions in the whole Hub, desktop and phone width. Run confirms that the worker runs
// unattended; a run waiting for approval is approved (confirmed) or denied; a TODO a worker holds reads "Claimed by a
// worker" and offers Cancel run, never Run. Nothing spills sideways at 390.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './auto/todos/Actions.strings.en.json';
import listStrings from './auto/todos/List.strings.en.json';
import { links } from './links';

const rows = (page: Page) => page.getByRole('table', { name: listStrings.title }).locator('tbody tr');
/** A change's outcome line: the kit Outcome is its own live region, a status when done and an alert when it may have
 *  gone through (the StatusLine beside it only says what is going on now). */
const outcomeLine = (page: Page, text: string, role: 'status' | 'alert' = 'status') => page.getByRole(role).filter({ hasText: text });
const outcome = (page: Page, text: string, role: 'status' | 'alert' = 'status') => outcomeLine(page, text, role).getByText(text, { exact: true });

async function openTodo(page: Page, title: string, tab?: string) {
  await gotoHub(page, tab ? `${links.todos}?tab=${tab}` : links.todos);
  // The screen loads lazily: a first visit on a busy dev server compiles its chunk first.
  await expect(rows(page).getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
  await rows(page).getByText(title, { exact: true }).click();
  await expect(page).toHaveURL(/[?&]sel=/);
}

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`${size.width}px`, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize(size));

    test('run asks first, says the worker runs unattended, then reports the start', async ({ page }) => {
      await openTodo(page, 'Answer the refund email');
      await page.getByRole('button', { name: strings['a.run'] }).click();
      const ask = page.getByRole('alertdialog');
      await expect(ask).toContainText(strings['run.effect']);
      await noSideScroll(page);
      await ask.getByRole('button', { name: strings['run.confirm'] }).click();
      await expect(outcome(page, strings['o.done.run'])).toBeVisible();
    });

    test('one run waiting for approval is approved after a confirm, another denied', async ({ page }) => {
      // A TODO with runs waiting for approval is on Waiting for you (logic.ts: pending_proposals), not Open.
      await openTodo(page, 'Fix the checkout total rounding', 'waiting');
      const proposal = (agent: string) => page.getByRole('listitem').filter({ hasText: `Proposed: run as ${agent}` });
      await expect(proposal('implementer')).toBeVisible();
      await proposal('implementer').getByRole('button', { name: strings['a.approve'] }).click();
      const ask = page.getByRole('alertdialog');
      await expect(ask).toContainText(strings['approve.effect']);
      await ask.getByRole('button', { name: strings['approve.confirm'] }).click();
      await expect(outcome(page, strings['o.done.approve'])).toBeVisible();
      // the approved one is no longer offered; the other still waits
      await expect(proposal('implementer')).toHaveCount(0);
      // The approve outcome's own Dismiss: the confirm dialog, while it closes, still holds a hidden Dismiss of its own.
      await outcomeLine(page, strings['o.done.approve']).getByRole('button', { name: 'Dismiss' }).click();
      await proposal('reviewer').getByRole('button', { name: strings['a.deny'], exact: true }).click();
      await expect(outcome(page, strings['o.done.deny'])).toBeVisible();
      await expect(proposal('reviewer')).toHaveCount(0);
      await noSideScroll(page);
      // None waits any more: the row leaves Waiting for you and reads on Open. The list is shown by a hash change, not a
      // reload, so the fixtures keep both decisions (a reload starts them again).
      const checkout = rows(page).filter({ hasText: 'Fix the checkout total rounding' });
      const list = (tab: string) => page.evaluate((h) => { location.hash = h; }, `#${links.todos}?tab=${tab}`);
      await list('waiting');
      // The TODO that asks a person a question still waits: the Waiting list is drawn, and the checkout row is not on it.
      await expect(rows(page).getByText('Decide the release date', { exact: true })).toBeVisible();
      await expect(checkout).toHaveCount(0);
      await list('open');
      await expect(checkout).toBeVisible();
    });

    test('a TODO a worker holds is claimed, read only, and offers Cancel run; an end naming no run leaves it unsure', async ({ page }) => {
      await openTodo(page, 'Migrate the orders table', 'running');
      await expect(page.getByText(strings.claimed)).toBeVisible();
      await expect(page.getByRole('button', { name: strings['a.run'], exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: strings['a.cancelRun'] }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: strings['cancel.confirm'] }).click();
      // Its end is not read yet: unknown, so an alert with Check again, never "Run cancelled".
      await expect(outcome(page, strings['o.cancel.answered'], 'alert')).toBeVisible();
      await expect(page.getByText(strings['o.cancel.unnamed'], { exact: false })).toBeVisible();
      await expect(page.getByText(strings['o.done.cancelRun'], { exact: true })).toHaveCount(0);
      await noSideScroll(page);
    });
  });
}

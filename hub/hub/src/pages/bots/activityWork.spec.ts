// Playwright: the Details panel's Status (a link row and a two-fact Facts list) and the Work tab
// (a Section head, the task table with Message as the row's inline action) draw whole from 320 to 1350 wide: nothing runs past
// its box or is cut, no side scroll, Message is on screen and opens the message form.
import { expect, type Locator } from '@playwright/test';
import { gotoHub, noSideScroll, test } from '@app/e2e';
import strings from './strings.en.json';

const BASE = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

/** Text lines and controls in `box` that run past its left or right edge. */
async function pastEdge(box: Locator): Promise<string[]> {
  return box.evaluate((root) => {
    const edge = root.getBoundingClientRect();
    const out: string[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('button, a, dt, dd, h2, h3, p, th, td')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > edge.right + 1 || r.left < edge.left - 1) out.push(`${el.tagName} ${(el.textContent ?? '').trim().slice(0, 40)}`);
    }
    return out;
  });
}

for (const width of [320, 390, 768, 1024, 1350]) {
  test.describe(`Details and Work at ${width}px`, () => {
    test.beforeEach(async ({ hubPage }) => {
      await hubPage.setViewportSize({ width, height: 900 });
    });

    test('Details: Status shows the link, when it was last active and its identifier, not the state or the computer again', async ({ hubPage: page }) => {
      await gotoHub(page, `${BASE}&details=1`, { state: 'working' });
      const panel = page.getByRole('complementary', { name: strings['rail.details'] });
      await expect(panel.getByRole('heading', { name: strings['rail.status'], exact: true })).toBeVisible();
      for (const k of ['rail.link', 'rail.lastActive', 'rail.id'] as const) await expect(panel.getByText(strings[k], { exact: true })).toBeVisible();
      await expect(panel.getByText('State', { exact: true })).toHaveCount(0);
      await expect(panel.getByText('Computer', { exact: true })).toHaveCount(0);
      // The header says both, at this width too.
      const head = page.getByRole('heading', { level: 2, name: 'Chief' }).locator('xpath=ancestor::header[1]');
      await expect(head.getByText(strings['status.working'], { exact: true })).toBeVisible();
      await expect(head.getByText(/atlas/).first()).toBeVisible(); // reason: the header names the computer in its link and again in its hosting line; either shows
      expect(await pastEdge(panel)).toEqual([]);
      await noSideScroll(page);
    });

    test('Work: the section head, the table and Message on the task row', async ({ hubPage: page }) => {
      await gotoHub(page, `${BASE}&tab=work`);
      const region = page.getByRole('region', { name: strings['work.title'] });
      await expect(region.getByText(strings['work.desc'])).toBeVisible();
      const row = page.getByRole('row').filter({ hasText: 'Read deploy log' });
      await expect(row).toBeVisible();
      // Message is the row's inline action at every width (a probe saw one direct button from 320 to 1350).
      const message = row.getByRole('button', { name: new RegExp(`^${strings['task.message']}`) });
      await expect(message).toHaveCount(1);
      await expect(message).toBeVisible();
      await message.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      // The same row's menu holds the other actions and not a second Message.
      await row.getByRole('button', { name: /Row actions|More/ }).click();
      await expect(page.getByRole('menuitem', { name: new RegExp(`^${strings['task.message']}`) })).toHaveCount(0);
      await page.keyboard.press('Escape');
      expect(await pastEdge(page.locator('main'))).toEqual([]);
      await noSideScroll(page);
    });
  });
}

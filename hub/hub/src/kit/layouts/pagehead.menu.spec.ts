// Playwright: a page header's own ⋯ (PageHeader `menu`) sits on the line of the header's actions on a one-line row, even
// with a subtitle under the title: its centre is level with the actions' centre, its top with theirs. Vault is the page
// that draws one (More vault actions after "Use with your agent" and New entry).
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from '../../pages/vault/strings.en.json';

test.use({ viewport: { width: 1440, height: 900 } });

test('at 1440 the header ⋯ is level with the header buttons', async ({ page }) => {
  await gotoHub(page, '/vault');
  const header = page.locator('header:has(h1)').first();
  const more = header.getByRole('button', { name: strings['action.more'] });
  const primary = header.getByRole('button', { name: strings['action.new'] });
  await more.waitFor({ timeout: 15_000 });
  await expect(header.locator('p').first(), 'the header has a subtitle under its title').toBeVisible();
  const m = await more.boundingBox();
  const p = await primary.boundingBox();
  expect(m && p, 'both shown').toBeTruthy();
  const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
  expect(Math.abs(centre(m!) - centre(p!)), 'the ⋯ centre is level with the buttons').toBeLessThanOrEqual(1);
  expect(m!.y, 'the ⋯ does not reach above the buttons').toBeGreaterThanOrEqual(p!.y - 1);
});

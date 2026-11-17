// Playwright: the reservation inspector in the Bare metal view's detail pane. It draws inside the
// pane's own body (kit DetailBody, as the listing's Detail does), so its body starts where the detail title starts, its
// sections, its actions and its footer action stay inside the page, and nothing scrolls sideways, wide and at phone width.
import { expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import strings from './servers/strings.en.json';

for (const width of [1350, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('a delivered reservation: its sections sit in the pane body, lined up with the title, nothing cut or sideways', async ({ page }) => {
      await gotoHub(page, '/billing?view=servers&tab=reservations&rsel=r03');
      const title = page.locator('header[class*="detailHeader"] [data-hub-title]');
      await expect(title).toBeVisible();
      const body = page.locator('header[class*="detailHeader"] ~ [class*="detailBody"]');
      for (const name of [strings['res.detail.terms'], strings['res.detail.paid'], strings['res.detail.delivered']])
        await expect(body.getByText(name, { exact: true })).toBeVisible();
      const tl = (await title.boundingBox())!.x;
      const first = body.locator('dl').first(); // reason: the terms' facts, the body's first block
      const fl = (await first.boundingBox())!.x;
      expect(Math.abs(fl - tl), `title ${tl} vs body ${fl}`).toBeLessThanOrEqual(1);
      // The body's actions (the delivered server's and rental's copy buttons) and the pane footer's one (View computers
      // on this server, drawn when the Hub serves Computers) stay whole inside the page.
      const buttons = await body.getByRole('button').all();
      expect(buttons.length, 'the delivered facts have their actions').toBeGreaterThan(0);
      await expect(body.getByRole('button', { name: strings['res.viewServer'] }), 'the way on is the footer action, not a body button').toHaveCount(0);
      const way = page.locator('footer[class*="detailFooter"]').getByRole('button', { name: strings['res.viewServer'] });
      for (const btn of [...buttons, ...(await way.all())]) {
        await btn.scrollIntoViewIfNeeded();
        const b = (await btn.boundingBox())!;
        expect(b.x, 'an action starts inside the page').toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, 'an action ends inside the page').toBeLessThanOrEqual(width);
      }
      await noSideScroll(page); // reason: the page scrolls in #hub-main, never the document (app/conformance.sidescroll.test.ts)
    });
  });
}

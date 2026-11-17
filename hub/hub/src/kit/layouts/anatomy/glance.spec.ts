// The kit "At a glance" on the gallery: one titled section, every fact on its own line, the limit's
// Meter beside its words, the kit's own words for an unread fact; at 1440 several cells to a row, at 390 at most two,
// with nothing wider than the page. Both themes.
import { expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

for (const theme of ['light', 'dark'] as const)
  for (const width of [1440, 390] as const)
    test.describe(`Glance at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });
      test('one titled section; the kit words for unread facts; the meter beside its words; no overflow', async ({ page }) => {
        await gotoHub(page, '/_kit?tab=pieces', { theme });
        const g = page.locator('#glance');
        await g.scrollIntoViewIfNeeded();
        await expect(g.getByRole('heading', { name: 'At a glance' })).toBeVisible();
        const list = g.getByLabel('At a glance');
        await expect(list.getByText('Reading…')).toBeVisible();
        await expect(list.getByText("Can't tell")).toBeVisible();
        await expect(list.getByText('At least 40 GB')).toBeVisible();
        const meter = list.getByRole('meter', { name: '3 of 10 backups kept' });
        await expect(meter).toBeVisible();
        const words = (await list.getByText('3 of 10', { exact: true }).boundingBox())!;
        const m = (await meter.boundingBox())!;
        // On one line while it fits: the meter's middle within the words' line.
        expect(Math.abs(m.y + m.height / 2 - (words.y + words.height / 2))).toBeLessThan(words.height);
        // A tip beside a meter: the meter is not inside the tip's button.
        const rules = list.getByRole('meter', { name: '4 of 10 firewall rules' });
        await expect(rules).toBeVisible();
        expect(await rules.evaluate((m) => m.closest('button') === null)).toBe(true);
        const cols = await list.evaluate((dl) => new Set([...dl.querySelectorAll('dt')].map((d) => Math.round(d.getBoundingClientRect().left))).size);
        if (width === 1440) expect(cols).toBeGreaterThan(1);
        else expect(cols).toBeLessThanOrEqual(2);
        // The page scrolls in #hub-main (the root clips), so that is the box that could overflow.
        const over = await page.locator('#hub-main').evaluate((m) => m.scrollWidth - m.clientWidth);
        expect(over).toBeLessThanOrEqual(0);
        await expect(page.locator('#glance-reading').getByText('Reading…')).toHaveCount(3);
      });
    });
